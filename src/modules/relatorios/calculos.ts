// Relatórios — cálculos derivados dos mesmos lançamentos do Caixa.
// Não existe armazenamento próprio: tudo é recalculado a partir das fontes
// reais (Caixa, Comissões, Clientes, Profissionais). Mesmos critérios:
// estornados ficam fora da receita, cancelados/não compareceram nunca
// geram lançamento, despesas são contadas à parte.
import type { Lancamento } from '@/modules/caixa/types'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import type { FormaPagamento } from '@/modules/caixa/types'
import { arredondar, dentroDoPeriodo } from '@/modules/comissoes/producao'
import type { FechamentoComissao, Periodo } from '@/modules/comissoes/types'

type Fonte = { nome: string; criadoEm: string }

export function doPeriodo(
  lancamentos: Lancamento[],
  periodo: Periodo,
): Lancamento[] {
  return lancamentos.filter((l) => dentroDoPeriodo(l.data, periodo))
}

function receitasValidas(lista: Lancamento[]): Lancamento[] {
  return lista.filter((l) => l.tipo === 'receita' && !l.estornado)
}

function soma(lista: Lancamento[]): number {
  return arredondar(lista.reduce((total, l) => total + l.valorLiquido, 0))
}

/* ------------------------------------------------------------------ */
/* Resumo financeiro                                                   */
/* ------------------------------------------------------------------ */

export type ResumoFinanceiro = {
  receitaServicos: number
  receitaProdutos: number
  receitaTotal: number
  despesas: number
  estornos: number
  resultado: number
  ticketMedio: number
  qtdAtendimentosPagos: number
  temDados: boolean
}

export function resumoFinanceiro(
  lancamentos: Lancamento[],
  periodo: Periodo,
): ResumoFinanceiro {
  const base = doPeriodo(lancamentos, periodo)
  const receitas = receitasValidas(base)
  const atendimentos = receitas.filter((l) => l.origem === 'atendimento')
  const produtos = receitas.filter((l) => l.origem === 'produto')

  const receitaServicos = soma(atendimentos)
  const receitaProdutos = soma(produtos)
  const receitaTotal = arredondar(receitaServicos + receitaProdutos)
  const despesas = soma(
    base.filter((l) => l.tipo === 'despesa' && !l.estornado),
  )
  const estornos = soma(
    base.filter((l) => l.tipo === 'receita' && l.estornado),
  )
  const qtdAtendimentosPagos = atendimentos.length

  return {
    receitaServicos,
    receitaProdutos,
    receitaTotal,
    despesas,
    estornos,
    resultado: arredondar(receitaTotal - despesas),
    ticketMedio:
      qtdAtendimentosPagos > 0
        ? arredondar(receitaServicos / qtdAtendimentosPagos)
        : 0,
    qtdAtendimentosPagos,
    temDados: base.length > 0,
  }
}

/* ------------------------------------------------------------------ */
/* Faturamento                                                         */
/* ------------------------------------------------------------------ */

export type EvolucaoDia = { data: string; receita: number; despesa: number }

export type Faturamento = {
  bruto: number
  servicos: number
  produtos: number
  descontos: number
  estornos: number
  despesas: number
  liquido: number
  evolucao: EvolucaoDia[]
  temDados: boolean
}

export function faturamento(
  lancamentos: Lancamento[],
  periodo: Periodo,
): Faturamento {
  const base = doPeriodo(lancamentos, periodo)
  const receitas = receitasValidas(base)

  const bruto = arredondar(
    receitas
      .filter((l) => l.origem === 'atendimento' || l.origem === 'produto')
      .reduce((total, l) => total + l.valor, 0),
  )
  const descontos = arredondar(
    receitas
      .filter((l) => l.origem === 'atendimento' || l.origem === 'produto')
      .reduce((total, l) => total + l.desconto, 0),
  )
  const servicos = soma(receitas.filter((l) => l.origem === 'atendimento'))
  const produtos = soma(receitas.filter((l) => l.origem === 'produto'))
  const estornos = soma(
    base.filter((l) => l.tipo === 'receita' && l.estornado),
  )
  const despesas = soma(
    base.filter((l) => l.tipo === 'despesa' && !l.estornado),
  )
  const liquido = arredondar(servicos + produtos)

  const porDia = new Map<string, EvolucaoDia>()
  for (const l of base) {
    const dia = porDia.get(l.data) ?? { data: l.data, receita: 0, despesa: 0 }
    if (l.tipo === 'receita' && !l.estornado) dia.receita += l.valorLiquido
    if (l.tipo === 'despesa' && !l.estornado) dia.despesa += l.valorLiquido
    porDia.set(l.data, dia)
  }
  const evolucao = [...porDia.values()]
    .map((d) => ({
      data: d.data,
      receita: arredondar(d.receita),
      despesa: arredondar(d.despesa),
    }))
    .sort((a, b) => a.data.localeCompare(b.data))

  return {
    bruto,
    servicos,
    produtos,
    descontos,
    estornos,
    despesas,
    liquido,
    evolucao,
    temDados: base.length > 0,
  }
}

/* ------------------------------------------------------------------ */
/* Formas de pagamento                                                 */
/* ------------------------------------------------------------------ */

export type FormaLinha = {
  forma: FormaPagamento
  rotulo: string
  valor: number
  qtd: number
  percentual: number
}

export function formasPagamento(
  lancamentos: Lancamento[],
  periodo: Periodo,
): { linhas: FormaLinha[]; total: number; temDados: boolean } {
  const receitas = receitasValidas(doPeriodo(lancamentos, periodo)).filter(
    (l) => l.origem === 'atendimento' || l.origem === 'produto',
  )
  const total = soma(receitas)

  const linhas = FORMAS_PAGAMENTO.map((forma) => {
    const daForma = receitas.filter((l) => l.formaPagamento === forma)
    const valor = soma(daForma)
    return {
      forma,
      rotulo: FORMAS_ROTULO[forma],
      valor,
      qtd: daForma.length,
      percentual: total > 0 ? Math.round((valor / total) * 1000) / 10 : 0,
    }
  }).filter((l) => l.qtd > 0)

  return { linhas, total, temDados: linhas.length > 0 }
}

/* ------------------------------------------------------------------ */
/* Serviços                                                            */
/* ------------------------------------------------------------------ */

export type ServicoLinha = {
  nome: string
  qtd: number
  faturamento: number
  ticketMedio: number
}

export function servicosDoPeriodo(
  lancamentos: Lancamento[],
  periodo: Periodo,
): {
  linhas: ServicoLinha[]
  maisRealizado: ServicoLinha | null
  maisReceita: ServicoLinha | null
  temDados: boolean
} {
  const atendimentos = receitasValidas(doPeriodo(lancamentos, periodo)).filter(
    (l) => l.origem === 'atendimento',
  )
  const mapa = new Map<string, { qtd: number; faturamento: number }>()
  for (const l of atendimentos) {
    const nome = l.servico || 'Sem serviço'
    const atual = mapa.get(nome) ?? { qtd: 0, faturamento: 0 }
    atual.qtd += 1
    atual.faturamento += l.valorLiquido
    mapa.set(nome, atual)
  }

  const linhas = [...mapa.entries()]
    .map(([nome, v]) => ({
      nome,
      qtd: v.qtd,
      faturamento: arredondar(v.faturamento),
      ticketMedio: arredondar(v.faturamento / v.qtd),
    }))
    .sort((a, b) => b.qtd - a.qtd || b.faturamento - a.faturamento)

  const maisReceita =
    linhas.length > 0
      ? [...linhas].sort((a, b) => b.faturamento - a.faturamento)[0]
      : null

  return {
    linhas,
    maisRealizado: linhas[0] ?? null,
    maisReceita,
    temDados: linhas.length > 0,
  }
}

/* ------------------------------------------------------------------ */
/* Despesas                                                            */
/* ------------------------------------------------------------------ */

export type DespesasRelatorio = {
  total: number
  qtd: number
  porCategoria: { categoria: string; valor: number; qtd: number }[]
  evolucao: { data: string; valor: number }[]
  temDados: boolean
}

export function despesasDoPeriodo(
  lancamentos: Lancamento[],
  periodo: Periodo,
): DespesasRelatorio {
  const despesas = doPeriodo(lancamentos, periodo).filter(
    (l) => l.tipo === 'despesa' && !l.estornado,
  )

  const categorias = new Map<string, { valor: number; qtd: number }>()
  const dias = new Map<string, number>()
  for (const l of despesas) {
    const cat = l.categoria || 'Outros'
    const atual = categorias.get(cat) ?? { valor: 0, qtd: 0 }
    atual.valor += l.valorLiquido
    atual.qtd += 1
    categorias.set(cat, atual)
    dias.set(l.data, (dias.get(l.data) ?? 0) + l.valorLiquido)
  }

  return {
    total: soma(despesas),
    qtd: despesas.length,
    porCategoria: [...categorias.entries()]
      .map(([categoria, v]) => ({
        categoria,
        valor: arredondar(v.valor),
        qtd: v.qtd,
      }))
      .sort((a, b) => b.valor - a.valor),
    evolucao: [...dias.entries()]
      .map(([data, valor]) => ({ data, valor: arredondar(valor) }))
      .sort((a, b) => a.data.localeCompare(b.data)),
    temDados: despesas.length > 0,
  }
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export type ClienteLinha = {
  chave: string
  nome: string
  atendimentos: number
  gasto: number
}

export type ClientesRelatorio = {
  atendidos: number
  novos: number
  recorrentes: number
  totalGasto: number
  ticketMedio: number
  linhas: ClienteLinha[]
  temDados: boolean
}

export function clientesDoPeriodo(
  lancamentos: Lancamento[],
  clientes: Fonte[],
  periodo: Periodo,
): ClientesRelatorio {
  const receitas = receitasValidas(doPeriodo(lancamentos, periodo)).filter(
    (l) => l.cliente,
  )

  const mapa = new Map<string, ClienteLinha>()
  for (const l of receitas) {
    const chave = normalizar(l.cliente as string)
    if (!chave) continue
    const atual = mapa.get(chave) ?? {
      chave,
      nome: l.cliente as string,
      atendimentos: 0,
      gasto: 0,
    }
    if (l.origem === 'atendimento') atual.atendimentos += 1
    atual.gasto += l.valorLiquido
    mapa.set(chave, atual)
  }

  const linhas = [...mapa.values()]
    .map((l) => ({ ...l, gasto: arredondar(l.gasto) }))
    .sort((a, b) => b.gasto - a.gasto)

  const totalGasto = arredondar(linhas.reduce((t, l) => t + l.gasto, 0))
  const novos = clientes.filter(
    (c) => c.criadoEm.slice(0, 10) >= periodo.inicio && c.criadoEm.slice(0, 10) <= periodo.fim,
  ).length

  return {
    atendidos: linhas.length,
    novos,
    recorrentes: linhas.filter((l) => l.atendimentos >= 2).length,
    totalGasto,
    ticketMedio: linhas.length > 0 ? arredondar(totalGasto / linhas.length) : 0,
    linhas,
    temDados: linhas.length > 0 || novos > 0,
  }
}

/* ------------------------------------------------------------------ */
/* Comissões — fechamentos                                             */
/* ------------------------------------------------------------------ */

export function fechamentosDoPeriodo(
  fechamentos: FechamentoComissao[],
  periodo: Periodo,
): { lista: FechamentoComissao[]; totalFechado: number } {
  const lista = fechamentos.filter(
    (f) =>
      !f.reaberto &&
      f.periodo.inicio >= periodo.inicio &&
      f.periodo.fim <= periodo.fim,
  )
  return {
    lista,
    totalFechado: arredondar(lista.reduce((t, f) => t + f.comissao, 0)),
  }
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}
