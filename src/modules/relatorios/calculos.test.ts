import { describe, expect, it } from 'vitest'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import type {
  AssinaturaClube,
  PagamentoClube,
} from '@/modules/clube/types'
import type { Periodo } from '@/modules/comissoes/types'
import {
  agendaDoPeriodo,
  clubeDoPeriodo,
  faturamento,
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
