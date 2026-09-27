// Contrato do repositório da Agenda (I6).
// Leitura honesta (erro ≠ banco vazio), escrita confirmada e idempotência por
// `id`: reenviar a agenda nunca cria um segundo agendamento.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  gravarAgendamento,
  gravarBloqueio,
  gravarExpediente,
  importarAgendamentos,
  importarBloqueios,
  lerExpediente,
  listarAgendamentos,
  listarBloqueios,
  removerAgendamento,
  removerBloqueio,
} from './agenda'
import type { Agendamento, Bloqueio, Expediente } from '@/modules/agenda/types'

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
    const corresponde = (linha: Linha) =>
      linha.__chave === undefined ||
      local.condicoes.every(([coluna, valor]) => linha[coluna] === valor)
    const indice = (linha: Linha) =>
      estado.linhas.findIndex(
        (item) => item.tabela === tabela && item.linha.id === linha.id,
      )
    const executar = (): Resposta => {
      estado.chamadas.push({ op: local.op, tabela })
      if (estado.falha) return { data: null, error: { message: estado.falha } }

      if (local.op === 'insert' || local.op === 'upsert') {
        const lote = (Array.isArray(local.payload)
          ? local.payload
          : [local.payload]) as Linha[]
        for (const nova of lote) {
          const posicao = indice(nova)
          if (posicao >= 0) estado.linhas[posicao].linha = { ...nova }
          else estado.linhas.push({ tabela, linha: { ...nova } })
        }
        return { data: lote.map((linha) => ({ ...linha })), error: null }
      }
      if (local.op === 'update') {
        const alvos = estado.linhas.filter(
          (item) => item.tabela === tabela && corresponde(item.linha),
        )
        alvos.forEach((item) => Object.assign(item.linha, local.payload))
        return { data: alvos.map((item) => ({ ...item.linha })), error: null }
      }
      if (local.op === 'delete') {
        const alvos = new Set(
          estado.linhas.filter(
            (item) => item.tabela === tabela && corresponde(item.linha),
          ),
        )
        estado.linhas = estado.linhas.filter((item) => !alvos.has(item))
        return { data: null, error: null }
      }
      return {
        data: estado.linhas
          .filter((item) => item.tabela === tabela && corresponde(item.linha))
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

const DIA = '2026-05-04'

function agendamento(extra: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'ag-1',
    cliente: 'Ana',
    telefone: '(11) 90000-0000',
    servico: 'Corte',
    profissional: 'Cleiton',
    data: DIA,
    horario: '10:00',
    status: 'pendente',
    observacao: '',
    criadoEm: '2026-05-01T12:00:00.000Z',
    atualizadoEm: '2026-05-01T12:00:00.000Z',
    duracaoMin: 30,
    ...extra,
  }
}

function bloqueio(extra: Partial<Bloqueio> = {}): Bloqueio {
  return {
    id: 'bl-1',
    profissional: 'Cleiton',
    data: DIA,
    inicio: '12:00',
    fim: '13:00',
    tipo: 'almoco',
    motivo: 'Almoço',
    criadoEm: '2026-05-01T12:00:00.000Z',
    atualizadoEm: '2026-05-01T12:00:00.000Z',
    ...extra,
  }
}

const expediente: Expediente = {
  inicio: '09:00',
  fim: '19:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
}

beforeEach(() => {
  banco.estado.reiniciar()
})

describe('Agenda — leituras', () => {
  it('lê agendamentos preservando status, remarcações e duração', async () => {
    banco.estado.reiniciar([
      [
        'agendamentos',
        {
          id: 'ag-1',
          cliente: 'Ana',
          telefone: '(11) 90000-0000',
          servico: 'Corte',
          profissional: 'Cleiton',
          data: DIA,
          horario: '10:00',
          status: 'concluido',
          duracao_min: 30,
          observacao: 'sem cafe',
          remarcacoes: [
            { de: { data: DIA, horario: '09:00', profissional: 'Cleiton' }, em: '2026-05-02T10:00:00.000Z' },
          ],
          criado_em: '2026-05-01T12:00:00.000Z',
          atualizado_em: '2026-05-03T12:00:00.000Z',
        },
      ],
    ])

    const [lido] = await listarAgendamentos()

    expect(lido).toMatchObject({
      id: 'ag-1',
      status: 'concluido',
      duracaoMin: 30,
      observacao: 'sem cafe',
      criadoEm: '2026-05-01T12:00:00.000Z',
      atualizadoEm: '2026-05-03T12:00:00.000Z',
    })
    expect(lido.remarcacoes).toHaveLength(1)
  })

  it('lê bloqueios e expediente', async () => {
    banco.estado.reiniciar([
      [
        'bloqueios',
        {
          id: 'bl-1',
          profissional: 'Cleiton',
          data: DIA,
          data_fim: DIA,
          inicio: '12:00',
          fim: '13:00',
          tipo: 'almoco',
          motivo: 'Almoço',
          criado_em: '2026-05-01T12:00:00.000Z',
          atualizado_em: '2026-05-01T12:00:00.000Z',
        },
      ],
      [
        'agenda_expediente',
        {
          chave: 'padrao',
          inicio: '09:00',
          fim: '19:00',
          almoco_inicio: '12:00',
          almoco_fim: '13:00',
          atualizado_em: '2026-05-01T12:00:00.000Z',
        },
      ],
    ])

    const bloqueios = await listarBloqueios()
    const lido = await lerExpediente()

    expect(bloqueios[0]).toMatchObject({ tipo: 'almoco', dataFim: DIA })
    expect(lido?.expediente).toEqual(expediente)
  })

  it('consulta válida sem registros devolve vazio', async () => {
    await expect(listarAgendamentos()).resolves.toEqual([])
    await expect(listarBloqueios()).resolves.toEqual([])
    await expect(lerExpediente()).resolves.toBeNull()
  })

  it('erro do banco lança com a mensagem original (não vira vazio)', async () => {
    banco.estado.falha = 'permission denied for table agendamentos'

    await expect(listarAgendamentos()).rejects.toThrow(/permission denied/)
    await expect(listarBloqueios()).rejects.toThrow(/permission denied/)
    await expect(lerExpediente()).rejects.toThrow(/permission denied/)
  })

  it('sem Supabase mantém o modo local e não consulta', async () => {
    banco.estado.semSupabase = true

    await expect(listarAgendamentos()).resolves.toEqual([])
    await expect(listarBloqueios()).resolves.toEqual([])
    await expect(lerExpediente()).resolves.toBeNull()
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Agenda — escritas confirmadas e idempotentes', () => {
  it('grava agendamento e devolve a linha confirmada', async () => {
    const gravado = await gravarAgendamento(agendamento())

    expect(gravado).toMatchObject({ id: 'ag-1', status: 'pendente' })
    expect(banco.estado.gravadas('agendamentos')).toHaveLength(1)
  })

  it('o MESMO agendamento gravado três vezes continua sendo um', async () => {
    await gravarAgendamento(agendamento())
    await gravarAgendamento(agendamento({ status: 'confirmado' }))
    await gravarAgendamento(agendamento({ status: 'concluido' }))

    const gravados = banco.estado.gravadas('agendamentos')
    expect(gravados).toHaveLength(1)
    expect(gravados[0].status).toBe('concluido')
  })

  it('importar a agenda repetida não duplica agendamento', async () => {
    const agenda = [agendamento(), agendamento({ id: 'ag-2', horario: '11:00' })]

    await expect(importarAgendamentos(agenda)).resolves.toBe(2)
    await expect(importarAgendamentos(agenda)).resolves.toBe(2)
    await expect(importarAgendamentos(agenda)).resolves.toBe(2)

    expect(banco.estado.gravadas('agendamentos')).toHaveLength(2)
  })

  it('mover horário/profissional e concluir continuam sendo o mesmo registro', async () => {
    banco.estado.reiniciar([['agendamentos', { id: 'ag-1', status: 'pendente' }]])

    await gravarAgendamento(agendamento({ horario: '15:00' }))
    await gravarAgendamento(agendamento({ horario: '15:00', status: 'concluido' }))

    const gravados = banco.estado.gravadas('agendamentos')
    expect(gravados).toHaveLength(1)
    expect(gravados[0]).toMatchObject({ horario: '15:00', status: 'concluido' })
  })

  it('grava e remove bloqueios e agendamentos', async () => {
    await gravarBloqueio(bloqueio())
    await gravarExpediente(expediente, '2026-05-01T12:00:00.000Z')
    await gravarAgendamento(agendamento())

    await expect(removerBloqueio('bl-1')).resolves.toBe(true)
    await expect(removerAgendamento('ag-1')).resolves.toBe(true)

    expect(banco.estado.gravadas('bloqueios')).toHaveLength(0)
    expect(banco.estado.gravadas('agendamentos')).toHaveLength(0)
    expect(banco.estado.gravadas('agenda_expediente')).toHaveLength(1)
  })

  it('gravar o mesmo bloqueio e o mesmo expediente não duplica', async () => {
    await gravarBloqueio(bloqueio())
    await gravarBloqueio(bloqueio())
    await gravarExpediente(expediente, '2026-05-01T12:00:00.000Z')
    await gravarExpediente(expediente, '2026-05-02T12:00:00.000Z')

    expect(banco.estado.gravadas('bloqueios')).toHaveLength(1)
    expect(banco.estado.gravadas('agenda_expediente')).toHaveLength(1)
  })

  it('importar bloqueios reenvia sem duplicar e devolve a contagem', async () => {
    await expect(importarBloqueios([bloqueio()])).resolves.toBe(1)
    await expect(importarBloqueios([bloqueio()])).resolves.toBe(1)
    expect(banco.estado.gravadas('bloqueios')).toHaveLength(1)

    banco.estado.falha = 'timeout'
    await expect(importarBloqueios([bloqueio()])).resolves.toBe(0)
  })

  it('recusa do Supabase propaga a mensagem em toda escrita', async () => {
    banco.estado.falha = 'violates row-level security policy'

    await expect(gravarAgendamento(agendamento())).rejects.toThrow(
      /row-level security/,
    )
    await expect(gravarBloqueio(bloqueio())).rejects.toThrow(/row-level security/)
    await expect(
      gravarExpediente(expediente, '2026-05-01T12:00:00.000Z'),
    ).rejects.toThrow(/row-level security/)
    await expect(removerAgendamento('ag-1')).rejects.toThrow(/row-level security/)
    await expect(removerBloqueio('bl-1')).rejects.toThrow(/row-level security/)
  })

  it('sem Supabase nada lança (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(gravarAgendamento(agendamento())).resolves.toBeNull()
    await expect(gravarBloqueio(bloqueio())).resolves.toBeNull()
    await expect(
      gravarExpediente(expediente, '2026-05-01T12:00:00.000Z'),
    ).resolves.toBeNull()
    await expect(removerAgendamento('ag-1')).resolves.toBe(false)
    await expect(removerBloqueio('bl-1')).resolves.toBe(false)
    await expect(importarAgendamentos([agendamento()])).resolves.toBe(0)
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})
