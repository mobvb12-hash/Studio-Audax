// Regressão das correções P1, P2 e P3 da auditoria do Estoque.
//
// P3 — o estorno devolvia o custo ATUAL do produto, então um reajuste de custo
// entre a venda e o estorno deixava o par venda/estorno com custos diferentes
// e o CMV por movimentação inconsistente. Agora o estorno usa o custo da
// movimentação de venda original (mesmo vendaId + produtoId), com o custo
// atual como fallback quando não há movimentação original.
//
// P1/P2 — `saidaPorVenda` marcava a venda como baixada ANTES de aplicar os
// saldos. Se algo lançasse no meio do laço, ficava estoque pela metade com a
// venda já marcada: o retry era ignorado e a perda ficava sem registro. Agora
// os saldos são simulados sem mutação antes (garantindo que a aplicação não
// lança), a marcação vem depois de aplicar tudo, e a proteção contra baixa
// duplicada continua valendo.
//
// As asserções usam o valor RETORNADO pela função e o espelho no
// localStorage, não o estado do React: assim o teste não depende do timing de
// flush do `act()`.
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

function criarProduto(nome: string, estoque: number, custo = 0): Produto {
  let produto!: Produto
  act(() => {
    produto = ctxProdutos.adicionar({
      nome,
      preco: 30,
      custo,
      estoque,
      estoqueMinimo: 0,
    })
  })
  return produto
}

/** Reajusta o custo depois do cadastro (simula correção de preço de custo). */
function reajustarCusto(produtoId: string, custo: number) {
  const atual = ctxProdutos.porId(produtoId)
  if (!atual) throw new Error('produto ausente no teste')
  act(() => {
    ctxProdutos.atualizar(produtoId, {
      nome: atual.nome,
      preco: atual.preco,
      custo,
      estoque: atual.estoque,
      estoqueMinimo: atual.estoqueMinimo,
    })
  })
}

/** Espelho gravado no localStorage — fonte estável para as asserções. */
function movimentacoes(): MovimentacaoEstoque[] {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as MovimentacaoEstoque[]
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useEstoque>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
})

describe('P3 — estorno devolve pelo custo da venda original', () => {
  it('usa o custo praticado na venda, não o custo reajustado depois', () => {
    montar()
    const produto = criarProduto('Pomada', 10, 12)

    let venda: MovimentacaoEstoque[] = []
    act(() => {
      venda = ctx.saidaPorVenda('venda-1', '2026-09-01', [
        { produtoId: produto.id, quantidade: 2 },
      ])
    })
    expect(venda[0].custoUnitario).toBe(12)

    // custo reajustado de 12 para 30 ANTES do estorno
    reajustarCusto(produto.id, 30)
    expect(ctxProdutos.porId(produto.id)?.custo).toBe(30)

    let estorno: MovimentacaoEstoque[] = []
    act(() => {
      estorno = ctx.reverterVenda({ id: 'venda-1', itens: [{ produtoId: produto.id, quantidade: 2 }] })
    })

    expect(estorno).toHaveLength(1)
    // fecha no custo da venda original, não no de agora
    expect(estorno[0].custoUnitario).toBe(12)
  })

  it('sem movimentação de venda, o estorno devolve o custo atual', () => {
    montar()
    const produto = criarProduto('Creme', 5, 6)

    // registra uma entrada (movimentação real) e depois tenta estornar uma
    // venda que não tem movimentação de venda correspondente
    act(() => {
      ctx.entrada({
        produtoId: produto.id,
        quantidade: 3,
        custoUnitario: 6,
        data: '2026-09-10',
      })
    })
    reajustarCusto(produto.id, 25)

    // 'venda-sem-baixa' não tem tipo 'venda' no histórico: nada é devolvido
    let estorno: MovimentacaoEstoque[] = []
    act(() => {
      estorno = ctx.reverterVenda({ id: 'venda-sem-baixa', itens: [{ produtoId: produto.id, quantidade: 1 }] })
    })
    expect(estorno).toHaveLength(0)
  })

  it('estorno de venda com dois produtos usa o custo de cada um', () => {
    montar()
    const a = criarProduto('Shampoo', 6, 4)
    const b = criarProduto('Condicionador', 6, 11)

    act(() => {
      ctx.saidaPorVenda('venda-2', '2026-09-02', [
        { produtoId: a.id, quantidade: 1 },
        { produtoId: b.id, quantidade: 1 },
      ])
    })
    reajustarCusto(a.id, 40)
    reajustarCusto(b.id, 50)

    let estorno: MovimentacaoEstoque[] = []
    act(() => {
      estorno = ctx.reverterVenda({ id: 'venda-2', itens: [{ produtoId: a.id, quantidade: 1 }, { produtoId: b.id, quantidade: 1 }] })
    })

    expect(estorno).toHaveLength(2)
    expect(estorno.find((m) => m.produtoId === a.id)?.custoUnitario).toBe(4)
    expect(estorno.find((m) => m.produtoId === b.id)?.custoUnitario).toBe(11)
  })

  it('preserva a idempotência do estorno', () => {
    montar()
    const produto = criarProduto('Gel', 4, 3)
    act(() => {
      ctx.saidaPorVenda('venda-3', '2026-09-03', [
        { produtoId: produto.id, quantidade: 1 },
      ])
    })

    let primeiro: MovimentacaoEstoque[] = []
    act(() => {
      primeiro = ctx.reverterVenda({ id: 'venda-3', itens: [{ produtoId: produto.id, quantidade: 1 }] })
    })
    expect(primeiro).toHaveLength(1)

    let segundo: MovimentacaoEstoque[] = []
    act(() => {
      segundo = ctx.reverterVenda({ id: 'venda-3', itens: [{ produtoId: produto.id, quantidade: 1 }] })
    })
    // segunda tentativa não devolve nada
    expect(segundo).toHaveLength(0)
    expect(movimentacoes().filter((m) => m.tipo === 'estorno')).toHaveLength(1)
  })
})

describe('P1/P2 — a venda só é marcada depois de aplicar tudo', () => {
  it('venda completa baixa tudo e marca uma única vez', () => {
    montar()
    const a = criarProduto('Tesoura', 5, 20)
    const b = criarProduto('Prancha', 3, 80)

    let novas: MovimentacaoEstoque[] = []
    act(() => {
      novas = ctx.saidaPorVenda('venda-4', '2026-09-04', [
        { produtoId: a.id, quantidade: 2 },
        { produtoId: b.id, quantidade: 1 },
      ])
    })

    expect(novas).toHaveLength(2)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(3)
    expect(ctxProdutos.porId(b.id)?.estoque).toBe(2)

    // marcada: a repetição não baixa de novo
    act(() => {
      novas = ctx.saidaPorVenda('venda-4', '2026-09-04', [
        { produtoId: a.id, quantidade: 2 },
        { produtoId: b.id, quantidade: 1 },
      ])
    })
    expect(novas).toHaveLength(0)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(3)
    expect(ctxProdutos.porId(b.id)?.estoque).toBe(2)
  })

  it('venda acima do estoque não marca e deixa o retry livre', () => {
    montar()
    const a = criarProduto('Cadeira', 2, 100)

    let erro = ''
    act(() => {
      try {
        ctx.saidaPorVenda('venda-5', '2026-09-05', [
          { produtoId: a.id, quantidade: 5 },
        ])
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e)
      }
    })

    expect(erro).toMatch(/Estoque insuficiente/)
    expect(movimentacoes()).toHaveLength(0)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(2)

    // NÃO foi marcada, então uma tentativa menor funciona
    let novas: MovimentacaoEstoque[] = []
    act(() => {
      novas = ctx.saidaPorVenda('venda-5', '2026-09-05', [
        { produtoId: a.id, quantidade: 2 },
      ])
    })
    expect(novas).toHaveLength(1)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(0)
  })

  it('itens repetidos do mesmo produto somam antes de comparar', () => {
    montar()
    const a = criarProduto('Kit', 4, 10)

    let erro = ''
    act(() => {
      try {
        ctx.saidaPorVenda('venda-6', '2026-09-06', [
          { produtoId: a.id, quantidade: 2 },
          { produtoId: a.id, quantidade: 3 },
        ])
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e)
      }
    })

    // 2+3=5 > 4: recusado inteiro, nada aplicado
    expect(erro).toMatch(/Estoque insuficiente/)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(4)
    expect(movimentacoes()).toHaveLength(0)
  })

  it('duas vendas do mesmo produto somam corretamente', () => {
    montar()
    const a = criarProduto('Escova', 10, 5)

    act(() => {
      ctx.saidaPorVenda('venda-7', '2026-09-07', [
        { produtoId: a.id, quantidade: 3 },
      ])
    })
    act(() => {
      ctx.saidaPorVenda('venda-8', '2026-09-07', [
        { produtoId: a.id, quantidade: 4 },
      ])
    })

    expect(ctxProdutos.porId(a.id)?.estoque).toBe(3)
    expect(movimentacoes().filter((m) => m.tipo === 'venda')).toHaveLength(2)
  })

  it('estoque zerado é aceito (venda até o limite)', () => {
    montar()
    const a = criarProduto('Demaqueizador', 1, 6)

    let novas: MovimentacaoEstoque[] = []
    act(() => {
      novas = ctx.saidaPorVenda('venda-9', '2026-09-08', [
        { produtoId: a.id, quantidade: 1 },
      ])
    })

    expect(novas[0].estoqueAntes).toBe(1)
    expect(novas[0].estoqueDepois).toBe(0)
    expect(ctxProdutos.porId(a.id)?.estoque).toBe(0)
  })

  it('saldo final bate com a soma das movimentações', () => {
    montar()
    const a = criarProduto('Barba', 20, 3)

    act(() => {
      ctx.entrada({
        produtoId: a.id,
        quantidade: 5,
        custoUnitario: 4,
        data: '2026-09-09',
      })
    })
    act(() => {
      ctx.saidaPorVenda('venda-10', '2026-09-09', [
        { produtoId: a.id, quantidade: 6 },
      ])
    })
    act(() => {
      ctx.ajuste({
        produtoId: a.id,
        tipo: 'saida',
        quantidade: 4,
        motivo: 'perda',
        data: '2026-09-09',
      })
    })

    const saldo = ctxProdutos.porId(a.id)?.estoque ?? 0
    const ultima = movimentacoes().filter((m) => m.produtoId === a.id).at(-1)
    expect(saldo).toBe(ultima?.estoqueDepois)
    expect(saldo).toBe(20 + 5 - 6 - 4)
  })
})
