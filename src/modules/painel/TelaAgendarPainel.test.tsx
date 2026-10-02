import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  carregarCatalogo,
  horariosPublicos,
} from '@/services/supabase/agendaPublica'
import type { CatalogoPublico } from '@/services/supabase/agendaPublica'
import {
  criarAgendamentoPainel,
  listarServicosComComplementos,
  obterMeuCadastro,
} from '@/services/supabase/painel'
import type { CadastroPainel, ServicoComComplementos } from '@/services/supabase/painel'
import TelaAgendarPainel from './telas/TelaAgendarPainel'

vi.mock('@/services/supabase/painel', () => ({
  obterMeuCadastro: vi.fn(),
  listarServicosComComplementos: vi.fn(),
  criarAgendamentoPainel: vi.fn(),
}))

vi.mock('@/services/supabase/agendaPublica', () => ({
  carregarCatalogo: vi.fn(),
  horariosPublicos: vi.fn(),
}))

const catalogo = vi.mocked(carregarCatalogo)
const horarios = vi.mocked(horariosPublicos)
const cadastro = vi.mocked(obterMeuCadastro)
const servicosComComplementos = vi.mocked(listarServicosComComplementos)
const criar = vi.mocked(criarAgendamentoPainel)

const CATALOGO: CatalogoPublico = {
  servicos: [
    { id: 'srv-corte', nome: 'Corte', preco: 70, duracaoMin: 40 },
    { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15 },
  ],
  profissionais: [{ id: 'pf-rafael', nome: 'Rafael' }],
}

const COMPLEMENTOS: ServicoComComplementos[] = [
  {
    id: 'srv-corte',
    nome: 'Corte',
    preco: 70,
    duracaoMin: 40,
    complementos: [{ id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15 }],
  },
  { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15, complementos: [] },
]

const MEU_CADASTRO: CadastroPainel = {
  id: 'cli-1',
  nome: 'Ana Silva',
  telefone: '(11) 98888-7777',
  email: 'ana@studio.com',
  nascimento: '1990-05-20',
  genero: 'feminino',
}

function escolherServicoEDados() {
  fireEvent.change(screen.getByLabelText('Serviço *'), {
    target: { value: 'Corte' },
  })
  fireEvent.change(screen.getByLabelText('Profissional *'), {
    target: { value: 'Rafael' },
  })
  fireEvent.change(screen.getByLabelText('Data *'), {
    target: { value: '2030-01-15' },
  })
}

beforeEach(() => {
  catalogo.mockReset()
  horarios.mockReset()
  cadastro.mockReset()
  servicosComComplementos.mockReset()
  criar.mockReset()
  catalogo.mockResolvedValue(CATALOGO)
  horarios.mockResolvedValue(['10:00', '11:00'])
  cadastro.mockResolvedValue(MEU_CADASTRO)
  servicosComComplementos.mockResolvedValue(COMPLEMENTOS)
  window.location.hash = ''
})

describe('TelaAgendarPainel', () => {
  it('mostra o cadastro da sessão e os complementos nada pré-marcados', async () => {
    render(<TelaAgendarPainel />)

    await waitFor(() =>
      expect(screen.getByLabelText('Serviço *')).toBeTruthy(),
    )
    expect(screen.getByText('Ana Silva')).toBeTruthy()
    expect(screen.getByText(/Agendando como/)).toBeTruthy()
    const select = screen.getByLabelText('Serviço *') as HTMLSelectElement
    expect(
      Array.from(select.options).map((opcao) =>
        (opcao.textContent ?? '').replace(/\s/g, ' '),
      ),
    ).toContain('Corte · R$ 70,00 · 40 min')

    fireEvent.change(screen.getByLabelText('Serviço *'), {
      target: { value: 'Corte' },
    })

    const complemento = screen.getByLabelText(/Barba/) as HTMLInputElement
    expect(complemento.checked).toBe(false)
    expect(screen.getByText(/Duração total:/)).toBeTruthy()
    expect(screen.getByText('40 min')).toBeTruthy()
  })

  it('soma a duração do complemento nos horários e envia os ids escolhidos', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() =>
      expect(screen.getByLabelText('Serviço *')).toBeTruthy(),
    )

    escolherServicoEDados()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '10:00' })).toBeTruthy(),
    )
    expect(horarios).toHaveBeenCalledWith('2030-01-15', 'Rafael', 40)

    fireEvent.click(screen.getByLabelText(/Barba/))
    expect(screen.getByText('55 min')).toBeTruthy()
    await waitFor(() =>
      expect(horarios).toHaveBeenCalledWith('2030-01-15', 'Rafael', 55),
    )

    criar.mockResolvedValue({ ok: true, id: 'ag-1' })
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(
        screen.getByText('Pedido de agendamento enviado!'),
      ).toBeTruthy(),
    )
    expect(criar).toHaveBeenCalledWith({
      servico: 'Corte',
      profissional: 'Rafael',
      data: '2030-01-15',
      horario: '10:00',
      observacao: '',
      complementos: ['srv-barba'],
    })
  })

  it('erro do servidor vira aviso honesto (sem tela de confirmação)', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() =>
      expect(screen.getByLabelText('Serviço *')).toBeTruthy(),
    )
    escolherServicoEDados()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '10:00' })).toBeTruthy(),
    )

    criar.mockResolvedValue({
      ok: false,
      erro: 'Complemento indisponível para este serviço.',
    })
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /Complemento indisponível/,
      ),
    )
    expect(
      screen.queryByText('Pedido de agendamento enviado!'),
    ).toBeNull()
  })

  it('horário tomado recarrega a lista de livres', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() =>
      expect(screen.getByLabelText('Serviço *')).toBeTruthy(),
    )
    escolherServicoEDados()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '10:00' })).toBeTruthy(),
    )
    const chamadas = horarios.mock.calls.length

    criar.mockResolvedValue({
      ok: false,
      erro: 'Este horário acabou de ser ocupado. Escolha outro.',
    })
    fireEvent.click(screen.getByRole('button', { name: '10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(horarios.mock.calls.length).toBeGreaterThan(chamadas),
    )
    expect(
      screen.queryByText('Pedido de agendamento enviado!'),
    ).toBeNull()
  })
})
