// Fix 8 — a remoção de cadastro precisa sobreviver ao F5 em Clientes,
// Serviços e Agenda (mesmo tombstone do Caixa/Profissionais). O tombstone
// mora no localStorage, é reaplicado na fusão com o servidor (a lista
// remota não devolve o registro) e a remoção remota que não chegou a valer
// é reenviada na carga seguinte, sem duplicar nada.
import { act, useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientesProvider, useClientes } from './clientes/store'
import { ServicosProvider, useServicos } from './servicos/store'
import { AgendaProvider, useAgenda } from './agenda/store'
import { normalizarCliente } from './clientes/regras'
import type { Cliente } from './clientes/types'
import type { Servico } from './servicos/types'
import type { Agendamento, Bloqueio } from './agenda/types'

const CHAVE_REMOVIDOS_CLIENTES = 'studio-audax:clientes:removidos:v1'
const CHAVE_REMOVIDOS_SERVICOS = 'studio-audax:servicos:removidos:v1'
const CHAVE_REMOVIDOS_AGENDAMENTOS =
  'studio-audax:agenda:agendamentos:removidos:v1'
const CHAVE_REMOVIDOS_BLOQUEIOS = 'studio-audax:agenda:bloqueios:removidos:v1'

const controle = vi.hoisted(() => ({
  remotoClientes: [] as Cliente[],
  falharClientes: false,
  chamadasRemoverCliente: [] as string[],
  remotoServicos: [] as Servico[],
  falharServicos: false,
  chamadasRemoverServico: [] as string[],
  remotoAgendamentos: [] as Agendamento[],
  remotoBloqueios: [] as Bloqueio[],
  falharAgendamentos: false,
  falharBloqueios: false,
  chamadasRemoverAgendamento: [] as string[],
  chamadasRemoverBloqueio: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/clientes', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/services/supabase/clientes')>()
  return {
    ...real,
    listarClientes: vi.fn(async () => controle.remotoClientes),
    removerCliente: vi.fn(async (id: string) => {
      controle.chamadasRemoverCliente.push(id)
      if (controle.falharClientes) throw new Error('remoção não confirmada')
      controle.remotoClientes = controle.remotoClientes.filter(
        (c) => c.id !== id,
      )
      return true
    }),
    criarCliente: vi.fn(async (c: Cliente) => c),
    atualizarCliente: vi.fn(async (c: Cliente) => c),
    alternarAtivoCliente: vi.fn(async () => true),
    importarClientes: vi.fn(async (lista: Cliente[]) => {
      controle.remotoClientes = [...controle.remotoClientes, ...lista]
      return lista.length
    }),
  }
})

vi.mock('@/services/supabase/servicos', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/services/supabase/servicos')>()
  return {
    ...real,
    listarServicos: vi.fn(async () => controle.remotoServicos),
    removerServico: vi.fn(async (id: string) => {
      controle.chamadasRemoverServico.push(id)
      if (controle.falharServicos) throw new Error('remoção não confirmada')
      controle.remotoServicos = controle.remotoServicos.filter(
        (s) => s.id !== id,
      )
      return true
    }),
    criarServico: vi.fn(async (s: Servico) => s),
    atualizarServico: vi.fn(async (s: Servico) => s),
    alternarAtivoServico: vi.fn(async () => true),
    importarServicos: vi.fn(async (lista: Servico[]) => {
      controle.remotoServicos = [...controle.remotoServicos, ...lista]
      return lista.length
    }),
  }
})

vi.mock('@/services/supabase/agenda', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/services/supabase/agenda')>()
  return {
    ...real,
    listarAgendamentos: vi.fn(async () => controle.remotoAgendamentos),
    listarBloqueios: vi.fn(async () => controle.remotoBloqueios),
    lerExpediente: vi.fn(async () => null),
    removerAgendamento: vi.fn(async (id: string) => {
      controle.chamadasRemoverAgendamento.push(id)
      if (controle.falharAgendamentos)
        throw new Error('remoção não confirmada')
      controle.remotoAgendamentos = controle.remotoAgendamentos.filter(
        (a) => a.id !== id,
      )
      return true
    }),
    removerBloqueio: vi.fn(async (id: string) => {
      controle.chamadasRemoverBloqueio.push(id)
      if (controle.falharBloqueios) throw new Error('remoção não confirmada')
      controle.remotoBloqueios = controle.remotoBloqueios.filter(
        (b) => b.id !== id,
      )
      return true
    }),
    gravarAgendamento: vi.fn(async (a: Agendamento) => a),
    gravarBloqueio: vi.fn(async (b: Bloqueio) => b),
    gravarExpediente: vi.fn(async () => null),
    importarAgendamentos: vi.fn(async (lista: Agendamento[]) => {
      controle.remotoAgendamentos = [...controle.remotoAgendamentos, ...lista]
      return lista.length
    }),
    importarBloqueios: vi.fn(async (lista: Bloqueio[]) => {
      controle.remotoBloqueios = [...controle.remotoBloqueios, ...lista]
      return lista.length
    }),
  }
})

function clienteAna(): Cliente {
  return normalizarCliente({
    id: 'cli-ana',
    nome: 'Ana Duarte',
    telefone: '(11) 98888-0001',
  })
}

function agendamentoExemplo(): Agendamento {
  return {
    id: 'ag-1',
    cliente: 'Ana Duarte',
    telefone: '(11) 98888-0001',
    servico: 'Corte Degradê',
    profissional: 'Cleiton Silva',
    data: '2026-10-05',
    horario: '10:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-10-01T10:00:00.000Z',
  }
}

function bloqueioExemplo(): Bloqueio {
  return {
    id: 'bl-1',
    profissional: 'Cleiton Silva',
    data: '2026-10-06',
    inicio: '08:00',
    fim: '09:00',
    tipo: 'folga',
    motivo: 'Consulta',
    criadoEm: '2026-10-01T10:00:00.000Z',
  }
}

let ctxClientes: ReturnType<typeof useClientes> | undefined
let ctxServicos: ReturnType<typeof useServicos> | undefined
let ctxAgenda: ReturnType<typeof useAgenda> | undefined

function CapturaClientes() {
  const valor = useClientes()
  useEffect(() => {
    ctxClientes = valor
  })
  return <div data-testid="qtd">{valor.clientes.length}</div>
}

function CapturaServicos() {
  const valor = useServicos()
  useEffect(() => {
    ctxServicos = valor
  })
  return <div data-testid="qtd">{valor.servicos.length}</div>
}

function CapturaAgenda() {
  const valor = useAgenda()
  useEffect(() => {
    ctxAgenda = valor
  })
  return (
    <div data-testid="qtd">
      {valor.agendamentos.length}:{valor.bloqueios.length}
    </div>
  )
}

function montarClientes() {
  return render(
    <ClientesProvider>
      <CapturaClientes />
    </ClientesProvider>,
  )
}

function montarServicos() {
  return render(
    <ServicosProvider>
      <CapturaServicos />
    </ServicosProvider>,
  )
}

function montarAgenda() {
  return render(
    <AgendaProvider>
      <CapturaAgenda />
    </AgendaProvider>,
  )
}

/** Deixa a cadeia de promessas da integração terminar antes de seguir. */
async function aguardarCarga() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function lerTombstone(chave: string): string[] {
  return JSON.parse(localStorage.getItem(chave) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  controle.remotoClientes = []
  controle.falharClientes = false
  controle.chamadasRemoverCliente = []
  controle.remotoServicos = []
  controle.falharServicos = false
  controle.chamadasRemoverServico = []
  controle.remotoAgendamentos = []
  controle.remotoBloqueios = []
  controle.falharAgendamentos = false
  controle.falharBloqueios = false
  controle.chamadasRemoverAgendamento = []
  controle.chamadasRemoverBloqueio = []
  ctxClientes = undefined
  ctxServicos = undefined
  ctxAgenda = undefined
})

describe('Clientes — remoção (tombstone persistido)', () => {
  it('remoção não confirmada não volta no F5 e é reenviada', async () => {
    controle.remotoClientes = [clienteAna()]
    const primeira = montarClientes()
    await aguardarCarga()
    expect(ctxClientes?.clientes).toHaveLength(1)
    const id = 'cli-ana'

    // O servidor ainda tem o cadastro: a remoção remota falhou
    controle.falharClientes = true
    act(() => {
      ctxClientes?.remover(id)
    })

    expect(lerTombstone(CHAVE_REMOVIDOS_CLIENTES)).toContain(id)
    expect(ctxClientes?.clientes).toHaveLength(0)

    // F5: a lista remota ainda devolveria o cadastro…
    primeira.unmount()
    controle.falharClientes = false
    const segunda = montarClientes()
    await aguardarCarga()

    // …mas a fusão respeita o tombstone e o cadastro não ressuscita
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(ctxClientes?.clientes).toHaveLength(0)
    // a remoção pendente é reenviada (apagar de novo é idempotente)
    expect(controle.chamadasRemoverCliente).toContain(id)
    expect(controle.remotoClientes).toHaveLength(0)

    // Próximo F5: servidor sem o cadastro → tombstone é descartado
    segunda.unmount()
    montarClientes()
    await aguardarCarga()
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(lerTombstone(CHAVE_REMOVIDOS_CLIENTES)).toEqual([])
  })
})

describe('Serviços — remoção (tombstone persistido)', () => {
  it('remoção não confirmada não volta no F5 e é reenviada', async () => {
    const primeira = montarServicos()
    await aguardarCarga()
    expect(ctxServicos?.servicos.length).toBeGreaterThan(0)
    // o envio do seed colocou o serviço no servidor
    expect(controle.remotoServicos.length).toBeGreaterThan(0)
    const alvo = ctxServicos!.servicos[0]

    controle.falharServicos = true
    await act(async () => {
      await ctxServicos!.remover(alvo.id)
    })

    expect(lerTombstone(CHAVE_REMOVIDOS_SERVICOS)).toContain(alvo.id)
    expect(
      ctxServicos?.servicos.some((s) => s.id === alvo.id),
    ).toBe(false)

    // F5: a lista remota ainda devolveria o serviço…
    primeira.unmount()
    controle.falharServicos = false
    const segunda = montarServicos()
    await aguardarCarga()

    // …mas a fusão respeita o tombstone e o serviço não ressuscita
    expect(
      ctxServicos?.servicos.some((s) => s.id === alvo.id),
    ).toBe(false)
    expect(lerTombstone(CHAVE_REMOVIDOS_SERVICOS)).toContain(alvo.id)
    // a remoção pendente é reenviada (apagar de novo é idempotente)
    expect(controle.chamadasRemoverServico).toContain(alvo.id)
    expect(
      controle.remotoServicos.some((s) => s.id === alvo.id),
    ).toBe(false)

    // Próximo F5: servidor sem o serviço → tombstone é descartado
    segunda.unmount()
    montarServicos()
    await aguardarCarga()
    expect(
      ctxServicos?.servicos.some((s) => s.id === alvo.id),
    ).toBe(false)
    expect(lerTombstone(CHAVE_REMOVIDOS_SERVICOS)).toEqual([])
  })
})

describe('Agenda — remoção de agendamento (tombstone persistido)', () => {
  it('remoção não confirmada não volta no F5 e é reenviada', async () => {
    controle.remotoAgendamentos = [agendamentoExemplo()]
    const primeira = montarAgenda()
    await aguardarCarga()
    expect(ctxAgenda?.agendamentos).toHaveLength(1)

    controle.falharAgendamentos = true
    act(() => {
      ctxAgenda?.remover('ag-1')
    })

    expect(lerTombstone(CHAVE_REMOVIDOS_AGENDAMENTOS)).toContain('ag-1')
    expect(ctxAgenda?.agendamentos).toHaveLength(0)

    // F5: a lista remota ainda devolveria o agendamento…
    primeira.unmount()
    controle.falharAgendamentos = false
    const segunda = montarAgenda()
    await aguardarCarga()

    // …mas a fusão respeita o tombstone e o agendamento não ressuscita
    expect(screen.getByTestId('qtd').textContent).toBe('0:0')
    expect(ctxAgenda?.agendamentos).toHaveLength(0)
    expect(lerTombstone(CHAVE_REMOVIDOS_AGENDAMENTOS)).toContain('ag-1')
    // a remoção pendente é reenviada (apagar de novo é idempotente)
    expect(controle.chamadasRemoverAgendamento).toContain('ag-1')

    // Próximo F5: servidor sem o agendamento → tombstone é descartado
    segunda.unmount()
    montarAgenda()
    await aguardarCarga()
    expect(controle.remotoAgendamentos).toHaveLength(0)
    expect(lerTombstone(CHAVE_REMOVIDOS_AGENDAMENTOS)).toEqual([])
  })
})

describe('Agenda — remoção de bloqueio (tombstone persistido)', () => {
  it('remoção não confirmada não volta no F5 e é reenviada', async () => {
    controle.remotoAgendamentos = [agendamentoExemplo()]
    controle.remotoBloqueios = [bloqueioExemplo()]
    const primeira = montarAgenda()
    await aguardarCarga()
    expect(ctxAgenda?.bloqueios).toHaveLength(1)

    controle.falharBloqueios = true
    act(() => {
      ctxAgenda?.removerBloqueio('bl-1')
    })

    expect(lerTombstone(CHAVE_REMOVIDOS_BLOQUEIOS)).toContain('bl-1')
    expect(ctxAgenda?.bloqueios).toHaveLength(0)

    // F5: a lista remota ainda devolveria o bloqueio…
    primeira.unmount()
    controle.falharBloqueios = false
    const segunda = montarAgenda()
    await aguardarCarga()

    // …mas a fusão respeita o tombstone e o bloqueio não ressuscita
    expect(ctxAgenda?.bloqueios).toHaveLength(0)
    expect(lerTombstone(CHAVE_REMOVIDOS_BLOQUEIOS)).toContain('bl-1')
    // a remoção pendente é reenviada (apagar de novo é idempotente)
    expect(controle.chamadasRemoverBloqueio).toContain('bl-1')

    // Próximo F5: servidor sem o bloqueio → tombstone é descartado
    segunda.unmount()
    montarAgenda()
    await aguardarCarga()
    expect(controle.remotoBloqueios).toHaveLength(0)
    expect(lerTombstone(CHAVE_REMOVIDOS_BLOQUEIOS)).toEqual([])
  })
})
