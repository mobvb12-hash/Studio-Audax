import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda from './Agenda'
import Caixa from './Caixa'
import Clientes from './Clientes'
import Comissoes from './Comissoes'
import Dashboard from './Dashboard'
import Profissionais from './Profissionais'
import Servicos from './Servicos'

beforeEach(() => {
  localStorage.clear()
})

describe('Smoke — páginas renderizam sem erros de console', () => {
  it('Caixa renderiza cabeçalho, KPIs e cartões', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <CaixaProvider>
        <Caixa />
      </CaixaProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Caixa' })).toBeTruthy()
    expect(screen.getByText('Recebido no dia')).toBeTruthy()
    expect(screen.getByText('Fechar caixa')).toBeTruthy()
    expect(screen.getByText('Recebimentos do dia')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Agenda renderiza grade com colunas de profissionais', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <Agenda onNovo={() => undefined} />
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy()
    expect(screen.getByText('Audax')).toBeTruthy()
    expect(screen.getByText('Diego')).toBeTruthy()
    expect(screen.getByText('+ Agendar')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Comissões renderiza cabeçalho, filtros de período e tabela', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <Comissoes />
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Comissões' })).toBeTruthy()
    expect(screen.getByText('Este mês')).toBeTruthy()
    expect(screen.getByText('Personalizado')).toBeTruthy()
    expect(screen.getByText('Barbeiro')).toBeTruthy()
    expect(screen.getByText('Total geral')).toBeTruthy()
    expect(screen.getByText('Audax')).toBeTruthy()
    expect(screen.getByText('Diego')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Painel (Dashboard) renderiza KPIs com comissões reais', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <Dashboard onNovo={() => undefined} />
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeTruthy()
    expect(screen.getByText('Comissões a pagar')).toBeTruthy()
    expect(screen.getByText('Receita do mês')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Clientes renderiza busca e lista', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Clientes />
          </CaixaProvider>
        </AgendaProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeTruthy()
    expect(screen.getByText('+ Novo cliente')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Serviços renderiza catálogo e totais', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ServicosProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Servicos />
          </CaixaProvider>
        </AgendaProvider>
      </ServicosProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Serviços' })).toBeTruthy()
    expect(screen.getByText('Corte Degradê')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Profissionais renderiza equipe', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ProfissionaisProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Profissionais />
          </CaixaProvider>
        </AgendaProvider>
      </ProfissionaisProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Profissionais' })).toBeTruthy()
    expect(screen.getByText('Audax')).toBeTruthy()
    expect(screen.getByText('Diego')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })
})
