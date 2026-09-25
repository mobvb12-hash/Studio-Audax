// Estoque — movimentações (histórico imutável, sem backend)
export type TipoMovimentacao =
  | 'inicial'
  | 'entrada'
  | 'venda'
  | 'estorno'
  | 'ajuste'

export type OrigemMovimentacao = 'cadastro' | 'pdv' | 'estorno' | 'manual'

export type MotivoAjuste =
  | 'perda'
  | 'avaria'
  | 'contagem'
  | 'erro_lancamento'
  | 'reposicao'
  | 'outro'

export const MOTIVOS_AJUSTE: Record<MotivoAjuste, string> = {
  perda: 'Perda',
  avaria: 'Avaria',
  contagem: 'Contagem física',
  erro_lancamento: 'Erro de lançamento',
  reposicao: 'Reposição',
  outro: 'Outro',
}

export const ROTULO_TIPO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  inicial: 'Estoque inicial',
  entrada: 'Entrada',
  venda: 'Venda',
  estorno: 'Estorno',
  ajuste: 'Ajuste',
}

export type MovimentacaoEstoque = {
  id: string
  produtoId: string
  produto: string
  tipo: TipoMovimentacao
  /** positivo = entrou, negativo = saiu */
  quantidade: number
  estoqueAntes: number
  estoqueDepois: number
  custoUnitario: number
  fornecedor?: string
  /** dia da movimentação (YYYY-MM-DD) */
  data: string
  hora: string
  origem: OrigemMovimentacao
  /** lançamento do Caixa associado (venda/estorno) */
  vendaId?: string
  motivo?: MotivoAjuste
  observacao?: string
  criadoEm: string
}

export type EntradaEstoqueInput = {
  produtoId: string
  quantidade: number
  custoUnitario: number
  fornecedor?: string
  data: string
  observacao?: string
}

export type AjusteEstoqueInput = {
  produtoId: string
  tipo: 'entrada' | 'saida'
  quantidade: number
  motivo: MotivoAjuste
  data: string
  observacao?: string
}

/** Item de venda usável pelo estoque (compatível com ItemVenda do Caixa) */
export type ItemVendaEstoque = {
  produto?: string
  produtoId?: string
  quantidade: number
  preco?: number
}
