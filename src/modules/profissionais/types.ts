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
}

export type NovoProfissionalInput = {
  nome: string
  telefone: string
  email: string
  foto: string
}
