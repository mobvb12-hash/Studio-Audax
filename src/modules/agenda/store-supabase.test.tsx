// Integração da Agenda com o Supabase (I6).
// Foco: regras intactas (conflito, bloqueio, remarcação, jaPago), nada se
// perde, nada duplica e falha de leitura não vira banco vazio.
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import { AgendaProvider, useAgenda } from './store'
import type { Agendamento, Bloqueio, Expediente } from './types'

const CHAVE_AGENDAMENTOS = 'studio-audax:agendamentos:v1'
const CHAVE_BLOQUEIOS = 'studio-audax:bloqueios:v1'
const CHAVE_EXPEDIENTE = 'studio-audax:expediente:v1'
const DIA = '2026-05-04'

const remoto = vi.hoisted(() => ({
  agendamentos: [] as unknown[],
  bloqueios: [] as unknown[],
  expediente: null as unknown,
  falhaLeitura: false,
  falhaEscrita: false,
  gravarEm(caixa: unknown[], linha: Record<string, unknown>) {
    const indice = caixa.findIndex(
      (item) => (item as { id: string }).id === linha.id,
    )
    if (indice >= 0) caixa[indice] = linha
    else caixa.push(linha)
  },
  ids(caixa: unknown[]): string[] {
    return caixa.map((item) => (item as { id: string }).id)
  },
  reiniciar() {
    remoto.agendamentos = []
    remoto.bloqueios = []
    remoto.expediente = null
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/agenda', () => ({
  listarAgendamentos: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.agendamentos] as never
  }),
  listarBloqueios: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.bloqueios] as never
  }),
  lerExpediente: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return remoto.expediente as never
  }),
  gravarAgendamento: vi.fn(async (agendamento: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.agendamentos, agendamento as Record<string, unknown>)
    return agendamento as never
  }),
  gravarBloqueio: vi.fn(async (bloqueio: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.bloqueios, bloqueio as Record<string, unknown>)
    return bloqueio as never
  }),
  gravarExpediente: vi.fn(async (expediente: unknown, carimbo: string) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.expediente = { expediente, atualizadoEm: carimbo }
    return expediente as never
  }),
  removerAgendamento: vi.fn(async (id: string) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.agendamentos = remoto.agendamentos.filter(
      (item) => (item as { id: string }).id !== id,
    )
    return true
  }),
  removerBloqueio: vi.fn(async (id: string) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.bloqueios = remoto.bloqueios.filter(
      (item) => (item as { id: string }).id !== id,
    )
    return true
  }),
  importarAgendamentos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.agendamentos, item as Record<string, unknown>)
    }
    return lista.length
  }),
  importarBloqueios: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.bloqueios, item as Record<string, unknown>)
    }
    return lista.length
  }),
  linhaAgendamento: (ag: Agendamento) => ({ ...ag }),
  paraAgendamento: (row: Agendamento) => ({ ...row }),
}))

let ctx: ReturnType<typeof useAgenda>

function Captura() {
  const valor = useAgenda()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function montar() {
  return render(
    <AgendaProvider>
      <Captura />
    </AgendaProvider>,
  )
}

/** Executa uma ação do store e devolve o valor (o `act` do RTL devolve thenable). */
function executar<T>(acao: () => T): T {
  let resultado!: T
  act(() => {
    resultado = acao()
  })
  return resultado
}

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

const expedientePadrao: Expediente = {
  inicio: '08:00',
  fim: '20:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
}

function novoAgendamento(extra: Record<string, unknown> = {}) {
  return {
    cliente: 'Ana',
    telefone: '(11) 90000-0000',
    servico: 'Corte',
    profissional: 'Cleiton',
    data: DIA,
    horario: '10:00',
    observacao: '',
    duracaoMin: 30,
    ...extra,
  }
}

function salvo(chave: string): unknown[] {
  return JSON.parse(localStorage.getItem(chave) ?? '[]')
}

/** Simula um aparelho que já sincronizou antes (marca presente). */
function marcarComoSincronizado(...chaves: string[]) {
  for (const chave of chaves) {
    localStorage.setItem(`${chave}:sincronizado_em:v1`, '2020-01-01T00:00:00.000Z')
  }
}

/** Marca já concluída agora: carimbo do registro é anterior → resquício. */
function marcarComoSincronizadoAgora(...chaves: string[]) {
  for (const chave of chaves) {
    localStorage.setItem(`${chave}:sincronizado_em:v1`, new Date().toISOString())
  }
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useAgenda>
})

describe('Agenda — agendamentos', () => {
  it('agenda local ausente no remoto é enviada (migração do que já existe)', async () => {
    // pendência legítima: já houve sincronização antes e o registro é
    // posterior à marca
    marcarComoSincronizado(CHAVE_AGENDAMENTOS, CHAVE_BLOQUEIOS)
    localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify([agendamento()]))

    montar()

    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))
    expect(remoto.ids(remoto.agendamentos)).toEqual(['ag-1'])
    expect(ctx.agendamentos).toHaveLength(1)
    expect(avisosPersistencia()).toEqual([])
  })

  it('J — agendamento anterior à última sincronização não volta (resquício fica no snapshot)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { importarAgendamentos } = await import('@/services/supabase/agenda')
    marcarComoSincronizadoAgora(CHAVE_AGENDAMENTOS, CHAVE_BLOQUEIOS)
    localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify([agendamento()]))

    montar()

    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    expect(remoto.agendamentos).toHaveLength(0)
    expect(importarAgendamentos).not.toHaveBeenCalled()
    expect(
      Object.keys(localStorage).filter((c) =>
        c.startsWith(`${CHAVE_AGENDAMENTOS}:backup:`),
      ),
    ).toHaveLength(1)
    aviso.mockRestore()
  })

  it('J — marca inexistente: agendamento local não é enviado', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { importarAgendamentos } = await import('@/services/supabase/agenda')
    localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify([agendamento()]))

    montar()

    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    expect(remoto.agendamentos).toHaveLength(0)
    expect(importarAgendamentos).not.toHaveBeenCalled()
    expect(
      localStorage.getItem(`${CHAVE_AGENDAMENTOS}:sincronizado_em:v1`),
    ).not.toBeNull()
    aviso.mockRestore()
  })

  it('criar agendamento grava local e envia com o mesmo id', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))

    const novo = executar(() => ctx.adicionar(novoAgendamento()))

    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))
    expect(remoto.ids(remoto.agendamentos)).toEqual([novo.id])
    await waitFor(() => expect(salvo(CHAVE_AGENDAMENTOS)).toHaveLength(1))
  })

  it('confirmar, concluir, cancelar e não compareceu vão para o Supabase', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    for (const status of ['confirmado', 'concluido', 'cancelado', 'nao_compareceu'] as const) {
      executar(() => ctx.mudarStatus(novo.id, status))
      await waitFor(() =>
        expect((remoto.agendamentos[0] as { status: string }).status).toBe(status),
      )
      expect(remoto.agendamentos).toHaveLength(1)
    }
  })

  it('editar mantém dado, horário e status e envia pelo mesmo id', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    const editado = executar(() =>
      ctx.editar(novo.id, {
        cliente: 'Ana Editada',
        telefone: '(11) 91111-1111',
        servico: 'Corte',
        observacao: 'sem café',
        duracaoMin: 45,
      }),
    )

    expect(editado.cliente).toBe('Ana Editada')
    expect(editado.horario).toBe('10:00')
    expect(editado.status).toBe('confirmado')
    await waitFor(() =>
      expect((remoto.agendamentos[0] as { cliente: string }).cliente).toBe(
        'Ana Editada',
      ),
    )
    expect(remoto.agendamentos).toHaveLength(1)
  })

  it('remarcar (mover horário/profissional) registra o histórico e envia', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    const remarcado = executar(() =>
      ctx.remarcar(novo.id, {
        data: DIA,
        horario: '16:00',
        profissional: 'Italo',
      }),
    )

    expect(remarcado.horario).toBe('16:00')
    expect(remarcado.remarcacoes).toHaveLength(1)
    expect(remarcado.remarcacoes?.[0].de).toEqual({
      data: DIA,
      horario: '10:00',
      profissional: 'Cleiton',
    })
    await waitFor(() =>
      expect((remoto.agendamentos[0] as { horario: string }).horario).toBe('16:00'),
    )
    expect((remoto.agendamentos[0] as Agendamento).remarcacoes).toHaveLength(1)
    expect(remoto.agendamentos).toHaveLength(1)
  })

  it('cancelamento libera o horário para novo agendamento (regra intacta)', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const primeiro = executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    executar(() => ctx.mudarStatus(primeiro.id, 'cancelado'))
    // o mesmo horário volta a ficar livre
    const segundo = executar(() => ctx.adicionar(novoAgendamento()))
    expect(segundo.horario).toBe('10:00')
    expect(ctx.agendamentos).toHaveLength(2)
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(2))
  })

  it('conflito de horário entre profissionais continua bloqueado', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    expect(() =>
      executar(() => ctx.adicionar(novoAgendamento({ profissional: 'Cleiton' }))),
    ).toThrow(/ocupado|conflito|Horário/i)
    // profissional diferente no mesmo horário continua permitido
    const outro = executar(() => ctx.adicionar(novoAgendamento({ profissional: 'Italo' })))
    expect(outro.profissional).toBe('Italo')
  })

  it('excluir remove dos dois lados', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    executar(() => ctx.remover(novo.id))

    expect(ctx.agendamentos).toHaveLength(0)
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(0))
  })

  it('registro que só existe no servidor entra na união (outro aparelho)', async () => {
    localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify([]))
    remoto.agendamentos = [agendamento({ id: 'ag-9', cliente: 'Beto' })]

    montar()

    await waitFor(() => expect(ctx.agendamentos).toHaveLength(1))
    expect(ctx.agendamentos[0].id).toBe('ag-9')
    expect(remoto.agendamentos).toHaveLength(1)
  })

  it('divergência: vence o mais recente por atualizadoEm e o perdedor fica no snapshot', async () => {
    localStorage.setItem(
      CHAVE_AGENDAMENTOS,
      JSON.stringify([
        agendamento({
          status: 'concluido',
          atualizadoEm: '2026-05-06T00:00:00.000Z',
        }),
      ]),
    )
    remoto.agendamentos = [
      agendamento({ status: 'pendente', atualizadoEm: '2026-05-01T00:00:00.000Z' }),
    ]

    montar()

    await waitFor(() => expect(ctx.agendamentos).toHaveLength(1))
    expect(ctx.agendamentos[0].status).toBe('concluido')
    await waitFor(() =>
      expect((remoto.agendamentos[0] as { status: string }).status).toBe('concluido'),
    )
    const chaves = Object.keys(localStorage).filter((chave) =>
      chave.startsWith(`${CHAVE_AGENDAMENTOS}:backup:`),
    )
    expect(chaves).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(chaves[0]) ?? '[]')[0].status).toBe('pendente')
  })

  it('divergência: agendamento remoto mais recente não é rebaixado', async () => {
    localStorage.setItem(
      CHAVE_AGENDAMENTOS,
      JSON.stringify([
        agendamento({ status: 'pendente', atualizadoEm: '2026-05-01T00:00:00.000Z' }),
      ]),
    )
    remoto.agendamentos = [
      agendamento({ status: 'concluido', atualizadoEm: '2026-05-06T00:00:00.000Z' }),
    ]

    montar()

    await waitFor(() => expect(ctx.agendamentos[0]?.status).toBe('concluido'))
    expect(remoto.agendamentos).toHaveLength(1)
    expect((remoto.agendamentos[0] as { status: string }).status).toBe('concluido')
  })

  it('falha de escrita mantém o agendamento local e avisa', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    remoto.falhaEscrita = true

    const novo = executar(() => ctx.adicionar(novoAgendamento()))

    expect(ctx.agendamentos).toHaveLength(1)
    await waitFor(() => expect(salvo(CHAVE_AGENDAMENTOS)).toHaveLength(1))
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
    expect(remoto.agendamentos).toHaveLength(0)
    expect(novo.id).toBeTruthy()
  })

  it('falha de leitura não vira banco vazio: não reenvia nem sobrescreve', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify([agendamento()]))
    remoto.agendamentos = [agendamento({ id: 'ag-9', cliente: 'Beto' })]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('Supabase indisponível'),
      expect.any(Error),
    )
    expect(remoto.ids(remoto.agendamentos)).toEqual(['ag-9'])
    await waitFor(() => expect(ctx.agendamentos).toHaveLength(1))
    expect(ctx.agendamentos[0].id).toBe('ag-1')
    aviso.mockRestore()
  })

  it('instalação nova adota a agenda remota', async () => {
    remoto.agendamentos = [agendamento({ id: 'ag-7', cliente: 'Carla' })]
    // storage vazio = instalação nova

    montar()

    await waitFor(() => expect(ctx.agendamentos).toHaveLength(1))
    expect(ctx.agendamentos[0].id).toBe('ag-7')
    expect(remoto.agendamentos).toHaveLength(1)
  })

  it('reenviar a mesma agenda não duplica agendamento nem altera a agenda', async () => {
    marcarComoSincronizado(CHAVE_AGENDAMENTOS, CHAVE_BLOQUEIOS)
    localStorage.setItem(CHAVE_AGENDAMENTOS, JSON.stringify([agendamento()]))
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    remoto.falhaEscrita = true

    const primeira = montar()
    await waitFor(() => expect(ctx.agendamentos).toHaveLength(1))
    expect(remoto.agendamentos).toHaveLength(0)

    // três cargas: a pendência é reenviada e continua sendo a mesma agenda
    primeira.unmount()
    remoto.falhaEscrita = false
    montar()
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))
    expect(remoto.agendamentos).toHaveLength(1)
    montar()
    await waitFor(() => expect(ctx.agendamentos).toHaveLength(1))
    expect(remoto.agendamentos).toHaveLength(1)
    aviso.mockRestore()
  })
})

describe('Agenda — bloqueios', () => {
  it('criar bloqueio vai para o Supabase e bloqueia o horário', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() =>
      ctx.criarBloqueio({
        profissional: 'Cleiton',
        data: DIA,
        inicio: '10:00',
        fim: '11:00',
        tipo: 'ferias',
        motivo: 'Férias',
      }),
    )

    expect(novo.tipo).toBe('ferias')
    await waitFor(() => expect(remoto.bloqueios).toHaveLength(1))
    expect((remoto.bloqueios[0] as { tipo: string }).tipo).toBe('ferias')
    // regra intacta: agendamento no período bloqueado é recusado
    expect(() => executar(() => ctx.adicionar(novoAgendamento()))).toThrow()
    expect(ctx.agendamentos).toHaveLength(0)
  })

  it('almoço, folga, férias, ausência e outro mantêm o tipo', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const tipos = ['almoco', 'folga', 'ferias', 'ausencia', 'outro'] as const
    for (const [indice, tipo] of tipos.entries()) {
      executar(() =>
        ctx.criarBloqueio({
          profissional: 'Cleiton',
          data: DIA,
          inicio: `${8 + indice}:00`,
          fim: `${8 + indice}:30`,
          tipo,
          motivo: `Motivo ${tipo}`,
        }),
      )
    }
    await waitFor(() => expect(remoto.bloqueios).toHaveLength(5))
    expect(
      (remoto.bloqueios as { tipo: string }[]).map((b) => b.tipo),
    ).toEqual([...tipos])
  })

  it('remover bloqueio remove dos dois lados', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() =>
      ctx.criarBloqueio({
        profissional: 'Cleiton',
        data: DIA,
        inicio: '12:00',
        fim: '13:00',
        tipo: 'almoco',
        motivo: 'Almoço',
      }),
    )
    await waitFor(() => expect(remoto.bloqueios).toHaveLength(1))

    executar(() => ctx.removerBloqueio(novo.id))

    expect(ctx.bloqueios).toHaveLength(0)
    await waitFor(() => expect(remoto.bloqueios).toHaveLength(0))
  })

  it('bloqueio que só existe no servidor entra na união', async () => {
    localStorage.setItem(CHAVE_BLOQUEIOS, JSON.stringify([]))
    remoto.bloqueios = [bloqueio({ id: 'bl-9', tipo: 'ausencia' })]

    montar()

    await waitFor(() => expect(ctx.bloqueios).toHaveLength(1))
    expect(ctx.bloqueios[0].id).toBe('bl-9')
  })

  it('falha ao criar bloqueio mantém o local e avisa', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    remoto.falhaEscrita = true

    executar(() =>
      ctx.criarBloqueio({
        profissional: 'Cleiton',
        data: DIA,
        inicio: '12:00',
        fim: '13:00',
        tipo: 'almoco',
        motivo: 'Almoço',
      }),
    )

    expect(ctx.bloqueios).toHaveLength(1)
    await waitFor(() => expect(salvo(CHAVE_BLOQUEIOS)).toHaveLength(1))
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
    expect(remoto.bloqueios).toHaveLength(0)
  })
})

describe('Agenda — expediente', () => {
  it('grava o expediente no Supabase e mantém o local', async () => {
    montar()
    await waitFor(() => expect(ctx.expediente).toEqual(expedientePadrao))

    const novo: Expediente = {
      inicio: '08:00',
      fim: '20:00',
      almocoInicio: '12:00',
      almocoFim: '13:00',
    }
    executar(() => ctx.salvarExpediente(novo))

    expect(ctx.expediente).toEqual(novo)
    await waitFor(() => expect(remoto.expediente).not.toBeNull())
    expect(JSON.parse(localStorage.getItem(CHAVE_EXPEDIENTE) ?? '{}')).toEqual(novo)
  })

  it('instalação nova adota o expediente remoto', async () => {
    const remotoExpediente: Expediente = {
      inicio: '10:00',
      fim: '22:00',
      almocoInicio: '13:00',
      almocoFim: '14:00',
    }
    remoto.expediente = {
      expediente: remotoExpediente,
      atualizadoEm: '2026-05-02T00:00:00.000Z',
    }
    // storage vazio = instalação nova

    montar()

    await waitFor(() => expect(ctx.expediente).toEqual(remotoExpediente))
  })

  it('expediente remoto mais recente não é rebaixado pelo local', async () => {
    remoto.expediente = {
      expediente: {
        inicio: '10:00',
        fim: '22:00',
        almocoInicio: '13:00',
        almocoFim: '14:00',
      },
      atualizadoEm: '2026-05-09T00:00:00.000Z',
    }

    montar()

    await waitFor(() =>
      expect(ctx.expediente.inicio).toBe('10:00'),
    )
    expect(ctx.expediente.fim).toBe('22:00')
  })

  it('falha ao gravar o expediente mantém o local e avisa', async () => {
    montar()
    await waitFor(() => expect(ctx.expediente).toEqual(expedientePadrao))
    remoto.falhaEscrita = true

    executar(() =>
      ctx.salvarExpediente({
        inicio: '07:00',
        fim: '21:00',
        almocoInicio: '12:00',
        almocoFim: '13:00',
      }),
    )

    expect(ctx.expediente.inicio).toBe('07:00')
    expect(JSON.parse(localStorage.getItem(CHAVE_EXPEDIENTE) ?? '{}').inicio).toBe('07:00')
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
  })

  it('expediente inválido continua sendo recusado antes de qualquer escrita', async () => {
    montar()
    await waitFor(() => expect(ctx.expediente).toEqual(expedientePadrao))

    expect(() =>
      executar(() =>
        ctx.salvarExpediente({
          inicio: '19:00',
          fim: '09:00',
          almocoInicio: '12:00',
          almocoFim: '13:00',
        }),
      ),
    ).toThrow()
    expect(remoto.expediente).toBeNull()
  })
})

describe('Agenda — renomeação de cadastro', () => {
  it('renomear profissional propaga na agenda e nos bloqueios sem duplicar', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    const novo = executar(() => ctx.adicionar(novoAgendamento()))
    executar(() =>
      ctx.criarBloqueio({
        profissional: 'Cleiton',
        data: DIA,
        inicio: '12:00',
        fim: '13:00',
        tipo: 'almoco',
        motivo: 'Almoço',
      }),
    )
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))
    await waitFor(() => expect(remoto.bloqueios).toHaveLength(1))

    executar(() => ctx.renomearProfissional('Cleiton', 'Cleiton Silva'))

    expect(ctx.agendamentos.find((a) => a.id === novo.id)?.profissional).toBe(
      'Cleiton Silva',
    )
    expect(ctx.bloqueios[0].profissional).toBe('Cleiton Silva')
    await waitFor(() =>
      expect(
        (remoto.agendamentos[0] as { profissional: string }).profissional,
      ).toBe('Cleiton Silva'),
    )
    expect(remoto.agendamentos).toHaveLength(1)
    expect(remoto.bloqueios).toHaveLength(1)
  })

  it('renomear cliente e serviço propaga sem criar agendamento', async () => {
    montar()
    await waitFor(() => expect(ctx.agendamentos).toEqual([]))
    executar(() => ctx.adicionar(novoAgendamento()))
    await waitFor(() => expect(remoto.agendamentos).toHaveLength(1))

    executar(() => ctx.renomearCliente('Ana', 'Ana Souza'))
    executar(() => ctx.renomearServico('Corte', 'Corte premium'))

    expect(ctx.agendamentos[0].cliente).toBe('Ana Souza')
    expect(ctx.agendamentos[0].servico).toBe('Corte premium')
    await waitFor(() =>
      expect((remoto.agendamentos[0] as { cliente: string }).cliente).toBe(
        'Ana Souza',
      ),
    )
    expect(remoto.agendamentos).toHaveLength(1)
  })
})
