import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicos,
} from '@/services/supabase/agendaPublica'
import type { CatalogoPublico } from '@/services/supabase/agendaPublica'
import AgendarPublico from './AgendarPublico'

vi.mock('@/services/supabase/agendaPublica', () => ({
  carregarCatalogo: vi.fn(),
  horariosPublicos: vi.fn(),
  criarAgendamentoPublico: vi.fn(),
}))

const catalogo = vi.mocked(carregarCatalogo)
const horarios = vi.mocked(horariosPublicos)
const criar = vi.mocked(criarAgendamentoPublico)

const CATALOGO: CatalogoPublico = {
  servicos: [
    { id: 'srv-corte', nome: 'Corte', preco: 70, duracaoMin: 40 },
    { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15 },
  ],
  profissionais: [
    { id: 'pf-rafael', nome: 'Rafael' },
    { id: 'pf-bianca', nome: 'Bianca' },
  ],
}

/** Data futura, para não depender de "hoje" da máquina. */
function diaFuturoIso(): string {
  const d = new Date(Date.now() + 5 * 86400000)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function escolherDataPeloAtalho(iso: string) {
  const atalho = screen.getByText('Escolher outra data')
  const details = atalho.closest('details')
  if (details && !details.open) fireEvent.click(atalho)
  const input = screen.getByDisplayValue(/^\d{2}\/\d{2}\/\d{4}$|^$/) as HTMLInputElement
  fireEvent.change(input, { target: { value: iso } })
}

async function preencherFluxo() {
  await waitFor(() => expect(screen.getByText('Agende seu horário')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /^Barba 15 min/ }))
  fireEvent.click(screen.getByRole('button', { name: /^Rafael/ }))
  escolherDataPeloAtalho(diaFuturoIso())
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Horário 10:00' })).toBeTruthy(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Horário 10:00' }))
}

beforeEach(() => {
  catalogo.mockReset()
  horarios.mockReset()
  criar.mockReset()
  catalogo.mockResolvedValue(CATALOGO)
  horarios.mockResolvedValue(['10:00', '11:00'])
  criar.mockResolvedValue({ ok: true, id: 'ag-9' })
})

describe('AgendarPublico', () => {
  it('mostra os serviços do catálogo oficial com preço e duração', async () => {
    render(<AgendarPublico />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Corte 40 min/ })).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: /^Barba 15 min/ })).toBeTruthy()
  })

  it('pede dados só depois de escolher o horário e mostra o resumo', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Barba 15 min/ })).toBeTruthy(),
    )

    // Nada de formulário de dados antes de existir horário escolhido.
    expect(screen.queryByLabelText('Nome completo')).toBeNull()

    await preencherFluxo()

    expect(screen.getByLabelText('Nome completo')).toBeTruthy()
    expect(screen.getByLabelText('Telefone / WhatsApp')).toBeTruthy()
    // "Resumo" aparece no indicador de etapas e no cartão de conferência.
    expect(screen.getByRole('heading', { name: 'Resumo' })).toBeTruthy()
    // O profissional escolhido aparece no resumo, com o valor oficial.
    expect(screen.getByRole('heading', { name: 'Resumo' }).textContent).toBeTruthy()
    expect(screen.getAllByText('Rafael').length).toBeGreaterThan(0)
  })

  it('confirmar fica bloqueado sem nome e telefone, e envia os dados ao confirmar', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Barba 15 min/ })).toBeTruthy(),
    )
    await preencherFluxo()

    const botao = screen.getByRole('button', { name: 'Confirmar agendamento' })
    expect((botao as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Preencha nome e telefone para confirmar.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: '  Ana Silva  ' },
    })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), {
      target: { value: '11988887777' },
    })

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Confirmar agendamento' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() => expect(screen.getByText('Agendamento confirmado!')).toBeTruthy())
    expect(criar).toHaveBeenCalledWith({
      cliente: '  Ana Silva  ',
      telefone: '(11) 98888-7777',
      servico: 'Barba',
      profissional: 'Rafael',
      data: diaFuturoIso(),
      horario: '10:00',
      observacao: '',
    })
  })

  it('horário tomado recarrega as vagas e explica o próximo passo', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Barba 15 min/ })).toBeTruthy(),
    )
    await preencherFluxo()
    const chamadas = horarios.mock.calls.length

    criar.mockResolvedValue({
      ok: false,
      erro: 'Este horário acabou de ser ocupado. Escolha outro.',
    })
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ana Silva' },
    })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), {
      target: { value: '11988887777' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/acabou de ser ocupado/),
    )
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
    await waitFor(() =>
      expect(horarios.mock.calls.length).toBeGreaterThan(chamadas),
    )
  })

  it('"Qualquer profissional" explica que a Agenda precisa de um nome', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Corte 40 min/ })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: /^Corte 40 min/ }))
    fireEvent.click(screen.getByRole('button', { name: /Qualquer profissional/ }))

    expect(horarios).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Escolha um profissional para ver os horários livres/),
    ).toBeTruthy()
  })

  it('catálogo sem serviço mostra estado honesto, sem tela em branco', async () => {
    catalogo.mockResolvedValue({ servicos: [], profissionais: [] })
    render(<AgendarPublico />)

    await waitFor(() =>
      expect(
        screen.getByText(/Não há serviços ou profissionais disponíveis/),
      ).toBeTruthy(),
    )
  })
})