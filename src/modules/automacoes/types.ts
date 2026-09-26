// Automações — tipos (gatilhos reais dos dados, sem envio automático)
// Cada sugestão carrega uma chave determinística usada como trava de
// anti-duplicação: preparada ou ignorada, a mesma chave nunca reaparece.
import type { IdTemplate } from '@/modules/whatsapp/types'

export type TipoAutomacao =
  | 'confirmacao'
  | 'lembrete'
  | 'cancelamento'
  | 'reagendamento'
  | 'aniversario'
  | 'inatividade'
  | 'vencimento_clube'
  | 'horario_liberado'

export const AUTOMACOES_ORDEM: TipoAutomacao[] = [
  'confirmacao',
  'lembrete',
  'cancelamento',
  'reagendamento',
  'aniversario',
  'inatividade',
  'vencimento_clube',
  'horario_liberado',
]

export const AUTOMACOES_ROTULO: Record<TipoAutomacao, string> = {
  confirmacao: 'Confirmação de agendamento',
  lembrete: 'Lembrete do dia',
  cancelamento: 'Aviso de cancelamento',
  reagendamento: 'Aviso de reagendamento',
  aniversario: 'Feliz aniversário',
  inatividade: 'Cliente inativo',
  vencimento_clube: 'Vencimento do Clube',
  horario_liberado: 'Horário liberado',
}

export type SugestaoAutomacao = {
  /** Trava anti-duplicação (determinística entre sessões) */
  chave: string
  tipo: TipoAutomacao
  template: IdTemplate
  clienteId: string
  cliente: string
  /** Texto final já gerado pelos templates oficiais */
  texto: string
  /** Vincula a um agendamento real quando o gatilho veio dele */
  agendamentoId?: string
}
