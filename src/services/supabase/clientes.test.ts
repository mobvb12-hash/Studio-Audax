import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alternarAtivoCliente,
  atualizarCliente,
  buscarClientes,
  criarCliente,
  importarClientes,
  listarClientes,
  removerCliente,
} from './clientes'
import type { Cliente } from '@/modules/clientes/types'

// Banco em memória com a mesma forma de consulta usada pelo repositório.
// `falha` simula erro do Supabase (rede, RLS, constraint...).
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Linha[],
    falha: null as string | null,
    semSupabase: false,
    chamadas: [] as {
      op: string
      tabela: string
      payload?: unknown
      ids?: string[]
    }[],
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((l) => ({ ...l }))
      estado.falha = null
      estado.chamadas = []
    },
  }

  function criarBuilder(tabela: string) {
    const local = {
      op: 'select',
      definido: false,
      payload: undefined as unknown,
      condicoes: [] as [string, unknown][],
      busca: '',
    }

    const marcar = (op: string) => {
      if (!local.definido) {
        local.op = op
        local.definido = true
      }
    }

    const filtrar = (): Linha[] =>
      estado.linhas.filter((linha) =>
        local.condicoes.every(([coluna, valor]) => linha[coluna] === valor),
      )

    const aplicarBusca = (linhas: Linha[]): Linha[] => {
      if (!local.busca) return linhas
      const termos = local.busca
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [coluna, , valor] = item.split('.')
          return [coluna, (valor ?? '').replace(/%/g, '').toLowerCase()] as const
        })
      return linhas.filter((linha) =>
        termos.some(([coluna, valor]) =>
          String(linha[coluna] ?? '')
            .toLowerCase()
            .includes(valor),
        ),
      )
    }

    const executar = (): Resposta => {
      const condicaoId = local.condicoes.find(([coluna]) => coluna === 'id')
      estado.chamadas.push({
        op: local.op,
        tabela,
        payload: local.payload,
        ids: condicaoId ? [String(condicaoId[1])] : undefined,
      })
      if (estado.falha) return { data: null, error: { message: estado.falha } }

      if (local.op === 'select') {
        const ordenado = aplicarBusca(filtrar()).slice().sort((a, b) =>
          String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR'),
        )
        return { data: ordenado.map((l) => ({ ...l })), error: null }
      }

      if (local.op === 'insert') {
        const linha = { ...(local.payload as Linha) }
        if (estado.linhas.some((l) => l.id === linha.id)) {
          return { data: null, error: { message: 'chave duplicada' } }
        }
        estado.linhas.push(linha)
        return { data: [{ ...linha }], error: null }
      }

      if (local.op === 'update') {
        const alvos = filtrar()
        alvos.forEach((linha) => Object.assign(linha, local.payload))
        return { data: alvos.map((l) => ({ ...l })), error: null }
      }

      if (local.op === 'delete') {
        const alvos = new Set(filtrar())
        estado.linhas = estado.linhas.filter((l) => !alvos.has(l))
        return { data: null, error: null }
      }

      // upsert (onConflict: id)
      const linhas = (local.payload as Linha[]) ?? []
      for (const nova of linhas) {
        const existente = estado.linhas.find((l) => l.id === nova.id)
        if (existente) Object.assign(existente, nova)
        else estado.linhas.push({ ...nova })
      }
      return { data: linhas, error: null }
    }

    const builder = {
      select: () => {
        marcar('select')
        return builder
      },
      insert: (payload: unknown) => {
        marcar('insert')
        local.payload = payload
        return builder
      },
      update: (payload: unknown) => {
        marcar('update')
        local.payload = payload
        return builder
      },
      delete: () => {
        marcar('delete')
        return builder
      },
      upsert: (payload: unknown) => {
        marcar('upsert')
        local.payload = payload
        return builder
      },
      eq: (coluna: string, valor: unknown) => {
        local.condicoes.push([coluna, valor])
        return builder
      },
      or: (expressao: string) => {
        local.busca = expressao
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
    cliente: {
      from: (tabela: string) => criarBuilder(tabela),
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente),
}))

function linha(id: string, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    nome,
    telefone: '(11) 90000-0000',
    email: `${id}@email.com`,
    observacao: '',
    ativo: true,
    genero: 'nao_informado',
    cpf: '',
    cnpj: '',
    nascimento: '',
    etiquetas: [],
    instagram: '',
    como_nos_conheceu: '',
    telefones: [],
    endereco: null,
    preferencias: {
      emailAgendamentos: true,
      smsLembrete: true,
      smsMarketing: true,
      emailMarketing: true,
    },
    criado_em: '2026-01-01T00:00:00.000Z',
    atualizado_em: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

function cliente(id: string, nome: string, extra: Partial<Cliente> = {}) {
  return {
    id,
    nome,
    telefone: '(11) 90000-0000',
    email: `${id}@email.com`,
    observacao: '',
    ativo: true,
    genero: 'nao_informado',
    cpf: '',
    cnpj: '',
    nascimento: '',
    etiquetas: [],
    instagram: '',
    comoNosConheceu: '',
    telefones: [],
    endereco: null,
    preferencias: {
      emailAgendamentos: true,
      smsLembrete: true,
      smsMarketing: true,
      emailMarketing: true,
    },
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as Cliente
}

beforeEach(() => {
  banco.estado.reiniciar()
  banco.estado.semSupabase = false
})

describe('Clientes — repository sem Supabase', () => {
  it('leituras devolvem [] e escritas devolvem null/false', async () => {
    banco.estado.semSupabase = true
    await expect(listarClientes()).resolves.toEqual([])
    await expect(buscarClientes('ana')).resolves.toEqual([])
    await expect(criarCliente(cliente('c1', 'Ana'))).resolves.toBeNull()
    await expect(atualizarCliente('c1', cliente('c1', 'Ana'))).resolves.toBeNull()
    await expect(alternarAtivoCliente('c1', false)).resolves.toBeNull()
    await expect(removerCliente('c1')).resolves.toBe(false)
    await expect(importarClientes([cliente('c1', 'Ana')])).resolves.toBe(0)
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Clientes — repository', () => {
  it('lista tudo em ordem de nome e converte jsonb para o tipo do app', async () => {
    banco.estado.reiniciar([
      linha('c2', 'Bruno Dias', {
        etiquetas: ['vip', 3],
        telefones: [{ tipo: 'comercial', numero: '(11) 3000-0000' }],
        endereco: { logradouro: 'Rua A', numero: '10', cidade: 'São Paulo' },
        genero: 'feminino',
      }),
      linha('c1', 'Ana Dias', { genero: 'inexistente' }),
    ])

    const lista = await listarClientes()

    expect(lista.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(lista[0].genero).toBe('nao_informado')
    expect(lista[1].etiquetas).toEqual(['vip'])
    expect(lista[1].telefones).toEqual([
      { tipo: 'comercial', numero: '(11) 3000-0000' },
    ])
    expect(lista[1].endereco?.logradouro).toBe('Rua A')
    expect(lista[1].comoNosConheceu).toBe('')
    expect(lista[1].preferencias.emailAgendamentos).toBe(true)
  })

  it('lança quando a consulta falha (distingue erro de lista vazia)', async () => {
    banco.estado.reiniciar([linha('c1', 'Ana')])
    banco.estado.falha = 'permission denied'
    await expect(listarClientes()).rejects.toThrow(/permission denied/)
  })

  it('busca por nome, e-mail ou telefone no servidor', async () => {
    banco.estado.reiniciar([
      linha('c1', 'Ana Dias', { email: 'ana@email.com' }),
      linha('c2', 'Bruno', { email: 'bruno@email.com' }),
    ])

    expect((await buscarClientes('bruno')).map((c) => c.id)).toEqual(['c2'])
    expect((await buscarClientes('ANA@')).map((c) => c.id)).toEqual(['c1'])
    expect(await buscarClientes('   ')).toHaveLength(2)
  })

  it('cria preservando o id gerado pelo app e grava timestamps', async () => {
    const novo = cliente('cli-abc123', 'Ana Dias', {
      criadoEm: '2026-02-02T10:00:00.000Z',
      atualizadoEm: '2026-02-02T10:00:00.000Z',
    })

    const criado = await criarCliente(novo)

    expect(criado?.id).toBe('cli-abc123')
    expect(banco.estado.linhas[0]).toMatchObject({
      id: 'cli-abc123',
      nome: 'Ana Dias',
      criado_em: '2026-02-02T10:00:00.000Z',
      atualizado_em: '2026-02-02T10:00:00.000Z',
      como_nos_conheceu: '',
    })
  })

  it('criação que viola o banco devolve null sem lançar', async () => {
    banco.estado.reiniciar([linha('cli-abc123', 'Ana')])
    await expect(criarCliente(cliente('cli-abc123', 'Outra'))).resolves.toBeNull()
    expect(banco.estado.linhas).toHaveLength(1)
    expect(banco.estado.linhas[0].nome).toBe('Ana')
  })

  it('atualiza somente o cliente alvo', async () => {
    banco.estado.reiniciar([linha('c1', 'Ana'), linha('c2', 'Bruno')])

    const atualizado = await atualizarCliente(
      'c1',
      cliente('c1', 'Ana Dias Editada', { telefone: '(11) 91111-2222' }),
    )

    expect(atualizado?.nome).toBe('Ana Dias Editada')
    expect(banco.estado.linhas.find((l) => l.id === 'c2')?.nome).toBe('Bruno')
    expect(banco.estado.linhas.find((l) => l.id === 'c1')?.telefone).toBe(
      '(11) 91111-2222',
    )
  })

  it('atualização sem correspondência devolve null', async () => {
    await expect(
      atualizarCliente('inexistente', cliente('inexistente', 'Ana')),
    ).resolves.toBeNull()
  })

  it('alterna o status sem apagar o registro', async () => {
    banco.estado.reiniciar([linha('c1', 'Ana')])

    const inativado = await alternarAtivoCliente('c1', false)

    expect(inativado?.ativo).toBe(false)
    expect(banco.estado.linhas).toHaveLength(1)
    expect(banco.estado.linhas[0].nome).toBe('Ana')
  })

  it('remove apenas o id pedido e devolve false na falha', async () => {
    banco.estado.reiniciar([linha('c1', 'Ana'), linha('c2', 'Bruno')])
    await expect(removerCliente('c1')).resolves.toBe(true)
    expect(banco.estado.linhas.map((l) => l.id)).toEqual(['c2'])

    banco.estado.falha = 'rede indisponível'
    await expect(removerCliente('c2')).resolves.toBe(false)
  })

  it('importa por upsert preservando ids e atualizando o que mudou', async () => {
    banco.estado.reiniciar([linha('c1', 'Ana')])

    const enviados = await importarClientes([
      cliente('c1', 'Ana Mudou'),
      cliente('c2', 'Novo Cliente'),
      cliente('c3', 'Outro Novo'),
    ])

    expect(enviados).toBe(3)
    expect(banco.estado.linhas.map((l) => [l.id, l.nome])).toEqual([
      ['c1', 'Ana Mudou'],
      ['c2', 'Novo Cliente'],
      ['c3', 'Outro Novo'],
    ])
    const chamada = banco.estado.chamadas.find((c) => c.op === 'upsert')
    expect(chamada?.tabela).toBe('clientes')
  })

  it('importação que falha devolve 0 (nada é confirmado)', async () => {
    banco.estado.falha = 'timeout'
    await expect(importarClientes([cliente('c1', 'Ana')])).resolves.toBe(0)
    expect(banco.estado.linhas).toHaveLength(0)
  })
})
