import { describe, expect, it } from 'vitest'
import type { Produto } from '@/modules/produtos/types'
import {
  produtosComEstoqueBaixo,
  resumirEstoque,
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

describe('resumirEstoque', () => {
  it('lista vazia devolve tudo zerado', () => {
    expect(resumirEstoque([])).toEqual({
      total: 0,
      ativos: 0,
      inativos: 0,
      unidades: 0,
      estoqueBaixo: 0,
      semEstoque: 0,
      valorEstimado: 0,
    })
  })

  it('alertas olham só ativos; patrimônio considera todo estoque físico', () => {
    const lista = [
      produto({ id: 'a', custo: 12, estoque: 10, estoqueMinimo: 2 }),
      produto({ id: 'b', custo: 8, estoque: 3, estoqueMinimo: 5 }),
      produto({ id: 'c', custo: 5, estoque: 0, estoqueMinimo: 0 }),
      produto({ id: 'd', custo: 20, estoque: 4, ativo: false }),
    ]
    const resumo = resumirEstoque(lista)
    expect(resumo.total).toBe(4)
    expect(resumo.ativos).toBe(3)
    expect(resumo.inativos).toBe(1)
    expect(resumo.unidades).toBe(17)
    // apenas ativos zerados entram no alerta (d está inativo)
    expect(resumo.semEstoque).toBe(1)
    // b (3 <= 5) e c (zerado ativo) — inativo fica de fora
    expect(resumo.estoqueBaixo).toBe(2)
    // patrimônio: 12x10 + 8x3 + 20x4 (custo de inativo conta; zerado não)
    expect(resumo.valorEstimado).toBe(224)
  })

  it('valor estimado usa o custo cadastrado, ignora zerados e arredonda em centavos', () => {
    const resumo = resumirEstoque([
      produto({ id: 'a', custo: 0.1, estoque: 3 }),
      produto({ id: 'b', custo: 999, estoque: 0 }),
    ])
    expect(resumo.valorEstimado).toBe(0.3)
  })
})
