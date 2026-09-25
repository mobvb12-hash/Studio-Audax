import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda from './Agenda'
import Caixa from './Caixa'
import Clientes from './Clientes'
import Clube from './Clube'
import Comissoes from './Comissoes'
import Dashboard from './Dashboard'
import PDV from './PDV'
import Produtos from './Produtos'
import Profissionais from './Profissionais'
import Relatorios from './Relatorios'
import Servicos from './Servicos'

beforeEach(() => {
  localStorage.clear()
})

describe('Smoke — páginas renderizam sem erros de console', () => {
  it('Caixa renderiza cabeçalho, KPIs e cartões', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ProdutosProvider>
        <EstoqueProvider>
          <CaixaProvider>
            <Caixa />
          </CaixaProvider>
        </EstoqueProvider>
      </ProdutosProvider>,
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
          <ProdutosProvider>
            <ServicosProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <ComissoesProvider>
                    <ClubeProvider>
                      <Dashboard onNovo={() => undefined} />
                    </ClubeProvider>
                  </ComissoesProvider>
                </CaixaProvider>
              </AgendaProvider>
            </ServicosProvider>
          </ProdutosProvider>
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
            <ClubeProvider>
              <Clientes />
            </ClubeProvider>
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

  it('PDV renderiza abas, carrinho vazio e botão de finalizar', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ProdutosProvider>
            <EstoqueProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <ComissoesProvider>
                    <ClubeProvider>
                      <PDV />
                    </ClubeProvider>
                  </ComissoesProvider>
                </CaixaProvider>
              </AgendaProvider>
            </EstoqueProvider>
          </ProdutosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'PDV' })).toBeTruthy()
    expect(screen.getByText('Nova venda')).toBeTruthy()
    expect(screen.getByText('Histórico de vendas')).toBeTruthy()
    expect(screen.getByText('Carrinho vazio.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Finalizar venda' }),
    ).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Produtos renderiza cabeçalho e estado vazio', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ProdutosProvider>
        <EstoqueProvider>
          <Produtos />
        </EstoqueProvider>
      </ProdutosProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Produtos' })).toBeTruthy()
    expect(screen.getByText('+ Novo produto')).toBeTruthy()
    expect(screen.getByText(/Nenhum produto cadastrado/)).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Relatórios renderiza filtros, resumo e seções com estado vazio', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ProdutosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <Relatorios />
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </ProdutosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeTruthy()
    expect(screen.getByText('Hoje')).toBeTruthy()
    expect(screen.getByText('Ontem')).toBeTruthy()
    expect(screen.getByText('Mês anterior')).toBeTruthy()
    expect(
      screen.getByText('Nenhuma movimentação no período selecionado.'),
    ).toBeTruthy()
    expect(screen.getByText('Formas de pagamento')).toBeTruthy()
    expect(screen.getByText('Comissões do período')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Audax Club renderiza cabeçalho, KPIs, filtros e estado vazio', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <CaixaProvider>
          <ClubeProvider>
            <Clube />
          </ClubeProvider>
        </CaixaProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Audax Club' })).toBeTruthy()
    expect(screen.getByText('+ Nova assinatura')).toBeTruthy()
    expect(screen.getByText('Assinaturas')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Todas' })).toBeTruthy()
    expect(screen.getByText('Nenhuma assinatura cadastrada.')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })
})
