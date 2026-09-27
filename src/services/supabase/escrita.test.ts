// Contrato de escrita dos repositórios de Profissionais/Serviços (C4).
// A falha do Supabase precisa chegar até a tela: devolve `null`/`false` em
// erro fazia a UI tratar a operação como concluída. Aqui `falha` simula a
// recusa do Supabase (rede, RLS, constraint...).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alternarAtivoProfissional,
  atualizarProfissional,
  criarProfissional,
  removerProfissional,
} from './profissionais'
import {
  alternarAtivoServico,
  atualizarServico,
  criarServico,
  removerServico,
} from './servicos'

// Banco em memória com a mesma forma de consulta usada pelos repositórios.
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Linha[],
    falha: null as string | null,
    semSupabase: false,
    chamadas: [] as { op: string; tabela: string }[],
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((linha) => ({ ...linha }))
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
    const filtrar = (): Linha[] =>
      estado.linhas.filter((linha) =>
        local.condicoes.every(([coluna, valor]) => linha[coluna] === valor),
      )
    const executar = (): Resposta => {
      estado.chamadas.push({ op: local.op, tabela })
      if (estado.falha) return { data: null, error: { message: estado.falha } }

      if (local.op === 'insert') {
        const linha = { ...(local.payload as Linha) }
        if (estado.linhas.some((existente) => existente.id === linha.id)) {
          return { data: null, error: { message: 'chave duplicada' } }
        }
        estado.linhas.push(linha)
        return { data: [{ ...linha }], error: null }
      }
      if (local.op === 'update') {
        const alvos = filtrar()
        alvos.forEach((linha) => Object.assign(linha, local.payload))
        return { data: alvos.map((linha) => ({ ...linha })), error: null }
      }
      if (local.op === 'delete') {
        const alvos = new Set(filtrar())
        estado.linhas = estado.linhas.filter((linha) => !alvos.has(linha))
        return { data: null, error: null }
      }
      if (local.op === 'select') {
        return { data: estado.linhas.map((linha) => ({ ...linha })), error: null }
      }
      return { data: null, error: null }
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

const entradaProfissional = {
  nome: 'Luan Silva',
  telefone: '(11) 91234-5678',
  email: 'luan@email.com',
  foto: '',
}
const entradaServico = {
  nome: 'Escova',
  preco: 70,
  duracaoMin: 45,
  categoria: 'Cabelo',
}

function linhaProfissional(id: string) {
  return {
    id,
    nome: 'Ana Local',
    telefone: '(11) 90000-0000',
    email: 'ana@email.com',
    foto: '',
    ativo: true,
    criado_em: '2026-01-01T00:00:00.000Z',
  }
}

function linhaServico(id: string) {
  return {
    id,
    nome: 'Corte',
    preco: 50,
    duracao_min: 30,
    categoria: '',
    ativo: true,
    criado_em: '2026-01-01T00:00:00.000Z',
    atualizado_em: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  banco.estado.reiniciar([linhaProfissional('p-1'), linhaServico('s-1')])
})

describe('Profissionais — escrita confirmada', () => {
  it('cria e devolve a linha gravada no banco', async () => {
    const criado = await criarProfissional({
      ...entradaProfissional,
      id: 'p-2',
      criadoEm: '2026-02-02T00:00:00.000Z',
    })

    expect(criado).toMatchObject({ id: 'p-2', nome: 'Luan Silva' })
    expect(
      banco.estado.linhas.find((linha) => linha.id === 'p-2')?.nome,
    ).toBe('Luan Silva')
  })

  it('edita e devolve a linha atualizada', async () => {
    const atualizado = await atualizarProfissional('p-1', {
      ...entradaProfissional,
      nome: 'Ana Editada',
    })

    expect(atualizado).toMatchObject({ id: 'p-1', nome: 'Ana Editada' })
    expect(banco.estado.linhas.find((l) => l.id === 'p-1')?.nome).toBe(
      'Ana Editada',
    )
  })

  it('recusa do Supabase vira erro em vez de null silencioso', async () => {
    banco.estado.falha = 'violates row-level security policy'

    await expect(
      criarProfissional({
        ...entradaProfissional,
        id: 'p-2',
        criadoEm: '2026-02-02T00:00:00.000Z',
      }),
    ).rejects.toThrow(/row-level security/)
    await expect(
      atualizarProfissional('p-1', entradaProfissional),
    ).rejects.toThrow(/row-level security/)
    await expect(alternarAtivoProfissional('p-1', false)).rejects.toThrow(
      /row-level security/,
    )
    await expect(removerProfissional('p-1')).rejects.toThrow(
      /row-level security/,
    )
    // nada foi gravado
    expect(banco.estado.linhas).toHaveLength(2)
  })

  it('registro inexistente no banco também é falha (não sucesso silencioso)', async () => {
    await expect(
      atualizarProfissional('p-9', entradaProfissional),
    ).rejects.toThrow(/não existe mais no Supabase/)
    await expect(alternarAtivoProfissional('p-9', false)).rejects.toThrow(
      /não existe mais no Supabase/,
    )
  })

  it('sem Supabase configurado nada lança (app 100% local)', async () => {
    banco.estado.semSupabase = true

    await expect(
      criarProfissional({
        ...entradaProfissional,
        id: 'p-2',
        criadoEm: '2026-02-02T00:00:00.000Z',
      }),
    ).resolves.toBeNull()
    await expect(
      atualizarProfissional('p-1', entradaProfissional),
    ).resolves.toBeNull()
    await expect(alternarAtivoProfissional('p-1', false)).resolves.toBeNull()
    await expect(removerProfissional('p-1')).resolves.toBe(false)
    expect(banco.estado.linhas).toHaveLength(2)
  })
})

describe('Serviços — escrita confirmada', () => {
  it('cria e devolve a linha gravada no banco', async () => {
    const criado = await criarServico({
      ...entradaServico,
      id: 's-2',
      criadoEm: '2026-02-02T00:00:00.000Z',
      atualizadoEm: '2026-02-02T00:00:00.000Z',
    })

    expect(criado).toMatchObject({ id: 's-2', nome: 'Escova', preco: 70 })
    expect(banco.estado.linhas.find((linha) => linha.id === 's-2')?.nome).toBe(
      'Escova',
    )
  })

  it('edita e devolve a linha atualizada com o novo carimbo de tempo', async () => {
    const atualizado = await atualizarServico('s-1', {
      ...entradaServico,
      nome: 'Corte Premium',
    })

    expect(atualizado).toMatchObject({ id: 's-1', nome: 'Corte Premium' })
    expect(banco.estado.linhas.find((l) => l.id === 's-1')?.nome).toBe(
      'Corte Premium',
    )
  })

  it('recusa do Supabase vira erro em vez de null/false silencioso', async () => {
    banco.estado.falha = 'falha de conexão'

    await expect(
      criarServico({
        ...entradaServico,
        id: 's-2',
        criadoEm: '2026-02-02T00:00:00.000Z',
        atualizadoEm: '2026-02-02T00:00:00.000Z',
      }),
    ).rejects.toThrow(/falha de conexão/)
    await expect(atualizarServico('s-1', entradaServico)).rejects.toThrow(
      /falha de conexão/,
    )
    await expect(alternarAtivoServico('s-1', false)).rejects.toThrow(
      /falha de conexão/,
    )
    await expect(removerServico('s-1')).rejects.toThrow(/falha de conexão/)
    expect(banco.estado.linhas).toHaveLength(2)
  })

  it('registro inexistente no banco também é falha (não sucesso silencioso)', async () => {
    await expect(atualizarServico('s-9', entradaServico)).rejects.toThrow(
      /não existe mais no Supabase/,
    )
    await expect(alternarAtivoServico('s-9', false)).rejects.toThrow(
      /não existe mais no Supabase/,
    )
  })

  it('sem Supabase configurado nada lança (app 100% local)', async () => {
    banco.estado.semSupabase = true

    await expect(
      criarServico({
        ...entradaServico,
        id: 's-2',
        criadoEm: '2026-02-02T00:00:00.000Z',
        atualizadoEm: '2026-02-02T00:00:00.000Z',
      }),
    ).resolves.toBeNull()
    await expect(atualizarServico('s-1', entradaServico)).resolves.toBeNull()
    await expect(alternarAtivoServico('s-1', false)).resolves.toBeNull()
    await expect(removerServico('s-1')).resolves.toBe(false)
    expect(banco.estado.linhas).toHaveLength(2)
  })
})
