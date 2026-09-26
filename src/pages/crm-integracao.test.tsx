import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { CrmProvider, useCrm } from '@/modules/crm/store'
import { MarketingProvider } from '@/modules/marketing/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import { WhatsProvider, useWhats } from '@/modules/whatsapp/store'
import Crm from './Crm'

const HOJE = hojeISO()
const CHAVE_WHATS = 'studio-audax:whatsapp:v1'
const CHAVE_CRM = 'studio-audax:crm:v1'

let ctxAgenda: ReturnType<typeof useAgenda>
let ctxClientes: ReturnType<typeof useClientes>
let ctxCrm: ReturnType<typeof useCrm>
let ctxWhats: ReturnType<typeof useWhats>

function Captura() {
  const agenda = useAgenda()
  const clientes = useClientes()
  const crm = useCrm()
  const whats = useWhats()
  useEffect(() => {
    ctxAgenda = agenda
    ctxClientes = clientes
    ctxCrm = crm
    ctxWhats = whats
  })
  return null
}

function env(elemento: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ClubeProvider>
                <CrmProvider>
                  <MarketingProvider>
                    <WhatsProvider>
                      <Captura />
                      {elemento}
                    </WhatsProvider>
                  </MarketingProvider>
                </CrmProvider>
              </ClubeProvider>
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function concluir(clienteNome: string, dataRel: number, servico: string) {
  const ag = ctxAgenda.adicionar({
    cliente: clienteNome,
    telefone: '',
    servico,
    profissional: 'Audax',
    data: somarDias(HOJE, dataRel),
    horario: '10:00',
    observacao: '',
  })
  ctxAgenda.mudarStatus(ag.id, 'concluido')
}

/** Ana: recorrente (4 visitas, última há 5 dias) com futuro marcado.
 *  Bruno: sem retorno (1 visita há 50 dias). */
function semear() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Ana Souza',
      telefone: '(11) 91111-2222',
      email: '',
      observacao: '',
    })
    ctxClientes.adicionar({
      nome: 'Bruno Lima',
      telefone: '',
      email: '',
      observacao: '',
    })
    concluir('Ana Souza', -65, 'Corte Degradê')
    concluir('Ana Souza', -45, 'Corte Degradê')
    concluir('Ana Souza', -25, 'Barba')
    concluir('Ana Souza', -5, 'Barba')
    ctxAgenda.adicionar({
      cliente: 'Ana Souza',
      telefone: '',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: somarDias(HOJE, 3),
      horario: '14:00',
      observacao: '',
    })
    concluir('Bruno Lima', -50, 'Corte Degradê')
  })
}

function cardDe(nome: string): HTMLElement {
  return screen.getByText(nome).closest('li') as HTMLElement
}

beforeEach(() => {
  localStorage.clear()
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxCrm = undefined as unknown as ReturnType<typeof useCrm>
  ctxWhats = undefined as unknown as ReturnType<typeof useWhats>
})

describe('CRM — segmentação com dados reais', () => {
  it('classifica e exibe os segmentos calculados na lista', () => {
    env(<Crm />)
    semear()

    const ana = cardDe('Ana Souza')
    const bruno = cardDe('Bruno Lima')
    expect(within(ana).getByText('Recorrente')).toBeTruthy()
    expect(within(bruno).getByText('Sem retorno')).toBeTruthy()
    expect(within(ana).getByText('4 atendimento(s)')).toBeTruthy()
    expect(within(bruno).getByText('1 atendimento(s)')).toBeTruthy()
    expect(screen.getByText(/2 cliente\(s\) analisado\(s\)/)).toBeTruthy()
  })

  it('busca por nome filtra a lista', () => {
    env(<Crm />)
    semear()
    fireEvent.change(screen.getByLabelText('Buscar cliente'), {
      target: { value: 'Bruno' },
    })
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.getByText(/1 exibido\(s\)/)).toBeTruthy()
  })

  it('filtro por segmento mostra apenas o segmento escolhido', () => {
    env(<Crm />)
    semear()
    fireEvent.click(screen.getByRole('button', { name: 'Sem retorno' }))
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(screen.getByText('Ana Souza')).toBeTruthy()
  })
})

describe('CRM — detalhe, interações e ações rápidas', () => {
  it('valida e registra nota de interação preservando o histórico', async () => {
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))
    expect(screen.getByRole('heading', { name: 'Ana Souza' })).toBeTruthy()
    expect(screen.getByText('a cada 20 dia(s)')).toBeTruthy()

    fireEvent.click(screen.getByText('Salvar interação'))
    expect(
      screen.getByText('Informe a interação (mínimo 3 letras).'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Nova interação'), {
      target: { value: 'Cliente quer lembrete no WhatsApp.' },
    })
    fireEvent.click(screen.getByText('Salvar interação'))
    expect(
      screen.getByText('Cliente quer lembrete no WhatsApp.'),
    ).toBeTruthy()
    expect(ctxCrm.interacoes).toHaveLength(1)

    const salvo = JSON.parse(localStorage.getItem(CHAVE_CRM) ?? '[]')
    expect(salvo[0].texto).toBe('Cliente quer lembrete no WhatsApp.')

    // reabrir o detalhe: nota continua lá (histórico não é apagado)
    fireEvent.click(screen.getByLabelText('Fechar'))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ana Souza' })).toBeNull(),
    )
    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))
    expect(
      screen.getByText('Cliente quer lembrete no WhatsApp.'),
    ).toBeTruthy()
  })

  it('ação rápida Agendar abre o modal de novo agendamento', () => {
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Bruno Lima')).getByText('Agendar'))
    expect(screen.getByText('Novo agendamento')).toBeTruthy()
    expect(
      (screen.getByLabelText('Cliente *') as HTMLInputElement).value,
    ).toBe('Bruno Lima')
  })
})

describe('CRM — WhatsApp preparado sem integração', () => {
  it('template de confirmação cria pendente; Enviar recusa sem integração', async () => {
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))

    fireEvent.click(screen.getByRole('button', { name: 'Confirmação' }))
    const mensagens: {
      status: string
      texto: string
      template: string
    }[] = JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0].status).toBe('pendente')
    expect(mensagens[0].template).toBe('confirmacao')
    expect(mensagens[0].texto).toContain('Corte Degradê')
    expect(mensagens[0].texto).toContain('Audax')

    const linha = screen
      .getByText(mensagens[0].texto)
      .closest('li') as HTMLElement
    expect(within(linha).getByText('Pendente')).toBeTruthy()

    fireEvent.click(within(linha).getByText('Enviar'))
    expect(
      await screen.findByText(/Integração com WhatsApp não configurada/),
    ).toBeTruthy()
    // nada foi enviado: continua pendente
    const depois: { status: string }[] = JSON.parse(
      localStorage.getItem(CHAVE_WHATS) ?? '[]',
    )
    expect(depois[0].status).toBe('pendente')

    fireEvent.click(within(linha).getByText('Marcar enviada'))
    await waitFor(() =>
      expect(within(linha).getByText('Enviada')).toBeTruthy(),
    )
    const final: { status: string }[] = JSON.parse(
      localStorage.getItem(CHAVE_WHATS) ?? '[]',
    )
    expect(final[0].status).toBe('enviada')
  })

  it('sem agendamento futuro o botão de confirmação fica indisponível', () => {
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Bruno Lima')).getByText('Detalhe'))
    expect(
      (screen.getByRole('button', { name: 'Confirmação' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Lembrete' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Reativação' }))
    const mensagens: { status: string; texto: string }[] = JSON.parse(
      localStorage.getItem(CHAVE_WHATS) ?? '[]',
    )
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0].status).toBe('pendente')
    expect(mensagens[0].texto).toContain('Bruno Lima')
    expect(ctxWhats.mensagens[0].origem).toBe('crm')
  })
})

describe('CRM — aniversariantes, produtos e marketing', () => {
  it('KPI de aniversários e badge no card mostram quem faz aniversário no mês', () => {
    env(<Crm />)
    semear()
    const mes = HOJE.slice(5, 7)
    act(() => {
      ctxClientes.adicionar({
        nome: 'Clara Duarte',
        telefone: '',
        email: '',
        observacao: '',
        nascimento: `${HOJE.slice(0, 4)}-${mes}-15`,
      })
    })
    const kpi = screen.getByText('Aniversários').parentElement as HTMLElement
    expect(within(kpi).getByText('1')).toBeTruthy()
    expect(
      within(cardDe('Clara Duarte')).getByText(`Aniversário 15/${mes}`),
    ).toBeTruthy()
  })

  it('detalhe exibe os produtos comprados derivados do caixa', () => {
    localStorage.setItem(
      'studio-audax:caixa:lancamentos:v1',
      JSON.stringify([
        {
          id: 'l-prod-1',
          tipo: 'receita',
          origem: 'produto',
          data: HOJE,
          hora: '11:00',
          descricao: 'Venda de produtos',
          valor: 60,
          desconto: 0,
          valorLiquido: 60,
          formaPagamento: 'pix',
          cliente: 'Ana Souza',
          itens: [{ produto: 'Pomada modeladora', quantidade: 2 }],
          criadoEm: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))
    expect(screen.getByText('Produtos comprados:')).toBeTruthy()
    expect(screen.getByText('Pomada modeladora (2)')).toBeTruthy()
  })

  it('botão Marketing abre públicos e cria/remove listas de público', () => {
    env(<Crm />)
    semear()
    fireEvent.click(screen.getByRole('button', { name: 'Marketing' }))
    expect(
      screen.getByRole('heading', { name: 'Marketing e campanhas' }),
    ).toBeTruthy()
    expect(
      screen.getByText('Mais de 90 dias sem visita — foco de reativação'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Nome da lista'), {
      target: { value: 'Reativação' },
    })
    fireEvent.change(screen.getByLabelText('Público'), {
      target: { value: 'inativos' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar lista' }))
    const salvo: { nome: string; publico: string }[] = JSON.parse(
      localStorage.getItem('studio-audax:marketing:v1') ?? '[]',
    )
    expect(salvo).toHaveLength(1)
    expect(salvo[0]).toMatchObject({ nome: 'Reativação', publico: 'inativos' })

    fireEvent.change(screen.getByLabelText('Nome da lista'), {
      target: { value: 'reativação' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar lista' }))
    expect(
      screen.getByText('Já existe uma lista com este nome.'),
    ).toBeTruthy()
    expect(
      JSON.parse(localStorage.getItem('studio-audax:marketing:v1') ?? '[]'),
    ).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('Nome da lista'), {
      target: { value: 'Recorrentes do mês' },
    })
    fireEvent.change(screen.getByLabelText('Público'), {
      target: { value: 'recorrentes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar lista' }))
    const lista = screen
      .getByText('Recorrentes do mês')
      .closest('li') as HTMLElement
    expect(within(lista).getByText('Ana Souza')).toBeTruthy()

    fireEvent.click(within(lista).getByRole('button', { name: 'Remover' }))
    expect(screen.queryByText('Recorrentes do mês')).toBeNull()
    const depois: { nome: string }[] = JSON.parse(
      localStorage.getItem('studio-audax:marketing:v1') ?? '[]',
    )
    expect(depois.map((l) => l.nome)).toEqual(['Reativação'])
  })
})

describe('CRM — assistente de texto da IA no WhatsApp', () => {
  it('gera rascunho personalizado e cria pendente com origem ia', () => {
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))

    fireEvent.click(screen.getByRole('button', { name: 'Sugerir com IA' }))
    // rascunho = texto oficial + toque pessoal (4 visitas, Audax preferido)
    expect(screen.getByText(/o seu preferido/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Criar mensagem pendente' }),
    )
    const mensagens: {
      status: string
      origem: string
      template: string
      texto: string
    }[] = JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0]).toMatchObject({
      status: 'pendente',
      origem: 'ia',
      template: 'confirmacao',
    })
    expect(mensagens[0].texto).toContain('Corte Degradê')
    expect(mensagens[0].texto).toContain('o seu preferido')

    // rascunho consumido e a mensagem aparece na lista do cliente
    expect(
      screen.queryByRole('button', { name: 'Criar mensagem pendente' }),
    ).toBeNull()
    expect(screen.getByText('Confirmação · ia')).toBeTruthy()
    expect(ctxWhats.integracaoAtiva).toBe(false)
  })

  it('descartar o rascunho não cria mensagem', () => {
    env(<Crm />)
    semear()
    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))

    fireEvent.click(screen.getByRole('button', { name: 'Sugerir com IA' }))
    expect(screen.getByText(/primeira visita|preferido|número/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(
      screen.queryByRole('button', { name: 'Criar mensagem pendente' }),
    ).toBeNull()
    const nada: unknown[] = JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
    expect(nada).toHaveLength(0)
  })

  it('sem dados disponíveis o assistente avisa em vez de criar', () => {
    env(<Crm />)
    act(() => {
      ctxClientes.adicionar({
        nome: 'Zilda Nunes',
        telefone: '',
        email: '',
        observacao: '',
      })
    })
    fireEvent.click(within(cardDe('Zilda Nunes')).getByText('Detalhe'))
    // nenhum template disponível: botão desabilitado, nada é criado
    expect(
      (screen.getByRole('button', { name: 'Sugerir com IA' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    const nada: unknown[] = JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
    expect(nada).toHaveLength(0)
  })
})

describe('CRM — próxima visita e histórico completo', () => {
  it('exibe a próxima visita no card e no detalhe do cliente', async () => {
    env(<Crm />)
    semear()

    expect(
      within(cardDe('Ana Souza')).getByText(/próxima \d{2}\/\d{2} às 14:00/),
    ).toBeTruthy()
    expect(
      within(cardDe('Bruno Lima')).queryByText(/próxima/),
    ).toBeNull()

    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))
    const kpiAna = screen.getByText('Próxima visita').parentElement as HTMLElement
    expect(within(kpiAna).getByText(/· 14:00/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Fechar'))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ana Souza' })).toBeNull(),
    )

    fireEvent.click(within(cardDe('Bruno Lima')).getByText('Detalhe'))
    const kpiBruno = screen
      .getByText('Próxima visita')
      .parentElement as HTMLElement
    expect(within(kpiBruno).getByText('Sem agendamento')).toBeTruthy()
  })

  it('histórico completo agrega visitas, pagamentos, interações e mensagens', () => {
    localStorage.setItem(
      'studio-audax:caixa:lancamentos:v1',
      JSON.stringify([
        {
          id: 'l-hist-1',
          tipo: 'receita',
          origem: 'atendimento',
          data: HOJE,
          hora: '11:00',
          descricao: 'Corte Degradê - Ana Souza',
          valor: 80,
          desconto: 0,
          valorLiquido: 80,
          formaPagamento: 'pix',
          cliente: 'Ana Souza',
          criadoEm: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    env(<Crm />)
    semear()
    const idAna = ctxClientes.clientes.find((c) => c.nome === 'Ana Souza')!.id
    act(() => {
      ctxCrm.adicionarInteracao({
        clienteId: idAna,
        tipo: 'nota',
        texto: 'Cliente quer lembrete por WhatsApp.',
      })
      ctxWhats.criar({
        clienteId: idAna,
        cliente: 'Ana Souza',
        template: 'reativacao',
        texto: 'Oi Ana, sentimos sua falta!',
        origem: 'crm',
      })
    })

    fireEvent.click(within(cardDe('Ana Souza')).getByText('Detalhe'))
    expect(
      screen.getByRole('heading', { name: 'Histórico completo' }),
    ).toBeTruthy()
    // 5 agendamentos + 1 pagamento + 1 interação + 1 mensagem
    expect(screen.getByText('8 evento(s)')).toBeTruthy()
    expect(
      screen.getAllByText('Agendamento · Corte Degradê · Audax'),
    ).toHaveLength(3)
    expect(screen.getAllByText('Agendamento · Barba · Audax')).toHaveLength(2)
    expect(
      screen.getByText('Pagamento · Corte Degradê - Ana Souza'),
    ).toBeTruthy()
    expect(
      screen.getByText('Nota · Cliente quer lembrete por WhatsApp.'),
    ).toBeTruthy()
    expect(
      screen.getByText('WhatsApp · Reativação · Oi Ana, sentimos sua falta!'),
    ).toBeTruthy()
    // a nota pura continua única na seção de interações (sem duplicar texto)
    expect(
      screen.getAllByText('Cliente quer lembrete por WhatsApp.'),
    ).toHaveLength(1)
  })
})

describe('CRM — grupos de retorno (ativos, risco e inativos)', () => {
  it('chips com contagem filtram a lista por grupo', () => {
    env(<Crm />)
    semear()

    expect(screen.getByRole('button', { name: 'Ativos (1)' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Em risco de retorno (1)' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inativos (0)' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ativos (1)' }))
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.queryByText('Bruno Lima')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Em risco de retorno (1)' }),
    )
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Inativos (0)' }))
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.queryByText('Bruno Lima')).toBeNull()
    expect(screen.getByText('Nenhum cliente neste segmento.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
  })
})

describe('CRM — ação de reativação', () => {
  it('registra a interação, prepara mensagem pendente e não duplica', () => {
    env(<Crm />)
    semear()
    const idBruno = ctxClientes.clientes.find(
      (c) => c.nome === 'Bruno Lima',
    )!.id

    fireEvent.click(screen.getByRole('button', { name: 'Reativar Bruno Lima' }))
    expect(
      screen.getByRole('heading', { name: 'Reativar cliente' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))

    expect(ctxCrm.interacoes).toHaveLength(1)
    expect(ctxCrm.interacoes[0]).toMatchObject({
      tipo: 'reativacao',
      clienteId: idBruno,
    })
    const mensagens: { template: string; status: string }[] = JSON.parse(
      localStorage.getItem(CHAVE_WHATS) ?? '[]',
    )
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0]).toMatchObject({
      template: 'reativacao',
      status: 'pendente',
    })
    expect(
      within(cardDe('Bruno Lima')).getByText('Reativação registrada'),
    ).toBeTruthy()
    expect(screen.getByText(/1 interação\(ões\)/)).toBeTruthy()

    // segunda ação: nova entrada no histórico, sem duplicar a mensagem
    fireEvent.click(screen.getByRole('button', { name: 'Reativar Bruno Lima' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
    expect(ctxCrm.interacoes).toHaveLength(2)
    const depois: unknown[] = JSON.parse(
      localStorage.getItem(CHAVE_WHATS) ?? '[]',
    )
    expect(depois).toHaveLength(1)
    expect(screen.getByText(/2 interação\(ões\)/)).toBeTruthy()
  })
})
