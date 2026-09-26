import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  avisosPersistencia,
  limparAvisosPersistencia,
} from '@/lib/persistencia'
import { ProdutosProvider, useProdutos } from './store'

const CHAVE = 'studio-audax:produtos:v1'

let ctx: ReturnType<typeof useProdutos>

function Captura() {
  const valor = useProdutos()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function montar() {
  return render(
    <ProdutosProvider>
      <Captura />
    </ProdutosProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  ctx = undefined as unknown as ReturnType<typeof useProdutos>
})

describe('Produtos — cadastro e validações', () => {
  it('cria produto válido ativo por padrão e persiste no localStorage', () => {
    montar()
    let id = ''
    act(() => {
      id = ctx.adicionar({ nome: 'Pomada modeladora', preco: 30 }).id
    })
    expect(ctx.produtos).toHaveLength(1)
    expect(ctx.porId(id)?.nome).toBe('Pomada modeladora')
    expect(ctx.porId(id)?.ativo).toBe(true)
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(salvo).toHaveLength(1)
    expect(salvo[0].nome).toBe('Pomada modeladora')
    expect(salvo[0].preco).toBe(30)
  })

  it('valida nome curto, preço inválido e nome duplicado', () => {
    montar()
    expect(() => ctx.adicionar({ nome: 'A', preco: 10 })).toThrow(/nome/)
    expect(() => ctx.adicionar({ nome: 'Creme', preco: 0 })).toThrow(/preço/)
    expect(() => ctx.adicionar({ nome: 'Creme', preco: -5 })).toThrow(/preço/)
    expect(() =>
      ctx.adicionar({ nome: 'Creme', preco: Number.NaN }),
    ).toThrow(/preço/)
    act(() => {
      ctx.adicionar({ nome: 'Creme capilar', preco: 50 })
    })
    expect(() =>
      ctx.adicionar({ nome: '  creme CAPILAR ', preco: 20 }),
    ).toThrow(/Já existe/)
    expect(ctx.produtos).toHaveLength(1)
  })

  it('atualiza produto e não permite duplicar nome de outro produto', () => {
    montar()
    act(() => {
      ctx.adicionar({ nome: 'Creme', preco: 30 })
    })
    act(() => {
      ctx.adicionar({ nome: 'Pomada', preco: 50 })
    })
    const alvo = ctx.produtos.find((p) => p.nome === 'Pomada')
    expect(alvo).toBeTruthy()
    act(() => {
      ctx.atualizar(alvo!.id, { nome: 'Pomada nova', preco: 55, ativo: false })
    })
    const atualizado = ctx.porId(alvo!.id)
    expect(atualizado?.nome).toBe('Pomada nova')
    expect(atualizado?.preco).toBe(55)
    expect(atualizado?.ativo).toBe(false)
    expect(() =>
      ctx.atualizar(alvo!.id, { nome: 'creme', preco: 40 }),
    ).toThrow(/Já existe/)
    const outro = ctx.produtos.find((p) => p.nome === 'Creme')
    expect(() =>
      ctx.atualizar(outro!.id, { nome: 'Creme', preco: -1 }),
    ).toThrow(/preço/)
  })

  it('ativa e desativa produto (toggle sem remoção)', () => {
    montar()
    let id = ''
    act(() => {
      id = ctx.adicionar({ nome: 'Gel fixador', preco: 25 }).id
    })
    act(() => {
      ctx.alternarAtivo(id)
    })
    expect(ctx.porId(id)?.ativo).toBe(false)
    act(() => {
      ctx.alternarAtivo(id)
    })
    expect(ctx.porId(id)?.ativo).toBe(true)
    expect(ctx.produtos).toHaveLength(1)
  })

  it('mantém dados salvos ao reabrir o provider (persistência)', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        {
          id: 'p1',
          nome: 'Creme capilar',
          preco: 30,
          ativo: true,
          criadoEm: '2026-09-25T10:00:00.000Z',
          atualizadoEm: '2026-09-25T10:00:00.000Z',
        },
      ]),
    )
    montar()
    expect(ctx.produtos).toHaveLength(1)
    expect(ctx.produtos[0].nome).toBe('Creme capilar')
    expect(ctx.produtos[0].preco).toBe(30)
  })

  it('JSON corrompido: preserva a cópia original, avisa e começa vazio', () => {
    localStorage.setItem(CHAVE, '{isso não é json válido')
    montar()
    expect(ctx.produtos).toHaveLength(0)
    expect(localStorage.getItem(`${CHAVE}:corrompido`)).toBe(
      '{isso não é json válido',
    )
    expect(
      avisosPersistencia().some((a) => a.tipo === 'dado_corrompido' && a.chave === CHAVE),
    ).toBe(true)
    limparAvisosPersistencia()
  })

  it('JSON com forma inesperada também é preservado e não apagado às cegas', () => {
    localStorage.setItem(CHAVE, '{"não":"é uma lista"}')
    montar()
    expect(ctx.produtos).toHaveLength(0)
    // a cópia corrompida fica intacta mesmo após o estado inicial ser regravado
    expect(localStorage.getItem(`${CHAVE}:corrompido`)).toBe(
      '{"não":"é uma lista"}',
    )
    expect(
      avisosPersistencia().some((a) => a.tipo === 'dado_corrompido' && a.chave === CHAVE),
    ).toBe(true)
    limparAvisosPersistencia()
  })
})
