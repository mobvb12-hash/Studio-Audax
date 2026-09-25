// Produtos (PDV) — tipos (sem backend: estado local + localStorage)
export type Produto = {
  id: string
  nome: string
  preco: number
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type NovoProdutoInput = {
  nome: string
  preco: number
  ativo?: boolean
}
