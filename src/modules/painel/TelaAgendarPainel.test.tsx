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

vi.mock('./regras', () => ({
  navegarPainel: vi.fn(),
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

/**
 * Escolhe serviço e profissional pelos tiles da nova UI. O tile de serviço
 * carrega o nome, a duração e o preço; o de profissional só o nome — por isso
 * a busca é feita com regex parcial, para não depender do texto exato.
 */
async function escolherServicoEProfissional() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Corte/ })).toBeTruthy(),
  )
  fireEvent.click(screen.getByRole('button', { name: /^Corte/ }))
  fireEvent.click(await screen.findByRole('button', { name: /^Rafael/ }))
}

/** Preenche a data pelo atalho "Escolher outra data" (input type=date). */
function escolherData(iso: string) {
  const atalho = screen.getByText('Escolher outra data')
  const details = atalho.closest('details')
  if (details && !details.open) fireEvent.click(atalho)
  const input = screen.getByDisplayValue(/^\d{2}\/\d{2}\/\d{4}$|^$/) as HTMLInputElement
  fireEvent.change(input, { target: { value: iso } })
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

    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    // Preço e duração vêm do catálogo oficial, sem preço inventado.
    expect(screen.getByRole('button', { name: /Corte 40 min/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Corte 40 min R/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Corte/ }))

    const complemento = screen.getByRole('button', { name: /^Barba 15 min \+\u0052/ })
    // Sugestão, nunca pré-marcada.
    expect(complemento.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(/Quer complementar seu atendimento/)).toBeTruthy()
  })

  it('soma a duração do complemento nos horários e envia os ids escolhidos', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Corte/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Rafael/ }))
    escolherData('2030-01-15')

    await waitFor(() =>
      expect(horarios).toHaveBeenCalledWith('2030-01-15', 'Rafael', 40),
    )

    fireEvent.click(screen.getByRole('button', { name: /^Barba 15 min \+\u0052/ }))
    expect(screen.getByRole('button', { name: /^Barba 15 min \+\u0052/ }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(() =>
      expect(horarios).toHaveBeenCalledWith('2030-01-15', 'Rafael', 55),
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Horário 10:00' })).toBeTruthy(),
    )
    criar.mockResolvedValue({ ok: true, id: 'ag-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Horário 10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() => expect(screen.getByText('Agendamento confirmado!')).toBeTruthy())
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
    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    await escolherServicoEProfissional()
    escolherData('2030-01-15')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Horário 10:00' })).toBeTruthy(),
    )

    criar.mockResolvedValue({
      ok: false,
      erro: 'Complemento indisponível para este serviço.',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Horário 10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /Complemento indisponível/,
      ),
    )
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
  })

  it('horário tomado recarrega a lista de livres', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    await escolherServicoEProfissional()
    escolherData('2030-01-15')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Horário 10:00' })).toBeTruthy(),
    )
    const chamadas = horarios.mock.calls.length

    criar.mockResolvedValue({
      ok: false,
      erro: 'Este horário acabou de ser ocupado. Escolha outro.',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Horário 10:00' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(horarios.mock.calls.length).toBeGreaterThan(chamadas),
    )
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
  })

  it('"Qualquer profissional" não inventa vaga: pede um profissional escolhido', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^Corte/ }))
    fireEvent.click(screen.getByRole('button', { name: /Qualquer profissional/ }))

    // Sem profissional definido não existe chamada de disponibilidade — a Agenda
    // oficial é sempre quem diz quais horários existem.
    expect(horarios).not.toHaveBeenCalled()
    expect(
      screen.getByText(/Escolha um profissional para ver os horários livres/),
    ).toBeTruthy()
  })

  it('cadastro sem vínculo explica o caminho do Perfil em vez de quebrar', async () => {
    cadastro.mockResolvedValue(null)
    render(<TelaAgendarPainel />)

    await waitFor(() =>
      expect(screen.getByText(/Abra o Perfil para concluir o vínculo/)).toBeTruthy(),
    )
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
  })
})