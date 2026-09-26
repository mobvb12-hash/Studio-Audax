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

const CHAVE_STORAGE = 'studio-audax:automacoes:v1'

type EstadoAutomacoes = {
  /** Chaves de sugestões já preparadas ou ignoradas (anti-duplicação) */
  tratadas: string[]
}

function ehEstado(valor: unknown): boolean {
  if (!valor || typeof valor !== 'object') return false
  const lista = (valor as { tratadas?: unknown }).tratadas
  return Array.isArray(lista) && lista.every((x) => typeof x === 'string')
}

function normalizar(bruto: EstadoAutomacoes): EstadoAutomacoes {
  const vistas = new Set<string>()
  const tratadas: string[] = []
  for (const item of bruto.tratadas) {
    const chave = item.trim()
    if (!chave || vistas.has(chave)) continue
    vistas.add(chave)
    tratadas.push(chave)
  }
  return { tratadas }
}

type AutomacoesContexto = {
  tratadas: string[]
  /** Marca a chave como tratada (idempotente) */
  marcarTratada: (chave: string) => void
  /** Marca várias chaves de uma vez (lote "preparar todas") */
  marcarTratadas: (chaves: string[]) => void
}

const Contexto = createContext<AutomacoesContexto | null>(null)

export function AutomacoesProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAutomacoes>(() =>
    normalizar(
      carregarJSON<EstadoAutomacoes>(
        CHAVE_STORAGE,
        { tratadas: [] },
        ehEstado,
      ),
    ),
  )

  useEffect(() => {
    salvarJSON(CHAVE_STORAGE, estado)
  }, [estado])

  const marcarTratada = useCallback((chave: string) => {
    const limpa = chave.trim()
    if (!limpa) {
      throw new Error('Informe a chave da automação.')
    }
    setEstado((atual) =>
      atual.tratadas.includes(limpa)
        ? atual
        : { tratadas: [...atual.tratadas, limpa] },
    )
  }, [])

  const marcarTratadas = useCallback((chaves: string[]) => {
    setEstado((atual) => {
      const vistas = new Set(atual.tratadas)
      const extras = chaves
        .map((c) => c.trim())
        .filter((c) => c && !vistas.has(c))
      if (extras.length === 0) return atual
      return { tratadas: [...atual.tratadas, ...extras] }
    })
  }, [])

  const valor = useMemo(
    () => ({ tratadas: estado.tratadas, marcarTratada, marcarTratadas }),
    [estado.tratadas, marcarTratada, marcarTratadas],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAutomacoes(): AutomacoesContexto {
  const ctx = useContext(Contexto)
  if (!ctx) {
    throw new Error('useAutomacoes deve ser usado dentro de AutomacoesProvider')
  }
  return ctx
}
