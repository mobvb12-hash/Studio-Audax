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

function ehEstadoIa(valor: unknown): boolean {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function carregar(): EstadoIa {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do fallback.
  const bruto = carregarJSON<Partial<EstadoIa>>(CHAVE_STORAGE, {}, ehEstadoIa)
  return {
    aceitas: normalizarLista(bruto.aceitas),
    descartadas: normalizarLista(bruto.descartadas),
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
    salvarJSON(CHAVE_STORAGE, estado)
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
