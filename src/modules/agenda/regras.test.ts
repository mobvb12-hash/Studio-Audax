import { describe, expect, it } from 'vitest'
import { formatarMinutos, verificarConflito } from './regras'
import type { Agendamento } from './types'

const DIA = '2026-09-25'

function ag(parcial: Partial<Agendamento>): Agendamento {
  return {
    id: `ag-${Math.random().toString(36).slice(2, 8)}`,
    cliente: 'Lucas Mendes',
    telefone: '',
    servico: 'Corte Degradê',
    profissional: 'Audax',
    data: DIA,
    horario: '10:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    ...parcial,
  }
}

const duracaoDo = (servico: string) =>
  servico === 'Corte + Barba' ? 70 : servico === 'Barba' ? 30 : 40

describe('Agenda — conflito de horários (sobreposição)', () => {
  it('mesmo horário exato para o mesmo profissional é conflito', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(true)
    if (r.conflito) expect(r.fimExistente).toBe('10:40')
  })

  it('sobreposição parcial é conflito (10:00 de 40min + 10:30)', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00' })],
      { data: DIA, horario: '10:30', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(true)
    if (r.conflito) expect(r.agendamento.horario).toBe('10:00')
  })

  it('serviço longo que invade o próximo horário é conflito', () => {
    const r = verificarConflito(
      [ag({ horario: '11:00', servico: 'Corte + Barba' })],
      { data: DIA, horario: '11:30', profissional: 'Audax', duracaoMin: 30 },
      duracaoDo,
    )
    expect(r.conflito).toBe(true)
    if (r.conflito) expect(r.fimExistente).toBe('12:10')
  })

  it('encostado sem sobreposição não é conflito (10:00 40min → 10:40 livre)', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00' })],
      { data: DIA, horario: '10:40', profissional: 'Audax', duracaoMin: 30 },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('profissionais diferentes não conflitam', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00', profissional: 'Audax' })],
      { data: DIA, horario: '10:00', profissional: 'Diego', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('dias diferentes não conflitam', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00', data: '2026-09-24' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('cancelado e não compareceu não bloqueiam o horário', () => {
    const cancelado = verificarConflito(
      [ag({ horario: '10:00', status: 'cancelado' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(cancelado.conflito).toBe(false)

    const faltou = verificarConflito(
      [ag({ horario: '10:00', status: 'nao_compareceu' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(faltou.conflito).toBe(false)
  })

  it('ignorarId permite reagendar sem conflito consigo mesmo', () => {
    const existente = ag({ horario: '10:00' })
    const r = verificarConflito(
      [existente],
      {
        data: DIA,
        horario: '10:00',
        profissional: 'Audax',
        duracaoMin: 40,
        ignorarId: existente.id,
      },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('formatarMinutos formata a hora final', () => {
    expect(formatarMinutos(10 * 60 + 40)).toBe('10:40')
    expect(formatarMinutos(11 * 60 + 70)).toBe('12:10')
  })
})
