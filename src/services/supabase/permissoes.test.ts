import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEM_SUPABASE_PERMISSOES,
  atualizarPerfilDoUsuario,
  carregarPermissoesDaEquipe,
  carregarPermissoesDoPerfil,
  criarUsuarioEquipe,
  definirPermissaoDoPerfil,
  listarPerfisEquipe,
} from './permissoes'

// Banco em memória com a mesma forma de consulta usada pelo repositório.
// `falha` simula a recusa (rede, RLS, constraint...).
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    semSupabase: false,
    falha: null as string | null,
    linhas: [] as Linha[],
    chamadas: [] as {
      op: string
      tabela: string
      payload?: unknown
      condicoes?: [string, unknown][]
    }[],
    auth: {
      sessaoAntes: null as null | { access_token: string; refresh_token: string },
      sessaoNova: null as null | { access_token: string; refresh_token: string },
      chamadas: [] as string[],
      errosSessao: null as string | null,
    },
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((linha) => ({ ...linha }))
      estado.falha = null
      estado.semSupabase = false
      estado.chamadas = []
      estado.auth = {
        sessaoAntes: null,
        sessaoNova: null,
        chamadas: [],
        errosSessao: null,
      }
    },
  }

  function criarBuilder(tabela: string) {
    const local = {
      op: '',
      payload: undefined as unknown,
      condicoes: [] as [string, unknown][],
    }

    const filtrar = () =>
      estado.linhas.filter((linha) =>
        local.condicoes.every(([coluna, valor]) => {
          if (typeof valor === 'string' && valor.startsWith('is:')) {
            const esperado = valor.slice(3)
            return linha[coluna] === (esperado === 'null' ? null : esperado)
          }
          return linha[coluna] === valor
        }),
      )

    const executar = (): Resposta => {
      estado.chamadas.push({
        op: local.op,
        tabela,
        payload: local.payload,
        condicoes: local.condicoes,
      })
      if (estado.falha) return { data: null, error: { message: estado.falha } }
      switch (local.op) {
        case 'insert': {
          const linha = { ...(local.payload as Linha) }
          estado.linhas.push(linha)
          return { data: [linha], error: null }
        }
        case 'upsert': {
          const linha = { ...(local.payload as Linha) }
          const indice = estado.linhas.findIndex(
            (existente) =>
              existente.perfil_id === linha.perfil_id && existente.acao === linha.acao,
          )
          if (indice >= 0) estado.linhas[indice] = { ...estado.linhas[indice], ...linha }
          else estado.linhas.push(linha)
          return { data: [linha], error: null }
        }
        case 'delete': {
          const alvos = filtrar()
          estado.linhas = estado.linhas.filter((linha) => !alvos.includes(linha))
          return { data: alvos, error: null }
        }
        case 'update': {
          const alvos = filtrar()
          for (const linha of alvos) Object.assign(linha, local.payload)
          return { data: alvos, error: null }
        }
        default:
          return { data: filtrar(), error: null }
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
      is: (coluna: string, valor: unknown) => {
        local.condicoes.push([coluna, `is:${String(valor)}`])
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

  const auth = {
    getSession: async () => ({
      data: { session: estado.auth.sessaoAntes },
      error: null,
    }),
    signUp: async () => ({
      data: { user: { id: 'user-novo' }, session: estado.auth.sessaoNova },
      error: null,
    }),
    setSession: async () => {
      estado.auth.chamadas.push('setSession')
      return { data: { session: null }, error: estado.auth.errosSessao ? { message: estado.auth.errosSessao } : null }
    },
  }

  return {
    estado,
    cliente: { from: (tabela: string) => criarBuilder(tabela), auth },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente),
}))

beforeEach(() => {
  banco.estado.reiniciar()
})

const PERM1 = { perfil_id: 'perf-1', acao: 'caixa:fechar', permitido: false }
const PERM2 = { perfil_id: 'perf-1', acao: 'clientes:criar', permitido: true }
const PERM3 = { perfil_id: 'perf-2', acao: 'caixa:ver', permitido: false }

describe('leitura das exceções', () => {
  it('monta o mapa de UM perfil', async () => {
    banco.estado.reiniciar([PERM1, PERM2, PERM3])

    await expect(carregarPermissoesDoPerfil('perf-1')).resolves.toEqual({
      'caixa:fechar': false,
      'clientes:criar': true,
    })
    expect(banco.estado.chamadas[0]).toMatchObject({
      op: 'select',
      tabela: 'perfis_permissoes',
      condicoes: [['perfil_id', 'perf-1']],
    })
  })

  it('sem Supabase devolve mapa vazio (manda o papel) e não consulta', async () => {
    banco.estado.semSupabase = true

    await expect(carregarPermissoesDoPerfil('perf-1')).resolves.toEqual({})
    await expect(carregarPermissoesDaEquipe()).resolves.toEqual({})
    expect(await listarPerfisEquipe()).toEqual([])
    expect(banco.estado.chamadas).toHaveLength(0)
  })

  it('falha de leitura lança — não vira "sem exceção" silencioso', async () => {
    banco.estado.falha = 'permission denied for table perfis_permissoes'

    await expect(carregarPermissoesDoPerfil('perf-1')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('agrupa as exceções por perfil para a tela de gestão', async () => {
    banco.estado.reiniciar([PERM1, PERM2, PERM3])

    await expect(carregarPermissoesDaEquipe()).resolves.toEqual({
      'perf-1': { 'caixa:fechar': false, 'clientes:criar': true },
      'perf-2': { 'caixa:ver': false },
    })
  })
})

describe('escrita de UMA exceção', () => {
  it('gravar false vira upsert da linha com o valor', async () => {
    await definirPermissaoDoPerfil('perf-1', 'caixa:fechar', false)

    expect(banco.estado.chamadas[0]).toMatchObject({
      op: 'upsert',
      tabela: 'perfis_permissoes',
      payload: { perfil_id: 'perf-1', acao: 'caixa:fechar', permitido: false },
    })
    // o "quem alterou" e o "valor anterior" são do BANCO (trigger da 042)
    expect(banco.estado.chamadas[0].payload).not.toHaveProperty('alterado_por')
    expect(banco.estado.chamadas[0].payload).not.toHaveProperty('anterior')
  })

  it('voltar ao padrão APAGA a linha em vez de gravar o mesmo valor', async () => {
    banco.estado.reiniciar([{ ...PERM1 }])

    await definirPermissaoDoPerfil('perf-1', 'caixa:fechar', null)

    expect(banco.estado.chamadas[0]).toMatchObject({ op: 'delete' })
    expect(banco.estado.chamadas[0].condicoes).toEqual([
      ['perfil_id', 'perf-1'],
      ['acao', 'caixa:fechar'],
    ])
    expect(banco.estado.linhas).toHaveLength(0)
  })

  it('sem Supabase a escrita lança — a tela nunca finge que gravou', async () => {
    banco.estado.semSupabase = true

    await expect(
      definirPermissaoDoPerfil('perf-1', 'caixa:fechar', true),
    ).rejects.toThrow(SEM_SUPABASE_PERMISSOES)
  })

  it('recusa do Supabase propaga a mensagem original (RLS inclusive)', async () => {
    banco.estado.falha = 'new row violates row-level security policy'

    await expect(
      definirPermissaoDoPerfil('perf-1', 'caixa:fechar', false),
    ).rejects.toThrow(/row-level security/)
  })
})

describe('equipe', () => {
  it('lista os perfis convertidos para o formato do app', async () => {
    banco.estado.reiniciar([
      {
        id: 'perf-1',
        user_id: 'user-1',
        nome: 'Cleiton',
        email: 'cleiton@studio.com',
        papel: 'dono',
        ativo: true,
        criado_em: '2026-01-01T00:00:00.000Z',
      },
    ])

    await expect(listarPerfisEquipe()).resolves.toEqual([
      {
        id: 'perf-1',
        userId: 'user-1',
        nome: 'Cleiton',
        email: 'cleiton@studio.com',
        papel: 'dono',
        ativo: true,
        criadoEm: '2026-01-01T00:00:00.000Z',
      },
    ])
  })

  it('trocar papel vai para perfis e recusa erro do servidor', async () => {
    banco.estado.reiniciar([
      {
        id: 'perf-1',
        user_id: 'user-1',
        nome: 'Ana',
        email: 'ana@studio.com',
        papel: 'recepcao',
        ativo: true,
        criado_em: '2026-01-01T00:00:00.000Z',
      },
    ])

    const atualizado = await atualizarPerfilDoUsuario('perf-1', { papel: 'gerente' })
    expect(atualizado.papel).toBe('gerente')
    expect(banco.estado.chamadas[0]).toMatchObject({ op: 'update', tabela: 'perfis' })

    banco.estado.falha = 'perfil: user_id, papel e ativo so mudam com admin'
    await expect(atualizarPerfilDoUsuario('perf-1', { papel: 'dono' })).rejects.toThrow(
      /so mudam com admin/,
    )
  })
})

describe('criação de usuário não desloga quem está criando', () => {
  it('sem sessão devolvida pelo signUp (autoconfirmação desligada) nem tenta restaurar', async () => {
    banco.estado.auth.sessaoAntes = {
      access_token: 'admin-a',
      refresh_token: 'admin-r',
    }
    banco.estado.auth.sessaoNova = null

    const { aviso } = await criarUsuarioEquipe({
      nome: 'Ana',
      email: 'ana@studio.com',
      senha: 'senha-longa-123',
      papel: 'recepcao',
    })

    expect(banco.estado.auth.chamadas).toEqual([])
    expect(aviso).toMatch(/confirmar o e-mail/)
    expect(banco.estado.chamadas.map((c) => c.tabela)).toContain('perfis')
  })

  it('com sessão devolvida restaura a do administrador com os tokens salvos', async () => {
    banco.estado.auth.sessaoAntes = {
      access_token: 'admin-a',
      refresh_token: 'admin-r',
    }
    banco.estado.auth.sessaoNova = { access_token: 'novo-a', refresh_token: 'novo-r' }

    const { aviso } = await criarUsuarioEquipe({
      nome: 'Ana',
      email: 'ana@studio.com',
      senha: 'senha-longa-123',
      papel: 'profissional',
    })

    expect(banco.estado.auth.chamadas).toEqual(['setSession'])
    expect(aviso).toBeNull()
  })

  it('se a restauração falhar o erro é claro (quem criou precisa voltar a entrar)', async () => {
    banco.estado.auth.sessaoAntes = {
      access_token: 'admin-a',
      refresh_token: 'admin-r',
    }
    banco.estado.auth.sessaoNova = { access_token: 'novo-a', refresh_token: 'novo-r' }
    banco.estado.auth.errosSessao = 'refresh_token not found'

    await expect(
      criarUsuarioEquipe({
        nome: 'Ana',
        email: 'ana@studio.com',
        senha: 'senha-longa-123',
        papel: 'recepcao',
      }),
    ).rejects.toThrow(/sessão do administrador não pôde ser restaurada/)
  })

  it('erro do signUp (e-mail já usado) é repassado', async () => {
    const clienteOriginal = banco.cliente
    vi.spyOn(clienteOriginal.auth, 'signUp').mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'user already registered' },
    } as never)

    await expect(
      criarUsuarioEquipe({
        nome: 'Ana',
        email: 'ana@studio.com',
        senha: 'senha-longa-123',
        papel: 'recepcao',
      }),
    ).rejects.toThrow(/user already registered/)
  })
})
