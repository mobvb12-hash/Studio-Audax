// Regressão do `order` da leitura de produtos.
//
// A consulta usava `.order('lower(nome)')`, produzindo `order=lower(nome).asc`.
// O PostgREST não aceita expressão de função no parâmetro `order`: ele lê
// `lower(nome)` como sintaxe de embed e recusa a requisição INTEIRA com
// PGRST108 ("'lower' is not an embedded resource in this request"). O
// sintoma era um HTTP 400 na leitura de produtos, que o store transformava em
// "Supabase indisponível — seguindo com os dados locais".
//
// A ordenação case-insensitive NÃO foi removida ao corrigir: ela vive em
// `modules/produtos/store.tsx` (`ordenar`, localeCompare pt-BR). Aqui o
// `order` só precisa mandar o nome cru.
//
// Por que este teste existe: os doubles de `order` nos outros testes são
// `order: () => builder` — aceitam qualquer argumento em silêncio, então nada
// travava a coluna. Aqui os argumentos são capturados e asseridos.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarProdutos } from './produtos'

type OrdemRegistrada = { coluna: unknown; opcoes: unknown }

const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Linha[],
    tabela: '' as string,
    /** Cada chamada de `order()`, com os argumentos recebidos. */
    orders: [] as { coluna: unknown; opcoes: unknown }[],
    semSupabase: false,
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((linha) => ({ ...linha }))
      estado.tabela = ''
      estado.orders = []
      estado.semSupabase = false
    },
  }

  function criarBuilder() {
    const builder = {
      select: () => builder,
      order: (coluna: unknown, opcoes: unknown) => {
        // Não aceita nada em silêncio: o argumento vai para a asserção.
        estado.orders.push({ coluna, opcoes })
        return builder
      },
      maybeSingle: async (): Promise<Resposta> => ({ data: null, error: null }),
      then: (
        aoResolver?: (valor: Resposta) => unknown,
        aoRejeitar?: (erro: unknown) => unknown,
      ) =>
        Promise.resolve<Resposta>({ data: estado.linhas, error: null }).then(
          aoResolver,
          aoRejeitar,
        ),
    }
    return builder
  }

  return {
    estado,
    cliente: {
      from: (tabela: string) => {
        estado.tabela = tabela
        return criarBuilder()
      },
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente),
}))

function linhaProduto(id: string, nome: string) {
  return {
    id,
    nome,
    preco: 25,
    custo: 12,
    estoque: 10,
    estoque_minimo: 2,
    categoria: 'Cuidados',
    foto: '',
    ativo: true,
    criado_em: '2026-01-01T00:00:00.000Z',
    atualizado_em: '2026-01-01T00:00:00.000Z',
  }
}

/** Só a chamada de `order` feita por `listarProdutos`. */
function unicaOrdem(): OrdemRegistrada {
  expect(banco.estado.orders).toHaveLength(1)
  return banco.estado.orders[0]
}

beforeEach(() => {
  banco.estado.reiniciar()
})

describe('listarProdutos — coluna do order', () => {
  it('ordena pela coluna crua "nome", com ascending true', async () => {
    banco.estado.reiniciar([linhaProduto('pro-1', 'Pomada')])

    await listarProdutos()

    const ordem = unicaOrdem()
    expect(ordem.coluna).toBe('nome')
    expect(ordem.opcoes).toEqual({ ascending: true })
  })

  it('NUNCA envia expressão de função no order (PGRST108)', async () => {
    banco.estado.reiniciar([linhaProduto('pro-1', 'Pomada')])

    await listarProdutos()

    const coluna = String(unicaOrdem().coluna)
    // `lower(nome)`, `lower("nome")`, `UPPER(nome)`, qualquer chamada de função
    // é recusada pelo PostgREST com PGRST108 e derruba a requisição inteira.
    expect(coluna).not.toMatch(/\w+\s*\(/)
    expect(coluna).not.toBe('lower(nome)')
    expect(coluna).toBe('nome')
  })

  it('a coluna enviada é um identificador simples, sem aspas nem ponto', async () => {
    banco.estado.reiniciar([linhaProduto('pro-1', 'Pomada')])

    await listarProdutos()

    const coluna = String(unicaOrdem().coluna)
    expect(coluna).toMatch(/^[a-z_][a-z0-9_]*$/)
  })

  it('consulta a tabela produtos e devolve as linhas convertidas', async () => {
    banco.estado.reiniciar([
      linhaProduto('pro-2', 'Batom'),
      linhaProduto('pro-1', 'Ácido'),
    ])

    const lista = await listarProdutos()

    expect(banco.estado.tabela).toBe('produtos')
    expect(lista.map((p) => p.nome)).toEqual(['Batom', 'Ácido'])
    expect(lista[0]).toMatchObject({ id: 'pro-2', estoqueMinimo: 2, ativo: true })
  })

  it('banco vazio devolve [] sem quebrar o order', async () => {
    banco.estado.reiniciar()

    await expect(listarProdutos()).resolves.toEqual([])
    expect(unicaOrdem().coluna).toBe('nome')
  })

  it('sem Supabase não consulta nada e devolve []', async () => {
    banco.estado.semSupabase = true

    await expect(listarProdutos()).resolves.toEqual([])
    expect(banco.estado.orders).toHaveLength(0)
  })
})
