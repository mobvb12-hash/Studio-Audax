// ============================================================================
// Pote do Audax Club — cálculo puro.
//
// Espelha, palavra por palavra, o que `audax_clube_rateio` faz em SQL
// (migration 028/029). Existe por dois motivos:
//
//   1. o app precisa do MESMO número sem depender de rede, e o modo local
//      (sem Supabase) precisa calcular igual;
//   2. o arredondamento é regra de dinheiro, então precisa de teste.
//
// A REGRA é única (item 10 do pedido):
//   receita destinada ao pote ÷ produção total, proporcional às fichas.
//
// O ARREDONDAMENTO é de MAIOR RESTO: cada parte é truncada em centavos e a
// sobra vai um centavo por vez para quem tem o maior resto fracionário, com
// desempate pelo nome para ser determinístico. Assim a soma das partes é
// EXATAMENTE o pote — nunca sobra nem falta um centavo (itens 26 e 27).
//
// Nada aqui consulta banco, rede ou storage: é entrada/saída pura.
import type { PlanoClube } from './types'

export type FichaProducao = {
  id?: string
  clienteId?: string
  cliente: string
  plano: string
  servico: string
  valorTabela: number
  valorPago: number
  beneficio: number
  /** ilimitado = cobre o plano; desconto =Procedimento químico; avulso = normal */
  tipoBeneficio: 'ilimitado' | 'desconto' | 'avulso'
  descontoPercentual: number
  profissionalId?: string
  profissional: string
  data: string
  horario: string
  duracaoMin: number
  fichas: number
  periodoPote: string
  estornado?: boolean
  fechamentoId?: string | null
}

export type PagamentoAssinatura = {
  data: string
  valor: number
  /** Estorno no Caixa invalida o pagamento (mesma regra do revenueio). */
  estornado?: boolean
}

export type Periodo = { inicio: string; fim: string }

export type PartePote = {
  profissionalId?: string
  profissional: string
  fichas: number
  producaoReferencia: number
  /** Participação em % (4 casas) */
  participacao: number
  /** Valor a receber, já com o centavo de resto */
  valor: number
}

export type RateioPote = {
  receita: number
  percentual: number
  pote: number
  fichasTotal: number
  producaoTotal: number
  partes: PartePote[]
  /** Soma das partes: tem de ser igual a `pote` (item 27) */
  somaPartes: number
  /** Receita real dos pagamentos, sem o que foi estornado */
  qtdPagamentos: number
  valorPagoTotal: number
  beneficioTotal: number
  /** Atendimentos Club e avulso do período, para o relatório (item 23) */
  atendimentosClub: number
  atendimentosAvulso: number
  utilizacao: number
  porServico: Record<string, { atendimentos: number; fichas: number; producaoReferencia: number }>
}

/** Centavos: o dinheiro é inteiro aqui dentro. */
function centavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100)
}

function paraReais(centavosTotais: number): number {
  return Math.round(centavosTotais) / 100
}

/** Arredonda para 2 casas, evitando o binário do JavaScript (0.1 + 0.2). */
export function arredondarMoeda(valor: number): number {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/** A data está dentro do período? Janela INCLUSIVA: >= início e <= fim. */
export function dentroDoPeriodo(data: string, periodo: Periodo): boolean {
  if (!data || !periodo.inicio || !periodo.fim) return false
  return data >= periodo.inicio && data <= periodo.fim
}

/**
 * Receita de assinaturas do período: pagamentos dentro da janela, sem o que
 * foi estornado no Caixa. É a base do pote (item 18).
 */
export function receitaDeAssinaturas(
  pagamentos: PagamentoAssinatura[],
  periodo: Periodo,
): { receita: number; qtdPagamentos: number } {
  const validos = (pagamentos ?? []).filter(
    (p) => dentroDoPeriodo(p.data, periodo) && !p.estornado,
  )
  return {
    receita: paraReais(validos.reduce((soma, p) => soma + centavos(p.valor), 0)),
    qtdPagamentos: validos.length,
  }
}

/**
 * Rateio do pote (itens 10, 19, 26 e 27).
 *
 * `percentual` é sempre o CONFIGURADO pelo dono. Com 0, nada é distribuído e a
 * função diz por quê — é o que impede o sistema de inventar regra financeira.
 */
export function calcularRateioPote(input: {
  fichas: FichaProducao[]
  pagamentos: PagamentoAssinatura[]
  periodo: Periodo
  percentual: number
  /** Profissionais que participam; vazio = todos com produção */
  participantes?: string[]
}): RateioPote {
  const { fichas, pagamentos, periodo, percentual } = input
  const participantes = (input.participantes ?? []).filter(Boolean)

  const noPeriodo = (fichas ?? []).filter(
    (f) => dentroDoPeriodo(f.data, periodo) && !f.estornado,
  )

  const ehParticipante = (f: FichaProducao): boolean =>
    participantes.length === 0 ||
    participantes.includes(f.profissional) ||
    (f.profissionalId !== undefined && participantes.includes(f.profissionalId))

  const doClub = noPeriodo.filter((f) => f.tipoBeneficio !== 'avulso' && ehParticipante(f))

  const { receita, qtdPagamentos } = receitaDeAssinaturas(pagamentos, periodo)
  const percentualNumerico = Number(percentual) || 0
  const poteCentavos =
    percentualNumerico > 0 ? Math.round((receita * percentualNumerico) / 100) * 100 : 0

  // Produção agregada por profissional — a ficha é de UM profissional, então
  // nunca há soma ambígua (itens 7 e 12).
  const agregado = new Map<
    string,
    { profissionalId?: string; profissional: string; fichas: number; referenciaCentavos: number }
  >()
  for (const ficha of doClub) {
    const chave = ficha.profissionalId ?? `nome:${ficha.profissional}`
    const atual = agregado.get(chave)
    if (atual) {
      atual.fichas += ficha.fichas
      atual.referenciaCentavos += centavos(ficha.valorTabela)
    } else {
      agregado.set(chave, {
        profissionalId: ficha.profissionalId,
        profissional: ficha.profissional,
        fichas: ficha.fichas,
        referenciaCentavos: centavos(ficha.valorTabela),
      })
    }
  }

  const linhas = [...agregado.values()]
  const fichasTotal = arredondarMoeda(
    linhas.reduce((soma, l) => soma + l.fichas, 0),
  )

  // Fase 1: parte truncada e resto fracionário de cada um.
  const brutos = linhas.map((linha) => {
    const bruto = (poteCentavos * linha.fichas) / (fichasTotal || 1)
    const parteCentavos = Math.trunc(bruto)
    return {
      linha,
      parteCentavos,
      // resto normalizado em centavos, para comparar e ordenar
      restoCentavos: bruto - parteCentavos,
      participacao: fichasTotal > 0 ? (linha.fichas / fichasTotal) * 100 : 0,
    }
  })

  // Fase 2: a sobra vai um centavo por vez para o maior resto.
  // Empate resolvido pelo nome — determinístico entre execuções.
  const sobraCentavos = poteCentavos - brutos.reduce((soma, b) => soma + b.parteCentavos, 0)
  const ordem = [...brutos].sort(
    (a, b) => b.restoCentavos - a.restoCentavos || a.linha.profissional.localeCompare(b.linha.profissional, 'pt-BR'),
  )
  const comCentavo = new Set(
    ordem.slice(0, Math.max(0, sobraCentavos)).map((b) => b.linha.profissional),
  )

  const partes: PartePote[] = brutos
    .map((b) => ({
      profissionalId: b.linha.profissionalId,
      profissional: b.linha.profissional,
      fichas: arredondarMoeda(b.linha.fichas),
      producaoReferencia: paraReais(b.linha.referenciaCentavos),
      participacao: Math.round(b.participacao * 10000) / 10000,
      valor: paraReais(
        b.parteCentavos + (comCentavo.has(b.linha.profissional) ? 1 : 0),
      ),
    }))
    .sort((a, b) => a.profissional.localeCompare(b.profissional, 'pt-BR'))

  const somaPartes = paraReais(partes.reduce((soma, p) => soma + centavos(p.valor), 0))

  // Detalhamento por serviço (item 20)
  const porServico: RateioPote['porServico'] = {}
  for (const ficha of doClub) {
    const atual = porServico[ficha.servico] ?? {
      atendimentos: 0,
      fichas: 0,
      producaoReferencia: 0,
    }
    porServico[ficha.servico] = {
      atendimentos: atual.atendimentos + 1,
      fichas: arredondarMoeda(atual.fichas + ficha.fichas),
      producaoReferencia: arredondarMoeda(
        atual.producaoReferencia + ficha.valorTabela,
      ),
    }
  }

  return {
    receita,
    percentual: percentualNumerico,
    pote: paraReais(poteCentavos),
    fichasTotal,
    producaoTotal: paraReais(
      doClub.reduce((soma, f) => soma + centavos(f.valorTabela), 0),
    ),
    partes,
    somaPartes,
    qtdPagamentos,
    valorPagoTotal: arredondarMoeda(
      doClub.reduce((soma, f) => soma + f.valorPago, 0),
    ),
    beneficioTotal: arredondarMoeda(
      doClub.reduce((soma, f) => soma + f.beneficio, 0),
    ),
    atendimentosClub: doClub.length,
    atendimentosAvulso: noPeriodo.filter((f) => f.tipoBeneficio === 'avulso').length,
    utilizacao: doClub.length,
    porServico,
  }
}

/**
 * Atendimentos que formaram a produção de um profissional no período.
 * É o detalhamento que a tela abre ao clicar na linha (item 20).
 */
export function atendimentosDoProfissional(
  fichas: FichaProducao[],
  periodo: Periodo,
  profissional: string,
  profissionalId?: string,
): FichaProducao[] {
  return (fichas ?? [])
    .filter(
      (f) =>
        dentroDoPeriodo(f.data, periodo) &&
        !f.estornado &&
        f.tipoBeneficio !== 'avulso' &&
        (f.profissional === profissional ||
          (profissionalId !== undefined && f.profissionalId === profissionalId)),
    )
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
}

/**
 * Plano cobre o serviço? Mesma regra da cobertura configurada, em memória.
 * Usada para avisar o atendente antes de o servidor responder.
 */
export function servicoCobertoPeloPlano(
  categoria: string,
  plano: PlanoClube | string,
  coberturas: Record<string, string[]>,
): boolean {
  if (!categoria.trim()) return false
  const lista = coberturas?.[plano]
  if (!Array.isArray(lista)) return false
  return lista.some(
    (c) => c.trim().toLowerCase() === categoria.trim().toLowerCase(),
  )
}