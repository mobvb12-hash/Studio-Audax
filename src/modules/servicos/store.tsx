import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { SERVICOS as SEED } from '@/modules/agenda/catalogo'
import type { NovoServicoInput, Servico } from './types'

const CHAVE_STORAGE = 'studio-audax:servicos:v1'

type ServicosContexto = {
  servicos: Servico[]
  adicionar: (input: NovoServicoInput) => Servico
  atualizar: (id: string, input: NovoServicoInput) => void
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

function carregar(): Servico[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (bruto) {
      const lista = JSON.parse(bruto) as Servico[]
      if (Array.isArray(lista)) return lista
    }
  } catch {
    // corrompido: recria a partir do seed
  }
  const agora = new Date().toISOString()
  return ordenar(
    SEED.map((s) => ({
      id: `srv-${s.nome.toLowerCase().replace(/\s+/g, '-')}`,
      nome: s.nome,
      preco: s.preco,
      duracaoMin: s.duracaoMin,
      criadoEm: agora,
      atualizadoEm: agora,
    })),
  )
}

export function ServicosProvider({ children }: { children: ReactNode }) {
  const [servicos, setServicos] = useState<Servico[]>(() => carregar())

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(servicos))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [servicos])

  const adicionar = useCallback((input: NovoServicoInput) => {
    const agora = new Date().toISOString()
    const novo: Servico = {
      id: gerarId(),
      nome: input.nome.trim(),
      preco: input.preco,
      duracaoMin: input.duracaoMin,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    setServicos((atual) => ordenar([...atual, novo]))
    return novo
  }, [])

  const atualizar = useCallback((id: string, input: NovoServicoInput) => {
    setServicos((atual) =>
      ordenar(
        atual.map((s) =>
          s.id === id
            ? {
                ...s,
                nome: input.nome.trim(),
                preco: input.preco,
                duracaoMin: input.duracaoMin,
                atualizadoEm: new Date().toISOString(),
              }
            : s,
        ),
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
    () => ({ servicos, adicionar, atualizar, remover, porId }),
    [servicos, adicionar, atualizar, remover, porId],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useServicos(): ServicosContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useServicos deve ser usado dentro de ServicosProvider')
  return ctx
}
