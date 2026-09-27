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
import { SERVICOS as SEED } from '@/modules/agenda/catalogo'
import { validarServico } from './regras'
import type { NovoServicoInput, Servico } from './types'

const CHAVE_STORAGE = 'studio-audax:servicos:v1'

type ServicosContexto = {
  servicos: Servico[]
  adicionar: (input: NovoServicoInput) => Servico
  atualizar: (id: string, input: NovoServicoInput) => void
  alternarAtivo: (id: string) => void
  remover: (id: string) => void
  porId: (id: string) => Servico | undefined
}

const Contexto = createContext<ServicosContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Servico[]): Servico[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Migração: registros antigos ganham categoria vazia e ativo: true. */
function migrar(bruto: Partial<Servico>): Servico | null {
  if (!bruto.id || !bruto.nome) return null
  const criadoEm = bruto.criadoEm ?? new Date().toISOString()
  return {
    id: bruto.id,
    nome: bruto.nome,
    preco: typeof bruto.preco === 'number' ? bruto.preco : 0,
    duracaoMin: typeof bruto.duracaoMin === 'number' ? bruto.duracaoMin : 30,
    categoria: typeof bruto.categoria === 'string' ? bruto.categoria : '',
    ativo: typeof bruto.ativo === 'boolean' ? bruto.ativo : true,
    criadoEm,
    atualizadoEm: bruto.atualizadoEm ?? criadoEm,
  }
}

function carregar(): Servico[] {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do seed.
  const bruto = carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray)
  if (Array.isArray(bruto)) {
    // lista salva (mesmo vazia) é preservada — o seed só entra em
    // instalação nova ou storage corrompido
    const migrada = (bruto as Partial<Servico>[])
      .map(migrar)
      .filter((s): s is Servico => s !== null)
    return ordenar(migrada)
  }
  const agora = new Date().toISOString()
  return ordenar(
    SEED.map((s) => ({
      id: `srv-${s.nome.toLowerCase().replace(/\s+/g, '-')}`,
      nome: s.nome,
      preco: s.preco,
      duracaoMin: s.duracaoMin,
      categoria: '',
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    })),
  )
}

export function ServicosProvider({ children }: { children: ReactNode }) {
  const [servicos, setServicos] = useState<Servico[]>(() => carregar())

  useEffect(() => {
    salvarJSON(CHAVE_STORAGE, servicos)
  }, [servicos])

  const adicionar = useCallback(
    (input: NovoServicoInput) => {
      const nome = input.nome.trim()
      const categoria = input.categoria?.trim() ?? ''
      const erro = validarServico({ ...input, nome, categoria })
      if (erro) throw new Error(erro)
      if (servicos.some((s) => normalizarTexto(s.nome) === normalizarTexto(nome))) {
        throw new Error('Já existe um serviço com este nome.')
      }
      const agora = new Date().toISOString()
      const novo: Servico = {
        id: gerarId(),
        nome,
        preco: input.preco,
        duracaoMin: input.duracaoMin,
        categoria,
        ativo: true,
        criadoEm: agora,
        atualizadoEm: agora,
      }
      setServicos((atual) => ordenar([...atual, novo]))
      return novo
    },
    [servicos],
  )

  const atualizar = useCallback(
    (id: string, input: NovoServicoInput) => {
      const nome = input.nome.trim()
      const categoria = input.categoria?.trim() ?? ''
      const erro = validarServico({ ...input, nome, categoria })
      if (erro) throw new Error(erro)
      if (
        servicos.some(
          (s) => s.id !== id && normalizarTexto(s.nome) === normalizarTexto(nome),
        )
      ) {
        throw new Error('Já existe um serviço com este nome.')
      }
      setServicos((atual) =>
        ordenar(
          atual.map((s) =>
            s.id === id
              ? {
                  ...s,
                  nome,
                  preco: input.preco,
                  duracaoMin: input.duracaoMin,
                  categoria,
                  atualizadoEm: new Date().toISOString(),
                }
              : s,
          ),
        ),
      )
    },
    [servicos],
  )

  /** Inativar/reativar nunca apaga o serviço nem o histórico dele. */
  const alternarAtivo = useCallback((id: string) => {
    setServicos((atual) =>
      atual.map((s) =>
        s.id === id
          ? { ...s, ativo: !s.ativo, atualizadoEm: new Date().toISOString() }
          : s,
      ),
    )
  }, [])

  const remover = useCallback((id: string) => {
    setServicos((atual) => atual.filter((s) => s.id !== id))
  }, [])

  const porId = useCallback(
    (id: string) => servicos.find((s) => s.id === id),
    [servicos],
  )

  const valor = useMemo(
    () => ({ servicos, adicionar, atualizar, alternarAtivo, remover, porId }),
    [servicos, adicionar, atualizar, alternarAtivo, remover, porId],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useServicos(): ServicosContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useServicos deve ser usado dentro de ServicosProvider')
  return ctx
}
