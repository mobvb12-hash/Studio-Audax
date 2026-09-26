// WhatsApp — tipos (sem backend: estado local + localStorage)
// O envio real NÃO acontece sem um provedor oficial configurado: este
// módulo só organiza mensagens/estados e fica pronto para a integração.

export type IdTemplate =
  | 'confirmacao'
  | 'lembrete'
  | 'pos_atendimento'
  | 'reativacao'
  | 'cancelamento'
  | 'reagendamento'
  | 'aniversario'
  | 'vencimento_clube'
  | 'horario_liberado'

/** Templates com botões manuais no painel do cliente (CRM). */
export const TEMPLATES_ORDEM: IdTemplate[] = [
  'confirmacao',
  'lembrete',
  'pos_atendimento',
  'reativacao',
]

/** Templates criados apenas pelo motor de Automações (Fase 8). */
export const TEMPLATES_AUTOMACAO: IdTemplate[] = [
  'cancelamento',
  'reagendamento',
  'aniversario',
  'vencimento_clube',
  'horario_liberado',
]

export const TEMPLATES_ROTULO: Record<IdTemplate, string> = {
  confirmacao: 'Confirmação',
  lembrete: 'Lembrete',
  pos_atendimento: 'Pós-atendimento',
  reativacao: 'Reativação',
  cancelamento: 'Cancelamento',
  reagendamento: 'Reagendamento',
  aniversario: 'Aniversário',
  vencimento_clube: 'Vencimento do Clube',
  horario_liberado: 'Horário liberado',
}

/** Valida ids de template (inclui os criados só por automação). */
export function ehIdTemplate(valor: unknown): valor is IdTemplate {
  return typeof valor === 'string' && valor in TEMPLATES_ROTULO
}

export type StatusMensagem = 'pendente' | 'enviada' | 'falhou'

export const STATUS_ROTULO: Record<StatusMensagem, string> = {
  pendente: 'Pendente',
  enviada: 'Enviada',
  falhou: 'Falhou',
}

/** Onde a mensagem foi preparada (nunca é enviada sozinha) */
export type OrigemMensagem = 'crm' | 'ia' | 'automacao'

export const ORIGEM_ROTULO: Record<OrigemMensagem, string> = {
  crm: 'crm',
  ia: 'ia',
  automacao: 'Automação',
}

export type MensagemWhats = {
  id: string
  clienteId: string
  /** Nome do cliente no momento do registro (histórico) */
  cliente: string
  template: IdTemplate
  texto: string
  status: StatusMensagem
  origem: OrigemMensagem
  /** Motivo quando o envio falha */
  motivoFalha?: string
  /** ISO do registro */
  criadoEm: string
  /** ISO de quando o envio foi concluído (manual ou por provedor) */
  enviadoEm?: string
  /** Vincula a mensagem a um agendamento real (confirmação/lembrete) */
  agendamentoId?: string
}

export type NovaMensagemInput = {
  clienteId: string
  cliente: string
  template: IdTemplate
  texto: string
  origem?: OrigemMensagem
  agendamentoId?: string
}
