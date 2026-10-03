import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { carregarCatalogo, horariosPublicosPorProfissional } from '@/services/supabase/agendaPublica'
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
  horariosPublicosPorProfissional: vi.fn(),
  horariosPublicos: vi.fn(),
}))

vi.mock('./regras', () => ({
  navegarPainel: vi.fn(),
}))

const catalogo = vi.mocked(carregarCatalogo)
const slots = vi.mocked(horariosPublicosPorProfissional)
const cadastro = vi.mocked(obterMeuCadastro)
const servicosComComplementos = vi.mocked(listarServicosComComplementos)
const criar = vi.mocked(criarAgendamentoPainel)

const CATALOGO: CatalogoPublico = {
  servicos: [
    { id: 'srv-corte', nome: 'Corte Audax', preco: 70, duracaoMin: 40, complementos: ['srv-barba'] },
    { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15, complementos: [] },
  ],
  profissionais: [
    { id: 'pf-cleiton', nome: 'Cleiton' },
    { id: 'pf-italo', nome: 'Ítalo' },
  ],
  barbearia: { endereco: '', telefone: '', instagram: '', mapa: '' },
  destaques: [],
}

const COMPLEMENTOS: ServicoComComplementos[] = [
  {
    id: 'srv-corte',
    nome: 'Corte Audax',
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
  fireEvent.change(screen.getByLabelText('Escolher data'), { target: { value: iso } })
}

/** Vai até a grade de horários sem escolher profissional. */
async function irAteOsSlots() {
  await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
  escolherDataPeloAtalho(diaFuturoIso())
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Horário 08:00 com Cleiton/ })).toBeTruthy(),
  )
}

beforeEach(() => {
  catalogo.mockReset()
  slots.mockReset()
  cadastro.mockReset()
  servicosComComplementos.mockReset()
  criar.mockReset()
  catalogo.mockResolvedValue(CATALOGO)
  slots.mockResolvedValue([
    { horario: '08:00', profissionais: ['Cleiton', 'Ítalo'] },
    { horario: '09:00', profissionais: ['Ítalo'] },
  ])
  cadastro.mockResolvedValue(MEU_CADASTRO)
  servicosComComplementos.mockResolvedValue(COMPLEMENTOS)
  window.location.hash = ''
})

describe('TelaAgendarPainel', () => {
  it('mostra o cadastro da sessão e os complementos nada pré-marcados', async () => {
    render(<TelaAgendarPainel />)

    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))

    const complemento = screen.getByRole('button', {
      name: /^Barba — \d+ minutos — mais/,
    })
    expect(complemento.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Quer completar?')).toBeTruthy()
  })

  it('consulta TODOS os profissionais de uma vez, sem perguntar profissional', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
    // Nenhuma etapa de profissional existe no fluxo.
    expect(screen.queryByText('Profissional')).toBeNull()

    escolherDataPeloAtalho(diaFuturoIso())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Horário 08:00 com Cleiton/ })).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: /Horário 08:00 com Ítalo/ })).toBeTruthy()
    expect(slots).toHaveBeenCalledWith(diaFuturoIso(), 40, ['Cleiton', 'Ítalo'])
  })

  it('soma a duração do complemento na consulta e envia os ids escolhidos', async () => {
    render(<TelaAgendarPainel />)
    await waitFor(() => expect(screen.getByText(/Agendando como Ana Silva/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
    escolherDataPeloAtalho(diaFuturoIso())
    await waitFor(() => expect(slots).toHaveBeenCalledWith(diaFuturoIso(), 40, [
      'Cleiton',
      'Ítalo',
    ]))

    fireEvent.click(screen.getByRole('button', { name: /^Barba — \d+ minutos — mais/ }))
    expect(screen.getByText(/Duração total do atendimento: 55 min/)).toBeTruthy()
    await waitFor(() =>
      expect(slots).toHaveBeenCalledWith(diaFuturoIso(), 55, ['Cleiton', 'Ítalo']),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Ítalo' }))
    criar.mockResolvedValue({ ok: true, id: 'ag-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() => expect(screen.getByText('Agendamento confirmado!')).toBeTruthy())
    expect(criar).toHaveBeenCalledWith({
      servico: 'Corte Audax',
      profissional: 'Ítalo',
      data: diaFuturoIso(),
      horario: '08:00',
      observacao: '',
      complementos: ['srv-barba'],
    })
  })

  it('erro do servidor vira aviso honesto (sem tela de confirmação)', async () => {
    render(<TelaAgendarPainel />)
    await irAteOsSlots()
    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }))

    criar.mockResolvedValue({
      ok: false,
      erro: 'Complemento indisponível para este serviço.',
    })
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
    await irAteOsSlots()
    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }))
    const chamadas = slots.mock.calls.length

    criar.mockResolvedValue({
      ok: false,
      erro: 'Este horário acabou de ser ocupado. Escolha outro.',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/acabou de ser ocupado/),
    )
    await waitFor(() =>
      expect(slots.mock.calls.length).toBeGreaterThan(chamadas),
    )
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
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