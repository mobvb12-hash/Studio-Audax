import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { carregarJSON, salvarJSON } from '@/lib/persistencia'
import { normalizarTexto } from '@/lib/moeda'
import { PROFISSIONAIS as SEED } from '@/modules/agenda/catalogo'
import { validarProfissional } from './regras'
import type { NovoProfissionalInput, Profissional } from './types'
import { supabase } from '@/lib/supabase'
import {
  listarProfissionais,
  criarProfissional,
  atualizarProfissional,
  alternarAtivoProfissional,
  removerProfissional,
} from '@/services/supabase/profissionais'

const CHAVE_STORAGE = 'studio-audax:profissionais:v1'

type ProfissionaisContexto = {
  profissionais: Profissional[]
  adicionar: (input: NovoProfissionalInput) => Promise<Profissional>
  atualizar: (id: string, input: NovoProfissionalInput) => Promise<void>
  alternarAtivo: (id: string) => Promise<void>
  remover: (id: string) => Promise<void>
  porId: (id: string) => Profissional | undefined
}

const Contexto = createContext<ProfissionaisContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Profissional[]): Profissional[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Garante campos novos em registros antigos (telefone/email/foto/ativo). */
function normalizar(partial: Partial<Profissional>): Profissional | null {
  if (!partial.id || !partial.nome) return null
  return {
    id: partial.id,
    nome: partial.nome,
    telefone: partial.telefone ?? '',
    email: partial.email ?? '',
    foto: partial.foto ?? '',
    ativo: typeof partial.ativo === 'boolean' ? partial.ativo : true,
    criadoEm: partial.criadoEm ?? new Date().toISOString(),
  }
}

function nomeChave(texto: string): string {
  return normalizarTexto(texto)
}

/** Id legível gerado para o seed da instalação nova */
function idSeed(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `prof-${slug}`
}

/**
 * Placeholders do template antigo renomeados para a equipe real.
 * Só age sobre o registro intacto (mesmo id + mesmo nome); qualquer
 * personalização do usuário é preservada como está.
 */
const PLACEHOLDERS = [
  { id: 'prof-audax', antigo: 'Audax', novo: 'Cleiton Silva' },
  { id: 'prof-diego', antigo: 'Diego', novo: 'Ítalo Santos' },
] as const

function migrarPlaceholder(p: Profissional): Profissional {
  const ph = PLACEHOLDERS.find((x) => x.id === p.id && x.antigo === p.nome)
  return ph ? { ...p, nome: ph.novo } : p
}

function carregar(): Profissional[] {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do seed.
  const bruto = carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray)
  if (Array.isArray(bruto)) {
    // lista salva (mesmo vazia) é preservada — o seed só entra em
    // instalação nova ou storage corrompido
    const migrada = (bruto as Partial<Profissional>[])
      .map(normalizar)
      .filter((p): p is Profissional => p !== null)
      .map(migrarPlaceholder)
    return ordenar(migrada)
  }
  const agora = new Date().toISOString()
  return SEED.map((nome) => ({
    id: idSeed(nome),
    nome,
    telefone: '',
    email: '',
    foto: '',
    ativo: true,
    criadoEm: agora,
  }))
}

export function ProfissionaisProvider({ children }: { children: ReactNode }) {
  const [profissionais, setProfissionais] = useState<Profissional[]>(() =>
    carregar(),
  )
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null

  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    listarProfissionais()
      .then((lista) => {
        if (!vivo) return
        if (lista.length > 0) {
          setProfissionais(lista)
        }
        setSincronizado(true)
      })
      .catch(() => {
        if (vivo) setSincronizado(true)
      })
    return () => {
      vivo = false
    }
  }, [temSupabase])

  useEffect(() => {
    if (temSupabase && !sincronizado) return
    salvarJSON(CHAVE_STORAGE, profissionais)
  }, [profissionais, temSupabase, sincronizado])

  const adicionar = useCallback(
    async (input: NovoProfissionalInput) => {
      const nome = input.nome.trim()
      const erro = validarProfissional({
        nome,
        telefone: input.telefone,
        email: input.email,
      })
      if (erro) throw new Error(erro)
      if (
        profissionais.some((p) => nomeChave(p.nome) === nomeChave(nome))
      ) {
        throw new Error('Já existe um profissional com este nome.')
      }
      const novo: Profissional = {
        id: gerarId(),
        nome,
        telefone: input.telefone.trim(),
        email: input.email.trim(),
        foto: input.foto,
        ativo: true,
        criadoEm: new Date().toISOString(),
      }
      setProfissionais((atual) => ordenar([...atual, novo]))
      if (temSupabase) {
        try {
          await criarProfissional(novo)
        } catch {
          // falha de rede — localStorage já tem o dado
        }
      }
      return novo
    },
    [profissionais, temSupabase],
  )

  const atualizar = useCallback(
    async (id: string, input: NovoProfissionalInput) => {
      const nome = input.nome.trim()
      const erro = validarProfissional({
        nome,
        telefone: input.telefone,
        email: input.email,
      })
      if (erro) throw new Error(erro)
      if (
        profissionais.some(
          (p) => p.id !== id && nomeChave(p.nome) === nomeChave(nome),
        )
      ) {
        throw new Error('Já existe um profissional com este nome.')
      }
      setProfissionais((atual) =>
        ordenar(
          atual.map((p) =>
            p.id === id
              ? {
                  ...p,
                  nome,
                  telefone: input.telefone.trim(),
                  email: input.email.trim(),
                  foto: input.foto,
                }
              : p,
          ),
        ),
      )
      if (temSupabase) {
        try {
          await atualizarProfissional(id, input)
        } catch {
          // falha de rede — localStorage já tem o dado
        }
      }
    },
    [profissionais, temSupabase],
  )

  /** Inativar/reativar nunca apaga o profissional nem o histórico dele. */
  const alternarAtivo = useCallback(
    async (id: string) => {
      const alvo = profissionais.find((p) => p.id === id)
      if (!alvo) return
      const novoAtivo = !alvo.ativo
      setProfissionais((atual) =>
        atual.map((p) => (p.id === id ? { ...p, ativo: novoAtivo } : p)),
      )
      if (temSupabase) {
        try {
          await alternarAtivoProfissional(id, novoAtivo)
        } catch {
          // falha de rede — localStorage já tem o dado
        }
      }
    },
    [profissionais, temSupabase],
  )

  const remover = useCallback(
    async (id: string) => {
      setProfissionais((atual) => atual.filter((p) => p.id !== id))
      if (temSupabase) {
        try {
          await removerProfissional(id)
        } catch {
          // falha de rede — localStorage já tem o dado
        }
      }
    },
    [temSupabase],
  )

  const porId = useCallback(
    (id: string) => profissionais.find((p) => p.id === id),
    [profissionais],
  )

  const valor = useMemo(
    () => ({
      profissionais,
      adicionar,
      atualizar,
      alternarAtivo,
      remover,
      porId,
    }),
    [profissionais, adicionar, atualizar, alternarAtivo, remover, porId],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useProfissionais(): ProfissionaisContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error(
      'useProfissionais deve ser usado dentro de ProfissionaisProvider',
    )
  return ctx
}
