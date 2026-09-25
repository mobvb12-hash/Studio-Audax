import { describe, expect, it } from 'vitest'
import type { Produto } from '@/modules/produtos/types'
import {
  produtosComEstoqueBaixo,
  ROTULO_STATUS,
  statusEstoque,
  estaBaixo,
  estaZerado,
} from './indicadores'

function produto(parcial: Partial<Produto>): Produto {
  return {
    id: 'p1',
    nome: 'Creme',
    preco: 30,
    custo: 10,
    estoque: 0,
    estoqueMinimo: 0,
    categoria: '',
    foto: '',
    ativo: true,
    criadoEm: '2026-09-01T10:00:00.000Z',
    atualizadoEm: '2026-09-01T10:00:00.000Z',
    ...parcial,
  }
}

describe('Indicadores de estoque', () => {
  it('zerado: nenhuma unidade disponível', () => {
    expect(estaZerado(produto({ estoque: 0 }))).toBe(true)
    expect(estaZerado(produto({ estoque: -1 }))).toBe(true)
    expect(estaZerado(produto({ estoque: 1 }))).toBe(false)
  })

  it('baixo: atual <= mínimo (zerados também entram)', () => {
    expect(estaBaixo(produto({ estoque: 3, estoqueMinimo: 5 }))).toBe(true)
    expect(estaBaixo(produto({ estoque: 5, estoqueMinimo: 5 }))).toBe(true)
    expect(estaBaixo(produto({ estoque: 6, estoqueMinimo: 5 }))).toBe(false)
    expect(estaBaixo(produto({ estoque: 0, estoqueMinimo: 0 }))).toBe(true)
  })

  it('status: zerado > baixo > normal com rótulos', () => {
    expect(statusEstoque(produto({ estoque: 0, estoqueMinimo: 2 }))).toBe('zerado')
    expect(statusEstoque(produto({ estoque: 1, estoqueMinimo: 2 }))).toBe('baixo')
    expect(statusEstoque(produto({ estoque: 9, estoqueMinimo: 2 }))).toBe('normal')
    expect(ROTULO_STATUS.zerado).toBe('Zerado')
    expect(ROTULO_STATUS.baixo).toBe('Baixo')
    expect(ROTULO_STATUS.normal).toBe('Normal')
  })

  it('produtosComEstoqueBaixo considera apenas ativos', () => {
    const lista = [
      produto({ id: 'a', estoque: 0, estoqueMinimo: 2 }),
      produto({ id: 'b', estoque: 10, estoqueMinimo: 2 }),
      produto({ id: 'c', estoque: 1, estoqueMinimo: 5, ativo: false }),
    ]
    const baixos = produtosComEstoqueBaixo(lista)
    expect(baixos.map((p) => p.id)).toEqual(['a'])
  })
})
