// Profissionais — tipos (sem backend: estado local + localStorage)
export type Profissional = {
  id: string
  nome: string
  telefone: string
  email: string
  /** Foto em data URL (JPEG compactado) ou string vazia */
  foto: string
  /**
   * Status ativo/inativo. Inativar nunca apaga dados: atendimentos,
   * agenda e comissões já realizados permanecem; o profissional apenas
   * deixa de receber novos agendamentos.
   */
  ativo: boolean
  criadoEm: string
  /**
   * WhatsApp de NOTIFICAÇÃO de novo agendamento (migration 024). Vazio =
   * o profissional não recebe aviso — o agendamento segue normal de todo
   * modo. É um canal oficial do cadastro, nunca um número fixo no código.
   */
  whatsappNotificacao: string
  /** Se false, o profissional não é notificado de novos agendamentos. */
  notificarAgendamentos: boolean
}

export type NovoProfissionalInput = {
  nome: string
  telefone: string
  email: string
  foto: string
  /** Opcional ao criar: sem valor, o profissional nasce sem notificação. */
  whatsappNotificacao?: string
  notificarAgendamentos?: boolean
}
