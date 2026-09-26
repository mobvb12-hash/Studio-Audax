import { describe, expect, it } from 'vitest'
import { EXPEDIENTE_PADRAO } from '@/modules/agenda/regras'
import type { Agendamento, Bloqueio } from '@/modules/agenda/types'
import {
  comPosicao,
  compativel,
  encaixesDisponiveis,
  filtrarPosicoes,
  validarPedido,
} from './regras'
import type { PedidoEspera } from './types'

const HOJE = '2026-03-10'

const BASE = {
  expediente: EXPEDIENTE_PADRAO,
  bloqueios: [] as Bloqueio[],
  agendamentos: [] as Agendamento[],
  profissionais: ['Audax', 'Diego'],
  hoje: HOJE,
}

function pedido(parcial: Partial<PedidoEspera> = {}): PedidoEspera {
  return {
    id: 'pe-1',
    clienteId: 'c1',
    cliente: 'Ana Souza',
    telefone: '(11) 91111-2222',
    servico: 'Corte Degradê',
    profissional: '',
    periodo: 'qualquer',
    dataPreferida: '',
    observacao: '',
    status: 'aguardando',
    criadoEm: '2026-03-01T10:00:00.000Z',
    ...parcial,
  }
}

function ag(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'ag-1',
    cliente: 'Carlos Melo',
    telefone: '',
    servico: 'Corte Degradê',
    profissional: 'Audax',
    data: HOJE,
    horario: '09:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-03-01T00:00:00.000Z',
    duracaoMin: 40,
    ...parcial,
  }
}

describe('validarPedido — campos obrigatórios', () => {
  it('valida cliente, serviço e período com mensagens prontas', () => {
    expect(() =>
      validarPedido({ clienteId: '', cliente: '', servico: 'Corte', telefone: '' }),
    ).toThrow('Selecione o cliente.')
    expect(() =>
      validarPedido({
        clienteId: 'c1',
        cliente: 'Ana',
        servico: '   ',
        telefone: '',
      }),
    ).toThrow('Selecione o serviço desejado.')
    expect(() =>
      validarPedido({
        clienteId: 'c1',
        cliente: 'Ana',
        servico: 'Corte',
        telefone: '',
        periodo: 'noite' as never,
      }),
    ).toThrow('Período inválido.')
    expect(() =>
      validarPedido({
        clienteId: 'c1',
        cliente: 'Ana',
        servico: 'Corte',
        telefone: '',
      }),
    ).not.toThrow()
  })
})

describe('compatível — período, profissional e data preferida', () => {
  it('aplica as três restrições do pedido na janela', () => {
    const janela = { data: HOJE, horario: '09:00', profissional: 'Audax' }
    expect(
      compativel(
        { profissional: '', dataPreferida: '', periodo: 'manha' },
        janela,
      ),
    ).toBe(true)
    expect(
      compativel(
        { profissional: '', dataPreferida: '', periodo: 'tarde' },
        janela,
      ),
    ).toBe(false)
    expect(
      compativel(
        { profissional: '', dataPreferida: '', periodo: 'qualquer' },
        { ...janela, horario: '15:00' },
      ),
    ).toBe(true)
    expect(
      compativel(
        { profissional: 'Diego', dataPreferida: '', periodo: 'qualquer' },
        janela,
      ),
    ).toBe(false)
    expect(
      compativel(
        { profissional: '', dataPreferida: '2026-03-11', periodo: 'qualquer' },
        janela,
      ),
    ).toBe(false)
    expect(
      compativel(
        { profissional: '', dataPreferida: HOJE, periodo: 'qualquer' },
        janela,
      ),
    ).toBe(true)
    // manhã vai até 11:59; tarde começa às 12:00
    expect(
      compativel(
        { profissional: '', dataPreferida: '', periodo: 'manha' },
        { ...janela, horario: '11:30' },
      ),
    ).toBe(true)
    expect(
      compativel(
        { profissional: '', dataPreferida: '', periodo: 'tarde' },
        { ...janela, horario: '14:00' },
      ),
    ).toBe(true)
  })
})

describe('encaixesDisponiveis — regras oficiais da Agenda', () => {
  it('encontra encaixes livres respeitando período, profissional e limite', () => {
    const janelas = encaixesDisponiveis({
      pedido: pedido({ periodo: 'manha', profissional: 'Audax' }),
      ...BASE,
    })
    expect(janelas.length).toBeGreaterThan(0)
    expect(janelas.length).toBeLessThanOrEqual(6)
    expect(janelas.every((j) => j.profissional === 'Audax')).toBe(true)
    expect(janelas.every((j) => j.horario < '12:00')).toBe(true)
    expect(janelas[0].data).toBe(HOJE)
  })

  it('horário ocupado pelo agendamento some; cancelado libera', () => {
    const ocupado = encaixesDisponiveis({
      pedido: pedido({ periodo: 'manha', profissional: 'Audax' }),
      ...BASE,
      agendamentos: [ag()],
    })
    expect(ocupado.some((j) => j.horario === '09:00')).toBe(false)
    expect(ocupado.some((j) => j.horario === '09:30')).toBe(false)
    expect(ocupado.some((j) => j.horario === '10:00')).toBe(true)

    const liberado = encaixesDisponiveis({
      pedido: pedido({ periodo: 'manha', profissional: 'Audax' }),
      ...BASE,
      agendamentos: [ag({ status: 'cancelado' })],
    })
    expect(liberado.some((j) => j.horario === '09:00')).toBe(true)
  })

  it('bloqueio de agenda remove os horários do profissional afetado', () => {
    const bloqueio: Bloqueio = {
      id: 'b1',
      profissional: 'Audax',
      data: HOJE,
      inicio: '10:00',
      fim: '11:00',
      tipo: 'folga',
      motivo: 'viagem',
      criadoEm: '2026-03-01T00:00:00.000Z',
    }
    const janelas = encaixesDisponiveis({
      pedido: pedido({ periodo: 'manha', profissional: 'Audax' }),
      ...BASE,
      bloqueios: [bloqueio],
    })
    expect(janelas.some((j) => j.horario === '10:00')).toBe(false)
    expect(janelas.some((j) => j.horario === '10:30')).toBe(false)
    expect(janelas.some((j) => j.horario === '09:00')).toBe(true)
    // outro profissional não é afetado
    const outro = encaixesDisponiveis({
      pedido: pedido({ periodo: 'manha', profissional: 'Diego' }),
      ...BASE,
      bloqueios: [bloqueio],
    })
    expect(outro.some((j) => j.horario === '10:00')).toBe(true)
  })

  it('período tarde começa após o almoço e respeita o limite', () => {
    const janelas = encaixesDisponiveis({
      pedido: pedido({ periodo: 'tarde' }),
      ...BASE,
      limite: 3,
    })
    expect(janelas).toHaveLength(3)
    expect(janelas.every((j) => j.horario >= '13:00')).toBe(true)
  })

  it('profissional pedido fora dos ativos não tem encaixe', () => {
    const janelas = encaixesDisponiveis({
      pedido: pedido({ profissional: 'Zé' }),
      ...BASE,
    })
    expect(janelas).toHaveLength(0)
  })

  it('data preferida no passado fica vazia; no futuro restringe o dia', () => {
    const passado = encaixesDisponiveis({
      pedido: pedido({ dataPreferida: '2026-03-09' }),
      ...BASE,
    })
    expect(passado).toHaveLength(0)

    const futuro = encaixesDisponiveis({
      pedido: pedido({ dataPreferida: '2026-03-11' }),
      ...BASE,
    })
    expect(futuro.length).toBeGreaterThan(0)
    expect(futuro.every((j) => j.data === '2026-03-11')).toBe(true)
  })
})

describe('comPosicao — ordem de chegada', () => {
  it('aguardando em ordem de chegada; encerrados sem posição; não reordena a entrada', () => {
    const lista = [
      pedido({ id: 'b', clienteId: 'c2', criadoEm: '2026-03-02T00:00:00.000Z' }),
      pedido({ id: 'a', criadoEm: '2026-03-01T00:00:00.000Z' }),
      pedido({
        id: 'c',
        criadoEm: '2026-03-03T00:00:00.000Z',
        status: 'atendido',
      }),
    ]
    const itens = comPosicao(lista)
    expect(itens.map((i) => [i.pedido.id, i.posicao])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', null],
    ])
    expect(lista.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('filtrarPosicoes — status e busca', () => {
  const itens = comPosicao([
    pedido({ id: 'a', cliente: 'Ana Souza', telefone: '(11) 91111-2222' }),
    pedido({
      id: 'b',
      clienteId: 'c2',
      cliente: 'Bruno Lima',
      telefone: '(11) 93333-4444',
      criadoEm: '2026-03-02T00:00:00.000Z',
      status: 'atendido',
    }),
  ])

  it('filtra por status preservando as posições', () => {
    const atendidos = filtrarPosicoes(itens, '', 'atendido')
    expect(atendidos).toHaveLength(1)
    expect(atendidos[0].pedido.id).toBe('b')
    expect(atendidos[0].posicao).toBeNull()

    const aguardando = filtrarPosicoes(itens, '', 'aguardando')
    expect(aguardando).toHaveLength(1)
    expect(aguardando[0].posicao).toBe(1)
  })

  it('busca por nome e telefone; termo sem resultado volta vazio', () => {
    expect(filtrarPosicoes(itens, 'Bruno', 'todos')).toHaveLength(1)
    expect(filtrarPosicoes(itens, '91111', 'todos')).toHaveLength(1)
    expect(filtrarPosicoes(itens, 'zzz', 'todos')).toHaveLength(0)
    expect(filtrarPosicoes(itens, '', 'todos')).toHaveLength(2)
  })
})
