import { act, useEffect } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import Clientes from './Clientes'

let ctxClientes: ReturnType<typeof useClientes>
let ctxAgenda: ReturnType<typeof useAgenda>
let ctxCaixa: ReturnType<typeof useCaixa>

function Captura() {
  const clientes = useClientes()
  const agenda = useAgenda()
  const caixa = useCaixa()
  useEffect(() => {
    ctxClientes = clientes
    ctxAgenda = agenda
    ctxCaixa = caixa
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <AgendaProvider>
        <CaixaProvider>
          <Captura />
          <Clientes />
        </CaixaProvider>
      </AgendaProvider>
    </ClientesProvider>,
  )
}

function semear() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      email: '',
      observacao: '',
    })
    ctxClientes.adicionar({
      nome: 'Ana Souza',
      telefone: '(11) 97777-6666',
      email: '',
      observacao: '',
    })
    ctxAgenda.adicionar({
      cliente: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: '2026-09-25',
      horario: '10:00',
      observacao: '',
    })
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: '2026-09-25',
      hora: '10:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 70,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
  })
}

function editar(nome: string) {
  const card = screen.getByText(nome).closest('li') as HTMLElement
  fireEvent.click(within(card).getByText('Editar'))
  fireEvent.change(screen.getByLabelText('Nome *'), {
    target: { value: 'Lucas M.' },
  })
}

beforeEach(() => {
  localStorage.clear()
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
})

describe('Renomeação de cadastro propaga para a operação', () => {
  it('editar o nome do cliente atualiza agenda e caixa', async () => {
    montar()
    semear()

    editar('Lucas Mendes')
    fireEvent.click(screen.getByText('Salvar alterações'))

    await waitFor(() =>
      expect(screen.queryByText('Salvar alterações')).toBeNull(),
    )
    expect(ctxClientes.clientes.map((c) => c.nome)).toContain('Lucas M.')
    expect(ctxAgenda.agendamentos[0].cliente).toBe('Lucas M.')
    expect(ctxCaixa.lancamentos[0].cliente).toBe('Lucas M.')
  })

  it('nome duplicado mostra erro no modal e não fecha', async () => {
    montar()
    semear()

    const card = screen.getByText('Ana Souza').closest('li') as HTMLElement
    fireEvent.click(within(card).getByText('Editar'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'lucas mendes' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(
      await screen.findByText('Já existe um cliente com este nome.'),
    ).toBeTruthy()
    expect(screen.getByText('Salvar alterações')).toBeTruthy()
    expect(ctxClientes.clientes.map((c) => c.nome)).toEqual([
      'Ana Souza',
      'Lucas Mendes',
    ])
    expect(ctxAgenda.agendamentos[0].cliente).toBe('Lucas Mendes')
    expect(ctxCaixa.lancamentos[0].cliente).toBe('Lucas Mendes')
  })
})
