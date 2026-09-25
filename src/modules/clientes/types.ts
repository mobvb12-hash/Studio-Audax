// Clientes — tipos (sem backend: estado local + localStorage)
export type Cliente = {
  id: string
  nome: string
  telefone: string
  email: string
  observacao: string
  criadoEm: string
  atualizadoEm: string
}

export type NovoClienteInput = {
  nome: string
  telefone: string
  email: string
  observacao: string
}
