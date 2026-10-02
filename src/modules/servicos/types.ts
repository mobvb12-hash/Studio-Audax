// Serviços — tipos (sem backend: estado local + localStorage)
export type Servico = {
  id: string
  nome: string
  preco: number
  duracaoMin: number
  /** Categoria livre (ex.: Cabelo, Barba). Vazio = sem categoria */
  categoria: string
  /**
   * Status ativo/inativo. Inativar nunca apaga dados: histórico de
   * agendamentos e pagamentos continua intacto; o serviço apenas some
   * das listas de novos agendamentos.
   */
  ativo: boolean
  /**
   * Ids de outros serviços sugeridos como COMPLEMENTO deste (coluna
   * `servicos.complementos` da 019). O painel do cliente oferece esses
   * itens com preço/duração do próprio catálogo; nunca marcados sozinhos.
   * Ausente/vazio = serviço sem complementos.
   */
  complementos?: string[]
  criadoEm: string
  atualizadoEm: string
}

export type NovoServicoInput = {
  nome: string
  preco: number
  duracaoMin: number
  /** Omitido = serviço sem categoria */
  categoria?: string
  /** Omitido = serviço sem complementos sugeridos */
  complementos?: string[]
}
