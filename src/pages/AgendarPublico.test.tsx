import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgendarPublico from './AgendarPublico'
import {
  carregarCatalogo,
  criarAgendamentoPublico,
  horariosPublicosPorProfissional,
  type CatalogoPublico,
} from '@/services/supabase/agendaPublica'
import type { SlotLivre } from '@/modules/agenda/regras'

/**
 * O fluxo do agendamento público, passo a passo.
 *
 * O que estes testes travam é o COMPORTAMENTO que o dono pediu:
 *   • vitrine com catálogo oficial e botão ESCOLHER em cada serviço;
 *   • uma etapa por vez, na ordem serviço → profissional → data → horário →
 *     complementos → dados → resumo → confirmação;
 *   • Cleiton e Ítalo aparecem juntos na etapa de profissional;
 *   • os horários vêm da Agenda e são os do profissional escolhido;
 *   • complemento vem de `servicos.complementos`, recalcula valor e duração e
 *     devolve o horário quando não cabe mais;
 *   • horário tomado no envio não confirma nem perde o que já foi escolhido.
 *
 * A disponibilidade NÃO é testada aqui: ela é `horariosLivresPorProfissional`,
 * coberto pelos testes do módulo da Agenda. Aqui verificamos que a tela usa a
 * função oficial e respeita o que ela devolve.
 */

vi.mock('@/services/supabase/agendaPublica', () => ({
  carregarCatalogo: vi.fn(),
  criarAgendamentoPublico: vi.fn(),
  horariosPublicosPorProfissional: vi.fn(),
}))

vi.mock('@/modules/painel/regras', () => ({
  navegarPainel: vi.fn(),
  lerPreenchimento: vi.fn(() => null),
  limparPreenchimento: vi.fn(),
  irParaAreaDoCliente: vi.fn(),
  irParaAgendamentoOficial: vi.fn(),
}))

// O conteúdo do Club vem da configuração oficial; no teste, a casa não tem
// nada configurado e a seção simplesmente não aparece (preferimos assim a
// mostrar um Club inventado).
vi.mock('@/services/supabase/painel', () => ({
  carregarBeneficiosClube: vi.fn(() => Promise.resolve(null)),
}))

const catalogo = vi.mocked(carregarCatalogo)
const slots = vi.mocked(horariosPublicosPorProfissional)
const criar = vi.mocked(criarAgendamentoPublico)

const CATALOGO: CatalogoPublico = {
  servicos: [
    {
      id: 'srv-corte',
      nome: 'Corte Audax',
      preco: 30,
      duracaoMin: 30,
      complementos: ['srv-barba'],
    },
    { id: 'srv-barba', nome: 'Barba', preco: 20, duracaoMin: 20, complementos: [] },
  ],
  profissionais: [
    { id: 'pf-cleiton', nome: 'Cleiton Silva', foto: '' },
    { id: 'pf-italo', nome: 'Italo Santos', foto: '' },
  ],
  barbearia: {
    endereco: 'Rua Ecoporanga, 60 - Ibura de Baixo - Recife/PE',
    telefone: '',
    instagram: '@studioaudax__',
    mapa: '',
  },
  destaques: ['Barba'],
}

/** O primeiro botão de dia da grade (o dia mais próximo). */
function primeiroDia() {
  return screen.getAllByRole('button', { name: /^Dia \d{4}/ })[0]
}

function escolherDia(): string {
  const botao = primeiroDia()
  const rotulo = botao.getAttribute('aria-label') ?? ''
  const iso = rotulo.replace('Dia ', '')
  fireEvent.click(botao)
  return iso
}

beforeEach(() => {
  catalogo.mockReset()
  slots.mockReset()
  criar.mockReset()
  catalogo.mockResolvedValue(CATALOGO)
  // 08:00 e 09:00 livres; 10:00 ocupado. A grade é a REAL devolvida pela Agenda.
  slots.mockResolvedValue([
    { horario: '08:00', profissionais: ['Cleiton Silva'] },
    { horario: '09:00', profissionais: ['Cleiton Silva'] },
    { horario: '10:00', profissionais: ['Cleiton Silva'] },
  ] satisfies SlotLivre[])
  criar.mockResolvedValue({ ok: true, id: 'ag-1' })
  window.location.hash = ''
})

describe('vitrine (primeira tela)', () => {
  it('abre direto em SERVIÇO, com o catálogo oficial', async () => {
    render(<AgendarPublico />)

    expect(await screen.findByText('Agende seu horário')).toBeTruthy()
    // Serviço do catálogo, com nome e preço vindos do banco.
    expect(screen.getByRole('button', { name: /^Corte Audax - R\$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Barba - R\$/ })).toBeTruthy()
  })

  it('cada serviço tem o botão ESCOLHER escrito', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    for (const nome of ['Corte Audax', 'Barba']) {
      const cartao = screen.getByRole('button', { name: new RegExp(`^${nome} -`) })
      expect(cartao.textContent).toContain('Escolher')
      expect(cartao.textContent).toContain('min')
    }
  })

  it('os destaques escolhidos pelo dono têm seção própria', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.getByText('Destaques da casa')).toBeTruthy()
    // O destaque não é repetido na lista de todos.
    const cartoesBarba = screen.getAllByRole('button', { name: /^Barba - R\$/ })
    expect(cartoesBarba).toHaveLength(1)
  })

  it('sem destaques configurados, a seção some', async () => {
    catalogo.mockResolvedValue({ ...CATALOGO, destaques: [] })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.queryByText('Destaques da casa')).toBeNull()
    // E o serviço continua disponível na lista completa.
    expect(screen.getByRole('button', { name: /^Barba - R\$/ })).toBeTruthy()
  })

  it('mostra os dados públicos da casa', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.getByText(/Rua Ecoporanga/)).toBeTruthy()
    expect(screen.getByText('@studioaudax__')).toBeTruthy()
  })

  it('catálogo sem serviço mostra estado honesto', async () => {
    catalogo.mockResolvedValue({
      servicos: [],
      profissionais: CATALOGO.profissionais,
      barbearia: CATALOGO.barbearia,
      destaques: [],
    })
    render(<AgendarPublico />)

    expect(await screen.findByText(/Nenhum serviço disponível/)).toBeTruthy()
  })
})

describe('fluxo: serviço → profissional → data → horário', () => {
  it('escolher o serviço abre a etapa do barbeiro', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))

    expect(await screen.findByText('Escolha seu barbeiro')).toBeTruthy()
    // A vitrine some: uma etapa por vez.
    expect(screen.queryByText('Agende seu horário')).toBeNull()
  })

  it('Cleiton e Ítalo aparecem juntos, com ESCOLHER', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))

    const cleiton = await screen.findByRole('button', { name: 'Escolher Cleiton Silva' })
    const italo = screen.getByRole('button', { name: 'Escolher Italo Santos' })
    expect(cleiton.textContent).toContain('Escolher')
    expect(italo.textContent).toContain('Escolher')
  })

  it('escolher o barbeiro abre os DIAS (não os horários)', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))

    expect(await screen.findByText('Escolha o dia')).toBeTruthy()
    expect(screen.getByText(/Com Cleiton Silva/)).toBeTruthy()
    expect(primeiroDia()).toBeTruthy()
    // A Agenda ainda não foi consultada: só há profissional e serviço.
    expect(slots).not.toHaveBeenCalled()
  })

  it('escolher o dia consulta a Agenda e mostra só horários livres', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    const dia = escolherDia()

    expect(await screen.findByText('Horários disponíveis')).toBeTruthy()
    // A regra oficial, chamada para o profissional escolhido.
    expect(slots).toHaveBeenCalledWith(dia, 30, ['Cleiton Silva'])
    expect(screen.getByRole('button', { name: 'Horário 08:00' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Horário 09:00' })).toBeTruthy()
    // Nada de horário de outro profissional na tela.
    expect(screen.queryByText('Italo Santos')).toBeNull()
  })

  it('dia sem horário livre diz isso e não mostra botão', async () => {
    slots.mockResolvedValue([])
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()

    expect(await screen.findByText(/Não há horário livre neste dia/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Horário / })).toBeNull()
  })

  it('escolher o horário abre os complementos', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))

    expect(await screen.findByText('Quer completar seu atendimento?')).toBeTruthy()
  })
})

describe('voltar', () => {
  it('volta uma etapa sem perder as escolhas', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    const dia = escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 09:00' }))
    await screen.findByText('Quer completar seu atendimento?')

    // Um passo para trás: a grade de horários volta, com a data ainda escolhida.
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    await waitFor(() => expect(screen.getByText('Horários disponíveis')).toBeTruthy())
    expect(screen.getByText(new RegExp(dia.split('-').reverse().join('/')))).toBeTruthy()
    // E o 09:00 continua marcado como escolhido.
    expect(
      screen.getByRole('button', { name: 'Horário 09:00' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('voltar do barbeiro devolve para a vitrine com o serviço marcado', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    await screen.findByText('Escolha seu barbeiro')

    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    await waitFor(() => expect(screen.getByText('Agende seu horário')).toBeTruthy())
    const cartao = screen.getByRole('button', { name: /^Corte Audax - R\$/ })
    expect(cartao.getAttribute('aria-pressed')).toBe('true')
    expect(cartao.textContent).toContain('Escolhido')
  })

  it('a primeira etapa não tem botão Voltar', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    expect(screen.queryByRole('button', { name: /Voltar/ })).toBeNull()
  })
})

describe('complementos', () => {
  async function ateComplementos() {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    await screen.findByText('Quer completar seu atendimento?')
  }

  it('sugere só o que a casa configurou para o serviço', async () => {
    await ateComplementos()

    // "Barba" é complemento do Corte no catálogo...
    expect(screen.getByRole('button', { name: /Barba.*20 min/ })).toBeTruthy()
    // ...e o próprio serviço não aparece como complemento de si mesmo.
    expect(screen.queryByRole('button', { name: /Corte Audax.*ADICIONAR/i })).toBeNull()
  })

  it('nada vem pré-marcado', async () => {
    await ateComplementos()
    const botao = screen.getByRole('button', { name: /Barba.*20 min/ })
    expect(botao.getAttribute('aria-pressed')).toBe('false')
    expect(botao.textContent).toContain('Adicionar')
  })

  it('adicionar marca e recalcula a duração na Agenda', async () => {
    await ateComplementos()
    fireEvent.click(screen.getByRole('button', { name: /Barba.*20 min/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Barba.*20 min/ }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    )
    // 30 do corte + 20 da barba = 50 min, e a Agenda é consultada de novo.
    await waitFor(() =>
      expect(slots.mock.calls.some((c) => c[1] === 50)).toBe(true),
    )
  })

  it('complemento que não cabe devolve o horário e avisa', async () => {
    // Com a barba o 08:00 não existe mais na grade.
    slots.mockImplementation(async (_d, duracao) =>
      duracao > 30
        ? [{ horario: '09:30', profissionais: ['Cleiton Silva'] }]
        : ([
            { horario: '08:00', profissionais: ['Cleiton Silva'] },
            { horario: '09:00', profissionais: ['Cleiton Silva'] },
          ] as SlotLivre[]),
    )
    await ateComplementos()
    fireEvent.click(screen.getByRole('button', { name: /Barba.*20 min/ }))

    expect(
      await screen.findByText(/não cabe mais no horário escolhido/i),
    ).toBeTruthy()
    // O restante da escolha continua: o cliente não volta ao começo.
    expect(screen.getByText(/Studio Audax/)).toBeTruthy()
  })

  it('serviço sem complemento diz que a casa não cadastrou', async () => {
    // Recomeça escolhendo a Barba, que não tem complementos.
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Barba - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))

    expect(
      await screen.findByText(/não cadastrou complementos/i),
    ).toBeTruthy()
  })
})

describe('dados, resumo e confirmação', () => {
  async function ateResumo() {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    fireEvent.click(await screen.findByRole('button', { name: /Continuar/ }))
    await screen.findByText('Seus dados')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Souza' } })
    fireEvent.change(screen.getByLabelText('Telefone com DDD'), {
      target: { value: '81999999999' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
  }

  it('não deixa seguir sem nome e telefone', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    fireEvent.click(screen.getByRole('button', { name: /^Corte Audax - R\$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    fireEvent.click(await screen.findByRole('button', { name: /Continuar/ }))
    await screen.findByText('Seus dados')

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(
      await screen.findByText(/Informe um nome e um telefone com DDD/),
    ).toBeTruthy()
  })

  it('o resumo mostra serviço, profissional, data, horário, duração e valor', async () => {
    await ateResumo()

    expect(await screen.findByText('Confira seu horário')).toBeTruthy()
    expect(screen.getByText('Corte Audax')).toBeTruthy()
    expect(screen.getByText('Cleiton Silva')).toBeTruthy()
    expect(screen.getByText('08:00')).toBeTruthy()
    expect(screen.getByText('30 min')).toBeTruthy()
    expect(screen.getByText('R$ 30,00')).toBeTruthy()
    // E o endereço oficial da casa.
    expect(screen.getByText(/Rua Ecoporanga/)).toBeTruthy()
  })

  it('confirmar cria o agendamento e mostra a confirmação', async () => {
    await ateResumo()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar agendamento/ }))

    expect(await screen.findByText('Agendamento confirmado!')).toBeTruthy()
    expect(criar).toHaveBeenCalledWith({
      cliente: 'Ana Souza',
      telefone: '81999999999',
      servico: 'Corte Audax',
      profissional: 'Cleiton Silva',
      data: expect.any(String),
      horario: '08:00',
      observacao: '',
      complementos: [],
    })
    // A confirmação mostra os mesmos dados.
    expect(screen.getByText('Cleiton Silva')).toBeTruthy()
    expect(screen.getByText('08:00')).toBeTruthy()
  })

  it('horário tomado entre a lista e o envio NÃO confirma', async () => {
    await ateResumo()
    criar.mockResolvedValue({ ok: false, erro: 'Horário ocupado.' })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar agendamento/ }))

    expect(await screen.findByText('Horário ocupado.')).toBeTruthy()
    expect(screen.queryByText('Agendamento confirmado!')).toBeNull()
    // Volta para os horários, sem perder serviço, profissional e dia.
    await waitFor(() => expect(screen.getByText('Horários disponíveis')).toBeTruthy())
    expect(slots.mock.calls.length).toBeGreaterThan(0)
  })

  it('a confirmação oferece voltar ao início e o agendamento do cliente', async () => {
    await ateResumo()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar agendamento/ }))
    await screen.findByText('Agendamento confirmado!')

    expect(screen.getByRole('button', { name: /Ver meu agendamento/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao início/ }))
    expect(await screen.findByText('Agende seu horário')).toBeTruthy()
  })
})
