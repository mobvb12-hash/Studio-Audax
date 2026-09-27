// Contrato dos repositórios de Produtos e Estoque (I5).
// Integridade de estoque: toda escrita confirma o resultado e toda falha real
// do Supabase é propagada — e como o upsert é pelo mesmo id do app, reenviar
// a mesma movimentação (ou a mesma venda) nunca vira uma segunda linha.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  atualizarProduto,
  criarProduto,
  importarProdutos,
  listarProdutos,
} from './produtos'
import {
  gravarMovimentacao,
  importarMovimentacoes,
  listarMovimentacoes,
} from './estoque'
import type { Produto } from '@/modules/produtos/types'
import type { MovimentacaoEstoque } from '@/modules/estoque/types'

// Banco em memória com a mesma forma de consulta usada pelos repositórios.
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Array<{ tabela: string; linha: Linha }>,
    falha: null as string | null,
    semSupabase: false,
    chamadas: [] as { op: string; tabela: string }[],
    gravadas(tabela: string): Linha[] {
      return estado.linhas
        .filter((item) => item.tabela === tabela)
        .map((item) => ({ ...item.linha }))
    },
    reiniciar(linhas: Array<[string, Linha]> = []) {
      estado.linhas = linhas.map(([tabela, linha]) => ({ tabela, linha }))
      estado.falha = null
      estado.semSupabase = false
      estado.chamadas = []
    },
  }

  function criarBuilder(tabela: string) {
    const local = {
      op: '',
      payload: undefined as unknown,
      condicoes: [] as [string, unknown][],
    }
    const indice = (id: unknown) =>
      estado.linhas.findIndex(
        (item) => item.tabela === tabela && item.linha.id === id,
      )
    const executar = (): Resposta => {
      estado.chamadas.push({ op: local.op, tabela })
      if (estado.falha) return { data: null, error: { message: estado.falha } }

      if (local.op === 'insert' || local.op === 'upsert') {
        const lote = (Array.isArray(local.payload)
          ? local.payload
          : [local.payload]) as Linha[]
        for (const nova of lote) {
          const posicao = indice(nova.id)
          if (posicao >= 0) estado.linhas[posicao].linha = { ...nova }
          else estado.linhas.push({ tabela, linha: { ...nova } })
        }
        return { data: lote.map((linha) => ({ ...linha })), error: null }
      }
      if (local.op === 'update') {
        const alvos = estado.linhas.filter(
          (item) =>
            item.tabela === tabela &&
            local.condicoes.every(
              ([coluna, valor]) => item.linha[coluna] === valor,
            ),
        )
        alvos.forEach((item) => Object.assign(item.linha, local.payload))
        return { data: alvos.map((item) => ({ ...item.linha })), error: null }
      }
      return {
        data: estado.linhas
          .filter(
            (item) =>
              item.tabela === tabela &&
              local.condicoes.every(
                ([coluna, valor]) => item.linha[coluna] === valor,
              ),
          )
          .map((item) => ({ ...item.linha })),
        error: null,
      }
    }

    const builder = {
      select: () => {
        if (!local.op) local.op = 'select'
        return builder
      },
      insert: (payload: unknown) => {
        local.op = 'insert'
        local.payload = payload
        return builder
      },
      upsert: (payload: unknown) => {
        local.op = 'upsert'
        local.payload = payload
        return builder
      },
      update: (payload: unknown) => {
        local.op = 'update'
        local.payload = payload
        return builder
      },
      delete: () => {
        local.op = 'delete'
        return builder
      },
      eq: (coluna: string, valor: unknown) => {
        local.condicoes.push([coluna, valor])
        return builder
      },
      order: () => builder,
      maybeSingle: async () => {
        const resposta = executar()
        const linhas = Array.isArray(resposta.data) ? resposta.data : []
        return { data: linhas[0] ?? null, error: resposta.error }
      },
      then: (
        aoResolver?: (valor: Resposta) => unknown,
        aoRejeitar?: (erro: unknown) => unknown,
      ) => Promise.resolve(executar()).then(aoResolver, aoRejeitar),
    }
    return builder
  }

  return {
    estado,
    cliente: { from: (tabela: string) => criarBuilder(tabela) },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente),
}))

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

function movimentacao(extra: Partial<MovimentacaoEstoque> = {}): MovimentacaoEstoque {
  return {
    id: 'mov-1',
    produtoId: 'pro-1',
    produto: 'Pomada',
    tipo: 'venda',
    quantidade: -2,
    estoqueAntes: 10,
    estoqueDepois: 8,
    custoUnitario: 12,
    data: '2026-04-01',
    hora: '10:00',
    origem: 'pdv',
    vendaId: 'lan-1',
    criadoEm: '2026-04-01T13:00:00.000Z',
    ...extra,
  }
}

beforeEach(() => {
  banco.estado.reiniciar()
})

describe('Produtos — leituras', () => {
  it('lê o cadastro e converte a linha', async () => {
    banco.estado.reiniciar([
      [
        'produtos',
        {
          id: 'pro-1',
          nome: 'Pomada',
          preco: 25,
          custo: 12,
          estoque: 10,
          estoque_minimo: 2,
          categoria: 'Cuidados',
          foto: 'data:image/jpeg;base64,X',
          ativo: true,
          criado_em: '2026-04-01T00:00:00.000Z',
          atualizado_em: '2026-04-01T00:00:00.000Z',
        },
      ],
    ])

    const [lido] = await listarProdutos()

    expect(lido).toMatchObject({
      id: 'pro-1',
      nome: 'Pomada',
      preco: 25,
      estoque: 10,
      estoqueMinimo: 2,
      foto: 'data:image/jpeg;base64,X',
      ativo: true,
    })
  })

  it('consulta válida sem registros devolve []', async () => {
    await expect(listarProdutos()).resolves.toEqual([])
  })

  it('erro do banco lança com a mensagem original (não vira [])', async () => {
    banco.estado.falha = 'permission denied for table produtos'

    await expect(listarProdutos()).rejects.toThrow(/permission denied/)
  })

  it('sem Supabase mantém o modo local e não consulta', async () => {
    banco.estado.semSupabase = true

    await expect(listarProdutos()).resolves.toEqual([])
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Produtos — escritas confirmadas', () => {
  it('cria e devolve a linha confirmada', async () => {
    const criado = await criarProduto(produto())

    expect(criado).toMatchObject({ id: 'pro-1', estoque: 10 })
    expect(banco.estado.gravadas('produtos')).toHaveLength(1)
  })

  it('reenviar o mesmo produto atualiza em vez de duplicar', async () => {
    await criarProduto(produto())
    await criarProduto(produto({ estoque: 7, atualizadoEm: '2026-04-02T00:00:00.000Z' }))

    const gravados = banco.estado.gravadas('produtos')
    expect(gravados).toHaveLength(1)
    expect(gravados[0].estoque).toBe(7)
  })

  it('confirma edição e trata produto inexistente como falha', async () => {
    banco.estado.reiniciar([['produtos', { id: 'pro-1', nome: 'Pomada' }]])

    const editado = await atualizarProduto('pro-1', produto({ nome: 'Pomada nova' }))
    expect(editado?.nome).toBe('Pomada nova')

    await expect(
      atualizarProduto('inexistente', produto({ id: 'inexistente' })),
    ).rejects.toThrow(/não existe mais no Supabase/)
  })

  it('recusa do Supabase propaga a mensagem', async () => {
    banco.estado.falha = 'violates check constraint'

    await expect(criarProduto(produto())).rejects.toThrow(/check constraint/)
    await expect(atualizarProduto('pro-1', produto())).rejects.toThrow(
      /check constraint/,
    )
  })

  it('importar reenvia sem duplicar e devolve a contagem', async () => {
    await expect(importarProdutos([produto()])).resolves.toBe(1)
    await expect(importarProdutos([produto()])).resolves.toBe(1)
    expect(banco.estado.gravadas('produtos')).toHaveLength(1)

    banco.estado.falha = 'timeout'
    await expect(importarProdutos([produto()])).resolves.toBe(0)
  })

  it('sem Supabase nada lança (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(criarProduto(produto())).resolves.toBeNull()
    await expect(atualizarProduto('pro-1', produto())).resolves.toBeNull()
    await expect(importarProdutos([produto()])).resolves.toBe(0)
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Estoque — leituras', () => {
  it('lê o histórico preservando quantidade, saldos e venda', async () => {
    banco.estado.reiniciar([
      [
        'estoque_movimentacoes',
        {
          id: 'mov-1',
          produto_id: 'pro-1',
          produto: 'Pomada',
          tipo: 'venda',
          quantidade: -2,
          estoque_antes: 10,
          estoque_depois: 8,
          custo_unitario: 12,
          data: '2026-04-01',
          hora: '10:00',
          origem: 'pdv',
          venda_id: 'lan-1',
          fornecedor: '',
          motivo: '',
          observacao: '',
          criado_em: '2026-04-01T13:00:00.000Z',
        },
      ],
    ])

    const [lida] = await listarMovimentacoes()

    expect(lida).toMatchObject({
      id: 'mov-1',
      produtoId: 'pro-1',
      tipo: 'venda',
      quantidade: -2,
      estoqueAntes: 10,
      estoqueDepois: 8,
      vendaId: 'lan-1',
      origem: 'pdv',
    })
  })

  it('consulta válida sem registros devolve []', async () => {
    await expect(listarMovimentacoes()).resolves.toEqual([])
  })

  it('erro do banco lança com a mensagem original', async () => {
    banco.estado.falha = 'statement timeout'

    await expect(listarMovimentacoes()).rejects.toThrow(/statement timeout/)
  })

  it('sem Supabase mantém o modo local', async () => {
    banco.estado.semSupabase = true

    await expect(listarMovimentacoes()).resolves.toEqual([])
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Estoque — escritas confirmadas e integridade', () => {
  it('grava a movimentação e devolve a linha confirmada', async () => {
    const gravada = await gravarMovimentacao(movimentacao())

    expect(gravada).toMatchObject({ id: 'mov-1', vendaId: 'lan-1' })
    expect(banco.estado.gravadas('estoque_movimentacoes')).toHaveLength(1)
  })

  it('a MESMA movimentação reenviada continua sendo uma só', async () => {
    await gravarMovimentacao(movimentacao())
    await gravarMovimentacao(movimentacao())

    expect(banco.estado.gravadas('estoque_movimentacoes')).toHaveLength(1)
  })

  it('reenviar a mesma venda inteira não cria uma segunda baixa', async () => {
    const baixa = [
      movimentacao({ id: 'mov-1', produtoId: 'pro-1', produto: 'Pomada', quantidade: -1 }),
      movimentacao({ id: 'mov-2', produtoId: 'pro-2', produto: 'Shampoo', quantidade: -2 }),
    ]

    await expect(importarMovimentacoes(baixa)).resolves.toBe(2)
    await expect(importarMovimentacoes(baixa)).resolves.toBe(2)
    await expect(importarMovimentacoes(baixa)).resolves.toBe(2)

    const gravadas = banco.estado.gravadas('estoque_movimentacoes')
    expect(gravadas).toHaveLength(2)
    expect(gravadas.map((l) => l.id)).toEqual(['mov-1', 'mov-2'])
  })

  it('estorno da mesma venda repetido continua sendo um movimento só', async () => {
    const estorno = movimentacao({
      id: 'mov-9',
      tipo: 'estorno',
      quantidade: 2,
      estoqueAntes: 8,
      estoqueDepois: 10,
      origem: 'estorno',
    })

    await gravarMovimentacao(estorno)
    await gravarMovimentacao(estorno)
    await expect(importarMovimentacoes([estorno])).resolves.toBe(1)

    expect(banco.estado.gravadas('estoque_movimentacoes')).toHaveLength(1)
  })

  it('recusa do Supabase propaga a mensagem', async () => {
    banco.estado.falha = 'deadlock detected'

    await expect(gravarMovimentacao(movimentacao())).rejects.toThrow(/deadlock/)
    await expect(importarMovimentacoes([movimentacao()])).resolves.toBe(0)
  })

  it('sem Supabase nada lança (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(gravarMovimentacao(movimentacao())).resolves.toBeNull()
    await expect(importarMovimentacoes([movimentacao()])).resolves.toBe(0)
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})
