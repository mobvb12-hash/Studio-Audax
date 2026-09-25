import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { EstoqueProvider, useEstoque } from './store'
import type { MovimentacaoEstoque } from './types'

const CHAVE = 'studio-audax:estoque:movimentacoes:v1'

let ctx: ReturnType<typeof useEstoque>
let ctxProdutos: ReturnType<typeof useProdutos>

function Captura() {
  const estoque = useEstoque()
  const produtos = useProdutos()
  useEffect(() => {
    ctx = estoque
    ctxProdutos = produtos
  })
  return null
}

function montar() {
  return render(
    <ProdutosProvider>
      <EstoqueProvider>
        <Captura />
      </EstoqueProvider>
    </ProdutosProvider>,
  )
}

function criarProduto(
  nome: string,
  estoque: number,
  custo = 0,
  estoqueMinimo = 0,
): Produto {
  let produto!: Produto
  act(() => {
    produto = ctxProdutos.adicionar({
      nome,
      preco: 30,
      custo,
      estoque,
      estoqueMinimo,
    })
  })
  return produto
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useEstoque>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
})

describe('Estoque — estoque inicial', () => {
  it('registra movimentação inicial 0 → N e persiste no localStorage', () => {
    montar()
    const p = criarProduto('Creme capilar', 10)
    act(() => {
      ctx.registrarInicial(p, 10)
    })
    expect(ctx.movimentacoes).toHaveLength(1)
    const m = ctx.movimentacoes[0]
    expect(m.tipo).toBe('inicial')
    expect(m.produtoId).toBe(p.id)
    expect(m.quantidade).toBe(10)
    expect(m.estoqueAntes).toBe(0)
    expect(m.estoqueDepois).toBe(10)
    expect(m.origem).toBe('cadastro')
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(salvo).toHaveLength(1)
    expect(salvo[0].tipo).toBe('inicial')
  })

  it('rejeita estoque inicial que não seja inteiro maior que zero', () => {
    montar()
    const p = criarProduto('Creme capilar', 10)
    expect(() => ctx.registrarInicial(p, 0)).toThrow(/maior que zero/)
    expect(() => ctx.registrarInicial(p, -3)).toThrow(/maior que zero/)
    expect(() => ctx.registrarInicial(p, 2.5)).toThrow(/maior que zero/)
    expect(ctx.movimentacoes).toHaveLength(0)
  })
})

describe('Estoque — entrada', () => {
  it('soma ao estoque e registra custo, fornecedor e data', () => {
    montar()
    const p = criarProduto('Pomada modeladora', 10, 12)
    let m!: MovimentacaoEstoque
    act(() => {
      m = ctx.entrada({
        produtoId: p.id,
        quantidade: 5,
        custoUnitario: 12.5,
        fornecedor: 'Distribuidora X',
        data: '2026-09-20',
        observacao: 'Promoção',
      })
    })
    expect(ctxProdutos.porId(p.id)?.estoque).toBe(15)
    expect(m.tipo).toBe('entrada')
    expect(m.estoqueAntes).toBe(10)
    expect(m.estoqueDepois).toBe(15)
    expect(m.custoUnitario).toBe(12.5)
    expect(m.fornecedor).toBe('Distribuidora X')
    expect(m.data).toBe('2026-09-20')
    expect(m.observacao).toBe('Promoção')
    expect(m.origem).toBe('manual')
  })

  it('valida quantidade, custo, data e produto', () => {
    montar()
    const p = criarProduto('Pomada modeladora', 10)
    expect(() =>
      ctx.entrada({
        produtoId: p.id,
        quantidade: 0,
        custoUnitario: 5,
        data: '2026-09-20',
      }),
    ).toThrow(/inteiro maior que zero/)
    expect(() =>
      ctx.entrada({
        produtoId: p.id,
        quantidade: 2,
        custoUnitario: -1,
        data: '2026-09-20',
      }),
    ).toThrow(/custo/)
    expect(() =>
      ctx.entrada({
        produtoId: p.id,
        quantidade: 2,
        custoUnitario: 5,
        data: '',
      }),
    ).toThrow(/data/)
    expect(() =>
      ctx.entrada({
        produtoId: 'nao-existe',
        quantidade: 2,
        custoUnitario: 5,
        data: '2026-09-20',
      }),
    ).toThrow(/não encontrado/)
    expect(ctxProdutos.porId(p.id)?.estoque).toBe(10)
    expect(ctx.movimentacoes).toHaveLength(0)
  })
})

describe('Estoque — ajuste manual', () => {
  it('ajuste de entrada soma e registra motivo/observação', () => {
    montar()
    const p = criarProduto('Creme capilar', 10)
    let m!: MovimentacaoEstoque
    act(() => {
      m = ctx.ajuste({
        produtoId: p.id,
        tipo: 'entrada',
        quantidade: 2,
        motivo: 'reposicao',
        data: '2026-09-21',
        observacao: 'Recontagem',
      })
    })
    expect(ctxProdutos.porId(p.id)?.estoque).toBe(12)
    expect(m.tipo).toBe('ajuste')
    expect(m.quantidade).toBe(2)
    expect(m.motivo).toBe('reposicao')
    expect(m.estoqueAntes).toBe(10)
    expect(m.estoqueDepois).toBe(12)
  })

  it('ajuste de saída devolve (perda) e nunca deixa estoque negativo', () => {
    montar()
    const p = criarProduto('Creme capilar', 10)
    act(() => {
      ctx.ajuste({
        produtoId: p.id,
        tipo: 'saida',
        quantidade: 3,
        motivo: 'perda',
        data: '2026-09-21',
      })
    })
    expect(ctxProdutos.porId(p.id)?.estoque).toBe(7)
    const ultima = ctx.movimentacoes[ctx.movimentacoes.length - 1]
    expect(ultima.quantidade).toBe(-3)
    expect(ultima.motivo).toBe('perda')

    expect(() =>
      ctx.ajuste({
        produtoId: p.id,
        tipo: 'saida',
        quantidade: 100,
        motivo: 'avaria',
        data: '2026-09-21',
      }),
    ).toThrow(/Estoque insuficiente/)
    expect(ctxProdutos.porId(p.id)?.estoque).toBe(7)
    expect(ctx.movimentacoes).toHaveLength(1)
  })

  it('exige motivo e quantidade válida', () => {
    montar()
    const p = criarProduto('Creme capilar', 10)
    expect(() =>
      ctx.ajuste({
        produtoId: p.id,
        tipo: 'saida',
        quantidade: 1,
        motivo: '' as never,
        data: '2026-09-21',
      }),
    ).toThrow(/motivo/)
    expect(() =>
      ctx.ajuste({
        produtoId: p.id,
        tipo: 'entrada',
        quantidade: 0,
        motivo: 'perda',
        data: '2026-09-21',
      }),
    ).toThrow(/inteiro maior que zero/)
    expect(ctx.movimentacoes).toHaveLength(0)
  })
})

describe('Estoque — saída por venda (PDV)', () => {
  it('baixa o estoque e cria uma movimentação por item com vendaId', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    const b = criarProduto('Pomada modeladora', 8)
    let movs: MovimentacaoEstoque[] = []
    act(() => {
      movs = ctx.saidaPorVenda('venda-1', '2026-09-22', [
        { produtoId: a.id, produto: a.nome, quantidade: 3, preco: 30 },
        { produtoId: b.id, produto: b.nome, quantidade: 2, preco: 50 },
      ])
    })
    expect(movs).toHaveLength(2)
    expect(ctx.movimentacoes.map((m) => m.tipo)).toEqual(['venda', 'venda'])
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(7)
    expect(ctxProdutos.porId(b.id)?.estoque).toBe(6)
    const m1 = ctx.movimentacoes[0]
    expect(m1.vendaId).toBe('venda-1')
    expect(m1.estoqueAntes).toBe(10)
    expect(m1.estoqueDepois).toBe(7)
    expect(m1.origem).toBe('pdv')
    expect(m1.data).toBe('2026-09-22')
  })

  it('pré-valida todos os itens — se um falhar, nada é baixado (atômico)', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    const b = criarProduto('Pomada modeladora', 2)
    expect(() =>
      ctx.saidaPorVenda('venda-2', '2026-09-22', [
        { produtoId: a.id, produto: a.nome, quantidade: 3 },
        { produtoId: b.id, produto: b.nome, quantidade: 5 },
      ]),
    ).toThrow(/Estoque insuficiente para "Pomada modeladora": disponível 2/)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(10)
    expect(ctxProdutos.porId(b.id)?.estoque).toBe(2)
    expect(ctx.movimentacoes).toHaveLength(0)
  })

  it('soma itens repetidos do mesmo produto na validação', () => {
    montar()
    const a = criarProduto('Creme capilar', 5)
    expect(() =>
      ctx.saidaPorVenda('venda-3', '2026-09-22', [
        { produtoId: a.id, produto: a.nome, quantidade: 3 },
        { produtoId: a.id, produto: a.nome, quantidade: 3 },
      ]),
    ).toThrow(/disponível 5, solicitado 6/)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(5)
  })

  it('rejeita venda sem id e sem itens; produto desconhecido também falha sem efeito', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    expect(() => ctx.saidaPorVenda('', '2026-09-22', [
      { produtoId: a.id, quantidade: 1 },
    ])).toThrow(/identificação/)
    expect(() =>
      ctx.saidaPorVenda('venda-4', '2026-09-22', []),
    ).toThrow(/sem itens/)
    expect(() =>
      ctx.saidaPorVenda('venda-5', '2026-09-22', [
        { produto: 'Fantasma', quantidade: 1 },
      ]),
    ).toThrow(/não encontrado/)
    expect(ctx.movimentacoes).toHaveLength(0)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(10)
  })
})

describe('Estoque — estorno (devolução)', () => {
  it('devolve o estoque criando movimentação "Estorno" sem apagar a de venda', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    act(() => {
      ctx.saidaPorVenda('venda-10', '2026-09-22', [
        { produtoId: a.id, produto: a.nome, quantidade: 3 },
      ])
    })
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(7)
    let devolvidas: MovimentacaoEstoque[] = []
    act(() => {
      devolvidas = ctx.reverterVenda({
        id: 'venda-10',
        itens: [{ produtoId: a.id, produto: a.nome, quantidade: 3 }],
      })
    })
    expect(devolvidas).toHaveLength(1)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(10)
    expect(ctx.movimentacoes.map((m) => m.tipo)).toEqual(['venda', 'estorno'])
    const estorno = ctx.movimentacoes[1]
    expect(estorno.estoqueAntes).toBe(7)
    expect(estorno.estoqueDepois).toBe(10)
    expect(estorno.vendaId).toBe('venda-10')
    expect(estorno.origem).toBe('estorno')
  })

  it('é idempotente — chamar duas vezes devolve uma única vez', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    act(() => {
      ctx.saidaPorVenda('venda-11', '2026-09-22', [
        { produtoId: a.id, produto: a.nome, quantidade: 4 },
      ])
    })
    act(() => {
      ctx.reverterVenda({
        id: 'venda-11',
        itens: [{ produtoId: a.id, produto: a.nome, quantidade: 4 }],
      })
    })
    let segunda: MovimentacaoEstoque[] = ['x' as never]
    act(() => {
      segunda = ctx.reverterVenda({
        id: 'venda-11',
        itens: [{ produtoId: a.id, produto: a.nome, quantidade: 4 }],
      })
    })
    expect(segunda).toHaveLength(0)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(10)
    expect(ctx.movimentacoes.filter((m) => m.tipo === 'estorno')).toHaveLength(1)
  })

  it('venda antiga sem baixa de estoque não cria estoque do nada', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    let retorno: MovimentacaoEstoque[] = ['x' as never]
    act(() => {
      retorno = ctx.reverterVenda({
        id: 'venda-legado',
        produto: 'Creme capilar',
        quantidade: 3,
      })
    })
    expect(retorno).toHaveLength(0)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(10)
    expect(ctx.movimentacoes).toHaveLength(0)
  })

  it('resolve produto por nome quando o item não traz id (compatibilidade)', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    act(() => {
      ctx.saidaPorVenda('venda-12', '2026-09-22', [
        { produto: 'creme CAPILAR', quantidade: 2 },
      ])
    })
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(8)
    act(() => {
      ctx.reverterVenda({ id: 'venda-12', produto: 'Creme capilar', quantidade: 2 })
    })
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(10)
  })
})

describe('Estoque — histórico e persistência', () => {
  it('movimentacoesDoProduto filtra por produto', () => {
    montar()
    const a = criarProduto('Creme capilar', 10)
    const b = criarProduto('Pomada modeladora', 6)
    act(() => {
      ctx.entrada({
        produtoId: a.id,
        quantidade: 5,
        custoUnitario: 10,
        data: '2026-09-20',
      })
    })
    act(() => {
      ctx.entrada({
        produtoId: b.id,
        quantidade: 2,
        custoUnitario: 8,
        data: '2026-09-20',
      })
    })
    const doA = ctx.movimentacoesDoProduto(a.id)
    expect(doA).toHaveLength(1)
    expect(doA[0].produtoId).toBe(a.id)
  })

  it('mantém o histórico ao reabrir o provider (F5)', () => {
    const primeiro = montar()
    const p = criarProduto('Creme capilar', 10)
    act(() => {
      ctx.saidaPorVenda('venda-20', '2026-09-22', [
        { produtoId: p.id, produto: p.nome, quantidade: 3 },
      ])
    })
    expect(ctx.movimentacoes).toHaveLength(1)
    primeiro.unmount()

    montar()
    expect(ctx.movimentacoes).toHaveLength(1)
    expect(ctx.movimentacoes[0].vendaId).toBe('venda-20')
    expect(ctx.movimentacoes[0].estoqueAntes).toBe(10)
    expect(ctx.movimentacoes[0].estoqueDepois).toBe(7)
  })
})
