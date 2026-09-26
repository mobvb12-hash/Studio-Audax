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

export type ResumoEstoque = {
  /** Todos os produtos cadastrados (ativos + inativos). */
  total: number
  ativos: number
  inativos: number
  /** Unidades em estoque — patrimônio físico (inclusive de inativos). */
  unidades: number
  /** Ativos com atual <= mínimo (zerados também entram). */
  estoqueBaixo: number
  /** Ativos sem nenhuma unidade disponível. */
  semEstoque: number
  /** Soma de custo x estoque dos produtos com estoque > 0 (custo já cadastrado). */
  valorEstimado: number
}

/**
 * Indicadores exibidos na tela de Estoque.
 * Alertas (estoque baixo / sem estoque) olham apenas produtos ativos — são os
 * vendáveis. Patrimônio (unidades / valor estimado) considera todo estoque
 * físico, usando o custo unitário já cadastrado no produto.
 */
export function resumirEstoque(produtos: Produto[]): ResumoEstoque {
  const resumo: ResumoEstoque = {
    total: produtos.length,
    ativos: 0,
    inativos: 0,
    unidades: 0,
    estoqueBaixo: 0,
    semEstoque: 0,
    valorEstimado: 0,
  }
  for (const produto of produtos) {
    if (produto.ativo) {
      resumo.ativos += 1
      if (estaZerado(produto)) resumo.semEstoque += 1
    } else {
      resumo.inativos += 1
    }
    resumo.unidades += Math.max(0, produto.estoque)
    if (produto.estoque > 0) {
      resumo.valorEstimado += produto.custo * produto.estoque
    }
  }
  resumo.estoqueBaixo = produtosComEstoqueBaixo(produtos).length
  resumo.valorEstimado = Math.round(resumo.valorEstimado * 100) / 100
  return resumo
}
