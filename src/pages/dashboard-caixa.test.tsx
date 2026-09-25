import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import Dashboard from './Dashboard'
import Comissoes from './Comissoes'

function Semente() {
  const { registrarPagamento, venderProduto, adicionarDespesa } = useCaixa()
  return (
    <button
      type="button"
      onClick={() => {
        registrarPagamento({
          agendamentoId: 'ag-1',
          data: hojeISO(),
          hora: '10:00',
          cliente: 'Lucas Mendes',
          profissional: 'Audax',
          servico: 'Corte Degradê',
          valor: 70,
          desconto: 10,
          formaPagamento: 'pix',
          statusAgendamento: 'confirmado',
        })
        venderProduto({
          data: hojeISO(),
          produto: 'Pomada',
          quantidade: 1,
          preco: 30,
          desconto: 0,
          formaPagamento: 'cartao_credito',
          profissional: 'Diego',
        })
        adicionarDespesa({
          data: hojeISO(),
          descricao: 'Energia',
          categoria: 'Energia / água',
          valor: 100,
          formaPagamento: 'pix',
        })
      }}
    >
      semear
    </button>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('Dashboard ↔ Caixa — números idênticos', () => {
  it('KPIs do mês e cartão "Caixa de hoje" batem com os lançamentos reais', () => {
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <Semente />
                  <Dashboard onNovo={() => undefined} />
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    fireEvent.click(screen.getByText('semear'))

    // Pagamento 70 - 10 desconto = 60 + venda 30 = receita 90; despesa 100
    const kpi = (rotulo: string) =>
      screen.getByText(rotulo).parentElement as HTMLElement
    expect(within(kpi('Receita do mês')).getByText('R$ 90,00')).toBeTruthy()
    expect(within(kpi('Despesas do mês')).getByText('R$ 100,00')).toBeTruthy()
    expect(within(kpi('Resultado líquido')).getByText('-R$ 10,00')).toBeTruthy()
    // Ticket médio = apenas atendimentos (60) / 1
    expect(within(kpi('Ticket médio')).getByText('R$ 60,00')).toBeTruthy()
    // Comissão de Audax (produção 60 × 40% padrão) — idêntica à tela Comissões
    expect(
      within(kpi('Comissões a pagar')).getByText('R$ 24,00'),
    ).toBeTruthy()

    // Cartão "Caixa de hoje" deve refletir exatamente os mesmos valores
    const linha = (rotulo: string) =>
      screen.getByText(rotulo).parentElement as HTMLElement
    expect(within(linha('Recebido hoje')).getByText('R$ 90,00')).toBeTruthy()
    expect(within(linha('Despesas hoje')).getByText('R$ 100,00')).toBeTruthy()
    expect(within(linha('Resultado')).getByText('-R$ 10,00')).toBeTruthy()

    // Por forma de pagamento: PIX 60 (desconto já abatido), crédito 30;
    // a despesa em PIX não conta como receita na forma de pagamento
    const formas = screen.getByText('Por forma de pagamento')
      .parentElement as HTMLElement
    expect(within(formas).getByText('R$ 60,00')).toBeTruthy()
    expect(within(formas).getByText('R$ 30,00')).toBeTruthy()

    // Por profissional
    const profs = screen.getByText('Por profissional')
      .parentElement as HTMLElement
    expect(within(profs).getByText(/Audax/)).toBeTruthy()
    expect(within(profs).getByText(/Diego/)).toBeTruthy()
  })

  it('Tela Comissões totaliza o mesmo valor do KPI do Dashboard', () => {
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <Semente />
                  <Comissoes />
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    fireEvent.click(screen.getByText('semear'))

    const kpi = (rotulo: string) =>
      screen.getByText(rotulo).parentElement as HTMLElement
    expect(within(kpi('Comissões a pagar')).getByText('R$ 24,00')).toBeTruthy()
    expect(within(kpi('Produção total')).getByText('R$ 60,00')).toBeTruthy()
    expect(within(kpi('Atendimentos pagos')).getByText('1')).toBeTruthy()
  })
})
