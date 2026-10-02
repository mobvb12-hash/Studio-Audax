import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelarAgendamentoPainel,
  listarMeusAgendamentos,
  remarcarAgendamentoPainel,
} from '@/services/supabase/painel'
import type { AgendamentoPainel } from '@/services/supabase/painel'
import { horariosPublicos } from '@/services/supabase/agendaPublica'
import PainelAgendamentos from './telas/PainelAgendamentos'

vi.mock('@/services/supabase/painel', () => ({
  listarMeusAgendamentos: vi.fn(),
  cancelarAgendamentoPainel: vi.fn(),
  remarcarAgendamentoPainel: vi.fn(),
}))

vi.mock('@/services/supabase/agendaPublica', () => ({
  horariosPublicos: vi.fn(),
}))

const listar = vi.mocked(listarMeusAgendamentos)
const cancelar = vi.mocked(cancelarAgendamentoPainel)
const remarcar = vi.mocked(remarcarAgendamentoPainel)
const horarios = vi.mocked(horariosPublicos)

function ag(parcial: Partial<AgendamentoPainel>): AgendamentoPainel {
  return {
    id: 'a1',
    servico: 'Corte',
    profissional: 'Rafael',
    data: '2999-12-31',
    horario: '14:00',
    status: 'confirmado',
    duracaoMin: 40,
    observacao: '',
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

beforeEach(() => {
  listar.mockReset()
  cancelar.mockReset()
  remarcar.mockReset()
  horarios.mockReset()
  horarios.mockResolvedValue(['16:00', '17:00'])
  window.location.hash = '#/painel/agendamentos'
})

describe('PainelAgendamentos', () => {
  it('lista todos os futuros e todo o histórico separados', async () => {
    listar.mockResolvedValue([
      ag({ id: 'fut-1', servico: 'Corte', data: '2999-12-31', horario: '14:00' }),
      ag({ id: 'fut-2', servico: 'Barba', data: '2999-12-31', horario: '09:00' }),
      ag({
        id: 'hist-1',
        servico: 'Sobrancelha',
        data: '2000-01-01',
        status: 'concluido',
      }),
      ag({
        id: 'hist-2',
        servico: 'Platinado / Luzes',
        data: '1999-06-15',
        status: 'cancelado',
      }),
    ])

    render(<PainelAgendamentos />)

    await waitFor(() =>
      expect(screen.getByText('Meus agendamentos')).toBeTruthy(),
    )
    expect(screen.getByText('Próximos')).toBeTruthy()
    expect(screen.getByText('Histórico')).toBeTruthy()
    // futuros em ordem crescente (09:00 antes de 14:00)
    const secoes = screen.getAllByText(/Barba|Corte/)
    expect(secoes.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Sobrancelha')).toBeTruthy()
    expect(screen.getByText('Platinado / Luzes')).toBeTruthy()
    expect(screen.getByText('Cancelado')).toBeTruthy()
    expect(screen.getByText('Concluído')).toBeTruthy()
  })

  it('sem nenhum agendamento convida a marcar', async () => {
    listar.mockResolvedValue([])

    render(<PainelAgendamentos />)

    await waitFor(() =>
      expect(
        screen.getByText('Você ainda não tem um agendamento marcado.'),
      ).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: 'Agendar horário' })).toBeTruthy()
    expect(screen.queryByText('Histórico')).toBeNull()
  })

  it('falha de carga vira aviso com tentar de novo', async () => {
    listar.mockRejectedValue(new Error('permission denied for table'))

    render(<PainelAgendamentos />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /permission denied/,
      ),
    )

    listar.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() =>
      expect(
        screen.getByText('Você ainda não tem um agendamento marcado.'),
      ).toBeTruthy(),
    )
  })

  it('cancelar exige confirmação e recarrega a lista', async () => {
    listar.mockResolvedValue([
      ag({ id: 'fut-1', servico: 'Corte', data: '2999-12-31' }),
    ])
    render(<PainelAgendamentos />)
    await waitFor(() =>
      expect(screen.getByText('Meus agendamentos')).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cancelar agendamento' }),
      ).toBeTruthy(),
    )

    cancelar.mockResolvedValue({ ok: true, id: 'fut-1' })
    const chamadas = listar.mock.calls.length
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancelar agendamento' }),
    )

    await waitFor(() => expect(cancelar).toHaveBeenCalledWith('fut-1'))
    await waitFor(() =>
      expect(listar.mock.calls.length).toBeGreaterThan(chamadas),
    )
  })

  it('erro do cancelar vira aviso honesto (sem recarregar)', async () => {
    listar.mockResolvedValue([
      ag({ id: 'fut-1', servico: 'Corte', data: '2999-12-31' }),
    ])
    render(<PainelAgendamentos />)
    await waitFor(() =>
      expect(screen.getByText('Meus agendamentos')).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cancelar agendamento' }),
      ).toBeTruthy(),
    )

    cancelar.mockResolvedValue({
      ok: false,
      erro: 'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de cancelar.',
    })
    const chamadas = listar.mock.calls.length
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancelar agendamento' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/já foi pago/),
    )
    expect(listar.mock.calls.length).toBe(chamadas)
  })

  it('remarcar: escolhe data/horário livres e envia a RPC', async () => {
    listar.mockResolvedValue([
      ag({ id: 'fut-1', servico: 'Corte', data: '2999-12-31', duracaoMin: 40 }),
    ])
    render(<PainelAgendamentos />)
    await waitFor(() =>
      expect(screen.getByText('Meus agendamentos')).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remarcar' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Nova data')).toBeTruthy(),
    )

    fireEvent.change(screen.getByLabelText('Nova data'), {
      target: { value: '2030-01-15' },
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '16:00' })).toBeTruthy(),
    )
    expect(horarios).toHaveBeenCalledWith(
      '2030-01-15',
      'Rafael',
      40,
    )

    remarcar.mockResolvedValue({ ok: true, id: 'fut-1' })
    const chamadas = listar.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '16:00' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar remarcação' }),
    )

    await waitFor(() =>
      expect(remarcar).toHaveBeenCalledWith('fut-1', '2030-01-15', '16:00'),
    )
    await waitFor(() =>
      expect(listar.mock.calls.length).toBeGreaterThan(chamadas),
    )
  })
})
