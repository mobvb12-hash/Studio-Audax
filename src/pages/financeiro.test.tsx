import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import Financeiro from './Financeiro'

let ctxCaixa: ReturnType<typeof useCaixa>

function Captura() {
  const caixa = useCaixa()
  useEffect(() => {
    ctxCaixa = caixa
  })
  return null
}

function montar() {
  return render(
    <CaixaProvider>
      <Captura />
      <div data-testid="financeiro">
        <Financeiro />
      </div>
    </CaixaProvider>,
  )
}

/** toLocaleString('pt-BR') usa espaço não separável (U+00A0) — normaliza. */
function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

const brl = (v: number) => norm(formatarBRL(v))

function texto(): string {
  return norm(screen.getByTestId('financeiro').textContent)
}

function kpi(rotulo: string): string {
  const candidatos = within(screen.getByTestId('financeiro')).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P') as HTMLElement
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

function clicarFiltro(rotulo: string) {
  fireEvent.click(within(screen.getByTestId('financeiro')).getByText(rotulo))
}

/** Base do período: pagamentos, venda de produto, receita do Club e despesa. */
let idEstornar = ''
function semear() {
  act(() => {
    const pago = ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: hojeISO(),
      hora: '09:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte',
      valor: 100,
      desconto: 20,
      formaPagamento: 'pix',
      statusAgendamento: 'concluido',
    })
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-2',
      data: hojeISO(),
      hora: '10:00',
      cliente: 'Ana Souza',
      profissional: 'Audax',
      servico: 'Barba',
      valor: 150,
      desconto: 0,
      formaPagamento: 'dinheiro',
      statusAgendamento: 'concluido',
    })
    ctxCaixa.venderProduto({
      data: hojeISO(),
      produto: 'Pomada modeladora',
      quantidade: 2,
      preco: 40,
      desconto: 10,
      formaPagamento: 'cartao_debito',
    })
    ctxCaixa.registrarReceitaClube({
      data: hojeISO(),
      descricao: 'Assinatura Audax Club',
      valor: 79.9,
      formaPagamento: 'cartao_credito',
    })
    ctxCaixa.adicionarDespesa({
      data: hojeISO(),
      descricao: 'Aluguel',
      categoria: 'Aluguel',
      valor: 30,
      formaPagamento: 'dinheiro',
    })
    // Pagamento de 100 - 20 = 80 estornado: sai da receita, vira estorno
    idEstornar = pago.id
  })
  // estorno em act separado: o contexto ainda não enxerga o lançamento novo
  act(() => {
    ctxCaixa.estornar(idEstornar)
  })
}

beforeEach(() => {
  localStorage.clear()
  idEstornar = ''
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
})

describe('Financeiro — resumo do período', () => {
  it('mostra os KPIs calculados a partir dos lançamentos do Caixa', () => {
    montar()
    semear()

    expect(screen.getByRole('heading', { name: 'Financeiro' })).toBeTruthy()
    expect(kpi('Receita de serviços')).toBe(brl(150))
    expect(kpi('Receita de produtos')).toBe(brl(70))
    expect(kpi('Receita do Club')).toBe(brl(79.9))
    expect(kpi('Receita total')).toBe(brl(299.9))
    expect(kpi('Despesas')).toBe(brl(30))
    expect(kpi('Estornos')).toBe(brl(80))
    expect(kpi('Resultado líquido')).toBe(brl(269.9))
    expect(kpi('Ticket médio')).toBe(brl(150))
    expect(kpi('Atendimentos pagos')).toBe('1')
    expect(texto()).toContain('1 atendimento(s) pago(s)')
    expect(texto()).toContain(`Resultado ${brl(269.9)}`)
  })

  it('período sem movimentação mostra o estado vazio', () => {
    montar()
    semear()

    clicarFiltro('Mês anterior')
    expect(
      screen.getByText('Nenhuma movimentação no período selecionado.'),
    ).toBeTruthy()
    expect(screen.queryByText('Receita total')).toBeNull()
  })
})

describe('Financeiro — evolução diária e formas de pagamento', () => {
  it('evolução mostra receita e despesa de cada dia do período', () => {
    montar()
    semear()

    expect(screen.getByText('Evolução diária')).toBeTruthy()
    expect(texto()).toContain('Receita')
    expect(texto()).toContain('Despesa')
    expect(texto()).toContain(brl(299.9))
    expect(texto()).toContain(brl(30))
  })

  it('formas de pagamento lista só recebimentos válidos com total e percentual', () => {
    montar()
    semear()

    const tabela = screen
      .getByText('Formas de pagamento')
      .closest('section') as HTMLElement

    expect(within(tabela).getByText('Dinheiro')).toBeTruthy()
    expect(within(tabela).getByText('Cartão débito')).toBeTruthy()
    expect(within(tabela).getByText('Cartão crédito')).toBeTruthy()
    // PIX só existia no lançamento estornado
    expect(within(tabela).queryByText('PIX')).toBeNull()
    expect(within(tabela).getByText(brl(150))).toBeTruthy()
    expect(within(tabela).getByText(brl(70))).toBeTruthy()
    expect(within(tabela).getByText(brl(79.9))).toBeTruthy()
    expect(within(tabela).getByText(brl(299.9))).toBeTruthy()
    expect(within(tabela).getByText('Total')).toBeTruthy()
  })
})

describe('Financeiro — filtro de período (mesmo padrão dos Relatórios)', () => {
  it('troca de período recalcula a tela e o personalizado abre as datas', () => {
    montar()
    semear()

    for (const rotulo of [
      'Hoje',
      'Ontem',
      'Esta semana',
      'Este mês',
      'Mês anterior',
    ]) {
      expect(screen.getByRole('button', { name: rotulo })).toBeTruthy()
    }

    clicarFiltro('Hoje')
    expect(kpi('Receita total')).toBe(brl(299.9))

    clicarFiltro('Mês anterior')
    expect(
      screen.getByText('Nenhuma movimentação no período selecionado.'),
    ).toBeTruthy()

    clicarFiltro('Personalizado')
    expect(screen.getByLabelText('Início do período')).toBeTruthy()
    expect(screen.getByLabelText('Fim do período')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Início do período'), {
      target: { value: hojeISO() },
    })
    fireEvent.change(screen.getByLabelText('Fim do período'), {
      target: { value: hojeISO() },
    })
    expect(kpi('Receita total')).toBe(brl(299.9))
  })
})
