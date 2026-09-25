// Agenda — tipos (sem backend: estado local + localStorage)
export type StatusAgendamento =
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'nao_compareceu'

export type Agendamento = {
  id: string
  cliente: string
  telefone: string
  servico: string
  profissional: string
  /** Data no formato YYYY-MM-DD (horário local) */
  data: string
  /** Horário no formato HH:MM */
  horario: string
  status: StatusAgendamento
  observacao: string
  criadoEm: string
}

export type NovoAgendamentoInput = {
  cliente: string
  telefone: string
  servico: string
  profissional: string
  data: string
  horario: string
  observacao: string
}
