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
  /**
   * Vínculo com a conta de acesso (`profissionais.user_id`, migration 014).
   * É o que dá posse ao profissional: RLS (`current_profissional_id()`) e as
   * telas de Agenda/Comissões usam este vínculo para mostrar só o que é dele.
   * null = cadastro sem conta de acesso (não aparece para o próprio dono).
   */
  userId?: string | null
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
