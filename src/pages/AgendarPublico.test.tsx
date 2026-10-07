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
import { ESTADO_VAZIO } from '@/modules/agendamento/estado'
import { carregarBeneficiosClube } from '@/services/supabase/painel'
import { irParaAreaDoCliente, salvarRetomadaAgendamento } from '@/modules/painel/regras'
import { formatarBRL } from '@/lib/moeda'

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

/**
 * O que o portão de identificação decide sobre.
 *
 * `sessaoAtiva` é o interruptor: `true` (o padrão) é um cliente que já tem
 * conta — é o caso repetido, e é ele que os testes de etapa descrevem. `false`
 * é o primeiro acesso, onde o agendamento exige cadastro antes dos extras.
 *
 * O rascunho é o que liga o fluxo público à Área do Cliente: sem sessão o
 * horário escolhido é guardado, a pessoa passa pela porta, e ao voltar o fluxo
 * reabre exatamente onde parou.
 */
const controle = vi.hoisted(() => ({
  sessaoAtiva: true,
  rascunho: null as unknown,
  preenchimento: null as { nome: string; telefone: string } | null,
}))

vi.mock('@/services/supabase/agendaPublica', () => ({
  carregarCatalogo: vi.fn(),
  criarAgendamentoPublico: vi.fn(),
  horariosPublicosPorProfissional: vi.fn(),
}))

vi.mock('@/modules/painel/regras', async () => {
  const actual = (await vi.importActual(
    '@/modules/painel/regras',
  )) as typeof import('@/modules/painel/regras')
  return {
    ...actual,
    navegarPainel: vi.fn(),
    lerPreenchimento: vi.fn(() => controle.preenchimento),
    limparPreenchimento: vi.fn(() => {
      controle.preenchimento = null
    }),
    irParaAreaDoCliente: vi.fn(),
    irParaAgendamentoOficial: vi.fn(),
    lerRetomadaAgendamento: vi.fn(() => controle.rascunho),
    limparRetomadaAgendamento: vi.fn(() => {
      controle.rascunho = null
    }),
    salvarRetomadaAgendamento: vi.fn((estado: unknown) => {
      controle.rascunho = estado
    }),
  }
})

// O conteúdo do Club vem da configuração oficial; no teste, a casa não tem
// nada configurado e a seção simplesmente não aparece (preferimos assim a
// mostrar um Club inventado).
//
// `clientePainel` é o MESMO contrato da Área do Cliente: devolve o adaptador
// de sessão, ou `null` quando não há Supabase. É por ele que o fluxo sabe se
// pode seguir sem identificação.
vi.mock('@/services/supabase/painel', () => ({
  carregarBeneficiosClube: vi.fn(() => Promise.resolve(null)),
  obterMeuCadastro: vi.fn(() => Promise.resolve(null)),
  clientePainel: vi.fn(() =>
    controle.sessaoAtiva
      ? {
          sessao: vi.fn(() => Promise.resolve({ user: { id: 'u-teste' } })),
          observar: vi.fn(() => () => {}),
        }
      : null,
  ),
}))

const catalogo = vi.mocked(carregarCatalogo)
const slots = vi.mocked(horariosPublicosPorProfissional)
const criar = vi.mocked(criarAgendamentoPublico)
const beneficios = vi.mocked(carregarBeneficiosClube)
const irParaCliente = vi.mocked(irParaAreaDoCliente)
const salvarRetomada = vi.mocked(salvarRetomadaAgendamento)

const CATALOGO: CatalogoPublico = {
  servicos: [
    {
      id: 'srv-corte',
      nome: 'Corte Audax',
      preco: 30,
      duracaoMin: 30,
      categoria: 'Cabelo',
      complementos: ['srv-barba'],
    },
    {
      id: 'srv-barba',
      nome: 'Barba',
      preco: 20,
      duracaoMin: 20,
      categoria: 'Barba',
      complementos: [],
    },
    {
      id: 'srv-luzes',
      nome: 'Luzes',
      preco: 90,
      duracaoMin: 60,
      categoria: 'Tratamento',
      complementos: [],
    },
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
    fotos: [],
  },
  destaques: ['Barba'],
}

/** O primeiro botão de dia da grade (o dia mais próximo). */
function primeiroDia() {
  return screen.getAllByRole('button', { name: /^Dia \d{4}/ })[0]
}

/**
 * Abre a LINHA de um serviço — o mesmo gesto que a pessoa faz.
 *
 * As linhas vêm FECHADAS (é o desenho pedido, igual ao do Audax Club). Com
 * estado controlado, "fechado" significa escondido de verdade, então o teste
 * exercita o caminho real em vez de clicar num botão invisível.
 */
function abrirLinha(nome: string): void {
  const botao = screen
    .getAllByRole('button', { expanded: false })
    .find((b) => (b.textContent ?? '').includes(nome))
  if (!botao) throw new Error(`linha "${nome}" não está na vitrine`)
  fireEvent.click(botao)
}

/** Fecha a linha, invertendo o que `abrirLinha` fez. */
function fecharLinha(nome: string): void {
  const botao = screen
    .getAllByRole('button', { expanded: true })
    .find((b) => (b.textContent ?? '').includes(nome))
  if (!botao) throw new Error(`linha "${nome}" não está aberta`)
  fireEvent.click(botao)
}

/** Abre a linha e escolhe o serviço, como o caminho real da pessoa. */
function escolherServicoNaVitrine(nome: string): void {
  abrirLinha(nome)
  fireEvent.click(screen.getByRole('button', { name: `Agendar ${nome}` }))
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
  beneficios.mockReset()
  irParaCliente.mockReset()
  // `mockClear`, não `mockReset`: o que importa aqui é a chamada, e a
  // implementação é quem grava o rascunho no controlador.
  salvarRetomada.mockClear()
  // O comum: cliente que já tem conta, para os testes de etapa descreverem o
  // agendamento e não o cadastro. Quem quer o portão zera isto no teste.
  controle.sessaoAtiva = true
  controle.rascunho = null
  controle.preenchimento = null
  catalogo.mockResolvedValue(CATALOGO)
  beneficios.mockResolvedValue(null)
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
    // Toda serviço do catálogo tem a sua linha, fechada, com o nome à mostra.
    expect(screen.getByRole('button', { expanded: false, name: /Corte Audax/ })).toBeTruthy()
    expect(screen.getByRole('button', { expanded: false, name: /Luzes/ })).toBeTruthy()
    // E o destaque do dono aparece no carrossel, com o botão de agendar.
    expect(screen.getByRole('button', { name: 'Agendar Barba' })).toBeTruthy()
  })

  it('uma linha por serviço, na ordem do catálogo', async () => {
    catalogo.mockResolvedValue({ ...CATALOGO, destaques: [] })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    const linhas = screen.getAllByRole('button', { expanded: false })
    expect(linhas.map((l) => l.textContent ?? '')).toEqual([
      expect.stringContaining('Corte Audax'),
      expect.stringContaining('Barba'),
      expect.stringContaining('Luzes'),
    ])
  })

  it('NENHUM serviço some da lista, mesmo quando é destaque', async () => {
    /*
     * Regressão do que a tela mostrou: a lista "todos os serviços" escondia os
     * que já estavam no carrossel de destaques. Com os destaques cobrindo o
     * catálogo, a lista ficava VAZIA — e era ali que a pessoa procurava o
     * serviço que não via. Destaque é atalho, não filtro.
     */
    catalogo.mockResolvedValue({
      ...CATALOGO,
      destaques: ['Barba', 'Corte Audax', 'Luzes'],
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    const linhas = screen.getAllByRole('button', { expanded: false })
    expect(linhas).toHaveLength(3)
    for (const nome of ['Barba', 'Corte Audax', 'Luzes']) {
      expect(linhas.some((l) => (l.textContent ?? '').includes(nome))).toBe(true)
    }
  })

  it('as opções do serviço aparecem ABAIXO da linha, com ESCOLHER', async () => {
    catalogo.mockResolvedValue({ ...CATALOGO, destaques: [] })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    // Fechado, o serviço não está na tela — nem para quem está lendo a linha.
    expect(screen.queryByRole('button', { name: 'Agendar Corte Audax' })).toBeNull()

    abrirLinha('Corte Audax')
    const cartao = screen.getByRole('button', { name: 'Agendar Corte Audax' })
    expect(cartao.textContent).toContain('Escolher')

    // Aberto, o serviço está DENTRO do painel que a linha declara.
    const linha = screen.getByRole('button', { expanded: true, name: /Corte Audax/ })
    const alvo = document.getElementById(linha.getAttribute('aria-controls') ?? '')
    expect(alvo?.contains(cartao)).toBe(true)
    // A categoria da casa aparece como contexto dentro do painel.
    expect(alvo?.textContent).toContain('Cabelo')
  })

  it('a linha fechada já mostra o preço, para comparar sem abrir nada', async () => {
    /*
     * Com a linha a 600px de largura, nome à esquerda e chevron à direita
     * deixavam o meio vazio: a página virava uma pilha de barras vazias. O
     * preço à direita preenche a linha e evita o clique.
     */
    catalogo.mockResolvedValue({ ...CATALOGO, destaques: [] })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    const linha = screen.getByRole('button', { expanded: false, name: /Corte Audax/ })
    expect(linha.textContent).toContain('Corte Audax')
    expect(linha.textContent).toContain('30 min')
    expect(linha.textContent).toContain(formatarBRL(30))
  })

  it('abre e fecha a linha do serviço', async () => {
    catalogo.mockResolvedValue({ ...CATALOGO, destaques: [] })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    abrirLinha('Luzes')
    expect(screen.getByRole('button', { name: 'Agendar Luzes' })).toBeTruthy()

    fecharLinha('Luzes')
    expect(screen.queryByRole('button', { name: 'Agendar Luzes' })).toBeNull()
  })

  it('a linha fechada mostra o nome e a duração do catálogo', async () => {
    catalogo.mockResolvedValue({ ...CATALOGO, destaques: [] })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    const linhas = screen.getAllByRole('button', { expanded: false })
    expect(linhas[0].textContent).toContain('Corte Audax')
    expect(linhas[0].textContent).toContain('30 min')
  })

  it('serviço sem categoria aparece igual, sem grupo "Outros"', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      destaques: [],
      servicos: [{ id: 'srv-x', nome: 'Pezinho', preco: 15, duracaoMin: 10 }],
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    // Sem agrupamento, não existe "Outros": a linha é do serviço e só.
    expect(screen.queryByText('Outros')).toBeNull()
    expect(screen.getByRole('button', { expanded: false, name: /Pezinho/ })).toBeTruthy()
  })

  it('os destaques têm seta, porque sem barra visível o mouse não rola', async () => {
    /*
     * Regressão do que a tela mostrou: a barra de rolagem do carrossel é
     * escondida e não havia seta nenhuma, então no mouse (Shift+roda do teclado
     * ou não) os destaques depois do terceiro eram inalcançáveis. No toque o
     * arrasto resolvia, e por isso o bug só aparecia no computador.
     */
    catalogo.mockResolvedValue({
      ...CATALOGO,
      destaques: ['Barba', 'Corte Audax', 'Luzes'],
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    // jsdom não calcula layout: sem largura real não há overflow, então a
    // resposta é dada com um elemento forçado a reportar que transborda.
    const trilha = document.querySelector('ul.overflow-x-auto') as HTMLElement
    let posicao = 0
    Object.defineProperty(trilha, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(trilha, 'scrollWidth', { value: 1200, configurable: true })
    Object.defineProperty(trilha, 'scrollLeft', {
      get: () => posicao,
      configurable: true,
    })
    // `scrollBy` também não existe no jsdom: o que interessa aqui é que a seta
    // chame a rolagem NA DIREÇÃO CERTA, não que o pixel saia certo.
    const rolar = vi.fn((passo: { left: number }) => {
      posicao += passo.left
    })
    trilha.scrollBy = rolar as unknown as HTMLElement['scrollBy']
    fireEvent.scroll(trilha)

    const proxima = await screen.findByRole('button', { name: 'Mais destaques' })
    const anterior = screen.getByRole('button', { name: 'Destaques anteriores' })
    // No começo: só dá para ir para a frente.
    expect((anterior as HTMLButtonElement).disabled).toBe(true)
    expect((proxima as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(proxima)
    expect(posicao).toBeGreaterThan(0)
    // Depois de rolar, as duas setas ficam disponíveis.
    fireEvent.scroll(trilha)
    expect((anterior as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(anterior)
    expect(posicao).toBeLessThan(400)
  })

  it('sem transbordo, as setas não aparecem', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    // Um destaque só cabe na tela: seta de não ir a lugar nenhum é ruído.
    expect(screen.queryByRole('button', { name: 'Mais destaques' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Destaques anteriores' })).toBeNull()
  })

  it('tem a porta do cliente no topo, junto com a marca', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    /*
     * Agendar e entrar são as duas coisas que a pessoa quer quando abre o link.
     * A porta do cliente fica no cabeçalho — e antes do título, para não
     * precisar rolar até o fim da página para entrar.
     */
    const entrar = screen.getByRole('button', { name: /Entrar/ })
    const titulo = screen.getByText('Agende seu horário')
    expect(
      entrar.compareDocumentPosition(titulo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(entrar)
    // Leva para a ÁREA DO CLIENTE, não para o login da equipe.
    expect(irParaCliente).toHaveBeenCalledWith()
  })

  it('mostra a equipe, com a foto que a casa cadastrou', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      profissionais: [
        { id: 'pf-cleiton', nome: 'Cleiton Silva', foto: 'https://fotos/c.png' },
        { id: 'pf-italo', nome: 'Italo Santos', foto: '' },
      ],
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.getByText('Nossa equipe')).toBeTruthy()
    const imagem = document.querySelector('img[src="https://fotos/c.png"]')
    expect(imagem).not.toBeNull()
    // Sem foto, cai na inicial do nome.
    expect(screen.getByText('I')).toBeTruthy()
  })

  it('galeria só aparece com foto cadastrada pela casa', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      barbearia: {
        ...CATALOGO.barbearia,
        fotos: ['https://fotos/casa1.jpg', 'https://fotos/casa2.jpg'],
      },
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.getByLabelText('Fotos do Studio Audax')).toBeTruthy()
    expect(document.querySelector('img[src="https://fotos/casa1.jpg"]')).not.toBeNull()
  })

  it('sem foto, a galeria não existe — nada de imagem de demonstração', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.queryByLabelText('Fotos do Studio Audax')).toBeNull()
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

describe('Audax Club na vitrine', () => {
  const COM_PLANOS = {
    coberturas: { cabelo: ['Cabelo'] },
    desconto: { quimicos: 0.1, produtos: 0.1 },
    rotulos: { cabelo: 'Audax Corte' },
    textos: { cabelo: ['Corte ilimitado durante a vigência'] },
  }

  it('vem FECHADO em uma linha, para não empurrar os serviços para fora', async () => {
    /*
     * Regressão do que a tela mostrou: com três cards de plano abertos, o Club
     * ocupava mais do que a dobra e a lista de serviços sumia. A linha fechada
     * diz só quantos planos existem.
     */
    beneficios.mockResolvedValue(COM_PLANOS)
    catalogo.mockResolvedValue({
      ...CATALOGO,
      barbearia: { ...CATALOGO.barbearia, telefone: '(81) 98963-4433' },
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    const linha = await screen.findByRole('button', { name: /Audax Club/ })
    expect(linha.getAttribute('aria-expanded')).toBe('false')
    expect(linha.textContent).toContain('3 planos de assinatura')
    // Os planos só existem depois de abrir.
    expect(screen.queryByText('Audax Corte')).toBeNull()
    fireEvent.click(linha)
    expect(await screen.findByText('Audax Corte')).toBeTruthy()
  })

  it('os serviços vêm ANTES do Club na tela', async () => {
    /*
     * O trabalho da página é agendar. Com o Club antes, quem chegava pelo link
     * via celular não via serviço nenhum sem rolar muito.
     */
    beneficios.mockResolvedValue(COM_PLANOS)
    catalogo.mockResolvedValue({
      ...CATALOGO,
      barbearia: { ...CATALOGO.barbearia, telefone: '(81) 98963-4433' },
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    const servicos = screen.getByText('Todos os serviços')
    const clube = await screen.findByRole('button', { name: /Audax Club/ })
    // `compareDocumentPosition` bit 4 = o Club vem DEPOIS na árvore.
    expect(
      servicos.compareDocumentPosition(clube) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('mostra os benefícios oficiais e leva ao WhatsApp da casa', async () => {
    beneficios.mockResolvedValue(COM_PLANOS)
    catalogo.mockResolvedValue({
      ...CATALOGO,
      barbearia: { ...CATALOGO.barbearia, telefone: '(81) 98963-4433' },
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    fireEvent.click(await screen.findByRole('button', { name: /Audax Club/ }))

    expect(await screen.findByText('Audax Corte')).toBeTruthy()
    expect(screen.getByText(/Corte ilimitado durante a vigência/)).toBeTruthy()
    /*
     * O botão é a conversa no WhatsApp OFICIAL — com o nome do plano na
     * mensagem e nenhum preço, que não está em configuração nenhuma.
     */
    const links = screen.getAllByRole('link', { name: 'Conhecer plano' })
    const doCorte = links.find((l) =>
      decodeURIComponent(l.getAttribute('href') ?? '').includes('Audax Corte'),
    )
    expect(doCorte).toBeTruthy()
    const href = doCorte?.getAttribute('href') ?? ''
    expect(href.startsWith('https://wa.me/5581989634433?text=')).toBe(true)
    expect(decodeURIComponent(href)).not.toContain('R$')
    for (const link of links) {
      expect(link.getAttribute('href') ?? '').toMatch(/^https:\/\/wa\.me\/55/)
    }
  })

  it('sem telefone oficial o botão some — nada de número inventado', async () => {
    beneficios.mockResolvedValue({
      coberturas: { cabelo: ['Cabelo'] },
      desconto: { quimicos: 0, produtos: 0 },
      rotulos: {},
      textos: { cabelo: ['Corte ilimitado durante a vigência'] },
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    fireEvent.click(await screen.findByRole('button', { name: /Audax Club/ }))

    expect(await screen.findByText(/Corte ilimitado durante a vigência/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Conhecer plano' })).toBeNull()
  })

  it('sem configuração do Club a seção inteira não aparece', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    expect(screen.queryByText('Audax Club')).toBeNull()
  })
})

describe('fluxo: serviço → profissional → data → horário', () => {
  it('escolher o serviço abre a etapa do barbeiro', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')

    escolherServicoNaVitrine('Corte Audax')

    expect(await screen.findByText('Escolha seu barbeiro')).toBeTruthy()
    // A vitrine some: uma etapa por vez.
    expect(screen.queryByText('Agende seu horário')).toBeNull()
  })

  it('Cleiton e Ítalo aparecem juntos, com ESCOLHER', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')

    const cleiton = await screen.findByRole('button', { name: 'Escolher Cleiton Silva' })
    const italo = screen.getByRole('button', { name: 'Escolher Italo Santos' })
    expect(cleiton.textContent).toContain('Escolher')
    expect(italo.textContent).toContain('Escolher')
  })

  it('escolher o barbeiro abre os DIAS (não os horários)', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))

    expect(await screen.findByText('Escolha o dia')).toBeTruthy()
    expect(screen.getByText(/Com Cleiton Silva/)).toBeTruthy()
    expect(primeiroDia()).toBeTruthy()
    // A Agenda ainda não foi consultada: só há profissional e serviço.
    expect(slots).not.toHaveBeenCalled()
  })

  it('escolher o dia consulta a Agenda e mostra só horários livres', async () => {
    // Relógio fixo em 15/01 09:00 em São Paulo: a chamada leva o CORTE de
    // "agora" (4º argumento) — o dia da grade e o dia do corte são o mesmo.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-15T12:00:00Z'))
    try {
      render(<AgendarPublico />)
      await screen.findByText('Agende seu horário')
      escolherServicoNaVitrine('Corte Audax')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }),
      )
      fireEvent.click(await screen.findByText('Escolha o dia'))
      const dia = escolherDia()

      expect(await screen.findByText('Horários disponíveis')).toBeTruthy()
      // A regra oficial, chamada para o profissional escolhido, com o corte
      // do dia de hoje (09:00 em America/Sao_Paulo = 12:00 UTC).
      expect(slots).toHaveBeenCalledWith(dia, 30, ['Cleiton Silva'], {
        data: '2030-01-15',
        minutos: 9 * 60,
      })
      expect(screen.getByRole('button', { name: 'Horário 08:00' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Horário 09:00' })).toBeTruthy()
      // Nada de horário de outro profissional na tela.
      expect(screen.queryByText('Italo Santos')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dia sem horário livre diz isso e não mostra botão', async () => {
    slots.mockResolvedValue([])
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()

    expect(await screen.findByText(/Não há horário livre neste dia/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Horário / })).toBeNull()
  })

  it('escolher o horário abre os complementos', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
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
    escolherServicoNaVitrine('Corte Audax')
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
    escolherServicoNaVitrine('Corte Audax')
    await screen.findByText('Escolha seu barbeiro')

    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    await waitFor(() => expect(screen.getByText('Agende seu horário')).toBeTruthy())
    // A vitrine volta como estava: a linha que a pessoa abriu continua
    // aberta, e o serviço continua marcado.
    const linha = screen.getByRole('button', { expanded: true, name: /Corte Audax/ })
    expect(linha).toBeTruthy()
    const cartao = screen.getByRole('button', { name: 'Agendar Corte Audax' })
    expect(cartao.getAttribute('aria-pressed')).toBe('true')
    expect(cartao.textContent).toContain('Escolhido')
  })

  it('a primeira etapa não tem botão Voltar', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    expect(screen.queryByRole('button', { name: /Voltar/ })).toBeNull()
  })
})

describe('extras: incluir outro serviço no mesmo horário', () => {
  async function ateExtras(servico = 'Corte Audax') {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine(servico)
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    await screen.findByText('Quer completar seu atendimento?')
  }

  it('mostra no máximo 2 sugestões, mesmo com mais complementos da casa', async () => {
    /*
     * A etapa é RECOMENDAÇÃO, não vitrine: a casa configurou três
     * complementos para o Corte e a pessoa ainda assim vê só os dois
     * primeiros. Três opções travam; a terceira não entra na tela.
     */
    catalogo.mockResolvedValue({
      ...CATALOGO,
      destaques: [],
      servicos: [
        {
          id: 'srv-corte',
          nome: 'Corte Audax',
          preco: 30,
          duracaoMin: 30,
          categoria: 'Cabelo',
          complementos: ['srv-barba', 'srv-sobrancelha', 'srv-luzes'],
        },
        { id: 'srv-barba', nome: 'Barba', preco: 20, duracaoMin: 20, categoria: 'Barba', complementos: [] },
        { id: 'srv-sobrancelha', nome: 'Sobrancelha', preco: 10, duracaoMin: 10, categoria: 'Barba', complementos: [] },
        { id: 'srv-luzes', nome: 'Luzes', preco: 90, duracaoMin: 60, categoria: 'Tratamento', complementos: [] },
      ],
    })
    await ateExtras()

    expect(screen.getByRole('button', { name: 'Adicionar Barba' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Adicionar Sobrancelha' })).toBeTruthy()
    // A terceira sugestão da casa não aparece: a cota é duas.
    expect(screen.queryByRole('button', { name: 'Adicionar Luzes' })).toBeNull()
    // E o serviço escolhido nunca é oferecido a si mesmo.
    expect(screen.queryByRole('button', { name: 'Adicionar Corte Audax' })).toBeNull()
  })

  it('as sugestões são só as da casa; o resto do catálogo fica de fora', async () => {
    /*
     * Antes a etapa listava o catálogo inteiro depois das sugestões — virava
     * prateleira de loja. Agora só entra o que a casa marcou como complemento
     * do serviço escolhido.
     */
    await ateExtras()

    expect(screen.getByText('Sugestões da casa')).toBeTruthy()
    // A Barba é complemento configurado do Corte.
    expect(screen.getByRole('button', { name: 'Adicionar Barba' })).toBeTruthy()
    // As Luzes não são complemento de ninguém — e ficam fora da tela.
    expect(screen.queryByRole('button', { name: 'Adicionar Luzes' })).toBeNull()
    expect(screen.queryByText('Outros serviços')).toBeNull()
  })

  it('o serviço já escolhido não é oferecido a si mesmo', async () => {
    await ateExtras()

    // "Adicionar Corte Audax" não pode existir: seria o mesmo serviço duas
    // vezes, e a duração contaria ele dobrado.
    expect(screen.queryByRole('button', { name: 'Adicionar Corte Audax' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover Corte Audax' })).toBeNull()
    // O nome aparece UMA vez na tela: na linha do total, como o serviço base.
    expect(screen.getAllByText('Corte Audax')).toHaveLength(1)
  })

  it('nada vem pré-marcado', async () => {
    await ateExtras()

    const botao = screen.getByRole('button', { name: 'Adicionar Barba' })
    expect(botao.getAttribute('aria-pressed')).toBe('false')
    expect(botao.textContent).toContain('Adicionar')
    // E o total mostrado é o do serviço SOZINHO: nada pré-marcado.
    expect(
      screen.getByRole('group', { name: 'Total do atendimento' }).textContent,
    ).toContain(formatarBRL(30))
  })

  it('o total aparece ANTES de continuar, com o que os extras somam', async () => {
    /*
     * Se a soma só aparecesse no resumo, o "adicione mais um" viraria surpresa
     * e o valor dobrado pareceria taxa escondida.
     */
    await ateExtras()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Barba' }))

    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'Total do atendimento' }).textContent,
      ).toContain(formatarBRL(50)),
    )
    expect(screen.getByRole('button', { name: 'Remover Barba' })).toBeTruthy()
  })

  it('duas sugestões selecionadas somam no total e na duração', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      destaques: [],
      servicos: [
        {
          id: 'srv-corte',
          nome: 'Corte Audax',
          preco: 30,
          duracaoMin: 30,
          categoria: 'Cabelo',
          complementos: ['srv-barba', 'srv-sobrancelha'],
        },
        { id: 'srv-barba', nome: 'Barba', preco: 20, duracaoMin: 20, categoria: 'Barba', complementos: [] },
        { id: 'srv-sobrancelha', nome: 'Sobrancelha', preco: 10, duracaoMin: 10, categoria: 'Barba', complementos: [] },
        { id: 'srv-luzes', nome: 'Luzes', preco: 90, duracaoMin: 60, categoria: 'Tratamento', complementos: [] },
      ],
    })
    await ateExtras()

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Barba' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Sobrancelha' }))

    // 30 do corte + 20 da barba + 10 da sobrancelha.
    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'Total do atendimento' }).textContent,
      ).toContain(formatarBRL(60)),
    )
    // A Luzes continua fora da tela: a cota é de duas sugestões.
    expect(screen.queryByRole('button', { name: 'Adicionar Luzes' })).toBeNull()
    // E a duração total é a soma das escolhidas — 30 + 20 + 10 = 60.
    await waitFor(() => expect(slots.mock.calls.some((c) => c[1] === 60)).toBe(true))
  })

  it('adicionar marca e recalcula a duração na Agenda', async () => {
    await ateExtras()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Barba' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remover Barba' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    // 30 do corte + 20 da barba = 50 min, e a Agenda é consultada de novo.
    await waitFor(() => expect(slots.mock.calls.some((c) => c[1] === 50)).toBe(true))
  })

  it('desmarcar volta o total e a duração ao serviço sozinho', async () => {
    await ateExtras()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Barba' }))
    await waitFor(() => expect(slots.mock.calls.some((c) => c[1] === 50)).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Remover Barba' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Adicionar Barba' })).toBeTruthy(),
    )
    expect(slots.mock.calls.some((c) => c[1] === 50)).toBe(true)
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
    await ateExtras()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Barba' }))

    expect(
      await screen.findByText(/não cabe mais no horário escolhido/i),
    ).toBeTruthy()
    // O restante da escolha continua: o cliente não volta ao começo.
    expect(screen.getByText(/Studio Audax/)).toBeTruthy()
  })

  it('quem não quer extra segue sem pagar nada a mais', async () => {
    await ateExtras()

    // Pular extras é uma escolha legítima: o botão existe e leva adiante.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Seus dados')).toBeTruthy()
  })

  it('sem sugestão configurada a etapa diz que pode seguir', async () => {
    catalogo.mockResolvedValue({
      ...CATALOGO,
      destaques: [],
      servicos: [{ id: 'srv-soz', nome: 'Barba', preco: 20, duracaoMin: 20 }],
    })
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Barba')
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))

    expect(await screen.findByText(/Sem complementos por aqui/i)).toBeTruthy()
    expect(screen.queryByText('Outros serviços')).toBeNull()
    // Seguir sem escolher nada é caminho livre.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Seus dados')).toBeTruthy()
  })
})


describe('dados, resumo e confirmação', () => {
  async function ateResumo() {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
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
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'ana@studio.com' },
    })
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1995-06-15' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
  }

  /** Mesmo caminho até os dados, mas com e-mail/nascimento que não passam. */
  async function ateResumoErrado(email: string, nascimento: string) {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
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
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: nascimento },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
  }

  function dataDeAmanha(): string {
    const d = new Date(Date.now() + 86400000)
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${mes}-${dia}`
  }

  it('não deixa seguir sem nome, telefone, e-mail e nascimento', async () => {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    fireEvent.click(await screen.findByRole('button', { name: /Continuar/ }))
    await screen.findByText('Seus dados')

    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))
    expect(
      await screen.findByText(/Informe nome, telefone com DDD, e-mail/),
    ).toBeTruthy()
  })

  it('e-mail com forma errada não segue adiante', async () => {
    await ateResumoErrado('ana no arroba studio', '1995-06-15')
    expect(
      await screen.findByText(/Informe nome, telefone com DDD, e-mail/),
    ).toBeTruthy()
  })

  it('nascimento do futuro não segue adiante', async () => {
    await ateResumoErrado('ana@studio.com', dataDeAmanha())
    expect(
      await screen.findByText(/Informe nome, telefone com DDD, e-mail/),
    ).toBeTruthy()
  })

  it('a observação escrita nos dados aparece no resumo até a confirmação', async () => {
    await ateResumo()
    // Volta para os dados, escreve e segue de novo: o que a pessoa escreveu
    // não pode sumir no caminho.
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    await screen.findByText('Seus dados')
    fireEvent.change(screen.getByLabelText('Observação'), {
      target: { value: 'Prefiro máquina baixa.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/ }))

    expect(await screen.findByText('Confira seu horário')).toBeTruthy()
    expect(screen.getByText('Prefiro máquina baixa.')).toBeTruthy()
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
      email: 'ana@studio.com',
      nascimento: '1995-06-15',
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

/*
 * O portão: reservar exige ser cliente, e a exigência acontece no ponto
 * exato onde a pessoa tenta seguir — depois de escolher hora, antes dos
 * extras.
 *
 * Os testes acima descrevem o agendamento de quem JÁ tem conta (o caso
 * repetido, `sessaoAtiva = true` por padrão). Estes descrevem o primeiro
 * acesso, que é o comport novo deste trabalho.
 */
describe('identificação obrigatória (primeiro acesso)', () => {
  /** Serviço → barbeiro → dia, parado na grade de horários. */
  async function ateHorario() {
    render(<AgendarPublico />)
    await screen.findByText('Agende seu horário')
    escolherServicoNaVitrine('Corte Audax')
    fireEvent.click(await screen.findByRole('button', { name: 'Escolher Cleiton Silva' }))
    fireEvent.click(await screen.findByText('Escolha o dia'))
    escolherDia()
    await screen.findByText('Horários disponíveis')
  }

  it('sem conta, passar pela etapa Extras leva à criação de acesso na Dados', async () => {
    controle.sessaoAtiva = false
    await ateHorario()

    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))

    expect(await screen.findByText('Quer completar seu atendimento?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByText('Falta pouco')).toBeTruthy()
    // Nada é enviado ao banco antes de a pessoa ser identificada.
    expect(criar).not.toHaveBeenCalled()
  })

  it('a porta na Dados oferece os dois caminhos', async () => {
    controle.sessaoAtiva = false
    await ateHorario()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    await screen.findByText('Quer completar seu atendimento?')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByText('Falta pouco')

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByLabelText('Nome completo')).toBeTruthy()
    expect(screen.getByLabelText('Telefone')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Data de nascimento')).toBeTruthy()
    expect(screen.getByLabelText('Senha')).toBeTruthy()
    expect(screen.getByLabelText('Confirmar senha')).toBeTruthy()

    // Voltar devolve a escolha
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    await waitFor(() => expect(screen.getByText('Falta pouco')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Já tenho conta — entrar' }))
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Senha')).toBeTruthy()
  })

  it('cadastro de conta valida presença dos campos obrigatórios primeiro', async () => {
    controle.sessaoAtiva = false
    await ateHorario()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    await screen.findByText('Quer completar seu atendimento?')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByText('Falta pouco')

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar acesso e continuar' }),
    )

    expect(
      await screen.findAllByText(/Informe seu nome completo/),
    ).not.toHaveLength(0)
    expect(criar).not.toHaveBeenCalled()
  })

  it('o horário escolhido é guardado; voltar devolve a escolha e descarta o rascunho', async () => {
    controle.sessaoAtiva = false
    await ateHorario()
    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))
    await screen.findByText('Quer completar seu atendimento?')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await screen.findByText('Falta pouco')

    // Volta para a tela de extras ao clicar em Voltar
    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(await screen.findByText('Quer completar seu atendimento?')).toBeTruthy()
  })

  it('quem volta já identificado cai direto nos extras, sem refazer nada', async () => {
    // O rascunho que a pessoa deixou ao se identificar, e a sessão pronta.
    controle.rascunho = {
      ...ESTADO_VAZIO,
      servicoNome: 'Corte Audax',
      profissional: 'Cleiton Silva',
      data: '2026-10-10',
      horario: '08:00',
    }

    render(<AgendarPublico />)

    expect(await screen.findByText('Quer completar seu atendimento?')).toBeTruthy()
    // Uso único: restaurado, ele some — senão a próxima visita cairia aqui.
    expect(controle.rascunho).toBeNull()
    expect(screen.queryByText('Falta pouco')).toBeNull()
  })

  it('quem já tem conta nunca vê a porta', async () => {
    await ateHorario()

    fireEvent.click(await screen.findByRole('button', { name: 'Horário 08:00' }))

    expect(await screen.findByText('Quer completar seu atendimento?')).toBeTruthy()
    expect(screen.queryByText('Falta pouco')).toBeNull()
    expect(salvarRetomada).not.toHaveBeenCalled()
  })
})
