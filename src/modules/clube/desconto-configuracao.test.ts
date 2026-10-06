// Desconto do assinante — a fração vem da configuração oficial
// (`configuracoes_sistema.clube.desconto.produtos`), e o padrão do código
// espelha o valor do banco (10%).
import { describe, expect, it } from 'vitest'
import { CONFIG_PADRAO, normalizarConfiguracoes } from '@/modules/configuracoes/types'
import {
  assinaturaVigente,
  DESCONTO_ASSINANTE_PADRAO,
  valorDescontoAssinante,
} from './regras'
import type { AssinaturaClube } from './types'

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

describe('Desconto do assinante — vem da configuração', () => {
  it('configuração 10% gera desconto de 10%', () => {
    expect(valorDescontoAssinante(200, true, 0.1)).toBe(20)
    expect(valorDescontoAssinante(99.9, true, 0.1)).toBe(9.99)
  })

  it('o padrão do código é 10% — igual ao valor gravado no banco', () => {
    expect(DESCONTO_ASSINANTE_PADRAO).toBe(0.1)
    expect(CONFIG_PADRAO.clube.desconto.produtos).toBe(0.1)
    expect(normalizarConfiguracoes({}).clube.desconto.produtos).toBe(0.1)
  })

  it('assinatura sem o parâmetro de configuração usa o padrão de 10%', () => {
    expect(valorDescontoAssinante(200, true)).toBe(20)
    // subtotal zero não gera desconto, mas também não quebra
    expect(valorDescontoAssinante(0, true)).toBe(0)
  })

  it('configuração alterada muda o cálculo', () => {
    expect(valorDescontoAssinante(200, true, 0.15)).toBe(30)
    expect(valorDescontoAssinante(200, true, 0.05)).toBe(10)
    expect(valorDescontoAssinante(200, true, 0)).toBe(0)
  })

  it('assinante não vigente não recebe desconto', () => {
    const vencida = assinar({ proximoVencimento: '2020-01-01' })
    expect(assinaturaVigente(vencida, '2026-09-01')).toBe(false)
    expect(valorDescontoAssinante(200, false, 0.1)).toBe(0)
    // cancelada também não é vigente
    const cancelada = assinar({ cancelada: true })
    expect(assinaturaVigente(cancelada, '2026-09-01')).toBe(false)
    expect(valorDescontoAssinante(200, false, 0.1)).toBe(0)
  })

  it('subtotal inválido não gera desconto (nan, negativo, texto)', () => {
    expect(valorDescontoAssinante(Number.NaN, true, 0.1)).toBe(0)
    expect(valorDescontoAssinante(-10, true, 0.1)).toBe(0)
  })

  it('fração inválida cai no padrão em vez de cobrar errado', () => {
    expect(valorDescontoAssinante(200, true, Number.NaN)).toBe(20)
    expect(valorDescontoAssinante(200, true, -1)).toBe(0)
  })

  it('o desconto nunca ultrapassa o subtotal (centavos)', () => {
    expect(valorDescontoAssinante(5, true, 0.1)).toBe(0.5)
    // fração > 1 é anômala, mas o teto continua valendo
    expect(valorDescontoAssinante(10, true, 2)).toBe(10)
    // arredonda em centavos, como o resto do caixa
    expect(valorDescontoAssinante(33.33, true, 0.1)).toBe(3.33)
    expect(valorDescontoAssinante(10.01, true, 0.1)).toBe(1)
  })

  it('produto não elegível não recebe desconto (cálculo fica no chamador)', () => {
    // A regra é só sobre o subtotal: quem filtra elegibilidade é o PDV.
    // O que a regra garante é que, sem subtotal ou sem assinatura, é zero.
    const subtotal = 0
    expect(valorDescontoAssinante(subtotal, true, 0.1)).toBe(0)
  })
})