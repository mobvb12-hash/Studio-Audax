import { describe, expect, it } from 'vitest'
import { parseMoeda } from './moeda'

// Regressão do achado C1 da auditoria: remover todos os pontos cegamente
// destruía o separador decimal e gravava valores 100× maiores
// ("70.00" → 7000) em preço de serviço, desconto, despesa e percentual.
describe('parseMoeda', () => {
  it('interpreta o ponto como decimal quando ele é o último separador', () => {
    expect(parseMoeda('70.00')).toBe(70)
    expect(parseMoeda('19.90')).toBe(19.9)
    expect(parseMoeda('0.50')).toBe(0.5)
    expect(parseMoeda('1234.56')).toBe(1234.56)
  })

  it('interprete a vírgula como decimal no formato pt-BR', () => {
    expect(parseMoeda('70,00')).toBe(70)
    expect(parseMoeda('1.234,56')).toBe(1234.56)
    expect(parseMoeda('0,99')).toBe(0.99)
    expect(parseMoeda(' 70,00 ')).toBe(70)
  })

  it('mantém os exemplos da documentação', () => {
    expect(parseMoeda('1.234,56')).toBe(1234.56)
    expect(parseMoeda('70')).toBe(70)
  })

  it('trata ponto como milhar apenas no padrão inequívoco', () => {
    expect(parseMoeda('1.234')).toBe(1234)
    expect(parseMoeda('1.234.567')).toBe(1234567)
    expect(parseMoeda('70.000')).toBe(70000)
  })

  it('aceita o formato com ponto decimal após milhares separados por vírgula', () => {
    expect(parseMoeda('1,234.56')).toBe(1234.56)
  })

  it('devolve 0 para texto vazio e NaN para texto inválido', () => {
    expect(parseMoeda('')).toBe(0)
    expect(parseMoeda('abc')).toBeNaN()
    expect(parseMoeda('R$ 70,00')).toBeNaN()
  })
})
