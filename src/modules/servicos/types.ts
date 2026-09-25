// Serviços — tipos (sem backend: estado local + localStorage)
export type Servico = {
  id: string
  nome: string
  preco: number
  duracaoMin: number
  criadoEm: string
  atualizadoEm: string
}

export type NovoServicoInput = {
  nome: string
  preco: number
  duracaoMin: number
}
