// Integração de Produtos e Estoque com o Supabase (I5).
// Foco: nada se perde, nada duplica e uma venda repetida baixa o estoque
// uma única vez.
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import type { MovimentacaoEstoque } from '@/modules/estoque/types'

const CHAVE_PRODUTOS = 'studio-audax:produtos:v1'
const CHAVE_ESTOQUE = 'studio-audax:estoque:movimentacoes:v1'

const remoto = vi.hoisted(() => ({
  produtos: [] as unknown[],
  movimentacoes: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  gravarEm(caixa: unknown[], linha: Record<string, unknown>) {
    const indice = caixa.findIndex(
      (item) => (item as { id: string }).id === linha.id,
    )
    if (indice >= 0) caixa[indice] = linha
    else caixa.push(linha)
  },
  ids(caixa: unknown[]): string[] {
    return caixa.map((item) => (item as { id: string }).id)
  },
  reiniciar() {
    remoto.produtos = []
    remoto.movimentacoes = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/produtos', () => ({
  listarProdutos: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.produtos] as never
  }),
  criarProduto: vi.fn(async (produto: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.produtos, produto as Record<string, unknown>)
    return produto as never
  }),
  atualizarProduto: vi.fn(async () => null),
  importarProdutos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.produtos, item as Record<string, unknown>)
    }
    return lista.length
  }),
}))

vi.mock('@/services/supabase/estoque', () => ({
  listarMovimentacoes: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.movimentacoes] as never
  }),
  gravarMovimentacao: vi.fn(async (movimentacao: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.movimentacoes, movimentacao as Record<string, unknown>)
    return movimentacao as never
  }),
  importarMovimentacoes: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.movimentacoes, item as Record<string, unknown>)
    }
    return lista.length
  }),
}))

let ctxProdutos: ReturnType<typeof useProdutos>
let ctxEstoque: ReturnType<typeof useEstoque>

function CapturaProdutos() {
  const valor = useProdutos()
  useEffect(() => {
    ctxProdutos = valor
  })
  return null
}

function CapturaEstoque() {
  const valor = useEstoque()
  useEffect(() => {
    ctxEstoque = valor
  })
  return null
}

function montar() {
  return render(
    <ProdutosProvider>
      <CapturaProdutos />
      <EstoqueProvider>
        <CapturaEstoque />
      </EstoqueProvider>
    </ProdutosProvider>,
  )
}

function produto(extra: Partial<Produto> = {}): Produto {
  return {
    id: 'pro-1',
    nome: 'Pomada',
    preco: 25,
    custo: 12,
    estoque: 10,
    estoqueMinimo: 2,
    categoria: 'Cuidados',
    foto: '',
    ativo: true,
    criadoEm: '2026-04-01T00:00:00.000Z',
    atualizadoEm: '2026-04-01T00:00:00.000Z',
    ...extra,
  }
}

/** Executa uma a��o do store e devolve o valor (o `act` do RTL devolve thenable). */
function executar<T>(acao: () => T): T {
  let resultado!: T
  act(() => {
    resultado = acao()
  })
  return resultado
}

function salvo(chave: string): unknown[] {
  return JSON.parse(localStorage.getItem(chave) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
  ctxEstoque = undefined as unknown as ReturnType<typeof useEstoque>
})

describe('Produtos — integração com o Supabase', () => {
  it('produto local ausente no remoto é enviado (migração do que já existe)', async () => {
    localStorage.setItem(CHAVE_PRODUTOS, JSON.stringify([produto()]))

    montar()

    await waitFor(() => expect(remoto.produtos).toHaveLength(1))
    expect(remoto.ids(remoto.produtos)).toEqual(['pro-1'])
    expect(ctxProdutos.produtos).toHaveLength(1)
    expect(avisosPersistencia()).toEqual([])
  })

  it('criar produto grava local e envia com o mesmo id', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))

    let novo!: Produto
    executar(() => {
      novo = ctxProdutos.adicionar({
        nome: 'Shampoo',
        preco: 40,
        custo: 20,
        estoque: 5,
        estoqueMinimo: 1,
      })
    })

    await waitFor(() => expect(remoto.produtos).toHaveLength(1))
    expect(remoto.ids(remoto.produtos)).toEqual([novo.id])
    await waitFor(() => expect(salvo(CHAVE_PRODUTOS)).toHaveLength(1))
  })

  it('editar e desativar vão para o Supabase pelo mesmo id', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    let criado!: Produto
    executar(() => {
      criado = ctxProdutos.adicionar({ nome: 'Shampoo', preco: 40, custo: 20 })
    })
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))

    executar(() => {
      ctxProdutos.atualizar(criado.id, { nome: 'Shampoo premium', preco: 55 })
    })
    await waitFor(() =>
      expect(
        (remoto.produtos[0] as { nome: string }).nome,
      ).toBe('Shampoo premium'),
    )

    executar(() => ctxProdutos.alternarAtivo(criado.id))
    await waitFor(() =>
      expect((remoto.produtos[0] as { ativo: boolean }).ativo).toBe(false),
    )
    expect(remoto.produtos).toHaveLength(1)
  })

  it('registro que só existe no servidor entra na união (outro aparelho)', async () => {
    localStorage.setItem(CHAVE_PRODUTOS, JSON.stringify([]))
    remoto.produtos = [produto({ id: 'pro-9', nome: 'Barba de Ferro' })]

    montar()

    await waitFor(() => expect(ctxProdutos.produtos).toHaveLength(1))
    expect(ctxProdutos.produtos[0].id).toBe('pro-9')
  })

  it('falha de leitura não vira banco vazio: não reenvia nem sobrescreve', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(CHAVE_PRODUTOS, JSON.stringify([produto()]))
    remoto.produtos = [produto({ id: 'pro-9', nome: 'Barba de Ferro' })]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('Supabase indisponível'),
      expect.any(Error),
    )
    expect(remoto.ids(remoto.produtos)).toEqual(['pro-9'])
    await waitFor(() => expect(ctxProdutos.produtos).toHaveLength(1))
    expect(ctxProdutos.produtos[0].id).toBe('pro-1')
    aviso.mockRestore()
  })

  it('falha de escrita mantém o produto local e avisa', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    remoto.falhaEscrita = true

    executar(() => {
      ctxProdutos.adicionar({ nome: 'Shampoo', preco: 40, custo: 20 })
    })

    await waitFor(() => expect(salvo(CHAVE_PRODUTOS)).toHaveLength(1))
    expect(ctxProdutos.produtos).toHaveLength(1)
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
    expect(remoto.produtos).toHaveLength(0)
  })

  it('divergência: vence o mais recente por atualizadoEm e o perdedor fica no snapshot', async () => {
    localStorage.setItem(
      CHAVE_PRODUTOS,
      JSON.stringify([
        produto({ estoque: 7, atualizadoEm: '2026-04-05T00:00:00.000Z' }),
      ]),
    )
    remoto.produtos = [
      produto({ estoque: 10, atualizadoEm: '2026-04-01T00:00:00.000Z' }),
    ]

    montar()

    await waitFor(() => expect(ctxProdutos.produtos).toHaveLength(1))
    expect(ctxProdutos.produtos[0].estoque).toBe(7)
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))
    const chaves = Object.keys(localStorage).filter((chave) =>
      chave.startsWith(`${CHAVE_PRODUTOS}:backup:`),
    )
    expect(chaves).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(chaves[0]) ?? '[]')[0].estoque).toBe(10)
  })

  it('instalação nova adota a lista oficial sem reenviar nada', async () => {
    remoto.produtos = [produto({ id: 'pro-7', nome: 'Pó de barbear' })]
    // storage vazio = instalação nova

    montar()

    await waitFor(() => expect(ctxProdutos.produtos).toHaveLength(1))
    expect(ctxProdutos.produtos[0].id).toBe('pro-7')
    expect(remoto.produtos).toHaveLength(1)
  })
})

describe('Estoque — integração com o Supabase', () => {
  it('entrada, saída e ajuste gravam o histórico nos dois lados', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    const criado = executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))

    executar(() =>
      ctxEstoque.entrada({
        produtoId: criado.id,
        quantidade: 5,
        custoUnitario: 12,
        data: '2026-04-02',
      }),
    )
    executar(() =>
      ctxEstoque.ajuste({
        produtoId: criado.id,
        tipo: 'saida',
        quantidade: 1,
        motivo: 'perda',
        data: '2026-04-03',
      }),
    )
    executar(() =>
      ctxEstoque.saidaPorVenda('lan-1', '2026-04-04', [
        { produtoId: criado.id, produto: 'Pomada', quantidade: 2 },
      ]),
    )

    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(12) // 10 + 5 - 1 - 2
    expect(ctxEstoque.movimentacoes).toHaveLength(3)
    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(3))
    await waitFor(() =>
      expect(
        (remoto.produtos[0] as { estoque: number }).estoque,
      ).toBe(12),
    )
  })

  it('reenviar o histórico não duplica movimentação nem muda o saldo', async () => {
    const primeira = montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    const produtoId = ctxProdutos.produtos[0].id
    executar(() =>
      ctxEstoque.entrada({
        produtoId,
        quantidade: 5,
        custoUnitario: 12,
        data: '2026-04-02',
      }),
    )
    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(1))
    const saldo = ctxProdutos.porId(produtoId)?.estoque
    expect(saldo).toBe(15)

    // três cargas: a pendência reenviada continua sendo uma movimentação
    primeira.unmount()
    montar()
    await waitFor(() => expect(ctxEstoque.movimentacoes).toHaveLength(1))
    expect(ctxProdutos.porId(produtoId)?.estoque).toBe(15)
    expect(remoto.movimentacoes).toHaveLength(1)
  })

  it('PDV: a mesma venda processada duas vezes baixa o estoque uma vez só', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    const criado = executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))

    const itens = [{ produtoId: criado.id, produto: 'Pomada', quantidade: 2 }]
    const primeira = executar(() => ctxEstoque.saidaPorVenda('lan-1', '2026-04-04', itens))
    expect(primeira).toHaveLength(1)
    // retry do PDV (mesma venda) — a trava por vendaId impede a segunda baixa
    const segunda = executar(() => ctxEstoque.saidaPorVenda('lan-1', '2026-04-04', itens))
    expect(segunda).toEqual([])
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(8)
    expect(ctxEstoque.movimentacoes).toHaveLength(1)

    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(1))
    expect(remoto.movimentacoes).toHaveLength(1)
    expect((remoto.movimentacoes[0] as { vendaId: string }).vendaId).toBe('lan-1')
    await waitFor(() =>
      expect((remoto.produtos[0] as { estoque: number }).estoque).toBe(8),
    )
  })

  it('PDV: reenvio da mesma venda após falha de sincronização não baixa de novo', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const primeiroRender = montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    const criado = executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))
    // a gravação do saldo e da movimentação é recusada pelo Supabase
    remoto.falhaEscrita = true

    executar(() =>
      ctxEstoque.saidaPorVenda('lan-2', '2026-04-04', [
        { produtoId: criado.id, produto: 'Pomada', quantidade: 3 },
      ]),
    )

    // localmente a venda happened: saldo baixou e histórico tem uma linha
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(7)
    expect(ctxEstoque.movimentacoes).toHaveLength(1)
    // o servidor não recebeu nada, e a tela avisa
    expect(remoto.movimentacoes).toHaveLength(0)
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )

    // nova carga com o Supabase de volta: a pendência é reenviada pelo mesmo
    // id — uma única movimentação, e o saldo não baixa de novo
    primeiroRender.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(1))
    expect(remoto.movimentacoes).toHaveLength(1)
    expect((remoto.movimentacoes[0] as { vendaId: string }).vendaId).toBe('lan-2')
    await waitFor(() => expect(ctxEstoque.movimentacoes).toHaveLength(1))
    expect(ctxEstoque.movimentacoes).toHaveLength(1)
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(7)
    // o saldo também foi recuperado: o remoto recebe o valor da sessão
    await waitFor(() =>
      expect((remoto.produtos[0] as { estoque: number }).estoque).toBe(7),
    )
    aviso.mockRestore()
  })

  it('estorno da venda devolve o estoque e repete sem duplicar', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    const criado = executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))
    executar(() =>
      ctxEstoque.saidaPorVenda('lan-3', '2026-04-04', [
        { produtoId: criado.id, produto: 'Pomada', quantidade: 2 },
      ]),
    )
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(8)

    const estorno = executar(() =>
      ctxEstoque.reverterVenda({
        id: 'lan-3',
        itens: [{ produtoId: criado.id, produto: 'Pomada', quantidade: 2 }],
      }),
    )
    expect(estorno).toHaveLength(1)
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(10)

    // repetir o estorno não devolve duas vezes
    const repetido = executar(() =>
      ctxEstoque.reverterVenda({
        id: 'lan-3',
        itens: [{ produtoId: criado.id, produto: 'Pomada', quantidade: 2 }],
      }),
    )
    expect(repetido).toEqual([])
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(10)
    expect(ctxEstoque.movimentacoes).toHaveLength(2)
    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(2))
  })

  it('estoque inicial registra o histórico e a sincronização mantém o saldo', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    const criado = executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))

    executar(() => ctxEstoque.registrarInicial(ctxProdutos.porId(criado.id)!, 4))

    expect(ctxEstoque.movimentacoes).toHaveLength(1)
    // estoque inicial registra o histórico sem mexer no saldo (regra existente)
    expect(ctxProdutos.porId(criado.id)?.estoque).toBe(10)
    expect(ctxEstoque.movimentacoes[0]).toMatchObject({
      tipo: 'inicial',
      quantidade: 4,
      estoqueAntes: 6,
      estoqueDepois: 10,
    })
    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(1))
    expect(salvo(CHAVE_ESTOQUE)).toHaveLength(1)
  })

  it('renomear produto propaga o rótulo sem criar movimentação', async () => {
    montar()
    await waitFor(() => expect(ctxProdutos.produtos).toEqual([]))
    const criado = executar(() =>
      ctxProdutos.adicionar({ nome: 'Pomada', preco: 25, custo: 12, estoque: 10 }),
    )
    await waitFor(() => expect(remoto.produtos).toHaveLength(1))
    executar(() =>
      ctxEstoque.entrada({
        produtoId: criado.id,
        quantidade: 2,
        custoUnitario: 12,
        data: '2026-04-02',
      }),
    )
    await waitFor(() => expect(remoto.movimentacoes).toHaveLength(1))

    executar(() => ctxEstoque.renomearProduto(criado.id, 'Pomada nova'))

    expect(ctxEstoque.movimentacoes[0].produto).toBe('Pomada nova')
    await waitFor(() =>
      expect((remoto.movimentacoes[0] as { produto: string }).produto).toBe(
        'Pomada nova',
      ),
    )
    expect(remoto.movimentacoes).toHaveLength(1)
  })

  it('histórico que só existe no servidor entra na união', async () => {
    const doServidor: MovimentacaoEstoque = {
      id: 'mov-9',
      produtoId: 'pro-1',
      produto: 'Pomada',
      tipo: 'entrada',
      quantidade: 5,
      estoqueAntes: 5,
      estoqueDepois: 10,
      custoUnitario: 12,
      data: '2026-04-02',
      hora: '09:00',
      origem: 'manual',
      criadoEm: '2026-04-02T12:00:00.000Z',
    }
    localStorage.setItem(CHAVE_ESTOQUE, JSON.stringify([]))
    remoto.movimentacoes = [doServidor]

    montar()

    await waitFor(() => expect(ctxEstoque.movimentacoes).toHaveLength(1))
    expect(ctxEstoque.movimentacoes[0].id).toBe('mov-9')
    expect(remoto.movimentacoes).toHaveLength(1)
  })

  it('falha de leitura do estoque não reenvia o histórico', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      CHAVE_ESTOQUE,
      JSON.stringify([
        {
          id: 'mov-1',
          produtoId: 'pro-1',
          produto: 'Pomada',
          tipo: 'entrada',
          quantidade: 5,
          estoqueAntes: 5,
          estoqueDepois: 10,
          custoUnitario: 12,
          data: '2026-04-02',
          hora: '09:00',
          origem: 'manual',
          criadoEm: '2026-04-02T12:00:00.000Z',
        },
      ]),
    )
    remoto.movimentacoes = [
      {
        id: 'mov-8',
        produtoId: 'pro-1',
        produto: 'Pomada',
        tipo: 'entrada',
        quantidade: 1,
        estoqueAntes: 9,
        estoqueDepois: 10,
        custoUnitario: 12,
        data: '2026-04-03',
        hora: '09:00',
        origem: 'manual',
        criadoEm: '2026-04-03T12:00:00.000Z',
      },
    ]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(remoto.ids(remoto.movimentacoes)).toEqual(['mov-8'])
    await waitFor(() => expect(ctxEstoque.movimentacoes).toHaveLength(1))
    expect(ctxEstoque.movimentacoes[0].id).toBe('mov-1')
    aviso.mockRestore()
  })

  it('instalação nova adota o histórico remoto', async () => {
    remoto.movimentacoes = [
      {
        id: 'mov-5',
        produtoId: 'pro-1',
        produto: 'Pomada',
        tipo: 'inicial',
        quantidade: 10,
        estoqueAntes: 0,
        estoqueDepois: 10,
        custoUnitario: 12,
        data: '2026-04-01',
        hora: '08:00',
        origem: 'cadastro',
        criadoEm: '2026-04-01T12:00:00.000Z',
      },
    ]
    // storage vazio = instalação nova

    montar()

    await waitFor(() => expect(ctxEstoque.movimentacoes).toHaveLength(1))
    expect(ctxEstoque.movimentacoes[0].id).toBe('mov-5')
    expect(remoto.movimentacoes).toHaveLength(1)
  })
})
