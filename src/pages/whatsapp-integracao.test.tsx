import { useEffect } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatarDataLonga, hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { CrmProvider } from '@/modules/crm/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import type { MensagemWhats } from '@/modules/whatsapp/types'
import Whats from './Whats'

const HOJE = hojeISO()
const CHAVE_WHATS = 'studio-audax:whatsapp:v1'

let ctxClientes: ReturnType<typeof useClientes>
let ctxAgenda: ReturnType<typeof useAgenda>

function Captura() {
  const clientes = useClientes()
  const agenda = useAgenda()
  useEffect(() => {
    ctxClientes = clientes
    ctxAgenda = agenda
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ClubeProvider>
                <CrmProvider>
                  <WhatsProvider>
                    <Captura />
                    <Whats />
                  </WhatsProvider>
                </CrmProvider>
              </ClubeProvider>
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function criarCliente(nome: string): string {
  let id = ''
  act(() => {
    id = ctxClientes.adicionar({ nome, telefone: '', email: '', observacao: '' }).id
  })
  return id
}

/** Cria o cliente e o seleciona no composer da central. */
function selecionarCliente(nome: string): string {
  const id = criarCliente(nome)
  fireEvent.change(screen.getByLabelText('Cliente'), {
    target: { value: id },
  })
  return id
}

function criarMensagemPelaTela() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Criar mensagem pendente' }),
  )
}

function kpi(rotulo: string): string {
  const candidatos = screen.getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P') as HTMLElement
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return (ps?.[1]?.textContent ?? '').trim()
}

function cardDe(nome: string): HTMLElement {
  const p = screen.getAllByText(nome).find((el) => el.tagName === 'P')
  return p?.closest('li') as HTMLElement
}

function lerMensagens(): MensagemWhats[] {
  return JSON.parse(localStorage.getItem(CHAVE_WHATS) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
})

describe('Central de WhatsApp — página', () => {
  it('renderiza título, aviso de integração, KPIs zerados e estado vazio', () => {
    montar()
    expect(
      screen.getByRole('heading', { level: 1, name: 'WhatsApp' }),
    ).toBeTruthy()
    expect(screen.getByText('Sem integração — nada é enviado')).toBeTruthy()
    expect(kpi('Total de mensagens')).toBe('0')
    expect(kpi('Mensagens pendentes')).toBe('0')
    expect(kpi('Mensagens enviadas')).toBe('0')
    expect(kpi('Com falha')).toBe('0')
    expect(
      screen.getByText(
        'Nenhuma mensagem registrada. Use os templates acima, o CRM ou as Automações.',
      ),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Criar mensagem pendente' }),
    ).toBeTruthy()
  })

  it('cria mensagem de retorno, lista como pendente e persiste após F5', () => {
    const { unmount } = montar()
    selecionarCliente('Ana Souza')

    criarMensagemPelaTela()
    expect(screen.getByText(/Mensagem pendente criada/)).toBeTruthy()
    expect(screen.getByText('Pendente')).toBeTruthy()
    expect(screen.getByText(/Retorno · crm/)).toBeTruthy()
    expect(screen.getByText(/Ana Souza! Aqui é o Studio Audax/)).toBeTruthy()
    expect(kpi('Mensagens pendentes')).toBe('1')
    expect(lerMensagens()).toHaveLength(1)
    expect(lerMensagens()[0]).toMatchObject({
      template: 'retorno',
      status: 'pendente',
      origem: 'crm',
    })

    // F5: recarrega tudo a partir do localStorage
    unmount()
    montar()
    expect(screen.getByText('Pendente')).toBeTruthy()
    expect(screen.getByText(/Retorno · crm/)).toBeTruthy()
    expect(kpi('Total de mensagens')).toBe('1')
  })

  it('evita duplicar: segundo clique reutiliza a pendente idêntica', () => {
    montar()
    selecionarCliente('Ana Souza')

    criarMensagemPelaTela()
    criarMensagemPelaTela()

    expect(screen.getByText(/nada foi duplicado/)).toBeTruthy()
    expect(kpi('Total de mensagens')).toBe('1')
    expect(lerMensagens()).toHaveLength(1)
  })

  it('valida seleção: sem cliente mostra erro claro e não grava nada', () => {
    montar()
    criarMensagemPelaTela()
    expect(
      screen.getByText('Selecione um cliente para criar a mensagem.'),
    ).toBeTruthy()
    expect(lerMensagens()).toHaveLength(0)
    expect(kpi('Total de mensagens')).toBe('0')
  })
})

describe('Central de WhatsApp — templates com dados reais', () => {
  it('confirmação usa o próximo agendamento e grava o vínculo', () => {
    montar()
    selecionarCliente('Ana Souza')
    const data = somarDias(HOJE, 3)
    act(() => {
      ctxAgenda.adicionar({
        cliente: 'Ana Souza',
        telefone: '',
        servico: 'Corte Degradê',
        profissional: 'Cleiton Silva',
        data,
        horario: '14:00',
        observacao: '',
      })
    })

    fireEvent.change(screen.getByLabelText('Modelo'), {
      target: { value: 'confirmacao' },
    })
    criarMensagemPelaTela()

    expect(screen.getByText(/Mensagem pendente criada/)).toBeTruthy()
    expect(screen.getByText(/Confirmação · crm/)).toBeTruthy()
    expect(screen.getByText(/Corte Degradê com Cleiton Silva/)).toBeTruthy()
    expect(
      screen.getByText(`Agendamento · ${formatarDataLonga(data)} às 14:00`),
    ).toBeTruthy()
    const salvo = lerMensagens()
    expect(salvo).toHaveLength(1)
    expect(salvo[0].agendamentoId).toBe(ctxAgenda.agendamentos[0].id)
  })

  it('confirmação sem agendamento futuro recusa com erro claro', () => {
    montar()
    selecionarCliente('Bruno Lima')
    fireEvent.change(screen.getByLabelText('Modelo'), {
      target: { value: 'confirmacao' },
    })
    criarMensagemPelaTela()
    expect(
      screen.getByText(
        'Este cliente não tem agendamento futuro para este template.',
      ),
    ).toBeTruthy()
    expect(lerMensagens()).toHaveLength(0)
  })

  it('reativação calcula os dias reais do último atendimento', () => {
    montar()
    selecionarCliente('Clara Dias')
    act(() => {
      ctxAgenda.adicionar({
        cliente: 'Clara Dias',
        telefone: '',
        servico: 'Barba',
        profissional: 'Ítalo Santos',
        data: somarDias(HOJE, -45),
        horario: '10:00',
        observacao: '',
      })
    })
    act(() => {
      ctxAgenda.mudarStatus(ctxAgenda.agendamentos[0].id, 'concluido')
    })

    fireEvent.change(screen.getByLabelText('Modelo'), {
      target: { value: 'reativacao' },
    })
    criarMensagemPelaTela()

    expect(screen.getByText(/Mensagem pendente criada/)).toBeTruthy()
    expect(screen.getByText(/45 dia\(s\)/)).toBeTruthy()
    expect(screen.getByText(/Reativação · crm/)).toBeTruthy()
    expect(lerMensagens()).toHaveLength(1)
  })

  it('reativação de cliente nunca atendido recusa com erro claro', () => {
    montar()
    selecionarCliente('Diego Alves')
    fireEvent.change(screen.getByLabelText('Modelo'), {
      target: { value: 'reativacao' },
    })
    criarMensagemPelaTela()
    expect(screen.getByText('Este cliente nunca foi atendido.')).toBeTruthy()
    expect(lerMensagens()).toHaveLength(0)
  })
})

describe('Central de WhatsApp — pendentes, enviadas, falhas e filtros', () => {
  function semear() {
    localStorage.setItem(
      CHAVE_WHATS,
      JSON.stringify([
        {
          id: 'm-1',
          clienteId: 'c-1',
          cliente: 'Ana Souza',
          template: 'retorno',
          texto: 'Mensagem da Ana',
          status: 'pendente',
          origem: 'crm',
          criadoEm: '2026-09-20T10:00:00.000Z',
        },
        {
          id: 'm-2',
          clienteId: 'c-2',
          cliente: 'Bruno Lima',
          template: 'confirmacao',
          texto: 'Mensagem do Bruno',
          status: 'enviada',
          origem: 'automacao',
          criadoEm: '2026-09-21T10:00:00.000Z',
        },
        {
          id: 'm-3',
          clienteId: 'c-3',
          cliente: 'Carla Dias',
          template: 'reativacao',
          texto: 'Mensagem da Carla',
          status: 'falhou',
          origem: 'ia',
          motivoFalha: 'Sem conexão',
          criadoEm: '2026-09-22T10:00:00.000Z',
        },
      ]),
    )
  }

  it('KPIs separam pendentes, enviadas e falhas; origens aparecem', () => {
    semear()
    montar()
    expect(kpi('Total de mensagens')).toBe('3')
    expect(kpi('Mensagens pendentes')).toBe('1')
    expect(kpi('Mensagens enviadas')).toBe('1')
    expect(kpi('Com falha')).toBe('1')
    expect(screen.getByText(/Retorno · crm/)).toBeTruthy()
    expect(screen.getByText(/Confirmação · Automação/)).toBeTruthy()
    expect(screen.getByText(/Reativação · ia/)).toBeTruthy()
    expect(screen.getByText('Sem conexão')).toBeTruthy()
  })

  it('chips de filtro separam status e busca filtra por cliente', () => {
    semear()
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Pendentes' }))
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.queryByText('Bruno Lima')).toBeNull()
    expect(screen.queryByText('Carla Dias')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enviadas' }))
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Falharam' }))
    expect(screen.getByText('Carla Dias')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.queryByText('Bruno Lima')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.getByText('Carla Dias')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar cliente'), {
      target: { value: 'bruno' },
    })
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()

    fireEvent.change(screen.getByLabelText('Buscar cliente'), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('Nenhuma mensagem com este filtro.')).toBeTruthy()
  })

  it('ações: Enviar avisa que não há integração, Marcar enviada e Registrar falha', async () => {
    semear()
    montar()

    // Enviar sem provedor: aviso claro e status permanece pendente
    const liAna = cardDe('Ana Souza')
    fireEvent.click(within(liAna).getByRole('button', { name: 'Enviar' }))
    await screen.findByText(/não configurada/)
    expect(kpi('Mensagens pendentes')).toBe('1')
    expect(lerMensagens()[0].status).toBe('pendente')

    // Marcar enviada manualmente (ex.: WhatsApp Web)
    fireEvent.click(
      within(cardDe('Ana Souza')).getByRole('button', {
        name: 'Marcar enviada',
      }),
    )
    expect(within(cardDe('Ana Souza')).getByText('Enviada')).toBeTruthy()
    expect(kpi('Mensagens enviadas')).toBe('2')
    expect(kpi('Mensagens pendentes')).toBe('0')
    expect(lerMensagens()[0].status).toBe('enviada')

    // Registrar falha com motivo obrigatório
    fireEvent.click(
      within(cardDe('Carla Dias')).getByRole('button', {
        name: 'Registrar falha',
      }),
    )
    expect(
      screen.getByRole('heading', { name: 'Registrar falha no envio' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(screen.getByText('Informe o motivo (mínimo 3 letras).')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: 'Número inválido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
    expect(kpi('Com falha')).toBe('1')
    expect(screen.getAllByText('Falhou')).toHaveLength(1)
    expect(screen.getByText('Número inválido')).toBeTruthy()
  })
})

describe('Central de WhatsApp — integração com o histórico do cliente', () => {
  it('Ver histórico abre o detalhe do cliente com a mensagem na timeline', () => {
    montar()
    selecionarCliente('Ana Souza')
    criarMensagemPelaTela()

    fireEvent.click(
      screen.getByRole('button', { name: 'Histórico de Ana Souza' }),
    )
    expect(screen.getByRole('heading', { name: 'Ana Souza' })).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Histórico completo' }),
    ).toBeTruthy()
    expect(screen.getByText(/WhatsApp · Retorno ·/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Fechar'))
    expect(screen.queryByRole('heading', { name: 'Ana Souza' })).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'WhatsApp' }),
    ).toBeTruthy()
  })
})
