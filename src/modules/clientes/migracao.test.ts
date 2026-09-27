import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cliente } from './types'
import * as repositorio from '@/services/supabase/clientes'
import {
  CHAVE_STORAGE_CLIENTES,
  migrarClientes,
  ultimoRelatorioMigracao,
} from './migracao'

// Remoto em memória: simula a tabela `clientes` (leitura/escrita) e as duas
// falhas possíveis — leitura (rede/RLS) e escrita (parcial ou total).
const remoto = vi.hoisted(() => ({
  linhas: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  /** ids que a escrita "aceita" mas não confirma na leitura */
  esquece: [] as string[],
  reiniciar() {
    remoto.linhas = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
    remoto.esquece = []
  },
}))

vi.mock('@/services/supabase/clientes', () => ({
  listarClientes: async () => {
    if (remoto.falhaLeitura) throw new Error('rede indisponível')
    return remoto.linhas
      .filter((linha) => {
        const id = (linha as { id: string }).id
        return !remoto.esquece.includes(id)
      })
      .map((linha) => ({ ...(linha as object) })) as never
  },
  importarClientes: vi.fn(async (lista: Cliente[]) => {
    if (remoto.falhaEscrita) return 0
    for (const cliente of lista) {
      if (remoto.esquece.includes(cliente.id)) continue
      const indice = remoto.linhas.findIndex(
        (linha) => (linha as Cliente).id === cliente.id,
      )
      if (indice >= 0) remoto.linhas[indice] = cliente
      else remoto.linhas.push(cliente)
    }
    return lista.length
  }),
  buscarClientes: async () => [],
  criarCliente: async () => null,
  atualizarCliente: async () => null,
  alternarAtivoCliente: async () => null,
  removerCliente: async () => false,
}))

function cliente(
  id: string,
  nome: string,
  extra: Partial<Cliente> = {},
): Cliente {
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
  }
}

function chavesBackup(): string[] {
  return Object.keys(localStorage).filter((chave) =>
    chave.startsWith(`${CHAVE_STORAGE_CLIENTES}:backup:`),
  )
}

beforeEach(() => {
  localStorage.clear()
  remoto.reiniciar()
  vi.clearAllMocks()
})

describe('Clientes — migração localStorage → Supabase', () => {
  it('envia os dados locais preservando ids, cria snapshot e mantém a chave original', async () => {
    const locais = [
      cliente('cli-001', 'Ana Dias', { atualizadoEm: '2026-01-01T00:00:00.000Z' }),
      cliente('cli-002', 'Bruno Canto', {
        criadoEm: '2025-05-05T00:00:00.000Z',
        atualizadoEm: '2025-05-05T00:00:00.000Z',
      }),
    ]
    localStorage.setItem(CHAVE_STORAGE_CLIENTES, JSON.stringify(locais))

    const relatorio = await migrarClientes(locais)

    expect(relatorio.ok).toBe(true)
    expect(relatorio.encontrados).toBe(2)
    expect(relatorio.inseridos).toBe(2)
    expect(relatorio.atualizados).toBe(0)
    expect(relatorio.ignorados).toBe(0)
    expect(relatorio.erros).toEqual([])
    expect(remoto.linhas.map((l) => (l as Cliente).id)).toEqual([
      'cli-001',
      'cli-002',
    ])
    expect(chavesBackup()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(CHAVE_STORAGE_CLIENTES) ?? '[]')).toHaveLength(2)
    expect(relatorio.clientes.map((c) => c.nome)).toEqual([
      'Ana Dias',
      'Bruno Canto',
    ])
  })

  it('banco já idêntico: tudo ignorado, sem escrita e sem novo snapshot', async () => {
    const locais = [cliente('cli-001', 'Ana Dias')]
    remoto.linhas = [cliente('cli-001', 'Ana Dias')]

    const relatorio = await migrarClientes(locais)

    expect(relatorio.ok).toBe(true)
    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.atualizados).toBe(0)
    expect(relatorio.ignorados).toBe(1)
    expect(chavesBackup()).toHaveLength(0)
    expect(remoto.linhas).toHaveLength(1)
  })

  it('em conflito vence o registro mais recente; o outro fica no backup', async () => {
    const localVelho = cliente('cli-a', 'Ana Versão Local', {
      atualizadoEm: '2026-01-01T00:00:00.000Z',
    })
    const localNovo = cliente('cli-b', 'Bruno Versão Local', {
      atualizadoEm: '2026-03-03T00:00:00.000Z',
    })
    remoto.linhas = [
      cliente('cli-a', 'Ana Versão Remota', {
        atualizadoEm: '2026-02-02T00:00:00.000Z',
      }),
      cliente('cli-b', 'Bruno Versão Remota', {
        atualizadoEm: '2026-01-15T00:00:00.000Z',
      }),
    ]

    const relatorio = await migrarClientes([localVelho, localNovo])

    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.atualizados).toBe(1)
    expect(relatorio.ignorados).toBe(1)
    const porId = new Map(
      remoto.linhas.map((l) => [(l as Cliente).id, l as Cliente]),
    )
    expect(porId.get('cli-a')?.nome).toBe('Ana Versão Remota')
    expect(porId.get('cli-b')?.nome).toBe('Bruno Versão Local')
    expect(chavesBackup()).toHaveLength(1)
    const backup = JSON.parse(
      localStorage.getItem(chavesBackup()[0]) ?? '[]',
    ) as Cliente[]
    expect(backup.map((c) => c.nome)).toContain('Ana Versão Local')
  })

  it('registros inválidos e duplicados são ignorados e reportados', async () => {
    const locais = [
      cliente('cli-1', 'Ana Dias'),
      cliente('cli-1', 'Ana Dias Repetida'),
      cliente('cli-2', 'ANA DIAS'),
      cliente('cli-3', 'Bruno', { telefone: '(11) 90000-0000' }),
      cliente('', 'Sem Id'),
      { ...cliente('cli-4', ''), id: 'cli-4' } as Cliente,
    ]

    const relatorio = await migrarClientes(locais)

    expect(relatorio.encontrados).toBe(6)
    expect(relatorio.inseridos).toBe(3)
    expect(relatorio.ignorados).toBe(3)
    expect(relatorio.ok).toBe(false)
    expect(relatorio.duplicidades).toHaveLength(4)
    expect(
      relatorio.duplicidades.filter((d) => d.startsWith('id repetido')),
    ).toHaveLength(1)
    expect(
      relatorio.duplicidades.filter((d) => d.startsWith('nome repetido')),
    ).toHaveLength(1)
    expect(
      relatorio.duplicidades.filter((d) => d.startsWith('telefone repetido')),
    ).toHaveLength(2)
    expect(relatorio.erros.join(' ')).toMatch(/inválido/)
    // nome/telefone repetidos continuam visíveis; só o id repetido é recusado
    expect(remoto.linhas.map((l) => (l as Cliente).id)).toEqual([
      'cli-1',
      'cli-2',
      'cli-3',
    ])
  })

  it('falha na leitura remota interrompe tudo sem escrever nem apagar', async () => {
    const locais = [cliente('cli-1', 'Ana Dias')]
    localStorage.setItem(CHAVE_STORAGE_CLIENTES, JSON.stringify(locais))
    remoto.falhaLeitura = true

    const relatorio = await migrarClientes(locais)

    expect(relatorio.ok).toBe(false)
    expect(relatorio.erros.join(' ')).toMatch(/Falha ao ler/)
    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.ignorados).toBe(1)
    expect(remoto.linhas).toHaveLength(0)
    expect(chavesBackup()).toHaveLength(0)
    expect(relatorio.clientes.map((c) => c.id)).toEqual(['cli-1'])
    expect(JSON.parse(localStorage.getItem(CHAVE_STORAGE_CLIENTES) ?? '[]')).toHaveLength(1)
  })

  it('falha na escrita mantém a lista local íntegra e sinaliza o erro', async () => {
    const locais = [cliente('cli-1', 'Ana Dias'), cliente('cli-2', 'Bruno')]
    remoto.falhaEscrita = true

    const relatorio = await migrarClientes(locais)

    expect(relatorio.ok).toBe(false)
    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.atualizados).toBe(0)
    expect(relatorio.ignorados).toBe(2)
    expect(relatorio.erros.join(' ')).toMatch(/Envio incompleto/)
    expect(relatorio.clientes.map((c) => c.id)).toEqual(['cli-1', 'cli-2'])
    expect(chavesBackup()).toHaveLength(1)
  })

  it('comparação final detecta o que não foi confirmado no remoto', async () => {
    const locais = [cliente('cli-1', 'Ana Dias'), cliente('cli-2', 'Bruno')]
    remoto.esquece = ['cli-2']

    const relatorio = await migrarClientes(locais)

    expect(relatorio.ok).toBe(false)
    expect(relatorio.erros.join(' ')).toMatch(/Não confirmado/)
    expect(relatorio.erros.join(' ')).toMatch(/cli-2/)
    // o registro não confirmado continua visível para o usuário
    expect(relatorio.clientes.map((c) => c.id)).toEqual(['cli-1', 'cli-2'])
  })

  it('aponta clienteId de outros módulos sem correspondência no cadastro', async () => {
    localStorage.setItem(
      'studio-audax:crm:v1',
      JSON.stringify([{ id: 'i1', clienteId: 'sem-cadastro' }]),
    )
    localStorage.setItem(
      'studio-audax:whatsapp:v1',
      JSON.stringify([{ id: 'm1', clienteId: 'cli-1' }]),
    )
    localStorage.setItem(
      'studio-audax:clube:v1',
      JSON.stringify([{ id: 'a1', clienteId: 'sumiu' }]),
    )

    const relatorio = await migrarClientes([cliente('cli-1', 'Ana Dias')])

    expect(relatorio.referenciasProblematicas).toEqual([
      'CRM: clienteId "sem-cadastro" sem cadastro',
      'Clube: clienteId "sumiu" sem cadastro',
    ])
    expect(relatorio.ok).toBe(true)
  })

  it('expõe o relatório da última migração', async () => {
    await migrarClientes([cliente('cli-99', 'Zilda Ramos')])
    expect(ultimoRelatorioMigracao()?.encontrados).toBe(1)

    await migrarClientes([
      cliente('cli-98', 'Ana'),
      cliente('cli-97', 'Bruno'),
    ])
    const ultimo = ultimoRelatorioMigracao()
    expect(ultimo?.encontrados).toBe(2)
    expect(ultimo?.inicio).not.toBe('')
    expect(ultimo?.fim).not.toBe('')
  })

  it('substituição por versão remota mais nova não reenvia e preserva o local', async () => {
    remoto.linhas = [cliente('cli-a', 'Ana Versão Remota')]
    const localAntigo = cliente('cli-a', 'Ana Versão Local', {
      atualizadoEm: '2024-01-01T00:00:00.000Z',
    })

    const relatorio = await migrarClientes([localAntigo])

    expect(relatorio.ok).toBe(true)
    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.atualizados).toBe(0)
    expect(relatorio.ignorados).toBe(1)
    expect(repositorio.importarClientes).not.toHaveBeenCalled()
    // o que foi substituído fica guardado no snapshot
    expect(chavesBackup()).toHaveLength(1)
    expect(
      JSON.parse(
        localStorage.getItem(chavesBackup()[0]) ?? '[]',
      ) as Cliente[],
    ).toEqual([localAntigo])
    expect(relatorio.clientes.map((c) => c.nome)).toEqual([
      'Ana Versão Remota',
    ])
  })

  it('sem snapshot possível não altera nada e não envia', async () => {
    remoto.linhas = [cliente('cli-a', 'Ana Versão Remota')]
    const localAntigo = cliente('cli-a', 'Ana Versão Local', {
      atualizadoEm: '2024-01-01T00:00:00.000Z',
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota cheia')
    })

    const relatorio = await migrarClientes([localAntigo])

    expect(relatorio.ok).toBe(false)
    expect(relatorio.erros.join(' ')).toMatch(/snapshot/)
    expect(relatorio.ignorados).toBe(1)
    expect(repositorio.importarClientes).not.toHaveBeenCalled()
    // devolve a lista local intacta — o remoto não foi aplicado
    expect(relatorio.clientes).toEqual([localAntigo])
    expect(remoto.linhas[0]).toMatchObject({ nome: 'Ana Versão Remota' })
    vi.restoreAllMocks()
  })
})
