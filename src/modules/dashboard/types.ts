// Módulo Dashboard — tipos
export type PeriodoDashboard = 'hoje' | 'semana' | 'mes'

export type StatusAgendamento = 'confirmado' | 'pendente' | 'concluido'

export type KpiDashboard = {
  id: string
  rotulo: string
  valor: string
  variacao: string
  variacaoPositiva: boolean
  descricao: string
}

export type AgendamentoResumo = {
  id: string
  cliente: string
  servico: string
  profissional: string
  horario: string
  status: StatusAgendamento
}

export type ServicoTop = {
  nome: string
  quantidade: number
  faturamento: number
}

export type DadosDashboard = {
  kpis: KpiDashboard[]
  proximosAgendamentos: AgendamentoResumo[]
  topServicos: ServicoTop[]
  ocupacaoPercentual: number
  metaMensal: number
  faturamentoAtual: number
}
