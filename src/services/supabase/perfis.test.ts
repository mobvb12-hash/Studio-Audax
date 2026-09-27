import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  criarPerfil,
  obterPerfil,
  perfilAtivo,
  verificarPapel,
} from './perfis'
import type { Perfil } from './perfis'

// Banco em memória com a mesma forma de consulta usada pelo repositório.
// `falha` simula a recusa do Supabase (rede, RLS, constraint...).
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Linha[],
    falha: null as string | null,
    /** resposta sem linha (insert que não devolve dado) */
    semLinha: false,
    semSupabase: false,
    chamadas: [] as { op: string; tabela: string }[],
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((linha) => ({ ...linha }))
      estado.falha = null
      estado.semLinha = false
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
    const executar = (): Resposta => {
      estado.chamadas.push({ op: local.op, tabela })
      if (estado.falha) return { data: null, error: { message: estado.falha } }
      if (local.op === 'insert') {
        const linha = { ...(local.payload as Linha) }
        if (estado.semLinha) return { data: null, error: null }
        estado.linhas.push(linha)
        return { data: [{ ...linha }], error: null }
      }
      const filtradas = estado.linhas.filter((linha) =>
        local.condicoes.every(([coluna, valor]) => linha[coluna] === valor),
      )
      return { data: filtradas.map((linha) => ({ ...linha })), error: null }
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
      eq: (coluna: string, valor: unknown) => {
        local.condicoes.push([coluna, valor])
        return builder
      },
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

const perfilAdmin: Perfil = {
  id: 'p1',
  userId: 'u1',
  nome: 'Admin',
  email: 'admin@studio.com',
  papel: 'admin',
  ativo: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
}

const perfilInativo: Perfil = { ...perfilAdmin, ativo: false }

describe('perfilAtivo', () => {
  it('retorna true para perfil ativo', async () => {
    await expect(perfilAtivo(perfilAdmin)).resolves.toBe(true)
  })

  it('retorna false para perfil inativo', async () => {
    await expect(perfilAtivo(perfilInativo)).resolves.toBe(false)
  })

  it('retorna false para null', async () => {
    await expect(perfilAtivo(null)).resolves.toBe(false)
  })
})

describe('verificarPapel', () => {
  it('permite admin acessar admin', async () => {
    await expect(verificarPapel(perfilAdmin, ['admin'])).resolves.toBe(true)
  })

  it('permite recepcao acessar recepcao', async () => {
    const recepcao = { ...perfilAdmin, papel: 'recepcao' as const }
    await expect(verificarPapel(recepcao, ['recepcao'])).resolves.toBe(true)
  })

  it('bloqueia profissional acessar admin', async () => {
    const profissional = { ...perfilAdmin, papel: 'profissional' as const }
    await expect(verificarPapel(profissional, ['admin'])).resolves.toBe(false)
  })

  it('bloqueia perfil inativo mesmo com papel correto', async () => {
    await expect(verificarPapel(perfilInativo, ['admin'])).resolves.toBe(false)
  })

  it('bloqueia null', async () => {
    await expect(verificarPapel(null, ['admin'])).resolves.toBe(false)
  })
})

describe('Perfis — escrita confirmada no Supabase', () => {
  it('cria o perfil e devolve a linha gravada', async () => {
    const criado = await criarPerfil(
      'u-1',
      'Cleiton',
      'cleiton@studio.com',
      'admin',
    )

    expect(criado).toMatchObject({ userId: 'u-1', papel: 'admin' })
    expect(banco.estado.linhas[0]).toMatchObject({
      user_id: 'u-1',
      nome: 'Cleiton',
      email: 'cleiton@studio.com',
    })
    expect(banco.estado.chamadas.map((c) => c.op)).toEqual(['insert'])
  })

  it('recusa do Supabase lança com a mensagem original (não vira null silencioso)', async () => {
    banco.estado.falha = 'violates row-level security policy'

    await expect(
      criarPerfil('u-1', 'Cleiton', 'cleiton@studio.com'),
    ).rejects.toThrow(/row-level security/)
    expect(banco.estado.linhas).toHaveLength(0)
  })

  it('inserção que não devolve linha também é falha', async () => {
    banco.estado.semLinha = true

    await expect(
      criarPerfil('u-1', 'Cleiton', 'cleiton@studio.com'),
    ).rejects.toThrow(/Falha ao gravar o perfil/)
  })

  it('sem Supabase configurado nada lança e nada é gravado (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(obterPerfil('u-1')).resolves.toBeNull()
    await expect(
      criarPerfil('u-1', 'Cleiton', 'cleiton@studio.com'),
    ).resolves.toBeNull()
    expect(banco.estado.chamadas).toHaveLength(0)
  })

  it('obtém o perfil do usuário quando existe', async () => {
    banco.estado.reiniciar([linhaPerfil('u-1')])

    const perfil = await obterPerfil('u-1')

    expect(perfil).toMatchObject({ userId: 'u-1', papel: 'admin' })
    expect(await obterPerfil('u-9')).toBeNull()
  })
})
