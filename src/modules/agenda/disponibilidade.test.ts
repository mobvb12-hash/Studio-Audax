import { describe, expect, it } from 'vitest'
import {
  horariosDisponiveis,
  horariosLivresPorProfissional,
} from './regras'
import type { Agendamento, Bloqueio, Expediente } from './types'

/**
 * A regra ÚNICA de disponibilidade por horário × profissional.
 *
 * É ela que a página pública, o Painel e o WhatsApp consomem — por isso os
 * casos abaixo são o contrato de "o horário mostrado é reservável".
 */

const EXPEDIENTE: Expediente = {
  inicio: '08:00',
  fim: '12:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
}

const TODOS = ['Cleiton', 'Ítalo']
const duracao = () => 30

function agendamento(parcial: Partial<Agendamento>): Agendamento {
  return {
    id: 'a',
    cliente: 'Cliente',
    telefone: '',
    servico: 'Corte',
    profissional: 'Cleiton',
    data: '2030-01-15',
    horario: '09:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2030-01-01T00:00:00.000Z',
    ...parcial,
  }
}

function bloqueio(parcial: Partial<Bloqueio>): Bloqueio {
  return {
    id: 'b',
    tipo: 'ausencia',
    profissional: 'Cleiton',
    data: '2030-01-15',
    dataFim: '2030-01-15',
    inicio: '08:00',
    fim: '12:00',
    motivo: '',
    criadoEm: '2030-01-01T00:00:00.000Z',
    ...parcial,
  }
}

function consultar(
  ocupacoes: Agendamento[],
  bloqueios: Bloqueio[] = [],
  profissionais = TODOS,
  duracaoMin = 30,
) {
  return horariosLivresPorProfissional(
    '2030-01-15',
    EXPEDIENTE,
    bloqueios,
    ocupacoes,
    profissionais,
    duracao,
    duracaoMin,
  )
}

describe('horariosLivresPorProfissional', () => {
  it('consulta TODOS os profissionais e devolve quem está livre em cada hora', () => {
    const slots = consultar([])
    expect(slots.map((s) => s.horario)).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
    // Nenhum profissional ocupado: os dois aparecem em toda hora.
    expect(slots.every((s) => s.profissionais.length === 2)).toBe(true)
  })

  it('Cleiton e Ítalo são independentes: um ocupado não esconde o outro', () => {
    const slots = consultar([agendamento({ profissional: 'Cleiton', horario: '08:00' })])
    const oito = slots.find((s) => s.horario === '08:00')
    expect(oito?.profissionais).toEqual(['Ítalo'])
    // Às 08:30 os dois voltam — o atendimento do Cleiton era de 30 min.
    const oitoTrinta = slots.find((s) => s.horario === '08:30')
    expect(oitoTrinta?.profissionais).toEqual(['Cleiton', 'Ítalo'])
  })

  it('os dois no mesmo horário: as DUAS opções aparecem juntas', () => {
    // Só o Ítalo está com agenda às 09:00; o Cleiton nada. Os dois têm de
    // aparecer como opções separadas naquele mesmo horário.
    const slots = consultar([
      agendamento({ profissional: 'Ítalo', horario: '09:00', duracaoMin: 30 }),
    ])
    // Assumindo o dono das 09:00, Cleiton está livre e Ítalo não:
    expect(slots.find((s) => s.horario === '09:00')?.profissionais).toEqual(['Cleiton'])
    // E num horário sem ninguém agendado, os dois juntos:
    expect(slots.find((s) => s.horario === '10:00')?.profissionais).toEqual([
      'Cleiton',
      'Ítalo',
    ])
  })

  it('respeita a duração real do serviço, não a grade de 30 minutos', () => {
    // Serviço de 60 min: 11:00 terminaria 12:00 e ainda cabe, 11:30 não.
    const slots = consultar([], [], TODOS, 60)
    expect(slots.map((s) => s.horario)).toContain('11:00')
    expect(slots.map((s) => s.horario)).not.toContain('11:30')
  })

  it('cancelado e não comparecido NÃO ocupam o horário', () => {
    for (const status of ['cancelado', 'nao_compareceu'] as const) {
      const slots = consultar([
        agendamento({ profissional: 'Cleiton', horario: '08:00', status }),
      ])
      expect(slots.find((s) => s.horario === '08:00')?.profissionais).toEqual([
        'Cleiton',
        'Ítalo',
      ])
    }
  })

  it('bloqueio de um profissional não afeta o outro', () => {
    const slots = consultar([], [bloqueio({ profissional: 'Cleiton' })])
    expect(slots.every((s) => !s.profissionais.includes('Cleiton'))).toBe(true)
    expect(slots.every((s) => s.profissionais.includes('Ítalo'))).toBe(true)
  })

  it('não oferece horário que caia sobre o almoço', () => {
    const almocoMeio: Expediente = {
      inicio: '08:00',
      fim: '14:00',
      almocoInicio: '12:00',
      almocoFim: '13:00',
    }
    const slots = horariosLivresPorProfissional(
      '2030-01-15',
      almocoMeio,
      [],
      [],
      TODOS,
      duracao,
      30,
    )
    expect(slots.map((s) => s.horario)).not.toContain('12:00')
  })

  it('sem profissionais não há slot nenhum', () => {
    expect(consultar([], [], [])).toEqual([])
  })
})

describe('horariosDisponiveis continua igual (mesma regra, forma antiga)', () => {
  it('achata a regra por profissional em horários + vagas', () => {
    const resultado = horariosDisponiveis(
      '2030-01-15',
      EXPEDIENTE,
      [],
      [agendamento({ profissional: 'Cleiton', horario: '08:00' })],
      TODOS,
      duracao,
    )
    expect(resultado.horarios).toContain('08:00')
    // 8 slots; no primeiro só o Ítalo está livre → 15 vagas.
    expect(resultado.vagas).toBe(15)
  })

  it('slot só de bloqueio conta uma vaga a menos', () => {
    const resultado = horariosDisponiveis(
      '2030-01-15',
      EXPEDIENTE,
      [bloqueio({ profissional: 'Cleiton' })],
      [],
      TODOS,
      duracao,
    )
    expect(resultado.horarios).toHaveLength(8)
    expect(resultado.vagas).toBe(8)
  })
})