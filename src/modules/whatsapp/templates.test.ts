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

  it('retorno usa o nome do cliente e o Studio Audax', () => {
    const texto = textoTemplate('retorno', { nome: 'Ana Souza' })
    expect(texto).toContain('Ana Souza')
    expect(texto).toContain('Studio Audax')
    expect(texto).toContain('retornando')
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
    expect(() => textoTemplate('retorno', { nome: '   ' })).toThrow(
      /retorno: cliente/,
    )
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

describe('Templates de automação — texto com dados reais', () => {
  it('cancelamento usa cliente, serviço, profissional, data e horário', () => {
    const texto = textoTemplate('cancelamento', {
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
    expect(texto).toContain('cancelado')
  })

  it('reagendamento anuncia o novo horário', () => {
    const texto = textoTemplate('reagendamento', {
      nome: 'Bruno Lima',
      servico: 'Barba',
      profissional: 'Diego',
      data: '2026-10-06',
      horario: '09:00',
    })
    expect(texto).toContain('Bruno Lima')
    expect(texto).toContain('remarcado')
    expect(texto).toContain('06/10/2026')
    expect(texto).toContain('09:00')
  })

  it('aniversário só precisa do nome', () => {
    const texto = textoTemplate('aniversario', { nome: 'Carla Dias' })
    expect(texto).toContain('Carla Dias')
    expect(texto).toContain('feliz aniversário')
    expect(texto).toContain('Studio Audax')
  })

  it('vencimento do Clube avisa dias futuros, hoje e atraso', () => {
    const futuro = textoTemplate('vencimento_clube', {
      nome: 'Ana Souza',
      plano: 'Cabelo + Barba',
      data: '2026-10-05',
      diasVencimento: 3,
    })
    expect(futuro).toContain('vence em 3 dia(s)')
    expect(futuro).toContain('Cabelo + Barba')
    expect(futuro).toContain('05/10/2026')

    const hoje = textoTemplate('vencimento_clube', {
      nome: 'Ana Souza',
      plano: 'Barba',
      data: '2026-10-05',
      diasVencimento: 0,
    })
    expect(hoje).toContain('vence hoje')

    const atraso = textoTemplate('vencimento_clube', {
      nome: 'Ana Souza',
      plano: 'Cabelo',
      data: '2026-10-05',
      diasVencimento: -2,
    })
    expect(atraso).toContain('venceu há 2 dia(s)')
  })

  it('horário liberado convida quem está na fila', () => {
    const texto = textoTemplate('horario_liberado', {
      nome: 'Bruno Lima',
      servico: 'Corte',
      profissional: 'Audax',
      data: '2026-10-07',
      horario: '11:00',
    })
    expect(texto).toContain('Bruno Lima')
    expect(texto).toContain('Abriu um horário')
    expect(texto).toContain('Corte')
    expect(texto).toContain('07/10/2026')
    expect(texto).toContain('11:00')
  })

  it('recusa dados incompletos dos novos templates', () => {
    expect(() => textoTemplate('cancelamento', { nome: 'Ana' })).toThrow(
      /cancelamento: serviço/,
    )
    expect(() => textoTemplate('reagendamento', { nome: 'Ana' })).toThrow(
      /reagendamento: serviço/,
    )
    expect(() =>
      textoTemplate('horario_liberado', { nome: 'Ana' }),
    ).toThrow(/horario_liberado: serviço/)
    expect(() =>
      textoTemplate('vencimento_clube', { nome: 'Ana', plano: 'Cabelo' }),
    ).toThrow(/vencimento_clube: data do vencimento/)
    expect(() =>
      textoTemplate('vencimento_clube', {
        nome: 'Ana',
        plano: 'Cabelo',
        data: '2026-10-05',
      }),
    ).toThrow(/dias até o vencimento/)
  })
})
