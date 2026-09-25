import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  TIPOS_INTERACAO,
  type Interacao,
  type NovaInteracaoInput,
  type TipoInteracao,
} from './types'

const CHAVE_STORAGE = 'studio-audax:crm:v1'

/** Preenche campos ausentes (registros antigos) com os padrões atuais. */
function normalizarInteracao(bruto: Partial<Interacao>): Interacao {
  const tipo =
    bruto.tipo && TIPOS_INTERACAO.includes(bruto.tipo)
      ? bruto.tipo
      : ('nota' as TipoInteracao)
  return {
    id: bruto.id ?? '',
    clienteId: bruto.clienteId ?? '',
    tipo,
    texto: bruto.texto ?? '',
    criadoEm: bruto.criadoEm ?? new Date().toISOString(),
  }
}

type CrmContexto = {
  interacoes: Interacao[]
  /** Valida antes de gravar — histórico nunca é apagado pelo sistema */
  adicionarInteracao: (input: NovaInteracaoInput) => Interacao
  interacoesDoCliente: (clienteId: string) => Interacao[]
}

const Contexto = createContext<CrmContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function carregar(): Interacao[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as Partial<Interacao>[]
    return Array.isArray(lista) ? lista.map(normalizarInteracao) : []
  } catch {
    return []
  }
}

function ordenar(lista: Interacao[]): Interacao[] {
  return [...lista].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const [interacoes, setInteracoes] = useState<Interacao[]>(() => carregar())

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(interacoes))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [interacoes])

  const adicionarInteracao = useCallback((input: NovaInteracaoInput) => {
    const clienteId = input.clienteId.trim()
    const texto = input.texto.trim()
    if (!clienteId) {
      throw new Error('Selecione um cliente para registrar a interação.')
    }
    if (texto.length < 3) {
      throw new Error('Informe a interação (mínimo 3 letras).')
    }
    const tipo =
      input.tipo && TIPOS_INTERACAO.includes(input.tipo)
        ? input.tipo
        : ('nota' as TipoInteracao)
    const nova: Interacao = normalizarInteracao({
      id: gerarId(),
      clienteId,
      tipo,
      texto,
      criadoEm: new Date().toISOString(),
    })
    setInteracoes((atual) => ordenar([nova, ...atual]))
    return nova
  }, [])

  const interacoesDoCliente = useCallback(
    (clienteId: string) =>
      interacoes.filter((i) => i.clienteId === clienteId),
    [interacoes],
  )

  const valor = useMemo(
    () => ({ interacoes, adicionarInteracao, interacoesDoCliente }),
    [interacoes, adicionarInteracao, interacoesDoCliente],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCrm(): CrmContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useCrm deve ser usado dentro de CrmProvider')
  return ctx
}
