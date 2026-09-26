import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EsperaProvider, useEspera } from '@/modules/espera/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Dashboard from './Dashboard'
import Espera from './Espera'

const HOJE = hojeISO()

let ctxAgenda: ReturnType<typeof useAgenda>
let ctxClientes: ReturnType<typeof useClientes>

function Captura() {
  const agenda = useAgenda()
  const clientes = useClientes()
  useEffect(() => {
    ctxAgenda = agenda
    ctxClientes = clientes
  })
  return null
}

function env(elemento: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <EsperaProvider>
              <Captura />
              {elemento}
            </EsperaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function semearClientes() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Ana Souza',
      telefone: '(11) 91111-2222',
      email: '',
      observacao: '',
    })
    ctxClientes.adicionar({
      nome: 'Bruno Lima',
      telefone: '(11) 92222-3333',
      email: '',
      observacao: '',
    })
  })
}

function idDe(nome: string): string {
  return ctxClientes.clientes.find((c) => c.nome === nome)!.id
}

/** Card li do pedido na lista (ignora as <option> do formulário). */
function pedidoDe(nome: string): HTMLElement | null {
  const alvo = screen
    .queryAllByText(nome)
    .find((el) => el.closest('li') !== null)
  return (alvo?.closest('li') as HTMLElement) ?? null
}

type Opcoes = { periodo?: 'Manhã' | 'Tarde'; profissional?: string }

function adicionarPedido(nome: string, servico: string, opcoes: Opcoes = {}) {
  fireEvent.change(screen.getByLabelText('Cliente'), {
    target: { value: idDe(nome) },
  })
  fireEvent.change(screen.getByLabelText('Serviço desejado'), {
    target: { value: servico },
  })
  if (opcoes.profissional) {
    fireEvent.change(screen.getByLabelText('Profissional'), {
      target: { value: opcoes.profissional },
    })
  }
  if (opcoes.periodo) {
    fireEvent.click(screen.getByRole('button', { name: opcoes.periodo }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar à fila' }))
}

beforeEach(() => {
  localStorage.clear()
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
})

describe('Fila de Espera — cadastro e validação', () => {
  it('estado inicial vazio com instrução clara', () => {
    env(<Espera />)
    expect(screen.getByRole('heading', { name: 'Fila de Espera' })).toBeTruthy()
    expect(
      screen.getByText(/Ninguém na fila de espera/),
    ).toBeTruthy()
    expect(screen.getByText(/0 aguardando/)).toBeTruthy()
  })

  it('adiciona pedido pelo formulário com período e posição #1', () => {
    env(<Espera />)
    semearClientes()
    adicionarPedido('Ana Souza', 'Corte Degradê', { periodo: 'Tarde' })

    const li = pedidoDe('Ana Souza')
    expect(li).not.toBeNull()
    expect(within(li!).getByText('#1')).toBeTruthy()
    expect(within(li!).getByText('Aguardando')).toBeTruthy()
    expect(within(li!).getByText(/Corte Degradê/)).toBeTruthy()
    expect(within(li!).getByText(/Tarde/)).toBeTruthy()
    expect(screen.getByText(/1 aguardando/)).toBeTruthy()
    expect(
      (screen.getByLabelText('Cliente') as HTMLSelectElement).value,
    ).toBe('')
  })

  it('valida seleção obrigatória e bloqueia cliente duplicado na fila', () => {
    env(<Espera />)
    semearClientes()

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à fila' }))
    expect(screen.getByText('Selecione o cliente.')).toBeTruthy()

    adicionarPedido('Ana Souza', 'Corte Degradê')
    expect(pedidoDe('Ana Souza')).not.toBeNull()

    adicionarPedido('Ana Souza', 'Barba')
    expect(
      screen.getByText('Este cliente já está na lista de espera.'),
    ).toBeTruthy()
    expect(pedidoDe('Ana Souza')).not.toBeNull()
    expect(screen.getByText(/1 aguardando/)).toBeTruthy()
  })
})

describe('Fila de Espera — edição, status e filtros', () => {
  it('edita o pedido e pode cancelar a edição', () => {
    env(<Espera />)
    semearClientes()
    adicionarPedido('Ana Souza', 'Corte Degradê')

    fireEvent.click(within(pedidoDe('Ana Souza')!).getByText('Editar'))
    expect(screen.getByText('Editar pedido da fila')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Serviço desejado'), {
      target: { value: 'Barba' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(
      screen.getByRole('heading', { name: 'Adicionar à fila' }),
    ).toBeTruthy()
    expect(within(pedidoDe('Ana Souza')!).getByText(/Barba/)).toBeTruthy()

    fireEvent.click(within(pedidoDe('Ana Souza')!).getByText('Editar'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição' }))
    expect(
      screen.getByRole('heading', { name: 'Adicionar à fila' }),
    ).toBeTruthy()
    expect(
      (screen.getByLabelText('Serviço desejado') as HTMLSelectElement).value,
    ).toBe('')
  })

  it('marca atendido e filtra por status sem perder posições', () => {
    env(<Espera />)
    semearClientes()
    adicionarPedido('Ana Souza', 'Corte Degradê')
    adicionarPedido('Bruno Lima', 'Barba')

    fireEvent.click(
      within(pedidoDe('Ana Souza')!).getByRole('button', {
        name: 'Atendido',
      }),
    )
    expect(within(pedidoDe('Ana Souza')!).getByText('Atendido')).toBeTruthy()
    expect(screen.getByText(/1 aguardando · 2 pedido\(s\)/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Atendidos' }))
    expect(pedidoDe('Ana Souza')).not.toBeNull()
    expect(pedidoDe('Bruno Lima')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Aguardando' }))
    expect(pedidoDe('Ana Souza')).toBeNull()
    const bruno = pedidoDe('Bruno Lima')
    expect(bruno).not.toBeNull()
    expect(within(bruno!).getByText('#1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelados' }))
    expect(screen.getByText('Nenhum pedido com este filtro.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(pedidoDe('Ana Souza')).not.toBeNull()
    expect(pedidoDe('Bruno Lima')).not.toBeNull()
  })

  it('remove da lista só depois de confirmar', () => {
    env(<Espera />)
    semearClientes()
    adicionarPedido('Ana Souza', 'Corte Degradê')

    fireEvent.click(
      within(pedidoDe('Ana Souza')!).getByRole('button', { name: 'Remover' }),
    )
    expect(screen.getByRole('heading', { name: 'Remover da fila' })).toBeTruthy()
    expect(pedidoDe('Ana Souza')).not.toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Remover da fila' }),
    )
    expect(pedidoDe('Ana Souza')).toBeNull()
    expect(screen.getByText(/Ninguém na fila de espera/)).toBeTruthy()
  })
})

describe('Fila de Espera — encaixes compatíveis com a Agenda', () => {
  it('mostra horários livres, libera ao cancelar e abre modal preenchido', () => {
    env(<Espera />)
    semearClientes()

    let idAgendamento = ''
    act(() => {
      idAgendamento = ctxAgenda.adicionar({
        cliente: 'Ana Souza',
        telefone: '',
        servico: 'Corte Degradê',
        profissional: 'Audax',
        data: HOJE,
        horario: '09:00',
        observacao: '',
      }).id
    })

    adicionarPedido('Bruno Lima', 'Corte Degradê', {
      periodo: 'Manhã',
      profissional: 'Audax',
    })
    const li = pedidoDe('Bruno Lima')
    expect(li).not.toBeNull()

    // 09:00 ocupado por Ana (40 min) — não é sugerido; 08:00 está livre
    expect(within(li!).queryByText(/09:00 · Audax/)).toBeNull()
    expect(within(li!).getByText(/08:00 · Audax/)).toBeTruthy()

    // cancelar o agendamento libera o horário na hora
    act(() => {
      ctxAgenda.mudarStatus(idAgendamento, 'cancelado')
    })
    expect(within(pedidoDe('Bruno Lima')!).getByText(/09:00 · Audax/)).toBeTruthy()

    // clicar no encaixe abre o modal já com cliente/data/hora/profissional
    fireEvent.click(
      within(pedidoDe('Bruno Lima')!).getByText(/09:00 · Audax/),
    )
    expect(screen.getByText('Novo agendamento')).toBeTruthy()
    const painel = screen
      .getByRole('heading', { name: 'Novo agendamento' })
      .closest('.max-w-lg') as HTMLElement
    expect(
      (within(painel).getByLabelText('Cliente *') as HTMLInputElement).value,
    ).toBe('Bruno Lima')
    expect(
      (within(painel).getByLabelText('Data *') as HTMLInputElement).value,
    ).toBe(HOJE)
    expect(
      (within(painel).getByLabelText('Profissional') as HTMLSelectElement)
        .value,
    ).toBe('Audax')
    // horário é um grupo de chips — o selecionado usa o destaque dourado
    const chipHora = within(painel).getByRole('button', { name: '09:00' })
    expect(chipHora.className).toContain('bg-[#8A6A14]')
  })
})

function SementeFila() {
  const { adicionar } = useEspera()
  return (
    <button
      type="button"
      onClick={() =>
        adicionar({
          clienteId: 'c1',
          cliente: 'Ana Souza',
          telefone: '',
          servico: 'Corte Degradê',
        })
      }
    >
      semear fila
    </button>
  )
}

describe('Fila de Espera — Painel', () => {
  it('cartão "Fila de espera agora" reflete os pedidos reais', () => {
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ProdutosProvider>
            <ServicosProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <ComissoesProvider>
                    <ClubeProvider>
                      <EsperaProvider>
                        <SementeFila />
                        <Dashboard onNovo={() => undefined} />
                      </EsperaProvider>
                    </ClubeProvider>
                  </ComissoesProvider>
                </CaixaProvider>
              </AgendaProvider>
            </ServicosProvider>
          </ProdutosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )

    const cartao = screen
      .getByText('Fila de espera agora')
      .closest('section') as HTMLElement
    expect(within(cartao).getByText('Ninguém na fila.')).toBeTruthy()
    expect(within(cartao).getByText('0')).toBeTruthy()

    fireEvent.click(screen.getByText('semear fila'))
    expect(
      within(
        screen.getByText('Fila de espera agora').closest('section') as HTMLElement,
      ).getByText('1'),
    ).toBeTruthy()
    expect(screen.getByText('#1 Ana Souza')).toBeTruthy()
  })
})
