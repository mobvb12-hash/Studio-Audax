import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ultimaSincronizacao } from '@/lib/persistencia'
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
  // aparelho que já sincronizou antes: fixtures (2025/2026) são posteriores
  // à marca e, portanto, pendências legítimas de reenvio
  localStorage.setItem(
    `${CHAVE_STORAGE_CLIENTES}:sincronizado_em:v1`,
    '2020-01-01T00:00:00.000Z',
  )
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
      // O Clube grava um ESTADO, não uma lista solta: a assinatura é que cita
      // `clienteId`. A forma antiga (array na raiz) nunca foi gravada pelo
      // módulo e fazia a varredura aceitar dado que o Clube não produz.
      JSON.stringify({
        assinaturas: [{ id: 'a1', clienteId: 'sumiu' }],
        pagamentos: [],
      }),
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

/**
 * Local-only e a marca de sincronização: a régua que separa pendência legítima
 * (carimbo posterior à última integração concluída) de resquício (carimbo
 * anterior ou igual — registro apagado no servidor).
 */
describe('Clientes — marca de sincronização e resquícios', () => {
  const MARCA = '2026-06-01T00:00:00.000Z'
  const CHAVE_MARCA = `${CHAVE_STORAGE_CLIENTES}:sincronizado_em:v1`

  /** Snapshot mais recente gravado pela migração. */
  function ultimoSnapshot(): Cliente[] {
    return JSON.parse(localStorage.getItem(chavesBackup().at(-1)!) ?? '[]')
  }

  it('A — local-only anterior à marca não volta: é descartado e fica no snapshot', async () => {
    localStorage.setItem(CHAVE_MARCA, MARCA)

    const relatorio = await migrarClientes([
      cliente('cli-1', 'Ana Dias', { atualizadoEm: '2026-01-01T00:00:00.000Z' }),
    ])

    expect(repositorio.importarClientes).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(0)
    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.atualizados).toBe(0)
    expect(relatorio.descartados).toEqual(['cli-1'])
    expect(relatorio.ignorados).toBe(1)
    expect(relatorio.ok).toBe(true)
    // sai da lista oficial…
    expect(relatorio.clientes).toEqual([])
    // …mas está preservado no snapshot
    expect(chavesBackup()).toHaveLength(1)
    expect(ultimoSnapshot().map((c) => c.id)).toEqual(['cli-1'])
  })

  it('B — pendência posterior à marca é enviada e a marca avança', async () => {
    localStorage.setItem(CHAVE_MARCA, MARCA)
    const posterior = cliente('cli-1', 'Ana Dias', {
      atualizadoEm: '2026-07-01T00:00:00.000Z',
    })

    const relatorio = await migrarClientes([posterior])

    expect(relatorio.inseridos).toBe(1)
    expect(relatorio.descartados).toEqual([])
    expect(remoto.linhas.map((l) => (l as Cliente).id)).toEqual(['cli-1'])
    expect(ultimaSincronizacao(CHAVE_STORAGE_CLIENTES)).not.toBe(MARCA)
  })

  it('C — marca inexistente é conservadora: nada local-only é enviado', async () => {
    localStorage.removeItem(CHAVE_MARCA)

    const relatorio = await migrarClientes([
      cliente('cli-1', 'Ana Dias'),
      cliente('cli-2', 'Bruno'),
    ])

    expect(repositorio.importarClientes).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(0)
    expect(relatorio.descartados).toEqual(['cli-1', 'cli-2'])
    expect(relatorio.ignorados).toBe(2)
    // preservados no snapshot
    expect(ultimoSnapshot().map((c) => c.id)).toEqual(['cli-1', 'cli-2'])
    // a marca só existe depois da sincronização concluída
    expect(ultimaSincronizacao(CHAVE_STORAGE_CLIENTES)).not.toBeNull()
  })

  it('D — envio parcial não avança a marca: a pendência segue para a próxima carga', async () => {
    localStorage.setItem(CHAVE_MARCA, MARCA)
    const pendente = cliente('cli-1', 'Ana Dias', {
      atualizadoEm: '2026-07-01T00:00:00.000Z',
    })
    remoto.falhaEscrita = true

    const primeira = await migrarClientes([pendente])

    expect(primeira.ok).toBe(false)
    expect(ultimaSincronizacao(CHAVE_STORAGE_CLIENTES)).toBe(MARCA)

    remoto.falhaEscrita = false
    const segunda = await migrarClientes([pendente])

    expect(segunda.inseridos).toBe(1)
    expect(ultimaSincronizacao(CHAVE_STORAGE_CLIENTES)).not.toBe(MARCA)
  })

  it('E — falha de snapshot não envia, não descarta e não avança a marca', async () => {
    localStorage.setItem(CHAVE_MARCA, MARCA)
    const resquicio = cliente('cli-1', 'Ana Dias', {
      atualizadoEm: '2026-01-01T00:00:00.000Z',
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota cheia')
    })

    const relatorio = await migrarClientes([resquicio])

    expect(relatorio.ok).toBe(false)
    expect(repositorio.importarClientes).not.toHaveBeenCalled()
    // não descartou nada: o resquício continua visível
    expect(relatorio.descartados).toEqual([])
    expect(relatorio.clientes.map((c) => c.id)).toEqual(['cli-1'])
    expect(ultimaSincronizacao(CHAVE_STORAGE_CLIENTES)).toBe(MARCA)
    vi.restoreAllMocks()
  })

  it('F — mesmo id local e remoto não duplica nem reenvia', async () => {
    localStorage.setItem(CHAVE_MARCA, MARCA)
    remoto.linhas = [cliente('cli-1', 'Ana Dias')]

    const relatorio = await migrarClientes([cliente('cli-1', 'Ana Dias')])

    expect(repositorio.importarClientes).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(1)
    expect(relatorio.inseridos).toBe(0)
    expect(relatorio.atualizados).toBe(0)
    expect(relatorio.descartados).toEqual([])
  })

  it('G — alteração local legítima (divergência) continua sincronizando', async () => {
    localStorage.setItem(CHAVE_MARCA, MARCA)
    remoto.linhas = [
      cliente('cli-1', 'Nome Antigo', {
        atualizadoEm: '2026-01-01T00:00:00.000Z',
      }),
    ]

    const relatorio = await migrarClientes([
      cliente('cli-1', 'Nome Novo', { atualizadoEm: '2026-07-01T00:00:00.000Z' }),
    ])

    expect(relatorio.atualizados).toBe(1)
    expect(remoto.linhas).toHaveLength(1)
    expect((remoto.linhas[0] as Cliente).nome).toBe('Nome Novo')
  })

  it('I — dado orgânico recente (carimbo de agora) continua sincronizando', async () => {
    const agora = new Date().toISOString()
    localStorage.setItem(CHAVE_MARCA, new Date(Date.now() - 60_000).toISOString())

    const relatorio = await migrarClientes([
      cliente('cli-1', 'Atendimento de hoje', {
        criadoEm: agora,
        atualizadoEm: agora,
      }),
    ])

    expect(relatorio.inseridos).toBe(1)
    expect(relatorio.descartados).toEqual([])
  })

  it('H — apagado no servidor não volta pela cópia antiga, e alteração posterior continua indo', async () => {
    // 1) registro existe no localStorage e é sincronizado (pendência legítima:
    //    já havia marca anterior e o carimbo é posterior a ela)
    localStorage.setItem(CHAVE_MARCA, '2020-01-01T00:00:00.000Z')
    const original = cliente('cli-7', 'Cliente Apagado No Servidor', {
      atualizadoEm: '2026-02-01T00:00:00.000Z',
    })
    const primeira = await migrarClientes([original])

    expect(primeira.inseridos).toBe(1)
    expect(remoto.linhas).toHaveLength(1)
    const marcaConcluida = ultimaSincronizacao(CHAVE_STORAGE_CLIENTES)
    expect(marcaConcluida).not.toBeNull()

    // 2) registro apagado remotamente; a cópia antiga continua no localStorage
    remoto.linhas = []

    // 3) painel abre de novo e a sincronização roda
    const segunda = await migrarClientes([original])

    // 4) o registro NÃO pode voltar
    expect(repositorio.importarClientes).toHaveBeenCalledTimes(1)
    expect(remoto.linhas).toHaveLength(0)
    expect(segunda.inseridos).toBe(0)
    expect(segunda.descartados).toEqual(['cli-7'])
    expect(segunda.clientes).toEqual([])
    // preservado no snapshot, para conferência
    expect(ultimoSnapshot().map((c) => c.id)).toEqual(['cli-7'])
    // a marca segue gravada (leitura ok, nada pendente a reenviar)
    expect(
      (ultimaSincronizacao(CHAVE_STORAGE_CLIENTES) ?? '') >= (marcaConcluida ?? ''),
    ).toBe(true)

    // 5) alteração local posterior à marca continua indo para o servidor.
    //    O carimbo é derivado da própria marca (não do relógio do sistema):
    //    a carga anterior acabou de gravar a marca, então `new Date()` cairia
    //    no mesmo milissegundo e a comparação `carimbo > marca` — correta e
    //    conservadora na produção — diria que a alteração não é elegível.
    const marcaAtual = ultimaSincronizacao(CHAVE_STORAGE_CLIENTES) ?? ''
    const alterado = cliente('cli-7', 'Cliente Apagado No Servidor', {
      atualizadoEm: new Date(Date.parse(marcaAtual) + 5000).toISOString(),
    })
    const terceira = await migrarClientes([alterado])

    expect(terceira.inseridos).toBe(1)
    expect(remoto.linhas).toHaveLength(1)
    expect((remoto.linhas[0] as Cliente).id).toBe('cli-7')
  })
})
