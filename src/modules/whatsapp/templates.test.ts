import { describe, expect, it } from 'vitest'
import type { Agendamento } from '@/modules/agenda/types'
import { dadosDoAgendamento, textoTemplate } from './templates'

const agendamento: Agendamento = {
  id: 'ag-1',
  cliente: 'Ana Souza',
  telefone: '',
  servico: 'Corte Degradê',
  profissional: 'Audax',
  data: '2026-10-05',
  horario: '14:30',
  status: 'confirmado',
  observacao: '',
  criadoEm: '2026-09-01T00:00:00.000Z',
  duracaoMin: 40,
}

describe('Templates de WhatsApp — texto com dados reais', () => {
  it('confirmação usa cliente, serviço, profissional, data e horário', () => {
    const texto = textoTemplate('confirmacao', {
      nome: 'Ana Souza',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: '2026-10-05',
      horario: '14:30',
    })
    expect(texto).toContain('Ana Souza')
    expect(texto).toContain('Corte Degradê')
    expect(texto).toContain('Audax')
    expect(texto).toContain('05/10/2026')
    expect(texto).toContain('14:30')
  })

  it('lembrete usa os mesmos dados do agendamento', () => {
    const texto = textoTemplate('lembrete', {
      nome: 'Bruno Lima',
      servico: 'Barba',
      profissional: 'Diego',
      data: '2026-10-06',
      horario: '09:00',
    })
    expect(texto).toContain('Lembrete')
    expect(texto).toContain('Bruno Lima')
    expect(texto).toContain('Barba')
    expect(texto).toContain('Diego')
    expect(texto).toContain('06/10/2026')
    expect(texto).toContain('09:00')
  })

  it('pós-atendimento usa cliente e serviço realizado', () => {
    const texto = textoTemplate('pos_atendimento', {
      nome: 'Carla Dias',
      servico: 'Platinado / Luzes',
    })
    expect(texto).toContain('Carla Dias')
    expect(texto).toContain('Platinado / Luzes')
    expect(texto).toContain('Studio Audax')
  })

  it('reativação usa dias reais e a data do último atendimento', () => {
    const texto = textoTemplate('reativacao', {
      nome: 'Diego Alves',
      ultimoAtendimento: '2026-09-01',
      diasSemAtendimento: 47,
    })
    expect(texto).toContain('Diego Alves')
    expect(texto).toContain('47 dia(s)')
    expect(texto).toContain('01/09/2026')
  })
})

describe('Templates — recusa dados incompletos', () => {
  it('confirmação exige serviço, profissional, data e horário', () => {
    expect(() =>
      textoTemplate('confirmacao', { nome: 'Ana', servico: 'Corte' }),
    ).toThrow(/confirmacao: profissional/)
    expect(() =>
      textoTemplate('confirmacao', {
        nome: 'Ana',
        servico: 'Corte',
        profissional: 'Audax',
        data: '2026-10-05',
      }),
    ).toThrow(/confirmacao: horário/)
  })

  it('lembrete exige data', () => {
    expect(() =>
      textoTemplate('lembrete', {
        nome: 'Ana',
        servico: 'Corte',
        profissional: 'Audax',
        horario: '10:00',
      }),
    ).toThrow(/lembrete: data/)
  })

  it('pós-atendimento exige serviço', () => {
    expect(() => textoTemplate('pos_atendimento', { nome: 'Ana' })).toThrow(
      /pos_atendimento: serviço/,
    )
  })

  it('reativação exige último atendimento e quantidade de dias', () => {
    expect(() => textoTemplate('reativacao', { nome: 'Ana' })).toThrow(
      /reativacao: último atendimento/,
    )
    expect(() =>
      textoTemplate('reativacao', { nome: 'Ana', ultimoAtendimento: '2026-09-01' }),
    ).toThrow(/dias desde o último atendimento/)
  })

  it('sempre exige o nome do cliente', () => {
    expect(() =>
      textoTemplate('pos_atendimento', { nome: '   ', servico: 'Corte' }),
    ).toThrow(/cliente/)
  })
})

describe('dadosDoAgendamento', () => {
  it('extrai os campos reais do agendamento', () => {
    expect(dadosDoAgendamento(agendamento)).toEqual({
      nome: 'Ana Souza',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: '2026-10-05',
      horario: '14:30',
    })
  })
})
