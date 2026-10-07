import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { carregarAgendamentos } from '@/modules/agenda/persistencia'
import { criarAgendamentoPublico } from './agendaPublica'

/**
 * Criação local (sem Supabase) do agendamento público.
 *
 * Com Supabase quem barra é a RPC (`agendamento_publico_criar`, migration
 * 053) — testada em `supabase-schema.test.ts`. Aqui está a MESMA recusa no
 * modo de demonstração: hoje não se agenda horário que já passou, senão a
 * tela local prometia o que o servidor de produção recusa.
 *
 * Relógio fixo em 15/01/2030 12:00 UTC = 09:00 em São Paulo.
 */

const PROPOSTA = {
  cliente: 'Ana Souza',
  telefone: '81999999999',
  servico: 'Corte Audax',
  profissional: 'Cleiton Silva',
  observacao: '',
  complementos: [] as string[],
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2030-01-15T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('criarAgendamentoPublico (local): hoje só aceita horário futuro', () => {
  it('horário de hoje que já passou é recusado e nada é gravado', async () => {
    const r = await criarAgendamentoPublico({
      ...PROPOSTA,
      data: '2030-01-15',
      horario: '08:00',
    })
    expect(r).toEqual({
      ok: false,
      erro: 'Este horário já passou. Escolha um horário futuro.',
    })
    expect(carregarAgendamentos()).toEqual([])
  })

  it('o horário EXATO do corte (09:00 = agora) também é recusado', async () => {
    const r = await criarAgendamentoPublico({
      ...PROPOSTA,
      data: '2030-01-15',
      horario: '09:00',
    })
    expect(r.ok).toBe(false)
    expect(carregarAgendamentos()).toEqual([])
  })

  it('depois do corte, o mesmo dia continua agendando normalmente', async () => {
    const r = await criarAgendamentoPublico({
      ...PROPOSTA,
      data: '2030-01-15',
      horario: '14:00',
    })
    expect(r).toEqual({ ok: true, id: expect.any(String) })
    expect(carregarAgendamentos()).toHaveLength(1)
  })

  it('data futura não é tocada pelo corte', async () => {
    const r = await criarAgendamentoPublico({
      ...PROPOSTA,
      data: '2030-01-16',
      horario: '08:00',
    })
    expect(r).toEqual({ ok: true, id: expect.any(String) })
    expect(carregarAgendamentos()).toHaveLength(1)
  })
})
