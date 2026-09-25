// Regras de indicador de estoque — funções puras, testáveis.
import type { Produto } from '@/modules/produtos/types'

/** Estoque zerado: nenhuma unidade disponível (não pode ser vendido). */
export function estaZerado(produto: Produto): boolean {
  return produto.estoque <= 0
}

/** Estoque baixo: atual <= mínimo (zerados também entram na régua). */
export function estaBaixo(produto: Produto): boolean {
  return produto.estoque <= produto.estoqueMinimo
}

export type StatusEstoque = 'normal' | 'baixo' | 'zerado'

export function statusEstoque(produto: Produto): StatusEstoque {
  if (estaZerado(produto)) return 'zerado'
  if (estaBaixo(produto)) return 'baixo'
  return 'normal'
}

export const ROTULO_STATUS: Record<StatusEstoque, string> = {
  normal: 'Normal',
  baixo: 'Baixo',
  zerado: 'Zerado',
}

export function produtosComEstoqueBaixo(produtos: Produto[]): Produto[] {
  return produtos.filter((p) => p.ativo && estaBaixo(p))
}
