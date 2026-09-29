import { describe, expect, it } from 'vitest'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import type {
  AssinaturaClube,
  PagamentoClube,
} from '@/modules/clube/types'
import type { Periodo } from '@/modules/comissoes/types'
import type { Produto } from '@/modules/produtos/types'
import {
  agendaDoPeriodo,
  clubeDoPeriodo,
  faturamento,
  produtosDoPeriodo,
  resumoFinanceiro,
  variacaoPercentual,
} from './calculos'
import { periodoAnterior } from './periodo'

const PERIODO: Periodo = { inicio: '2026-06-01', fim: '2026-06-30' }

function lanc(overrides: Partial<Lancamento> & { id: string; data: string }): Lancamento {
  return {
    tipo: 'receita',
    origem: 'atendimento',
    hora: '10:00',
    descricao: '',
    valor: 100,
    desconto: 0,
    valorLiquido: 100,
    formaPagamento: 'pix',
    criadoEm: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function ag(overrides: Partial<Agendamento> & { id: string; data: string }): Agendamento {
  return {
    cliente: 'Ana Souza',
    telefone: '',
    servico: 'Corte Degradê',
    profissional: 'Audax',
    horario: '10:00',
    status: 'concluido',
    observacao: '',
    criadoEm: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function assinatura(
  overrides: Partial<AssinaturaClube> & { id: string },
): AssinaturaClube {
  return {
    clienteId: 'c-1',
    cliente: 'Ana Souza',
    plano: 'cabelo',
    valorMensal: 100,
    dataAssinatura: '2026-01-01',
    proximoVencimento: '2026-06-28',
    cancelada: false,
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function pagamento(
  overrides: Partial<PagamentoClube> & { id: string; data: string },
): PagamentoClube {
  return {
    assinaturaId: 'a-1',
    clienteId: 'c-1',
    valor: 100,
    formaPagamento: 'pix',
    criadoEm: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('agendaDoPeriodo — contagem de status no período', () => {
  it('conta status, remarcações e ignora o que está fora do período', () => {
    const lista = [
      ag({ id: '1', data: '2026-06-10', status: 'concluido' }),
      ag({ id: '2', data: '2026-06-11', status: 'pendente' }),
      ag({ id: '3', data: '2026-06-12', status: 'confirmado' }),
      ag({ id: '4', data: '2026-06-13', status: 'cancelado' }),
      ag({ id: '5', data: '2026-06-14', status: 'nao_compareceu' }),
      ag({
        id: '6',
        data: '2026-06-15',
        status: 'concluido',
        remarcacoes: [
          {
            de: { data: '2026-06-09', horario: '09:00', profissional: 'Audax' },
            em: '2026-06-09T10:00:00.000Z',
          },
          {
            de: { data: '2026-06-08', horario: '08:00', profissional: 'Diego' },
            em: '2026-06-08T10:00:00.000Z',
          },
        ],
      }),
      ag({ id: '7', data: '2026-07-01', status: 'concluido' }),
    ]

    const r = agendaDoPeriodo(lista, PERIODO)
    expect(r.total).toBe(6)
    expect(r.emAberto).toBe(2)
    expect(r.concluidos).toBe(2)
    expect(r.cancelados).toBe(1)
    expect(r.naoCompareceu).toBe(1)
    expect(r.remarcacoes).toBe(2)
    expect(r.temDados).toBe(true)
  })

  it('sem agendamentos no período devolve zeros e temDados false', () => {
    const r = agendaDoPeriodo([ag({ id: '1', data: '2026-07-01' })], PERIODO)
    expect(r).toEqual({
      total: 0,
      emAberto: 0,
      concluidos: 0,
      cancelados: 0,
      naoCompareceu: 0,
      remarcacoes: 0,
      temDados: false,
    })
  })

  it('não altera a lista recebida', () => {
    const lista = [ag({ id: '1', data: '2026-06-10' })]
    agendaDoPeriodo(lista, PERIODO)
    expect(lista).toHaveLength(1)
  })
})

describe('clubeDoPeriodo — assinaturas e pagamentos reais', () => {
  const HOJE = '2026-06-15'

  it('soma só os pagamentos do período e exclui estornados', () => {
    const assinaturas = [assinatura({ id: 'a-1' })]
    const pagamentos = [
      pagamento({ id: 'p-1', data: '2026-06-10', valor: 99.9 }),
      pagamento({ id: 'p-2', data: '2026-06-20', valor: 50 }),
      pagamento({ id: 'p-3', data: '2026-05-30', valor: 70 }),
      pagamento({
        id: 'p-4',
        data: '2026-06-25',
        valor: 30,
        caixaLancamentoId: 'l-estornado',
      }),
    ]
    const estornados = new Set(['l-estornado'])

    const r = clubeDoPeriodo(assinaturas, pagamentos, PERIODO, estornados, HOJE)
    expect(r.pagamentos).toBe(2)
    expect(r.pagamentosValor).toBe(149.9)
    expect(r.total).toBe(1)
    expect(r.temDados).toBe(true)
  })

  it('deriva as situações pelas regras oficiais do Clube', () => {
    const assinaturas = [
      assinatura({ id: 'a-1', proximoVencimento: '2026-06-28' }),
      assinatura({ id: 'a-2', proximoVencimento: '2026-06-17' }),
      assinatura({ id: 'a-3', proximoVencimento: '2026-06-10' }),
      assinatura({ id: 'a-4', proximoVencimento: '2026-06-01' }),
      assinatura({ id: 'a-5', cancelada: true }),
    ]
    const r = clubeDoPeriodo(assinaturas, [], PERIODO, new Set(), HOJE)
    expect(r.situacoes.ativas).toBe(2)
    expect(r.situacoes.proximas).toBe(1)
    expect(r.situacoes.atrasadas).toBe(1)
    expect(r.situacoes.vencidas).toBe(1)
    expect(r.situacoes.canceladas).toBe(1)
    expect(r.receitaPrevista).toBe(400)
  })

  it('sem assinaturas e sem pagamentos no período devolve zeros', () => {
    const r = clubeDoPeriodo([], [], PERIODO, new Set(), HOJE)
    expect(r.temDados).toBe(false)
    expect(r.pagamentos).toBe(0)
    expect(r.pagamentosValor).toBe(0)
    expect(r.receitaPrevista).toBe(0)
    expect(r.total).toBe(0)
  })
})

describe('variacaoPercentual — comparação só quando faz sentido', () => {
  it('calcula alta, baixa e arredonda em 1 casa decimal', () => {
    expect(variacaoPercentual(120, 100)).toBe(20)
    expect(variacaoPercentual(80, 100)).toBe(-20)
    expect(variacaoPercentual(103, 100)).toBe(3)
    expect(variacaoPercentual(100, 100)).toBe(0)
    expect(variacaoPercentual(-10, -20)).toBe(50)
  })

  it('sem base no período anterior devolve null (UI oculta o %)', () => {
    expect(variacaoPercentual(100, 0)).toBeNull()
    expect(variacaoPercentual(0, 0)).toBeNull()
  })
})

describe('periodoAnterior — janela de mesmo tamanho imediatamente antes', () => {
  it('dia simples vira o dia imediatamente anterior', () => {
    expect(
      periodoAnterior({ inicio: '2026-03-12', fim: '2026-03-12' }),
    ).toEqual({ inicio: '2026-03-11', fim: '2026-03-11' })
  })

  it('preserva o tamanho da janela', () => {
    const atual = { inicio: '2026-03-10', fim: '2026-03-12' }
    const anterior = periodoAnterior(atual)
    expect(anterior).toEqual({ inicio: '2026-03-07', fim: '2026-03-09' })
    const dias = (p: Periodo) =>
      (new Date(`${p.fim}T12:00:00`).getTime() -
        new Date(`${p.inicio}T12:00:00`).getTime()) /
        86_400_000 +
      1
    expect(dias(anterior)).toBe(dias(atual))
  })

  it('cruza o fim do mês corretamente', () => {
    expect(
      periodoAnterior({ inicio: '2026-07-01', fim: '2026-07-02' }),
    ).toEqual({ inicio: '2026-06-29', fim: '2026-06-30' })
  })
})

describe('consistência com as regras oficiais do Caixa', () => {
  it('estorno fica fora da receita e aparece à parte', () => {
    const lista = [
      lanc({ id: 'l-1', data: '2026-06-10', valor: 100, valorLiquido: 100 }),
      lanc({
        id: 'l-2',
        data: '2026-06-11',
        valor: 40,
        valorLiquido: 40,
        estornado: true,
      }),
      lanc({
        id: 'l-3',
        data: '2026-06-12',
        tipo: 'despesa',
        origem: 'despesa',
        valor: 30,
        valorLiquido: 30,
      }),
    ]
    const r = resumoFinanceiro(lista, PERIODO)
    expect(r.receitaTotal).toBe(100)
    expect(r.estornos).toBe(40)
    expect(r.despesas).toBe(30)
    expect(r.resultado).toBe(70)
    expect(r.temDados).toBe(true)
  })

  it('receita líquida do faturamento bate com a receita total do resumo', () => {
    const lista = [
      lanc({ id: 'l-1', data: '2026-06-10', valor: 80, desconto: 10, valorLiquido: 70 }),
      lanc({ id: 'l-2', data: '2026-06-11', origem: 'produto', valor: 50, valorLiquido: 50 }),
      lanc({ id: 'l-3', data: '2026-06-12', origem: 'clube', valor: 99.9, valorLiquido: 99.9 }),
    ]
    const resumo = resumoFinanceiro(lista, PERIODO)
    const fat = faturamento(lista, PERIODO)
    expect(fat.liquido).toBe(resumo.receitaTotal)
    expect(fat.bruto).toBe(229.9)
    expect(fat.descontos).toBe(10)
  })
})

// Auditoria F19: o desconto do PDV é rateado pelo valor bruto de cada
// item — a soma das receitas por produto fecha com o valor líquido do
// caixa (nunca acima do faturamento oficial).
describe('produtosDoPeriodo — desconto do PDV rateado (auditoria F19)', () => {
  const PERIODO_PROD: Periodo = { inicio: '2026-06-01', fim: '2026-06-30' }

  function produto(
    overrides: Partial<Produto> & { id: string; nome: string },
  ): Produto {
    return {
      preco: 30,
      custo: 12,
      estoque: 5,
      estoqueMinimo: 2,
      categoria: '',
      foto: '',
      ativo: true,
      criadoEm: '2026-06-01T00:00:00.000Z',
      atualizadoEm: '2026-06-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('rateia o desconto e fecha com o valor líquido do caixa', () => {
    const venda = lanc({
      id: 'v-1',
      data: '2026-06-15',
      origem: 'produto',
      valor: 130,
      desconto: 10,
      valorLiquido: 120,
      itens: [
        { produtoId: 'p1', produto: 'Pomada', quantidade: 2, preco: 50 },
        { produtoId: 'p2', produto: 'Gel', quantidade: 1, preco: 30 },
      ],
    })
    const r = produtosDoPeriodo(
      [venda],
      [
        produto({ id: 'p1', nome: 'Pomada' }),
        produto({ id: 'p2', nome: 'Gel' }),
      ],
      PERIODO_PROD,
    )

    const pomada = r.linhas.find((l) => l.id === 'p1')!
    const gel = r.linhas.find((l) => l.id === 'p2')!
    expect(pomada.qtdVendida).toBe(2)
    expect(pomada.receita).toBe(92.31)
    expect(gel.qtdVendida).toBe(1)
    expect(gel.receita).toBe(27.69)
    // soma por produto == faturamento oficial do caixa (valorLiquido)
    expect(r.receitaTotal).toBe(120)
    expect(r.qtdTotalVendida).toBe(3)
  })

  it('venda avulsa sem itens continua usando o valor líquido direto', () => {
    const venda = lanc({
      id: 'v-2',
      data: '2026-06-16',
      origem: 'produto',
      produto: 'Pomada',
      quantidade: 3,
      valor: 90,
      valorLiquido: 90,
    })
    const r = produtosDoPeriodo(
      [venda],
      [produto({ id: 'p1', nome: 'Pomada' })],
      PERIODO_PROD,
    )
    expect(r.linhas[0].receita).toBe(90)
    expect(r.receitaTotal).toBe(90)
  })

  it('venda estornada fica fora do relatório de produtos', () => {
    const venda = lanc({
      id: 'v-3',
      data: '2026-06-17',
      origem: 'produto',
      valorLiquido: 50,
      estornado: true,
      itens: [
        { produtoId: 'p1', produto: 'Pomada', quantidade: 1, preco: 50 },
      ],
    })
    const r = produtosDoPeriodo(
      [venda],
      [produto({ id: 'p1', nome: 'Pomada' })],
      PERIODO_PROD,
    )
    expect(r.receitaTotal).toBe(0)
    expect(r.qtdTotalVendida).toBe(0)
  })
})

// Auditoria C5/C6 — 🟠1: o PDV grava `itens[].produtoId` e a venda avulsa do
// Caixa grava só o nome. O mesmo produto vendido pelos dois caminhos no
// período precisa ser SOMADO (a chave não pode escolher só uma das origens)
// e nenhuma venda pode ser contada duas vezes.
describe('produtosDoPeriodo — PDV e venda avulsa do mesmo produto (C5/C6 🟠1)', () => {
  const PERIODO_PROD: Periodo = { inicio: '2026-06-01', fim: '2026-06-30' }

  function produto(
    overrides: Partial<Produto> & { id: string; nome: string },
  ): Produto {
    return {
      preco: 30,
      custo: 12,
      estoque: 5,
      estoqueMinimo: 2,
      categoria: '',
      foto: '',
      ativo: true,
      criadoEm: '2026-06-01T00:00:00.000Z',
      atualizadoEm: '2026-06-01T00:00:00.000Z',
      ...overrides,
    }
  }

  /** Venda do PDV/fechamento — chaveada por produtoId. */
  function vendaPdv(): Lancamento {
    return lanc({
      id: 'v-pdv',
      data: '2026-06-15',
      origem: 'produto',
      valor: 150,
      desconto: 0,
      valorLiquido: 150,
      itens: [
        { produtoId: 'p1', produto: 'Pomada', quantidade: 3, preco: 50 },
      ],
    })
  }

  /** Venda avulsa do Caixa — chaveada pelo nome normalizado. */
  function vendaAvulsa(): Lancamento {
    return lanc({
      id: 'v-avulsa',
      data: '2026-06-20',
      origem: 'produto',
      produto: 'Pomada',
      quantidade: 2,
      valor: 60,
      desconto: 0,
      valorLiquido: 60,
    })
  }

  it('soma PDV e venda avulsa do mesmo produto no mesmo período', () => {
    const r = produtosDoPeriodo(
      [vendaPdv(), vendaAvulsa()],
      [produto({ id: 'p1', nome: 'Pomada' })],
      PERIODO_PROD,
    )

    const pomada = r.linhas.find((l) => l.id === 'p1')!
    expect(pomada.qtdVendida).toBe(5)
    expect(pomada.receita).toBe(210)
    expect(r.qtdTotalVendida).toBe(5)
    expect(r.receitaTotal).toBe(210)

    // o KPI de Receita de produtos continua batendo com a soma por produto
    expect(resumoFinanceiro([vendaPdv(), vendaAvulsa()], PERIODO_PROD).receitaProdutos).toBe(210)
  })

  it('só a venda avulsa também soma normalmente', () => {
    const r = produtosDoPeriodo(
      [vendaAvulsa()],
      [produto({ id: 'p1', nome: 'Pomada' })],
      PERIODO_PROD,
    )
    expect(r.linhas[0].qtdVendida).toBe(2)
    expect(r.linhas[0].receita).toBe(60)
    expect(r.receitaTotal).toBe(60)
  })

  it('uma venda individual não é contada duas vezes', () => {
    // mesma venda, duas chaves de identificação (id e nome) — só uma é usada
    const r = produtosDoPeriodo(
      [vendaPdv()],
      [produto({ id: 'p1', nome: 'Pomada' })],
      PERIODO_PROD,
    )
    expect(r.linhas[0].qtdVendida).toBe(3)
    expect(r.linhas[0].receita).toBe(150)
    expect(r.qtdTotalVendida).toBe(3)
    expect(r.receitaTotal).toBe(150)

    const avulsa = produtosDoPeriodo(
      [vendaAvulsa()],
      [produto({ id: 'p1', nome: 'Pomada' })],
      PERIODO_PROD,
    )
    expect(avulsa.linhas[0].qtdVendida).toBe(2)
    expect(avulsa.receitaTotal).toBe(60)
  })

  it('vendas de produtos diferentes não se misturam ao somar as chaves', () => {
    const gel = lanc({
      id: 'v-gel',
      data: '2026-06-21',
      origem: 'produto',
      produto: 'Gel',
      quantidade: 1,
      valor: 30,
      valorLiquido: 30,
    })
    const r = produtosDoPeriodo(
      [vendaPdv(), gel],
      [produto({ id: 'p1', nome: 'Pomada' }), produto({ id: 'p2', nome: 'Gel' })],
      PERIODO_PROD,
    )
    expect(r.linhas.find((l) => l.id === 'p1')!.qtdVendida).toBe(3)
    expect(r.linhas.find((l) => l.id === 'p1')!.receita).toBe(150)
    expect(r.linhas.find((l) => l.id === 'p2')!.qtdVendida).toBe(1)
    expect(r.linhas.find((l) => l.id === 'p2')!.receita).toBe(30)
    expect(r.receitaTotal).toBe(180)
  })
})
