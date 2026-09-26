// Marketing — estado local + localStorage. Guarda só a REFERÊNCIA de
// público (nunca os clientes): a lista sempre acompanha os dados reais.
// Nenhum envio é feito daqui (campanhas/WhatsApp são Fase 8).
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
import {
  PUBLICOS_ORDEM,
  type ListaPublico,
  type NovaListaInput,
} from './types'

const CHAVE = 'studio-audax:marketing:v1'

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

type MarketingContexto = {
  listas: ListaPublico[]
  /** Valida nome/público e trava nome duplicado */
  criarLista: (input: NovaListaInput) => ListaPublico
  removerLista: (id: string) => void
}

const Contexto = createContext<MarketingContexto | null>(null)

function ehLista(bruto: unknown): boolean {
  return (
    Array.isArray(bruto) &&
    bruto.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as ListaPublico).id === 'string' &&
        typeof (item as ListaPublico).nome === 'string' &&
        PUBLICOS_ORDEM.includes((item as ListaPublico).publico),
    )
  )
}

export function MarketingProvider({ children }: { children: ReactNode }) {
  const [listas, setListas] = useState<ListaPublico[]>(() =>
    carregarJSON<ListaPublico[]>(CHAVE, [], ehLista),
  )

  useEffect(() => {
    salvarJSON(CHAVE, listas)
  }, [listas])

  const criarLista = useCallback(
    (input: NovaListaInput) => {
      const nome = input.nome.trim()
      if (nome.length < 3) {
        throw new Error('Informe um nome para a lista (mínimo 3 letras).')
      }
      if (!PUBLICOS_ORDEM.includes(input.publico)) {
        throw new Error('Público inválido.')
      }
      const chave = nome.toLocaleLowerCase('pt-BR')
      const repetida = listas.some(
        (l) => l.nome.trim().toLocaleLowerCase('pt-BR') === chave,
      )
      if (repetida) throw new Error('Já existe uma lista com este nome.')
      const nova: ListaPublico = {
        id: gerarId(),
        nome,
        publico: input.publico,
        criadoEm: new Date().toISOString(),
      }
      setListas((atual) => [...atual, nova])
      return nova
    },
    [listas],
  )

  const removerLista = useCallback((id: string) => {
    setListas((atual) => atual.filter((l) => l.id !== id))
  }, [])

  const valor = useMemo(
    () => ({ listas, criarLista, removerLista }),
    [listas, criarLista, removerLista],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useMarketing(): MarketingContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error('useMarketing deve ser usado dentro de MarketingProvider')
  return ctx
}
