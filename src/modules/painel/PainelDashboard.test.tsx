import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listarMeusAgendamentos,
  obterMeuCadastro,
} from '@/services/supabase/painel'
import type { AgendamentoPainel } from '@/services/supabase/painel'
import PainelDashboard from './telas/PainelDashboard'

vi.mock('@/services/supabase/painel', () => ({
  listarMeusAgendamentos: vi.fn(),
  obterMeuCadastro: vi.fn(),
}))

const listar = vi.mocked(listarMeusAgendamentos)
const cadastro = vi.mocked(obterMeuCadastro)

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

beforeEach(() => {
  listar.mockReset()
  cadastro.mockReset()
})

describe('PainelDashboard', () => {
  it('mostra a saudação, o próximo agendamento e os últimos do histórico', async () => {
    cadastro.mockResolvedValue({
      id: 'cli-1',
      nome: 'Ana Silva',
      telefone: '(11) 98888-7777',
      email: 'ana@studio.com',
      nascimento: '',
      genero: 'nao_informado',
    })
    listar.mockResolvedValue([
      ag({ id: 'futuro', servico: 'Corte', data: '2999-12-31' }),
      ag({
        id: 'passado',
        servico: 'Barba',
        data: '2000-01-01',
        status: 'concluido',
      }),
    ])

    render(<PainelDashboard />)

    await waitFor(() =>
      expect(screen.getByText('Olá, Ana!')).toBeTruthy(),
    )
    expect(screen.getByText('Seu próximo horário')).toBeTruthy()
    // A ação de ver o agendamento é explícita.
    expect(screen.getByRole('button', { name: 'Ver agendamento' })).toBeTruthy()
    expect(screen.getByText('Corte')).toBeTruthy()
    expect(screen.getByText('Últimos atendimentos')).toBeTruthy()
    expect(screen.getByText('Barba')).toBeTruthy()
  })

  it('sem agendamentos mostra o convite para marcar', async () => {
    cadastro.mockResolvedValue(null)
    listar.mockResolvedValue([])

    render(<PainelDashboard />)

    await waitFor(() =>
      expect(
        screen.getByText('Você ainda não possui um próximo horário.'),
      ).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: 'Agendar meu horário' })).toBeTruthy()
    expect(screen.queryByText('Últimos atendimentos')).toBeNull()
  })

  it('falha de carga vira aviso com tentar de novo', async () => {
    cadastro.mockResolvedValue(null)
    listar.mockRejectedValue(new Error('permission denied for table'))

    render(<PainelDashboard />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /permission denied/,
      ),
    )

    listar.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() =>
      expect(
        screen.getByText('Você ainda não possui um próximo horário.'),
      ).toBeTruthy(),
    )
  })
})
