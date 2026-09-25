import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

const CHAVE_STORAGE = 'studio-audax:ia:v1'

type EstadoIa = {
  /** Sugestões que o humano confirmou (executadas na tela) */
  aceitas: string[]
  /** Sugestões que o humano descartou */
  descartadas: string[]
}

function normalizarLista(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === 'string')
    : []
}

function carregar(): EstadoIa {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return { aceitas: [], descartadas: [] }
    const brutoEstado = JSON.parse(bruto) as Partial<EstadoIa>
    return {
      aceitas: normalizarLista(brutoEstado.aceitas),
      descartadas: normalizarLista(brutoEstado.descartadas),
    }
  } catch {
    return { aceitas: [], descartadas: [] }
  }
}

type IaContexto = {
  aceitas: string[]
  descartadas: string[]
  /** Marca a sugestão como confirmada pelo humano (após executar a ação) */
  marcarAceita: (sugestaoId: string) => void
  marcarDescartada: (sugestaoId: string) => void
  tratada: (sugestaoId: string) => boolean
}

const Contexto = createContext<IaContexto | null>(null)

export function IaProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoIa>(() => carregar())

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(estado))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [estado])

  const marcarAceita = useCallback((sugestaoId: string) => {
    setEstado((atual) => {
      if (atual.aceitas.includes(sugestaoId)) return atual
      return {
        ...atual,
        aceitas: [...atual.aceitas, sugestaoId],
        descartadas: atual.descartadas.filter((id) => id !== sugestaoId),
      }
    })
  }, [])

  const marcarDescartada = useCallback((sugestaoId: string) => {
    setEstado((atual) => {
      if (atual.descartadas.includes(sugestaoId)) return atual
      return {
        ...atual,
        descartadas: [...atual.descartadas, sugestaoId],
        aceitas: atual.aceitas.filter((id) => id !== sugestaoId),
      }
    })
  }, [])

  const tratada = useCallback(
    (sugestaoId: string) =>
      estado.aceitas.includes(sugestaoId) ||
      estado.descartadas.includes(sugestaoId),
    [estado],
  )

  const valor = useMemo(
    () => ({
      aceitas: estado.aceitas,
      descartadas: estado.descartadas,
      marcarAceita,
      marcarDescartada,
      tratada,
    }),
    [estado, marcarAceita, marcarDescartada, tratada],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useIa(): IaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useIa deve ser usado dentro de IaProvider')
  return ctx
}
