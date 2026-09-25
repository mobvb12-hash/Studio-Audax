import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type {
  Agendamento,
  NovoAgendamentoInput,
  StatusAgendamento,
} from './types'

const CHAVE_STORAGE = 'studio-audax:agendamentos:v1'

type AgendaContexto = {
  agendamentos: Agendamento[]
  adicionar: (input: NovoAgendamentoInput) => Agendamento
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
  porData: (dataISO: string) => Agendamento[]
}

const Contexto = createContext<AgendaContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function carregar(): Agendamento[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as Agendamento[]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function AgendaProvider({ children }: { children: ReactNode }) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>(() =>
    carregar(),
  )

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(agendamentos))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [agendamentos])

  const adicionar = useCallback((input: NovoAgendamentoInput) => {
    const novo: Agendamento = {
      id: gerarId(),
      cliente: input.cliente.trim(),
      telefone: input.telefone.trim(),
      servico: input.servico,
      profissional: input.profissional,
      data: input.data,
      horario: input.horario,
      status: 'pendente',
      observacao: input.observacao.trim(),
      criadoEm: new Date().toISOString(),
    }
    setAgendamentos((atual) =>
      [...atual, novo].sort((a, b) =>
        `${a.data} ${a.horario}`.localeCompare(`${b.data} ${b.horario}`),
      ),
    )
    return novo
  }, [])

  const mudarStatus = useCallback(
    (id: string, status: StatusAgendamento) => {
      setAgendamentos((atual) =>
        atual.map((ag) => (ag.id === id ? { ...ag, status } : ag)),
      )
    },
    [],
  )

  const remover = useCallback((id: string) => {
    setAgendamentos((atual) => atual.filter((ag) => ag.id !== id))
  }, [])

  const porData = useCallback(
    (dataISO: string) =>
      agendamentos
        .filter((ag) => ag.data === dataISO && ag.status !== 'cancelado')
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos],
  )

  const valor = useMemo(
    () => ({ agendamentos, adicionar, mudarStatus, remover, porData }),
    [agendamentos, adicionar, mudarStatus, remover, porData],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAgenda(): AgendaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAgenda deve ser usado dentro de AgendaProvider')
  return ctx
}
