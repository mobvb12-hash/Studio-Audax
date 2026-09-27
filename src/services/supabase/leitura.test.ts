// Contrato de leitura dos repositórios do Supabase (I2): com o Supabase
// configurado, erro de consulta tem de ser distinguido de resposta vazia —
// senão a integração do C2 trata "não consegui ler" como "banco vazio" e
// reenvia o cadastro local por cima do que já existe no servidor.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarProfissionais } from './profissionais'
import { listarServicos } from './servicos'
import { obterPerfil } from './perfis'

// Banco em memória com a mesma forma de consulta usada pelos repositórios.
// `falha` simula recusa do Supabase; `semDados` simula resposta sem array.
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Linha[],
    falha: null as string | null,
    semDados: false,
    semSupabase: false,
    chamadas: [] as { op: string; tabela: string }[],
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((linha) => ({ ...linha }))
      estado.falha = null
      estado.semDados = false
      estado.semSupabase = false
      estado.chamadas = []
    },
  }

  function criarBuilder(tabela: string) {
    const local = { op: '', condicoes: [] as [string, unknown][] }
    const executar = (): Resposta => {
      estado.chamadas.push({ op: local.op, tabela })
      if (estado.falha) return { data: null, error: { message: estado.falha } }
      const filtradas = estado.linhas.filter((linha) =>
        local.condicoes.every(([coluna, valor]) => linha[coluna] === valor),
      )
      if (estado.semDados) return { data: null, error: null }
      return { data: filtradas, error: null }
    }

    const builder = {
      select: () => {
        if (!local.op) local.op = 'select'
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

function linhaProfissional(id: string, nome: string) {
  return {
    id,
    nome,
    telefone: '(11) 90000-0000',
    email: `${id}@email.com`,
    foto: '',
    ativo: true,
    criado_em: '2026-01-01T00:00:00.000Z',
  }
}

function linhaServico(id: string, nome: string) {
  return {
    id,
    nome,
    preco: 50,
    duracao_min: 30,
    categoria: '',
    ativo: true,
    criado_em: '2026-01-01T00:00:00.000Z',
    atualizado_em: '2026-01-01T00:00:00.000Z',
  }
}

function linhaPerfil(userId: string) {
  return {
    id: 'perfil-1',
    user_id: userId,
    nome: 'Cleiton',
    email: 'cleiton@studio.com',
    papel: 'admin',
    ativo: true,
    criado_em: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  banco.estado.reiniciar()
})

describe('Leitura de profissionais — "não existe" ≠ "não consegui ler"', () => {
  it('lê o que existe no banco', async () => {
    banco.estado.reiniciar([
      linhaProfissional('p-2', 'Bruno'),
      linhaProfissional('p-1', 'Ana'),
    ])

    const lista = await listarProfissionais()

    expect(lista.map((p) => p.id)).toEqual(['p-2', 'p-1'])
    expect(lista[0].telefone).toBe('(11) 90000-0000')
  })

  it('consulta válida sem registros devolve [] (banco realmente vazio)', async () => {
    banco.estado.reiniciar()

    await expect(listarProfissionais()).resolves.toEqual([])
  })

  it('erro do banco lança com a mensagem original (não vira [])', async () => {
    banco.estado.reiniciar([linhaProfissional('p-1', 'Ana')])
    banco.estado.falha = 'JWT expired'

    await expect(listarProfissionais()).rejects.toThrow(/JWT expired/)
  })

  it('resposta sem dados também é falha, não lista vazia', async () => {
    banco.estado.semDados = true

    await expect(listarProfissionais()).rejects.toThrow(
      /Falha ao ler profissionais/,
    )
  })

  it('sem Supabase continua devolvendo [] (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(listarProfissionais()).resolves.toEqual([])
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Leitura de serviços — "não existe" ≠ "não consegui ler"', () => {
  it('lê o que existe no banco', async () => {
    banco.estado.reiniciar([
      linhaServico('s-2', 'Escova'),
      linhaServico('s-1', 'Corte'),
    ])

    const lista = await listarServicos()

    expect(lista.map((s) => s.id)).toEqual(['s-2', 's-1'])
    expect(lista[0].duracaoMin).toBe(30)
  })

  it('consulta válida sem registros devolve [] (banco realmente vazio)', async () => {
    banco.estado.reiniciar()

    await expect(listarServicos()).resolves.toEqual([])
  })

  it('erro do banco lança com a mensagem original (não vira [])', async () => {
    banco.estado.falha = 'connection terminated'

    await expect(listarServicos()).rejects.toThrow(/connection terminated/)
  })

  it('resposta sem dados também é falha, não lista vazia', async () => {
    banco.estado.semDados = true

    await expect(listarServicos()).rejects.toThrow(/Falha ao ler serviços/)
  })

  it('sem Supabase continua devolvendo [] (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(listarServicos()).resolves.toEqual([])
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Leitura de perfil — "sem perfil" ≠ "não consegui ler"', () => {
  it('lê o perfil do usuário', async () => {
    banco.estado.reiniciar([linhaPerfil('u-1')])

    const perfil = await obterPerfil('u-1')

    expect(perfil).toMatchObject({ userId: 'u-1', papel: 'admin' })
  })

  it('consulta válida sem registro devolve null (usuário sem perfil)', async () => {
    banco.estado.reiniciar()

    await expect(obterPerfil('u-1')).resolves.toBeNull()
  })

  it('erro do banco lança com a mensagem original (não vira null)', async () => {
    banco.estado.falha = 'permission denied for table perfis'

    await expect(obterPerfil('u-1')).rejects.toThrow(/permission denied/)
  })

  it('sem Supabase continua devolvendo null (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(obterPerfil('u-1')).resolves.toBeNull()
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})
