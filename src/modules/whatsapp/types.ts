// WhatsApp — tipos (sem backend: estado local + localStorage)
// O envio real NÃO acontece sem um provedor oficial configurado: este
// módulo só organiza mensagens/estados e fica pronto para a integração.

export type IdTemplate =
  | 'confirmacao'
  | 'lembrete'
  | 'pos_atendimento'
  | 'reativacao'

export const TEMPLATES_ORDEM: IdTemplate[] = [
  'confirmacao',
  'lembrete',
  'pos_atendimento',
  'reativacao',
]

export const TEMPLATES_ROTULO: Record<IdTemplate, string> = {
  confirmacao: 'Confirmação',
  lembrete: 'Lembrete',
  pos_atendimento: 'Pós-atendimento',
  reativacao: 'Reativação',
}

export type StatusMensagem = 'pendente' | 'enviada' | 'falhou'

export const STATUS_ROTULO: Record<StatusMensagem, string> = {
  pendente: 'Pendente',
  enviada: 'Enviada',
  falhou: 'Falhou',
}

/** Onde a mensagem foi preparada (nunca é enviada sozinha) */
export type OrigemMensagem = 'crm' | 'ia'

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
