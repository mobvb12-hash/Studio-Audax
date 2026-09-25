import { describe, expect, it } from 'vitest'
import type { Lancamento } from '@/modules/caixa/types'
import { calcularComissao, calcularProducao } from './producao'

const PERIODO = { inicio: '2026-09-01', fim: '2026-09-30' }

function lanc(parcial: Partial<Lancamento>): Lancamento {
  return {
    id: `l-${Math.random().toString(36).slice(2, 8)}`,
    tipo: 'receita',
    origem: 'atendimento',
    data: '2026-09-15',
    hora: '10:00',
    descricao: 'Corte Degradê — Lucas',
    valor: 70,
    desconto: 0,
    valorLiquido: 70,
    formaPagamento: 'pix',
    profissional: 'Audax',
    cliente: 'Lucas',
    servico: 'Corte Degradê',
    criadoEm: '2026-09-15T10:00:00.000Z',
    ...parcial,
  }
}

describe('Produção — cálculo puro a partir do Caixa', () => {
  it('soma atendimentos pagos com bruto, desconto e líquido', () => {
    const p = calcularProducao(
      [
        lanc({ valor: 70, desconto: 10, valorLiquido: 60 }),
        lanc({ valor: 50, desconto: 0, valorLiquido: 50, data: '2026-09-20' }),
      ],
      'Audax',
      PERIODO,
    )
    expect(p.qtdAtendimentos).toBe(2)
    expect(p.bruto).toBe(120)
    expect(p.descontos).toBe(10)
    expect(p.liquido).toBe(110)
    expect(p.qtdEstornos).toBe(0)
  })

  it('retira estornos da produção e reporta à parte', () => {
    const p = calcularProducao(
      [
        lanc({ valor: 70, valorLiquido: 70 }),
        lanc({
          valor: 50,
          valorLiquido: 50,
          estornado: true,
          estornadoEm: '2026-09-16T10:00:00.000Z',
        }),
      ],
      'Audax',
      PERIODO,
    )
    expect(p.qtdAtendimentos).toBe(1)
    expect(p.liquido).toBe(70)
    expect(p.qtdEstornos).toBe(1)
    expect(p.valorEstornos).toBe(50)
    expect(p.itens).toHaveLength(1)
    expect(p.estornados).toHaveLength(1)
  })

  it('vendas de produtos ficam separadas da produção de serviços', () => {
    const p = calcularProducao(
      [
        lanc({ valor: 70, valorLiquido: 70 }),
        lanc({
          origem: 'produto',
          valor: 30,
          valorLiquido: 30,
          descricao: '1× Pomada',
        }),
        lanc({
          origem: 'produto',
          valor: 30,
          valorLiquido: 30,
          estornado: true,
        }),
      ],
      'Audax',
      PERIODO,
    )
    expect(p.liquido).toBe(70)
    expect(p.producaoProdutos).toBe(30)
    expect(p.qtdProdutos).toBe(1)
  })

  it('ignora profissional e período de fora', () => {
    const p = calcularProducao(
      [
        lanc({ profissional: 'Diego', valorLiquido: 90, valor: 90 }),
        lanc({ data: '2026-08-31', valorLiquido: 80, valor: 80 }),
        lanc({ data: '2026-10-01', valorLiquido: 60, valor: 60 }),
        lanc({ data: '2026-09-01', valorLiquido: 25, valor: 25 }),
        lanc({ data: '2026-09-30', valorLiquido: 35, valor: 35 }),
      ],
      'Audax',
      PERIODO,
    )
    expect(p.qtdAtendimentos).toBe(2)
    expect(p.liquido).toBe(60)
  })

  it('despesas e lançamentos sem profissional ignorados', () => {
    const p = calcularProducao(
      [
        lanc({ tipo: 'despesa', origem: 'despesa', valor: 100, valorLiquido: 100 }),
        lanc({ profissional: undefined }),
      ],
      'Audax',
      PERIODO,
    )
    expect(p.qtdAtendimentos).toBe(0)
    expect(p.liquido).toBe(0)
  })

  it('cancelados/não compareceu/não pagos não têm lançamento — produção zero', () => {
    // status de agenda não geram lançamento no Caixa; simular sem lançamentos
    const p = calcularProducao([], 'Audax', PERIODO)
    expect(p.qtdAtendimentos).toBe(0)
    expect(p.liquido).toBe(0)
    expect(p.valorEstornos).toBe(0)
  })
})

describe('Cálculo de comissão', () => {
  it('calcula o percentual sobre a produção líquida', () => {
    expect(calcularComissao(110, 40)).toBe(44)
    expect(calcularComissao(70.5, 40)).toBe(28.2)
    expect(calcularComissao(0, 40)).toBe(0)
  })

  it('nunca retorna valor negativo e limita o percentual', () => {
    expect(calcularComissao(-50, 40)).toBe(0)
    expect(calcularComissao(100, -10)).toBe(0)
    expect(calcularComissao(100, 150)).toBe(100)
    expect(calcularComissao(NaN, 40)).toBe(0)
  })
})
