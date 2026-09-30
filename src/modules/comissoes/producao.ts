// Produção do profissional — cálculo puro a partir dos pagamentos do Caixa.
// Cancelados, não comparecidos e não pagos nunca geram lançamento no Caixa;
// estornos são excluídos da produção e reportados à parte.
import type { Lancamento } from '@/modules/caixa/types'
import { normalizarTexto } from '@/lib/moeda'
import type { Periodo } from './types'

export type ProducaoProfissional = {
  /** atendimentos pagos e não estornados no período */
  qtdAtendimentos: number
  /** soma dos valores cheios dos serviços (sem estorno) */
  bruto: number
  /** soma dos descontos concedidos */
  descontos: number
  /** valor líquido = bruto - descontos */
  liquido: number
  /** quantidade de estornos no período (informativo) */
  qtdEstornos: number
  /** valor líquido estornado no período (já retirado da produção) */
  valorEstornos: number
  /** itens que compõem a produção (para detalhamento) */
  itens: Lancamento[]
  /** estornos do período (histórico) */
  estornados: Lancamento[]
  /** vendas de produtos separadas da produção de serviços */
  producaoProdutos: number
  qtdProdutos: number
}

export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function dentroDoPeriodo(data: string, periodo: Periodo): boolean {
  return data >= periodo.inicio && data <= periodo.fim
}

/**
 * Este lançamento pertence ao profissional?
 *
 * Vínculo seguro (§5.3): quando AMBOS têm id (lançamento novo + cadastro),
 * o id manda — rename, caixa ou acentos diferentes nunca mais quebram o
 * match. Lançamento legado (sem id) cai no nome normalizado, que é a regra
 * que o sistema sempre usou (melhorada: normaliza antes de comparar).
 */
function ehDoProfissional(
  l: Lancamento,
  profissional: string,
  profissionalId?: string,
): boolean {
  if (profissionalId && l.profissionalId) {
    return l.profissionalId === profissionalId
  }
  return normalizarTexto(l.profissional ?? '') === normalizarTexto(profissional)
}

export function calcularProducao(
  lancamentos: Lancamento[],
  profissional: string,
  periodo: Periodo,
  profissionalId?: string,
): ProducaoProfissional {
  const doProfissional = lancamentos.filter(
    (l) =>
      ehDoProfissional(l, profissional, profissionalId) &&
      dentroDoPeriodo(l.data, periodo),
  )

  const servicos = doProfissional.filter((l) => l.origem === 'atendimento')
  const estornados = servicos.filter((l) => l.estornado)
  const validos = servicos.filter((l) => !l.estornado)

  const produtos = doProfissional.filter(
    (l) => l.origem === 'produto' && !l.estornado,
  )

  const bruto = validos.reduce((soma, l) => soma + l.valor, 0)
  const descontos = validos.reduce((soma, l) => soma + l.desconto, 0)
  const liquido = validos.reduce((soma, l) => soma + l.valorLiquido, 0)
  const valorEstornos = estornados.reduce((soma, l) => soma + l.valorLiquido, 0)
  const producaoProdutos = produtos.reduce((soma, l) => soma + l.valorLiquido, 0)

  return {
    qtdAtendimentos: validos.length,
    bruto: arredondar(bruto),
    descontos: arredondar(descontos),
    liquido: arredondar(liquido),
    qtdEstornos: estornados.length,
    valorEstornos: arredondar(valorEstornos),
    itens: validos.sort((a, b) =>
      `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`),
    ),
    estornados: estornados.sort((a, b) =>
      `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`),
    ),
    producaoProdutos: arredondar(producaoProdutos),
    qtdProdutos: produtos.length,
  }
}

/** Comissão = produção líquida × percentual. Nunca negativa. */
export function calcularComissao(liquido: number, percentual: number): number {
  if (!Number.isFinite(liquido) || !Number.isFinite(percentual)) return 0
  const base = Math.max(0, liquido)
  const pct = Math.min(100, Math.max(0, percentual))
  return arredondar((base * pct) / 100)
}
