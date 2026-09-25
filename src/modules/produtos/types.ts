// Produtos + estoque — tipos (sem backend: estado local + localStorage)
export type Produto = {
  id: string
  nome: string
  preco: number
  /** custo unitário de aquisição — histórico/margem futura */
  custo: number
  /** estoque atual (unidades) */
  estoque: number
  /** estoque mínimo — atual <= mínimo = estoque baixo */
  estoqueMinimo: number
  categoria: string
  foto: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string
}

export type NovoProdutoInput = {
  nome: string
  preco: number
  custo?: number
  estoque?: number
  estoqueMinimo?: number
  categoria?: string
  foto?: string
  ativo?: boolean
}
