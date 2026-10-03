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
  /** PARCELA DO POTE: quanto daquele dinheiro a produção dele gerou */
  valor: number
  /** Comissão sobre a PRÓPRIA parcela (40% no Studio Audax) */
  comissao: number
}

export type RateioPote = {
  /** 1. valor efetivamente recebido das assinaturas no período */
  receita: number
  /** 2. o pote: a receita INTEIRA — não existe percentual de entrada */
  pote: number
  /** Registro explícito de que 100% da receita forma o pote */
  percentualPote: number
  /** Fração da comissão do profissional sobre a parcela (0.40 = 40%) */
  comissaoPercentual: number
  fichasTotal: number
  producaoTotal: number
  /** 3. parcelas do pote */
  partes: PartePote[]
  /** Soma das parcelas: tem de ser igual a `pote` (item 7) */
  somaPartes: number
  /** 4. comissão total devida = soma das comissões individuais (item 8) */
  comissaoTotal: number
  /** O que sobra para a empresa: pote menos comissão */
  receitaEmpresa: number
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
/** Arredonda para centavos inteiros: o dinheiro nunca passa por float. */
function arredondarCentavos(valor: number): number {
  return Math.round(valor)
}

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
 * COMISSÃO PADRÃO DO STUDIO AUDAX: 40% sobre a parcela do pote do profissional.
 * Configurável em Configurações → Clube (`clube.comissao.percentual`), porque o
 * dono pode mudar — mas o padrão é o dele: 40%.
 */
export const COMISSAO_PADRAO = 0.4

/**
 * Rateio do pote — a regra real do Studio Audax (migration 030).
 *
 * 1. O pote é a receita EFETIVAMENTE recebida das assinaturas do período,
 *    INTEIRA. Não existe "percentual da receita que entra no pote".
 * 2. O pote é dividido proporcionalmente às fichas de produção.
 * 3. Sobre a PARCELA de cada profissional incide a comissão (0.40 = 40%).
 * 4. O resto permanece como receita da empresa.
 *
 * Espelha `audax_clube_rateio` linha por linha — os dois lados são travados
 * pelos mesmos números de exemplo.
 */
export function calcularRateioPote(input: {
  fichas: FichaProducao[]
  pagamentos: PagamentoAssinatura[]
  periodo: Periodo
  /** Comissão do profissional sobre a parcela: 0.40 = 40%. */
  comissaoPercentual?: number
  /** Profissionais que participam; vazio = todos com produção */
  participantes?: string[]
  /** Fichas já distribuídas por um fechamento anterior não entram de novo. */
  apenasNaoRateadas?: boolean
}): RateioPote {
  const { fichas, pagamentos, periodo } = input
  const participantes = (input.participantes ?? []).filter(Boolean)
  const comissao = input.comissaoPercentual ?? COMISSAO_PADRAO

  const noPeriodo = (fichas ?? []).filter(
    (f) => dentroDoPeriodo(f.data, periodo) && !f.estornado,
  )

  const ehParticipante = (f: FichaProducao): boolean =>
    participantes.length === 0 ||
    participantes.includes(f.profissional) ||
    (f.profissionalId !== undefined && participantes.includes(f.profissionalId))

  // Só produção Club VÁLIDA: avulso não gera ficha, e ficha já distribuída por
  // um fechamento anterior não pode ser paga de novo.
  const doClub = noPeriodo.filter(
    (f) =>
      f.tipoBeneficio !== 'avulso' &&
      ehParticipante(f) &&
      !(input.apenasNaoRateadas === true && Boolean(f.fechamentoId)),
  )

  const { receita, qtdPagamentos } = receitaDeAssinaturas(pagamentos, periodo)
  // O pote é a receita INTEIRA — o dinheiro não passa por float.
  const poteCentavos = centavos(receita)

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
    .map((b) => {
      const parcelaCentavos =
        b.parteCentavos + (comCentavo.has(b.linha.profissional) ? 1 : 0)
      return {
        profissionalId: b.linha.profissionalId,
        profissional: b.linha.profissional,
        fichas: arredondarMoeda(b.linha.fichas),
        producaoReferencia: paraReais(b.linha.referenciaCentavos),
        participacao: Math.round(b.participacao * 10000) / 10000,
        valor: paraReais(parcelaCentavos),
        // Comissão sobre a PRÓPRIA parcela, já arredondada em centavos.
        comissao: paraReais(arredondarCentavos(parcelaCentavos * comissao)),
      }
    })
    .sort((a, b) => a.profissional.localeCompare(b.profissional, 'pt-BR'))

  const somaPartes = paraReais(partes.reduce((soma, p) => soma + centavos(p.valor), 0))
  const comissaoTotal = paraReais(
    partes.reduce((soma, p) => soma + centavos(p.comissao), 0),
  )

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
    // Os QUATRO valores ficam separados: receita paga, pote, parcela e comissão.
    receita,
    pote: paraReais(poteCentavos),
    percentualPote: 100,
    comissaoPercentual: comissao,
    fichasTotal,
    producaoTotal: paraReais(
      doClub.reduce((soma, f) => soma + centavos(f.valorTabela), 0),
    ),
    partes,
    somaPartes,
    comissaoTotal,
    // O que sobra do pote depois da comissão é receita da empresa.
    receitaEmpresa: paraReais(poteCentavos - centavos(comissaoTotal)),
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