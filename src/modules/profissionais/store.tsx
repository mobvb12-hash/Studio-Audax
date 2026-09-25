import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { PROFISSIONAIS as SEED } from '@/modules/agenda/catalogo'
import type { NovoProfissionalInput, Profissional } from './types'

const CHAVE_STORAGE = 'studio-audax:profissionais:v1'

type ProfissionaisContexto = {
  profissionais: Profissional[]
  adicionar: (input: NovoProfissionalInput) => Profissional
  atualizar: (id: string, input: NovoProfissionalInput) => void
  remover: (id: string) => void
  porId: (id: string) => Profissional | undefined
}

const Contexto = createContext<ProfissionaisContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Profissional[]): Profissional[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Garante campos novos em registros antigos (telefone/email/foto). */
function normalizar(partial: Partial<Profissional>): Profissional | null {
  if (!partial.id || !partial.nome) return null
  return {
    id: partial.id,
    nome: partial.nome,
    telefone: partial.telefone ?? '',
    email: partial.email ?? '',
    foto: partial.foto ?? '',
    criadoEm: partial.criadoEm ?? new Date().toISOString(),
  }
}

function carregar(): Profissional[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (bruto) {
      const lista = JSON.parse(bruto) as Partial<Profissional>[]
      if (Array.isArray(lista)) {
        const migrada = lista
          .map(normalizar)
          .filter((p): p is Profissional => p !== null)
        if (migrada.length > 0) return ordenar(migrada)
      }
    }
  } catch {
    // corrompido: recria a partir do seed
  }
  const agora = new Date().toISOString()
  return SEED.map((nome) => ({
    id: `prof-${nome.toLowerCase()}`,
    nome,
    telefone: '',
    email: '',
    foto: '',
    criadoEm: agora,
  }))
}

export function ProfissionaisProvider({ children }: { children: ReactNode }) {
  const [profissionais, setProfissionais] = useState<Profissional[]>(() =>
    carregar(),
  )

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(profissionais))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [profissionais])

  const adicionar = useCallback((input: NovoProfissionalInput) => {
    const novo: Profissional = {
      id: gerarId(),
      nome: input.nome.trim(),
      telefone: input.telefone.trim(),
      email: input.email.trim(),
      foto: input.foto,
      criadoEm: new Date().toISOString(),
    }
    setProfissionais((atual) => ordenar([...atual, novo]))
    return novo
  }, [])

  const atualizar = useCallback((id: string, input: NovoProfissionalInput) => {
    setProfissionais((atual) =>
      ordenar(
        atual.map((p) =>
          p.id === id
            ? {
                ...p,
                nome: input.nome.trim(),
                telefone: input.telefone.trim(),
                email: input.email.trim(),
                foto: input.foto,
              }
            : p,
        ),
      ),
    )
  }, [])

  const remover = useCallback((id: string) => {
    setProfissionais((atual) => atual.filter((p) => p.id !== id))
  }, [])

  const porId = useCallback(
    (id: string) => profissionais.find((p) => p.id === id),
    [profissionais],
  )

  const valor = useMemo(
    () => ({ profissionais, adicionar, atualizar, remover, porId }),
    [profissionais, adicionar, atualizar, remover, porId],
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
