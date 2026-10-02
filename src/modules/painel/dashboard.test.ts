import { describe, expect, it } from 'vitest'
import type { AgendamentoPainel } from '@/services/supabase/painel'
import {
  ehProximo,
  formatarDataBR,
  rotuloStatus,
  separarAgendamentos,
} from './dashboard'

function ag(parcial: Partial<AgendamentoPainel>): AgendamentoPainel {
  return {
    id: 'a1',
    servico: 'Corte',
    profissional: 'Rafael',
    data: '2999-12-31',
    horario: '14:00',
    status: 'confirmado',
    duracaoMin: 30,
    observacao: '',
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

describe('dashboard do cliente — regras', () => {
  it('próximo = status ativo e data não passada', () => {
    expect(ehProximo(ag({ data: '2999-12-31', status: 'pendente' }), '2026-01-05')).toBe(true)
    expect(ehProximo(ag({ data: '2026-01-05', status: 'confirmado' }), '2026-01-05')).toBe(true)
    expect(ehProximo(ag({ data: '2026-01-04', status: 'confirmado' }), '2026-01-05')).toBe(false)
    expect(ehProximo(ag({ data: '2999-12-31', status: 'cancelado' }), '2026-01-05')).toBe(false)
    expect(ehProximo(ag({ data: '2999-12-31', status: 'concluido' }), '2026-01-05')).toBe(false)
  })

  it('separa e ordena: futuros crescentes, histórico decrescente', () => {
    const lista = [
      ag({ id: 'h1', data: '2026-01-03', horario: '10:00', status: 'concluido' }),
      ag({ id: 'p2', data: '2999-01-02', horario: '15:00', status: 'pendente' }),
      ag({ id: 'p1', data: '2999-01-01', horario: '09:00', status: 'confirmado' }),
      ag({ id: 'h2', data: '2026-01-04', horario: '08:00', status: 'cancelado' }),
    ]
    const { proximos, historico } = separarAgendamentos(lista, '2026-01-05')
    expect(proximos.map((a) => a.id)).toEqual(['p1', 'p2'])
    expect(historico.map((a) => a.id)).toEqual(['h2', 'h1'])
  })

  it('formata data sem depender de locale', () => {
    expect(formatarDataBR('2026-01-05')).toBe('segunda-feira, 5/1/2026')
    expect(formatarDataBR('2026-12-25')).toBe('sexta-feira, 25/12/2026')
    expect(formatarDataBR('lixo')).toBe('lixo')
  })

  it('rótulos de status conhecidos; desconhecido vira o valor cru', () => {
    expect(rotuloStatus('pendente')).toBe('Pendente')
    expect(rotuloStatus('nao_compareceu')).toBe('Não compareceu')
    expect(rotuloStatus('qualquer')).toBe('qualquer')
  })
})
