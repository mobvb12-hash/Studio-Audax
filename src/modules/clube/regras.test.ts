import { describe, expect, it } from 'vitest'
import {
  addMonthsISO,
  assinaturaVigente,
  dataISOValida,
  diasEntre,
  pagamentosNoMes,
  proximoVencimentoAposPagamento,
  situacoesAssinaturas,
  statusAssinatura,
  valorDescontoAssinante,
} from './regras'
import type { AssinaturaClube, PagamentoClube } from './types'

function assinar(parcial: Partial<AssinaturaClube> = {}): AssinaturaClube {
  return {
    id: 'a1',
    clienteId: 'c1',
    cliente: 'Lucas Mendes',
    plano: 'cabelo',
    valorMensal: 89.9,
    dataAssinatura: '2026-08-25',
    proximoVencimento: '2026-09-25',
    cancelada: false,
    criadoEm: '2026-08-25T10:00:00.000Z',
    ...parcial,
  }
}

function pagamento(parcial: Partial<PagamentoClube> = {}): PagamentoClube {
  return {
    id: 'p1',
    assinaturaId: 'a1',
    clienteId: 'c1',
    data: '2026-09-10',
    valor: 89.9,
    formaPagamento: 'pix',
    criadoEm: '2026-09-10T10:00:00.000Z',
    ...parcial,
  }
}

describe('datas', () => {
  it('valida datas ISO e recusa formatos inválidos', () => {
    expect(dataISOValida('2026-09-25')).toBe(true)
    expect(dataISOValida('2026-02-28')).toBe(true)
    expect(dataISOValida('2026-02-30')).toBe(false)
    expect(dataISOValida('2026-13-01')).toBe(false)
    expect(dataISOValida('25/09/2026')).toBe(false)
    expect(dataISOValida('')).toBe(false)
  })

  it('soma meses com ajuste para o fim do mês', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonthsISO('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonthsISO('2026-03-15', 1)).toBe('2026-04-15')
    expect(addMonthsISO('2026-03-15', 12)).toBe('2027-03-15')
  })

  it('calcula dias entre datas (positivo = futuro)', () => {
    expect(diasEntre('2026-09-25', '2026-09-25')).toBe(0)
    expect(diasEntre('2026-09-25', '2026-09-26')).toBe(1)
    expect(diasEntre('2026-09-25', '2026-09-18')).toBe(-7)
  })
})

describe('status da assinatura (derivado, nunca armazenado)', () => {
  const hoje = '2026-09-25'

  it('ativa quando falta mais de 3 dias', () => {
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-29' }), hoje)).toBe('ativa')
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-10-25' }), hoje)).toBe('ativa')
  })

  it('próxima do vencimento de 3 dias até o próprio dia', () => {
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-28' }), hoje)).toBe('proxima_vencimento')
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-26' }), hoje)).toBe('proxima_vencimento')
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-25' }), hoje)).toBe('proxima_vencimento')
  })

  it('atrasada de 1 a 7 dias após o vencimento', () => {
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-24' }), hoje)).toBe('atrasada')
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-18' }), hoje)).toBe('atrasada')
  })

  it('vencida após 7 dias de tolerância', () => {
    expect(statusAssinatura(assinar({ proximoVencimento: '2026-09-17' }), hoje)).toBe('vencida')
  })

  it('cancelada tem precedência sobre qualquer vencimento', () => {
    expect(
      statusAssinatura(
        assinar({ cancelada: true, proximoVencimento: '2027-01-01' }),
        hoje,
      ),
    ).toBe('cancelada')
    expect(
      statusAssinatura(
        assinar({ cancelada: true, proximoVencimento: '2020-01-01' }),
        hoje,
      ),
    ).toBe('cancelada')
  })

  it('vigente = não cancelada e ainda dentro do ciclo', () => {
    expect(assinaturaVigente(assinar({ proximoVencimento: '2026-10-10' }), hoje)).toBe(true)
    expect(assinaturaVigente(assinar({ proximoVencimento: '2026-09-25' }), hoje)).toBe(true)
    expect(assinaturaVigente(assinar({ proximoVencimento: '2026-09-24' }), hoje)).toBe(false)
    expect(assinaturaVigente(assinar({ cancelada: true }), hoje)).toBe(false)
  })
})

describe('desconto de 10% do assinante', () => {
  it('aplica 10% arredondado em centavos apenas para vigentes', () => {
    expect(valorDescontoAssinante(100, true)).toBe(10)
    expect(valorDescontoAssinante(99.99, true)).toBe(10)
    expect(valorDescontoAssinante(33.33, true)).toBe(3.33)
    expect(valorDescontoAssinante(100, false)).toBe(0)
    expect(valorDescontoAssinante(0, true)).toBe(0)
    expect(valorDescontoAssinante(-10, true)).toBe(0)
  })
})

describe('renovação', () => {
  it('pagamento adiantado mantém a âncora do ciclo', () => {
    expect(
      proximoVencimentoAposPagamento('2026-10-20', '2026-10-15'),
    ).toBe('2026-11-20')
  })

  it('pagamento após o vencimento reancora na data do pagamento', () => {
    expect(
      proximoVencimentoAposPagamento('2026-10-20', '2026-10-25'),
    ).toBe('2026-11-25')
  })
})

describe('agregados para Dashboard/Clube', () => {
  const hoje = '2026-09-25'

  it('conta situações sem duplicar', () => {
    const s = situacoesAssinaturas(
      [
        assinar({ id: '1', proximoVencimento: '2026-10-10' }), // ativa
        assinar({ id: '2', proximoVencimento: '2026-09-27' }), // próxima
        assinar({ id: '3', proximoVencimento: '2026-09-22' }), // atrasada
        assinar({ id: '4', proximoVencimento: '2026-09-01' }), // vencida
        assinar({ id: '5', cancelada: true }), // cancelada
      ],
      hoje,
    )
    expect(s).toEqual({
      ativas: 2, // ativa + próxima (vigentes)
      proximas: 1,
      atrasadas: 1,
      vencidas: 1,
      canceladas: 1,
    })
  })

  it('pagamentosNoMes soma o mês e ignora lançamentos estornados', () => {
    const lista = [
      pagamento({ id: 'p1', data: '2026-09-10', valor: 89.9 }),
      pagamento({ id: 'p2', data: '2026-09-20', valor: 100 }),
      pagamento({
        id: 'p3',
        data: '2026-09-21',
        valor: 50,
        caixaLancamentoId: 'l-estornado',
      }),
      pagamento({ id: 'p4', data: '2026-08-10', valor: 70 }),
    ]
    const estornados = new Set(['l-estornado'])
    expect(pagamentosNoMes(lista, '2026-09', estornados)).toBe(189.9)
    expect(pagamentosNoMes(lista, '2026-08', estornados)).toBe(70)
    expect(pagamentosNoMes(lista, '2026-10', estornados)).toBe(0)
  })
})
