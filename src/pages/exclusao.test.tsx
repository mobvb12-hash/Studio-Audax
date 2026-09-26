import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { CrmProvider } from '@/modules/crm/store'
import { ClubeProvider } from '@/modules/clube/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Clientes from './Clientes'
import Profissionais from './Profissionais'
import Servicos from './Servicos'

beforeEach(() => {
  localStorage.clear()
})

function montarClientes() {
  return render(
    <ClientesProvider>
      <CrmProvider>
        <WhatsProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ClubeProvider>
                <Clientes />
              </ClubeProvider>
            </CaixaProvider>
          </AgendaProvider>
        </WhatsProvider>
      </CrmProvider>
    </ClientesProvider>,
  )
}

describe('Confirmação de exclusão destrutiva', () => {
  it('Clientes: excluir exige confirmação e preserva histórico', async () => {
    montarClientes()
    fireEvent.click(screen.getByText('+ Novo cliente'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Lucas Mendes' },
    })
    fireEvent.change(screen.getByLabelText('Telefone *'), {
      target: { value: '(11) 98888-7777' },
    })
    fireEvent.click(screen.getByText('Cadastrar cliente'))

    fireEvent.click(screen.getByLabelText('Excluir Lucas Mendes'))
    expect(screen.getByText('Excluir cliente')).toBeTruthy()

    fireEvent.click(screen.getByText('Voltar'))
    await waitFor(() =>
      expect(screen.queryByText('Excluir cliente')).toBeNull(),
    )
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Excluir Lucas Mendes'))
    fireEvent.click(screen.getByText('Sim, excluir'))
    await waitFor(() =>
      expect(screen.queryByText('Lucas Mendes')).toBeNull(),
    )
  })

  it('Serviços: excluir exige confirmação', async () => {
    render(
      <ServicosProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Servicos />
          </CaixaProvider>
        </AgendaProvider>
      </ServicosProvider>,
    )
    fireEvent.click(screen.getByLabelText('Excluir Corte Degradê'))
    expect(screen.getByText('Excluir serviço')).toBeTruthy()
    expect(screen.getByText('Corte Degradê')).toBeTruthy()

    fireEvent.click(screen.getByText('Sim, excluir'))
    await waitFor(() =>
      expect(screen.queryByLabelText('Excluir Corte Degradê')).toBeNull(),
    )
  })

  it('Profissionais: excluir exige confirmação', async () => {
    render(
      <ProfissionaisProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Profissionais />
          </CaixaProvider>
        </AgendaProvider>
      </ProfissionaisProvider>,
    )
    fireEvent.click(screen.getByLabelText('Excluir Cleiton Silva'))
    expect(screen.getByText('Excluir profissional')).toBeTruthy()

    fireEvent.click(screen.getByText('Voltar'))
    await waitFor(() =>
      expect(screen.queryByText('Excluir profissional')).toBeNull(),
    )
    expect(screen.getByText('Cleiton Silva')).toBeTruthy()
  })
})
