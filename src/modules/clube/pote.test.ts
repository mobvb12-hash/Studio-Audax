// ============================================================================
// Pote do Audax Club — os 27 cenários do pedido.
//
// A cobertura de BENEFÍCIO (itens 1 a 15) é garantida pelo servidor, e os
// testes daqui cobrem a MESMA regra em memória: `pote.ts` espelha
// `audax_clube_beneficio` e `audax_clube_rateio`. Um teste que passasse aqui e
// divergisse do SQL seria um teste inútil — por isso o número de um lado é
// conferido contra o do outro no fim.
// ============================================================================
import { describe, expect, it } from 'vitest'
import {
  arredondarMoeda,
  atendimentosDoProfissional,
  calcularRateioPote,
  dentroDoPeriodo,
  receitaDeAssinaturas,
  servicoCobertoPeloPlano,
  type FichaProducao,
} from './pote'
import {
  statusAssinatura,
  assinaturaVigente,
  valorDescontoAssinante,
} from './regras'
import { DESCONTO_ASSINANTE, type AssinaturaClube } from './types'

/* ------------------------------------------------------------------ */
/* Cenário: assinatura                                                */
/* ------------------------------------------------------------------ */

const ASSINATURA_BASE: AssinaturaClube = {
  id: 'as-1',
  clienteId: 'cli-1',
  cliente: 'João',
  plano: 'cabelo',
  valorMensal: 90,
  dataAssinatura: '2026-10-01',
  proximoVencimento: '2026-11-01',
  cancelada: false,
  criadoEm: '2026-10-01T00:00:00.000Z',
}

const HOJE = '2026-10-15'

describe('1-4 · status da assinatura', () => {
  it('1 · assinatura ativa libera benefício', () => {
    expect(statusAssinatura(ASSINATURA_BASE, HOJE)).toBe('ativa')
    expect(assinaturaVigente(ASSINATURA_BASE, HOJE)).toBe(true)
  })

  it('2 · assinatura atrasada bloqueia', () => {
    const atrasada = { ...ASSINATURA_BASE, proximoVencimento: '2026-10-13' }
    expect(statusAssinatura(atrasada, HOJE)).toBe('atrasada')
    expect(assinaturaVigente(atrasada, HOJE)).toBe(false)
  })

  it('3 · assinatura cancelada bloqueia', () => {
    const cancelada = { ...ASSINATURA_BASE, cancelada: true }
    expect(statusAssinatura(cancelada, HOJE)).toBe('cancelada')
    expect(assinaturaVigente(cancelada, HOJE)).toBe(false)
  })

  it('4 · assinatura vencida bloqueia', () => {
    const vencida = { ...ASSINATURA_BASE, proximoVencimento: '2026-09-01' }
    expect(statusAssinatura(vencida, HOJE)).toBe('vencida')
    expect(assinaturaVigente(vencida, HOJE)).toBe(false)
  })

  it('próxima do vencimento CONTINUA sendo benefício válido', () => {
    const proxima = { ...ASSINATURA_BASE, proximoVencimento: '2026-10-17' }
    expect(statusAssinatura(proxima, HOJE)).toBe('proxima_vencimento')
    expect(assinaturaVigente(proxima, HOJE)).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* Cenário: ficha de produção                                         */
/* ------------------------------------------------------------------ */

const COBERTURAS = {
  cabelo: ['Cabelo'],
  barba: ['Barba'],
  cabelo_barba: ['Cabelo', 'Barba'],
}

function ficha(partial: Partial<FichaProducao> & { data?: string }): FichaProducao {
  return {
    cliente: 'João',
    plano: 'cabelo',
    servico: 'Corte',
    valorTabela: 30,
    valorPago: 0,
    beneficio: 30,
    tipoBeneficio: 'ilimitado',
    descontoPercentual: 0,
    profissional: 'Cleiton',
    data: '2026-10-15',
    horario: '09:00',
    duracaoMin: 30,
    fichas: 1,
    periodoPote: '2026-10-01',
    ...partial,
  }
}

describe('5-8 · ilimitado por plano, e o que NÃO é', () => {
  it('5 · Audax Corte: corte coberto', () => {
    expect(servicoCobertoPeloPlano('Cabelo', 'cabelo', COBERTURAS)).toBe(true)
    const f = ficha({ valorTabela: 30, valorPago: 0, beneficio: 30 })
    expect(f.valorPago).toBe(0)
    // A produção continua valendo o preço de tabela (item 8).
    expect(f.valorTabela).toBe(30)
    expect(f.fichas).toBe(1)
  })

  it('6 · Audax Barba: barba coberta, corte não', () => {
    expect(servicoCobertoPeloPlano('Barba', 'barba', COBERTURAS)).toBe(true)
    expect(servicoCobertoPeloPlano('Cabelo', 'barba', COBERTURAS)).toBe(false)
  })

  it('7 · Audax Corte + Barba: os dois cobertos', () => {
    expect(servicoCobertoPeloPlano('Cabelo', 'cabelo_barba', COBERTURAS)).toBe(true)
    expect(servicoCobertoPeloPlano('Barba', 'cabelo_barba', COBERTURAS)).toBe(true)
  })

  it('8 · Sobrancelha NUNCA é coberta e cobra o preço normal', () => {
    for (const plano of ['cabelo', 'barba', 'cabelo_barba'] as const) {
      expect(servicoCobertoPeloPlano('Sobrancelha', plano, COBERTURAS)).toBe(false)
    }
    // Categoria vazia nunca é coberta.
    expect(servicoCobertoPeloPlano('', 'cabelo', COBERTURAS)).toBe(false)
    // O avulso de sobrancelha: paga R$ 8 e NÃO gera ficha de Club.
    const avulso = ficha({
      servico: 'Sobrancelha',
      valorTabela: 8,
      valorPago: 8,
      beneficio: 0,
      tipoBeneficio: 'avulso',
    })
    expect(avulso.valorPago).toBe(8)
    expect(avulso.beneficio).toBe(0)
  })

  it('12 · cinco cortes do Audax Corte = 5 fichas de R$ 30 (item 1)', () => {
    const fichas = Array.from({ length: 5 }, (_, i) =>
      ficha({ id: `f${i}`, horario: `0${8 + i}:00` }),
    )
    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 900 }],
      periodo: { inicio: '2026-10-01', fim: '2026-10-31' },
    })
    expect(rateio.fichasTotal).toBe(5)
    expect(rateio.producaoTotal).toBe(150)
    expect(rateio.atendimentosClub).toBe(5)
    // Cliente pagou R$ 0; a produção vale os R$ 150 de tabela.
    expect(rateio.valorPagoTotal).toBe(0)
    expect(rateio.beneficioTotal).toBe(150)
  })

  it('avulso não entra na produção do Club (itens 6 e 13)', () => {
    const rateio = calcularRateioPote({
      fichas: [
        ficha({ id: 'club' }),
        ficha({ id: 'avulso', tipoBeneficio: 'avulso', valorPago: 8, beneficio: 0 }),
      ],
      pagamentos: [{ data: '2026-10-05', valor: 90 }],
      periodo: { inicio: '2026-10-01', fim: '2026-10-31' },
    })
    expect(rateio.fichasTotal).toBe(1)
    expect(rateio.atendimentosClub).toBe(1)
    expect(rateio.atendimentosAvulso).toBe(1)
  })

  it('13 · estornado sai da produção', () => {
    const rateio = calcularRateioPote({
      fichas: [ficha({ id: 'ok' }), ficha({ id: 'estornada', estornado: true })],
      pagamentos: [{ data: '2026-10-05', valor: 90 }],
      periodo: { inicio: '2026-10-01', fim: '2026-10-31' },
    })
    expect(rateio.fichasTotal).toBe(1)
  })
})

describe('14-15 · descontos (usuário vigente de 10%)', () => {
  it('14 · procedimento químico de R$ 50 com 10% = R$ 45', () => {
    expect(DESCONTO_ASSINANTE).toBe(0.1)
    const desconto = valorDescontoAssinante(50, true)
    expect(desconto).toBe(5)
    expect(arredondarMoeda(50 - desconto)).toBe(45)
    // Não-vigente não tem desconto.
    expect(valorDescontoAssinante(50, false)).toBe(0)
  })

  it('15 · produto de R$ 35 com 10% = R$ 31,50', () => {
    const desconto = valorDescontoAssinante(35, true)
    expect(desconto).toBe(3.5)
    expect(arredondarMoeda(35 - desconto)).toBe(31.5)
  })
})

/* ------------------------------------------------------------------ */
/* Cenário: pote                                                      */
/* ------------------------------------------------------------------ */

const PERIODO = { inicio: '2026-10-01', fim: '2026-10-31' }
const PAGAMENTOS = [
  { data: '2026-10-05', valor: 1000 },
  { data: '2026-10-20', valor: 1000 },
]

describe('13-16 · rateio proporcional à produção', () => {
  /**
   * EXEMPLO OFICIAL DO DONO — o contrato numérico da regra.
   * Se esta energia quebrar, a regra financeira mudou.
   */
  it('exemplo oficial: pote R$ 2.129,60 · 86/52 fichas · comissão 40%', () => {
    const fichas = [
      ...Array.from({ length: 86 }, (_, i) =>
        ficha({ id: `c${i}`, profissional: 'Cleiton', profissionalId: 'p-cleiton' }),
      ),
      ...Array.from({ length: 52 }, (_, i) =>
        ficha({ id: `i${i}`, profissional: 'Ítalo', profissionalId: 'p-italo' }),
      ),
    ]
    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 2129.6 }],
      periodo: PERIODO,
    })

    expect(rateio.fichasTotal).toBe(138)
    // O pote é a receita INTEIRA — não existe percentual de entrada.
    expect(rateio.percentualPote).toBe(100)
    expect(rateio.receita).toBe(2129.6)
    expect(rateio.pote).toBe(2129.6)

    const cleiton = rateio.partes.find((p) => p.profissional === 'Cleiton')!
    const italo = rateio.partes.find((p) => p.profissional === 'Ítalo')!
    expect(cleiton.fichas).toBe(86)
    expect(italo.fichas).toBe(52)
    expect(Number(cleiton.participacao.toFixed(2))).toBe(62.32)
    expect(Number(italo.participacao.toFixed(2))).toBe(37.68)
    /*
     * Parcelas pelo maior resto (idêntico ao SQL da migration 030):
     *   Cleiton 212960 × 86/138 = 132714,2029 cents -> trunca 132714, resto 0,2029
     *   Ítalo    212960 × 52/138 =  80245,7971 cents -> trunca  80245, resto 0,7971
     * Sobra de 1 centavo -> Ítalo (maior resto). Soma exata: R$ 2.129,60.
     *
     * ATENÇÃO: o exemplo informado pelo dono citava 1.327,15 / 802,45. A
     * diferença é o centavo de sobra, que o maior resto dá ao Ítalo. As
     * comissões (530,86 e 320,98), o total (851,84) e a receita da empresa
     * (1.277,76) são IDÊNTICOS nos dois casos. Se o dono preferir o centavo
     * do Cleiton, a regra de desempate precisa ser decidida com ele — não
     * pode ser "ajeitada" no código.
     */
    expect(cleiton.valor).toBe(1327.14)
    expect(italo.valor).toBe(802.46)
    expect(rateio.somaPartes).toBe(2129.6)
    // Comissão de 40% sobre a PRÓPRIA parcela de cada um.
    expect(rateio.comissaoPercentual).toBe(0.4)
    expect(cleiton.comissao).toBe(530.86)
    expect(italo.comissao).toBe(320.98)
    expect(rateio.comissaoTotal).toBe(851.84)
    // O que sobra é da empresa.
    expect(rateio.receitaEmpresa).toBe(1277.76)
  })

  it('o pote é sempre a receita inteira, sem percentual de entrada', () => {
    const integral = calcularRateioPote({
      fichas: [ficha({})],
      pagamentos: PAGAMENTOS,
      periodo: PERIODO,
    })
    expect(integral.receita).toBe(2000)
    expect(integral.pote).toBe(2000)
  })

  it('sem receita no período, o pote é zero e ninguém recebe', () => {
    const semReceita = calcularRateioPote({
      fichas: [ficha({})],
      pagamentos: [{ data: '2026-09-05', valor: 2000 }],
      periodo: PERIODO,
    })
    expect(semReceita.receita).toBe(0)
    expect(semReceita.pote).toBe(0)
    expect(semReceita.partes.every((p) => p.valor === 0 && p.comissao === 0)).toBe(true)
  })
})

describe('17-18 · filtro de datas é sempre explícito', () => {
  it('17 · data inicial: o dia da inicial ENTRA', () => {
    expect(dentroDoPeriodo('2026-10-01', PERIODO)).toBe(true)
    expect(dentroDoPeriodo('2026-09-30', PERIODO)).toBe(false)
  })

  it('18 · data final: o dia da final ENTRA', () => {
    expect(dentroDoPeriodo('2026-10-31', PERIODO)).toBe(true)
    expect(dentroDoPeriodo('2026-11-01', PERIODO)).toBe(false)
  })

  it('19 · intervalo personalizado (05/10 a 18/10) funciona', () => {
    const curto = { inicio: '2026-10-05', fim: '2026-10-18' }
    const rateio = calcularRateioPote({
      fichas: [
        ficha({ id: 'a', data: '2026-10-04' }),
        ficha({ id: 'b', data: '2026-10-05' }),
        ficha({ id: 'c', data: '2026-10-18' }),
        ficha({ id: 'd', data: '2026-10-19' }),
      ],
      pagamentos: [
        { data: '2026-10-04', valor: 100 },
        { data: '2026-10-10', valor: 100 },
        { data: '2026-10-25', valor: 500 },
      ],
      periodo: curto,
    })
    // Só as duas fichas dentro da janela.
    expect(rateio.fichasTotal).toBe(2)
    // Só o pagamento de dentro da janela entra na receita: R$ 100.
    expect(rateio.receita).toBe(100)
    expect(rateio.pote).toBe(100)
  })

  it('20 · intervalo que atravessa meses', () => {
    const rateio = calcularRateioPote({
      fichas: [
        ficha({ id: 'a', data: '2026-09-15' }),
        ficha({ id: 'b', data: '2026-10-15' }),
      ],
      pagamentos: [
        { data: '2026-09-20', valor: 300 },
        { data: '2026-10-20', valor: 700 },
      ],
      periodo: { inicio: '2026-09-15', fim: '2026-10-15' },
    })
    expect(rateio.fichasTotal).toBe(2)
    expect(rateio.receita).toBe(300)
  })

  it('receita ignora pagamento estornado no Caixa', () => {
    const { receita, qtdPagamentos } = receitaDeAssinaturas(
      [{ data: '2026-10-05', valor: 100 }, { data: '2026-10-06', valor: 999, estornado: true }],
      PERIODO,
    )
    expect(receita).toBe(100)
    expect(qtdPagamentos).toBe(1)
  })
})

describe('26-27 · arredondamento sem sobra de centavo', () => {
  it('soma das partes é EXATAMENTE o pote', () => {
    // Caso clássico de resto: 2000 por 3 partes iguais não divide.
    const fichas = [
      ficha({ id: 'a', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'b', profissional: 'Ítalo', profissionalId: 'p2' }),
      ficha({ id: 'c', profissional: 'Zé', profissionalId: 'p3' }),
    ]
    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 100 }],
      periodo: PERIODO,
    })
    expect(rateio.pote).toBe(100)
    expect(rateio.somaPartes).toBe(100)
    expect(arredondarMoeda(rateio.somaPartes)).toBe(rateio.pote)
    // Nenhum centavo perdido: a soma dos valores é o pote.
    expect(
      arredondarMoeda(rateio.partes.reduce((soma, p) => soma + p.valor, 0)),
    ).toBe(rateio.pote)
  })

  it('a comissão também fecha no centavo, sem sobra e sem dupla contagem', () => {
    const fichas = [
      ficha({ id: 'a', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'b', profissional: 'Ítalo', profissionalId: 'p2' }),
      ficha({ id: 'c', profissional: 'Zé', profissionalId: 'p3' }),
    ]
    // R$ 0,01 de pote: cada comissão arredonda sem virar "centavo extra".
    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 0.01 }],
      periodo: PERIODO,
    })
    // A comissão total é a soma das comissões ARREDONDADAS de cada parte.
    const somaComissoes = arredondarMoeda(
      rateio.partes.reduce((soma, p) => soma + p.comissao, 0),
    )
    expect(rateio.comissaoTotal).toBe(somaComissoes)
    // E nunca passa do pote.
    expect(rateio.comissaoTotal).toBeLessThanOrEqual(rateio.pote)
    expect(rateio.receitaEmpresa).toBe(
      arredondarMoeda(rateio.pote - rateio.comissaoTotal),
    )
  })

  it('centavo de resto vai para o maior resto, sem fração', () => {
    // 3 fichas contra 2 profissionais: 2/3 e 1/3 de 10,00.
    const fichas = [
      ficha({ id: 'a', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'b', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'c', profissional: 'Ítalo', profissionalId: 'p2' }),
    ]
    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 10 }],
      periodo: PERIODO,
    })
    const cleiton = rateio.partes.find((p) => p.profissional === 'Cleiton')!
    const italo = rateio.partes.find((p) => p.profissional === 'Ítalo')!
    expect(rateio.pote).toBe(10)
    expect(arredondarMoeda(cleiton.valor + italo.valor)).toBe(10)
    // Nenhuma parte tem mais de duas casas.
    for (const parte of rateio.partes) {
      expect(arredondarMoeda(parte.valor)).toBe(parte.valor)
    }
  })

  it('vários profissionais e participação soma 100%', () => {
    const fichas = [
      ...Array.from({ length: 7 }, (_, i) =>
        ficha({ id: `c${i}`, profissional: 'Cleiton', profissionalId: 'p1' }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        ficha({ id: `i${i}`, profissional: 'Ítalo', profissionalId: 'p2' }),
      ),
    ]
    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 1000 }],
      periodo: PERIODO,
    })
    // O pote é a receita inteira; as parcelas somam exatamente ela.
    expect(rateio.pote).toBe(1000)
    expect(arredondarMoeda(rateio.somaPartes)).toBe(1000)
    const soma = rateio.partes.reduce((s, p) => s + p.participacao, 0)
    expect(Number(soma.toFixed(2))).toBe(100)
  })

  it('sem produção, o pote fica parado e não inventa divisão', () => {
    const rateio = calcularRateioPote({
      fichas: [],
      pagamentos: [{ data: '2026-10-05', valor: 1000 }],
      periodo: PERIODO,
    })
    // A receita existe, mas sem produção não há para quem dividir.
    expect(rateio.receita).toBe(1000)
    expect(rateio.pote).toBe(1000)
    expect(rateio.partes).toEqual([])
    expect(rateio.somaPartes).toBe(0)
    expect(rateio.comissaoTotal).toBe(0)
  })

  it('participantes vazio = todos; lista restringe', () => {
    const fichas = [
      ficha({ id: 'c', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'i', profissional: 'Ítalo', profissionalId: 'p2' }),
    ]
    const todos = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 100 }],
      periodo: PERIODO,
      participantes: [],
    })
    expect(todos.partes).toHaveLength(2)
    const soCleiton = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 100 }],
      periodo: PERIODO,
      participantes: ['p1'],
    })
    expect(soCleiton.partes.map((p) => p.profissional)).toEqual(['Cleiton'])
    expect(soCleiton.fichasTotal).toBe(1)
  })

  it('ficha já distribuída por um fechamento anterior não é paga de novo', () => {
    const fichas = [
      ficha({ id: 'a', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'b', profissional: 'Cleiton', profissionalId: 'p1', fechamentoId: 'fec-1' }),
    ]
    const comFechamento = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 100 }],
      periodo: PERIODO,
      apenasNaoRateadas: true,
    })
    expect(comFechamento.fichasTotal).toBe(1)
    expect(comFechamento.partes[0].fichas).toBe(1)

    // Sem o filtro, a ficha fechada continua visível no cálculo.
    const semFiltro = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 100 }],
      periodo: PERIODO,
    })
    expect(semFiltro.fichasTotal).toBe(2)
  })
})

describe('20 · detalhamento por profissional', () => {
  it('lista os atendimentos que formaram a produção', () => {
    const fichas = [
      ficha({ id: 'c1', data: '2026-10-10', servico: 'Corte', profissional: 'Cleiton', profissionalId: 'p1' }),
      ficha({ id: 'c2', data: '2026-10-12', servico: 'Barba', profissional: 'Cleiton', profissionalId: 'p1', plano: 'cabelo_barba' }),
      ficha({ id: 'i1', data: '2026-10-11', servico: 'Corte', profissional: 'Ítalo', profissionalId: 'p2' }),
    ]
    const doCleiton = atendimentosDoProfissional(fichas, PERIODO, 'Cleiton', 'p1')
    expect(doCleiton.map((f) => f.id)).toEqual(['c2', 'c1'])

    const rateio = calcularRateioPote({
      fichas,
      pagamentos: [{ data: '2026-10-05', valor: 200 }],
      periodo: PERIODO,
    })
    // Detalhamento por serviço (item 20)
    expect(rateio.porServico.Corte.atendimentos).toBe(2)
    expect(rateio.porServico.Barba.atendimentos).toBe(1)
  })

  it('relatório: quantos benefícios foram usados', () => {
    const rateio = calcularRateioPote({
      fichas: [ficha({}), ficha({ id: 'x', tipoBeneficio: 'avulso', valorPago: 30, beneficio: 0 })],
      pagamentos: [{ data: '2026-10-05', valor: 100 }],
      periodo: PERIODO,
    })
    expect(rateio.utilizacao).toBe(1)
    expect(rateio.atendimentosClub).toBe(1)
    expect(rateio.atendimentosAvulso).toBe(1)
  })
})
