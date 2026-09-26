import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { CrmProvider, useCrm } from '@/modules/crm/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider, useServicos } from '@/modules/servicos/store'
import { WhatsProvider, useWhats } from '@/modules/whatsapp/store'
import Clientes from './Clientes'

const DIA = hojeISO()

let ctxClientes: ReturnType<typeof useClientes>
let ctxAgenda: ReturnType<typeof useAgenda>
let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClube: ReturnType<typeof useClube>
let ctxServicos: ReturnType<typeof useServicos>
let ctxCrm: ReturnType<typeof useCrm>
let ctxWhats: ReturnType<typeof useWhats>

function Captura() {
  const clientes = useClientes()
  const agenda = useAgenda()
  const caixa = useCaixa()
  const clube = useClube()
  const servicos = useServicos()
  const crm = useCrm()
  const whats = useWhats()
  useEffect(() => {
    ctxClientes = clientes
    ctxAgenda = agenda
    ctxCaixa = caixa
    ctxClube = clube
    ctxServicos = servicos
    ctxCrm = crm
    ctxWhats = whats
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <CrmProvider>
        <WhatsProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ClubeProvider>
                <ServicosProvider>
                  <ProfissionaisProvider>
                    <Captura />
                    <Clientes />
                  </ProfissionaisProvider>
                </ServicosProvider>
              </ClubeProvider>
            </CaixaProvider>
          </AgendaProvider>
        </WhatsProvider>
      </CrmProvider>
    </ClientesProvider>,
  )
}

function criarCliente(nome: string, telefone = ''): string {
  let id = ''
  act(() => {
    id = ctxClientes.adicionar({ nome, telefone, email: '', observacao: '' }).id
  })
  return id
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

function kpi(rotulo: string): string {
  const candidatos = screen.getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P') as HTMLElement
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

function semearAtendimentoConcluido(cliente: string, valor = 100) {
  act(() => {
    ctxAgenda.adicionar({
      cliente,
      telefone: '(11) 98888-7777',
      servico: 'Corte',
      profissional: 'Audax',
      data: DIA,
      horario: '10:00',
      observacao: '',
    })
  })
  act(() => {
    ctxAgenda.mudarStatus(ctxAgenda.agendamentos[0].id, 'concluido')
  })
  act(() => {
    ctxCaixa.registrarPagamento({
      agendamentoId: ctxAgenda.agendamentos[0].id,
      data: DIA,
      hora: '10:00',
      cliente,
      profissional: 'Audax',
      servico: 'Corte',
      valor,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'concluido',
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClube = undefined as unknown as ReturnType<typeof useClube>
  ctxServicos = undefined as unknown as ReturnType<typeof useServicos>
  ctxCrm = undefined as unknown as ReturnType<typeof useCrm>
  ctxWhats = undefined as unknown as ReturnType<typeof useWhats>
})

describe('Clientes — página (filtros, status e ações)', () => {
  it('renderiza KPIs de status, chips de filtro e badges de ativo/inativo', () => {
    montar()
    criarCliente('Lucas Mendes', '(11) 98888-7777')
    const anaId = criarCliente('Ana Souza', '(11) 97777-6666')
    act(() => {
      ctxClientes.alternarAtivo(anaId)
    })

    expect(screen.getByRole('button', { name: 'Todos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ativos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inativos' })).toBeTruthy()
    expect(kpi('Total de clientes')).toBe('2')
    expect(kpi('Clientes ativos')).toBe('1')
    expect(kpi('Clientes inativos')).toBe('1')
    expect(kpi('Atendimentos concluídos')).toBe('0')
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Inativo')).toBeTruthy()
  })

  it('busca filtra por nome e por telefone', () => {
    montar()
    criarCliente('Lucas Mendes', '(11) 98888-7777')
    criarCliente('Ana Souza', '(11) 97777-6666')

    fireEvent.change(screen.getByLabelText('Buscar cliente'), {
      target: { value: 'ana' },
    })
    expect(screen.queryByText('Lucas Mendes')).toBeNull()
    expect(screen.getByText('Ana Souza')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar cliente'), {
      target: { value: '98888' },
    })
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()
    expect(screen.queryByText('Ana Souza')).toBeNull()
  })

  it('filtro Inativos, Inativar e Reativar preservam cadastro e histórico', () => {
    montar()
    const anaId = criarCliente('Ana Souza', '(11) 97777-6666')
    criarCliente('Lucas Mendes', '(11) 98888-7777')
    act(() => {
      ctxAgenda.adicionar({
        cliente: 'Ana Souza',
        telefone: '',
        servico: 'Corte',
        profissional: 'Audax',
        data: DIA,
        horario: '10:00',
        observacao: '',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Ana Souza' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inativos' }))

    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.queryByText('Lucas Mendes')).toBeNull()
    expect(screen.getByText('Inativo')).toBeTruthy()

    expect(ctxClientes.clientes).toHaveLength(2)
    expect(ctxClientes.clientes.find((c) => c.id === anaId)?.ativo).toBe(false)
    expect(ctxAgenda.agendamentos).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reativar Ana Souza' }))
    expect(screen.queryByText('Ana Souza')).toBeNull()
    expect(screen.getByText('Nenhum cliente inativo no momento.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(ctxClientes.clientes.find((c) => c.id === anaId)?.ativo).toBe(true)
  })

  it('card mostra total de atendimentos, último atendimento e total gasto', () => {
    montar()
    criarCliente('Lucas Mendes', '(11) 98888-7777')
    semearAtendimentoConcluido('Lucas Mendes', 100)

    const card = screen.getByText('Lucas Mendes').closest('li') as HTMLElement
    const texto = norm(card.textContent)
    expect(texto).toContain('1 atendimento(s)')
    expect(texto).toContain(`Último: ${formatarDataLonga(DIA)}`)
    expect(texto).toContain('R$ 100,00')
    expect(kpi('Atendimentos concluídos')).toBe('1')
  })

  it('ação Agendar abre modal com o cliente pré-preenchido e cria o agendamento', () => {
    montar()
    act(() => {
      ctxServicos.adicionar({ nome: 'Corte', preco: 50, duracaoMin: 30 })
    })
    criarCliente('Lucas Mendes', '(11) 98888-7777')

    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }))

    expect((screen.getByLabelText('Cliente *') as HTMLInputElement).value).toBe(
      'Lucas Mendes',
    )
    expect(
      (screen.getByLabelText('Telefone / WhatsApp') as HTMLInputElement).value,
    ).toBe('(11) 98888-7777')

    fireEvent.click(screen.getByText('Salvar agendamento'))

    expect(screen.queryByLabelText('Cliente *')).toBeNull()
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxAgenda.agendamentos[0].cliente).toBe('Lucas Mendes')
  })

  it('card marca Assinante quando o cliente tem assinatura vigente', () => {
    montar()
    const id = criarCliente('Lucas Mendes', '(11) 98888-7777')
    act(() => {
      ctxClube.assinar({
        clienteId: id,
        cliente: 'Lucas Mendes',
        plano: 'cabelo',
        valorMensal: 79.9,
        dataAssinatura: DIA,
      })
    })
    expect(screen.getByText('Assinante')).toBeTruthy()
  })

  it('perfil do cliente mostra status, último atendimento e total gasto', () => {
    montar()
    criarCliente('Lucas Mendes', '(11) 98888-7777')
    semearAtendimentoConcluido('Lucas Mendes', 100)

    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))

    const modal = screen.getByText('Histórico do cliente').closest(
      '.fixed',
    ) as HTMLElement
    expect(within(modal).getByText('Ativo')).toBeTruthy()

    const ultimo = within(modal).getByText('Último atendimento')
      .parentElement as HTMLElement
    expect(ultimo.textContent).toContain(formatarDataLonga(DIA))

    const total = within(modal).getByText('Total gasto').parentElement as HTMLElement
    expect(norm(total.textContent)).toContain('R$ 100,00')
  })
})

describe('Clientes — exclusão segura (CRM e WhatsApp vinculados)', () => {
  it('bloqueia a exclusão quando há interação de CRM e mostra o motivo', () => {
    montar()
    const id = criarCliente('Lucas Mendes', '(11) 98888-7777')
    act(() => {
      ctxCrm.adicionarInteracao({
        clienteId: id,
        tipo: 'ligacao',
        texto: 'Cliente pediu retorno sobre o corte.',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Lucas Mendes' }))

    expect(screen.queryByText('Excluir cliente')).toBeNull()
    const alerta = screen.getByRole('alert')
    expect(alerta.textContent).toContain('Não foi possível excluir “Lucas Mendes”')
    expect(alerta.textContent).toContain('1 interação(ões) de CRM')
    expect(ctxClientes.clientes).toHaveLength(1)

    fireEvent.click(screen.getByText('Entendi'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(ctxClientes.clientes).toHaveLength(1)
  })

  it('bloqueia a exclusão quando há mensagem de WhatsApp vinculada', () => {
    montar()
    const id = criarCliente('Ana Souza', '(11) 97777-6666')
    act(() => {
      ctxWhats.criar({
        clienteId: id,
        cliente: 'Ana Souza',
        template: 'pos_atendimento',
        texto: 'Obrigado pela visita!',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ana Souza' }))

    expect(screen.queryByText('Excluir cliente')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(
      '1 mensagem(ns) de WhatsApp',
    )
    expect(ctxClientes.clientes).toHaveLength(1)
  })

  it('cliente sem CRM/WhatsApp mantém o fluxo normal de confirmação', () => {
    montar()
    criarCliente('Lucas Mendes', '(11) 98888-7777')

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Lucas Mendes' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Excluir cliente')).toBeTruthy()
  })
})
