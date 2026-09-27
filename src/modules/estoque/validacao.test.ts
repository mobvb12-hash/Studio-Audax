import { describe, expect, it } from 'vitest'
import { validarQuantidadeEstoque } from './validacao'

describe('validarQuantidadeEstoque — F12', () => {
  it('aceita quantidade válida com estoque suficiente', () => {
    expect(validarQuantidadeEstoque(2, 'Pomada', 10)).toBeNull()
    expect(validarQuantidadeEstoque(1, 'Pomada', 1)).toBeNull()
    expect(validarQuantidadeEstoque(5, 'Pomada', 10, 3)).toBeNull()
  })

  it('rejeita quantidade não inteira ou menor que 1', () => {
    expect(validarQuantidadeEstoque(0, 'Pomada', 10)).toBe(
      'Quantidade deve ser um número inteiro maior que zero.',
    )
    expect(validarQuantidadeEstoque(-1, 'Pomada', 10)).toBe(
      'Quantidade deve ser um número inteiro maior que zero.',
    )
    expect(validarQuantidadeEstoque(1.5, 'Pomada', 10)).toBe(
      'Quantidade deve ser um número inteiro maior que zero.',
    )
  })

  it('rejeita quando estoque é insuficiente sem carrinho', () => {
    expect(validarQuantidadeEstoque(5, 'Pomada', 3)).toBe(
      'Estoque insuficiente para "Pomada": disponível 3, solicitado 5.',
    )
  })

  it('rejeita quando estoque é insuficiente com carrinho', () => {
    expect(validarQuantidadeEstoque(3, 'Pomada', 10, 8)).toBe(
      'Estoque insuficiente para "Pomada": disponível 10, no carrinho 8 + 3.',
    )
  })

  it('rejeita quando quantidade + carrinho excede estoque', () => {
    expect(validarQuantidadeEstoque(2, 'Pomada', 10, 9)).toBe(
      'Estoque insuficiente para "Pomada": disponível 10, no carrinho 9 + 2.',
    )
  })
})
