import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicosPorProfissional,
} from '@/services/supabase/agendaPublica'
import type { CatalogoPublico } from '@/services/supabase/agendaPublica'
import AgendarPublico from './AgendarPublico'

vi.mock('@/services/supabase/agendaPublica', () => ({
  carregarCatalogo: vi.fn(),
  horariosPublicosPorProfissional: vi.fn(),
  horariosPublicos: vi.fn(),
  criarAgendamentoPublico: vi.fn(),
}))

vi.mock('@/modules/painel/regras', () => ({
  navegarPainel: vi.fn(),
}))

const catalogo = vi.mocked(carregarCatalogo)
const slots = vi.mocked(horariosPublicosPorProfissional)
const criar = vi.mocked(criarAgendamentoPublico)

const CATALOGO: CatalogoPublico = {
  servicos: [
    { id: 'srv-corte', nome: 'Corte Audax', preco: 70, duracaoMin: 40 },
    { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15, complementos: [] },
  ],
  profissionais: [
    { id: 'pf-cleiton', nome: 'Cleiton' },
    { id: 'pf-italo', nome: 'Ítalo' },
  ],
  barbearia: {
    endereco: 'Rua Ecoporanga, 60 - Ibura de Baixo - Recife/PE',
    telefone: '(81) 99737-3593',
    instagram: '@studioaudax__',
    mapa: '',
  },
}

const HOJE = (() => {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
})()

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
  const input = screen.getByLabelText('Escolher data')
  fireEvent.change(input, { target: { value: iso } })
}

/**
 * Percorre o fluxo até a escolha do slot, sem escolher profissional em momento
 * algum — que é justamente o comportamento exigido.
 */
async function irAteOsSlots() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
  )
  fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
  escolherDataPeloAtalho(diaFuturoIso())
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Horário 08:00 com Cleiton/ })).toBeTruthy(),
  )
}

beforeEach(() => {
  catalogo.mockReset()
  slots.mockReset()
  criar.mockReset()
  catalogo.mockResolvedValue(CATALOGO)
  // 08:00 tem os dois; 09:00 só o Ítalo. É a grade REAL devolvida pela Agenda.
  slots.mockResolvedValue([
    { horario: '08:00', profissionais: ['Cleiton', 'Ítalo'] },
    { horario: '09:00', profissionais: ['Ítalo'] },
  ])
  criar.mockResolvedValue({ ok: true, id: 'ag-1' })
  window.location.hash = ''
})

describe('AgendarPublico — serviço, data e TODOS os profissionais', () => {
  it('um cartão por serviço, com o botão ESCOLHER visível', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )

    for (const nome of ['Corte Audax', 'Barba']) {
      const cartao = screen.getByRole('button', { name: new RegExp(`^${nome} —`) })
      expect(cartao).toBeTruthy()
      // O verbo de ação está escrito: nada de descobrir o que o botão faz.
      expect(cartao.textContent).toContain('Escolher')
    }
  })

  it('NÃO pede profissional: a data sozinha já traz os horários', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )

    // Escolheu o serviço: ainda não há horários e não há pergunta de profissional.
    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
    expect(screen.getByText(/Escolha a data para ver os horários livres/)).toBeTruthy()
    expect(slots).not.toHaveBeenCalled()

    escolherDataPeloAtalho(diaFuturoIso())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Horário 08:00 com Cleiton/ })).toBeTruthy(),
    )
    // Cleiton e Ítalo aparecem JUNTOS no mesmo horário.
    expect(screen.getByRole('button', { name: /Horário 08:00 com Ítalo/ })).toBeTruthy()
    // E a consulta foi feita para os dois, não para um só.
    expect(slots).toHaveBeenCalledWith(diaFuturoIso(), 40, ['Cleiton', 'Ítalo'])
  })

  it('Cleiton e Ítalo simultâneos viram botões separados e clicáveis', async () => {
    render(<AgendarPublico />)
    await irAteOsSlots()

    expect(
      screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Horário 08:00 com Ítalo' }),
    ).toBeTruthy()
    // Horário onde só um dos dois está livre aparece só com ele.
    expect(
      screen.getByRole('button', { name: 'Horário 09:00 com Ítalo' }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Horário 09:00 com Cleiton' }),
    ).toBeNull()

    // Tocar no slot já define o profissional — não existe passo separado.
    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Ítalo' }))
    expect(
      screen.getByRole('button', { name: 'Horário 08:00 com Ítalo' }).getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ana Silva' },
    })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), {
      target: { value: '11988887777' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))
    await waitFor(() => expect(criar).toHaveBeenCalled())
    expect(criar.mock.calls[0][0].profissional).toBe('Ítalo')
    expect(criar.mock.calls[0][0].horario).toBe('08:00')
  })

  it('só entra na etapa de dados depois de escolher o horário', async () => {
    render(<AgendarPublico />)
    await irAteOsSlots()
    expect(screen.queryByLabelText('Nome completo')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }))
    expect(screen.getByLabelText('Nome completo')).toBeTruthy()
    expect(screen.getByLabelText('Telefone / WhatsApp')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Resumo' })).toBeTruthy()
  })

  it('confirmar fica bloqueado sem nome e telefone', async () => {
    render(<AgendarPublico />)
    await irAteOsSlots()
    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }))

    const botao = screen.getByRole('button', { name: 'Confirmar agendamento' })
    expect((botao as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Preencha nome e telefone para confirmar.')).toBeTruthy()
  })

  it('envia o agendamento e mostra a confirmação', async () => {
    render(<AgendarPublico />)
    await irAteOsSlots()
    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }))
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ana Silva' },
    })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), {
      target: { value: '11988887777' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))
    await waitFor(() => expect(screen.getByText('Agendamento confirmado!')).toBeTruthy())

    expect(criar).toHaveBeenCalledWith({
      cliente: 'Ana Silva',
      telefone: '(11) 98888-7777',
      servico: 'Corte Audax',
      profissional: 'Cleiton',
      data: diaFuturoIso(),
      horario: '08:00',
      observacao: '',
      complementos: [],
    })
  })

  it('horário tomado recarrega a lista e não mostra confirmação', async () => {
    render(<AgendarPublico />)
    await irAteOsSlots()
    fireEvent.click(screen.getByRole('button', { name: 'Horário 08:00 com Cleiton' }))
    fireEvent.change(screen.getByLabelText('Nome completo'), {
      target: { value: 'Ana Silva' },
    })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), {
      target: { value: '11988887777' },
    })
    const chamadas = slots.mock.calls.length

    criar.mockResolvedValue({
      ok: false,
      erro: 'Este horário acabou de ser ocupado. Escolha outro.',
    })
    // O botão só libera com nome e telefone preenchidos.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Confirmar agendamento' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/acabou de ser ocupado/),
    )
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
    await waitFor(() => expect(slots.mock.calls.length).toBeGreaterThan(chamadas))
  })

  it('catálogo sem serviço mostra estado honesto', async () => {
    catalogo.mockResolvedValue({
      servicos: [],
      profissionais: [{ id: 'a', nome: 'Cleiton' }],
      barbearia: CATALOGO.barbearia,
    })
    render(<AgendarPublico />)

    await waitFor(() =>
      expect(screen.getByText(/Nenhum serviço disponível/)).toBeTruthy(),
    )
  })
})

describe('AgendarPublico — complementos', () => {
  it('sugere opcionalmente e recalcula duração e valor', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      servicos: [
        {
          id: 'srv-corte',
          nome: 'Corte Audax',
          preco: 70,
          duracaoMin: 40,
          complementos: ['srv-barba'],
        },
        {
          id: 'srv-barba',
          nome: 'Barba',
          preco: 35,
          duracaoMin: 15,
          complementos: [],
        },
      ],
    })
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
    const complemento = screen.getByRole('button', { name: /^Barba — \d+ minutos — mais/ })
    // Sugestão: nunca pré-marcada.
    expect(complemento.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(complemento)
    expect(
      screen.getByRole('button', { name: /^Barba — \d+ minutos — mais/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByText(/Duração total do atendimento: 55 min/)).toBeTruthy()

    // A consulta de disponibilidade passa a usar a duração SOMADA.
    escolherDataPeloAtalho(diaFuturoIso())
    await waitFor(() => expect(slots).toHaveBeenCalledWith(diaFuturoIso(), 55, [
      'Cleiton',
      'Ítalo',
    ]))
  })

  it('serviço sem complementos não mostra a seção', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
    expect(screen.queryByText('Quer completar?')).toBeNull()
  })
})

describe('AgendarPublico — informações da barbearia', () => {
  it('mostra endereço, telefone e Instagram com os links oficiais', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )

    expect(
      screen.getByText('Rua Ecoporanga, 60 - Ibura de Baixo - Recife/PE'),
    ).toBeTruthy()
    expect(screen.getByText('(81) 99737-3593')).toBeTruthy()
    expect(screen.getByText('@studioaudax__')).toBeTruthy()

    const chegar = screen.getByRole('link', { name: /Como chegar/ })
    expect(chegar.getAttribute('href')).toContain('google.com/maps/search')
    expect(chegar.getAttribute('href')).toContain(encodeURIComponent('Ecoporanga'))
    expect(screen.getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain(
      'wa.me/5581997373593',
    )
    expect(
      screen.getByRole('link', { name: /Instagram/ }).getAttribute('href'),
    ).toBe('https://instagram.com/studioaudax__')
  })

  it('sem telefone oficial não mostra o botão de WhatsApp', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      barbearia: { ...CATALOGO.barbearia, telefone: '' },
    })
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )

    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull()
    // O resto continua aparecendo: falta de um dado não derruba a seção.
    expect(screen.getByRole('link', { name: /Como chegar/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Instagram/ })).toBeTruthy()
  })

  it('oferece a entrada da Área do Cliente', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )
    expect(screen.getByRole('button', { name: 'Abrir Área do Cliente' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Área do Cliente' })).toBeTruthy()
  })

  it('data de hoje é a primeira offered (nada de data passada)', async () => {
    render(<AgendarPublico />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Corte Audax/ })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: /Corte Audax/ }))
    expect(screen.getByLabelText('Escolher data').getAttribute('min')).toBe(HOJE)
  })
})