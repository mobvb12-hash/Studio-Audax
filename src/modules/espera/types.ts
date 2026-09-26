// Lista de Espera — tipos (sem backend: estado local + localStorage)
// Separada da Agenda normal: um pedido de espera NÃO ocupa horário, não
// vira agendamento sozinho e não dispara WhatsApp (confirmação é Fase 8).
export type PeriodoEspera = 'manha' | 'tarde' | 'qualquer'

export const PERIODOS_ESPERA: PeriodoEspera[] = ['manha', 'tarde', 'qualquer']

export const PERIODOS_ESPERA_ROTULO: Record<PeriodoEspera, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  qualquer: 'Qualquer',
}

export type StatusEspera = 'aguardando' | 'atendido' | 'cancelado'

export const STATUS_ESPERA_ORDEM: StatusEspera[] = [
  'aguardando',
  'atendido',
  'cancelado',
]

export const STATUS_ESPERA_ROTULO: Record<StatusEspera, string> = {
  aguardando: 'Aguardando',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
}

/** Pedido da fila de espera — cliente deseja horário quando abrir */
export type PedidoEspera = {
  id: string
  clienteId: string
  cliente: string
  telefone: string
  servico: string
  /** '' = qualquer profissional */
  profissional: string
  periodo: PeriodoEspera
  /** 'YYYY-MM-DD' ou '' = qualquer dia */
  dataPreferida: string
  observacao: string
  status: StatusEspera
  /** ISO completo */
  criadoEm: string
  /** ISO — preenchido ao virar atendido/cancelado */
  encerradoEm?: string
}

export type NovoPedidoInput = {
  clienteId: string
  cliente: string
  telefone: string
  servico: string
  /** Omitido = '' (qualquer profissional) */
  profissional?: string
  /** Omitido = 'qualquer' */
  periodo?: PeriodoEspera
  /** Omitido = '' (qualquer dia) */
  dataPreferida?: string
  observacao?: string
}
