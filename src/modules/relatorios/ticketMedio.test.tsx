import { describe, expect, it } from 'vitest'
import { ticketMedio } from './calculos'

describe('ticketMedio — regra oficial', () => {
  it('arredonda para 2 casas decimais', () => {
    expect(ticketMedio(100, 3)).toBe(33.33)
    expect(ticketMedio(130, 3)).toBe(43.33)
    expect(ticketMedio(19, 2)).toBe(9.5)
  })

  it('retorna 0 quando não há atendimentos', () => {
    expect(ticketMedio(0, 0)).toBe(0)
    expect(ticketMedio(100, 0)).toBe(0)
  })

  it('retorna o valor exato quando não há fração', () => {
    expect(ticketMedio(130, 2)).toBe(65)
    expect(ticketMedio(80, 1)).toBe(80)
  })
})
