// Agenda — tipos (sem backend: estado local + localStorage)
export type StatusAgendamento =
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'nao_compareceu'

/** Registro de uma remarcação — preserva o histórico do agendamento */
export type Remarcacao = {
  de: { data: string; horario: string; profissional: string }
  /** ISO da mudança */
  em: string
}

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
  /** Duração em minutos registrada no momento do agendamento */
  duracaoMin?: number
  /** Remarrações anteriores (histórico preservado) */
  remarcacoes?: Remarcacao[]
}

export type NovoAgendamentoInput = {
  cliente: string
  telefone: string
  servico: string
  profissional: string
  data: string
  horario: string
  observacao: string
  /** Duração do serviço no momento do agendamento (histórico) */
  duracaoMin?: number
}

/** Expediente de trabalho configurado na Agenda */
export type Expediente = {
  /** HH:MM — início do atendimento */
  inicio: string
  /** HH:MM — fim do atendimento */
  fim: string
  /** HH:MM — início do almoço (igual a fim = sem almoço) */
  almocoInicio: string
  /** HH:MM — fim do almoço */
  almocoFim: string
}

export type TipoBloqueio = 'almoco' | 'folga' | 'ferias' | 'ausencia' | 'outro'

/** Bloqueio de agenda: impede novos agendamentos no período */
export type Bloqueio = {
  id: string
  profissional: string
  /** Data inicial no formato YYYY-MM-DD */
  data: string
  /** Data final YYYY-MM-DD (inclusive); ausente = mesmo dia */
  dataFim?: string
  /** HH:MM */
  inicio: string
  /** HH:MM */
  fim: string
  tipo: TipoBloqueio
  motivo: string
  criadoEm: string
}

export type NovoBloqueioInput = Omit<Bloqueio, 'id' | 'criadoEm'>
