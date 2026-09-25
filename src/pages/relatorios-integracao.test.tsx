import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { formatarBRL } from '@/lib/moeda'
import Comissoes from './Comissoes'
import Dashboard from './Dashboard'
import Relatorios from './Relatorios'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClientes: ReturnType<typeof useClientes>

function Captura() {
  const caixa = useCaixa()
  const clientes = useClientes()
  useEffect(() => {
    ctxCaixa = caixa
    ctxClientes = clientes
  })
  return null
}

function montar(children: React.ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <ComissoesProvider>
                <Captura />
                {children}
              </ComissoesProvider>
            </CaixaProvider>
          </AgendaProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function semear() {
  let idEstornar = ''
  act(() => {
    ctxClientes.adicionar({
      nome: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      email: '',
      observacao: '',
    })
    // Pagamento com desconto: 100 - 20 = 80 (PIX, Audax)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: hojeISO(),
      hora: '09:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 100,
      desconto: 20,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
    // Pagamento simples: 50 (dinheiro, Diego)
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-2',
      data: hojeISO(),
      hora: '10:00',
      cliente: 'Ana Souza',
      profissional: 'Diego',
      servico: 'Barba',
      valor: 50,
      desconto: 0,
      formaPagamento: 'dinheiro',
      statusAgendamento: 'confirmado',
    })
    // Venda de produto: 30 (dinheiro)
    ctxCaixa.venderProduto({
      data: hojeISO(),
      produto: 'Pomada',
      quantidade: 1,
      preco: 30,
      desconto: 0,
      formaPagamento: 'dinheiro',
      profissional: 'Diego',
    })
    // Despesa: 100 (PIX)
    ctxCaixa.adicionarDespesa({
      data: hojeISO(),
      descricao: 'Aluguel',
      categoria: 'Aluguel',
      valor: 100,
      formaPagamento: 'pix',
    })
    // Estorno: 40 (cartão crédito) — fora da receita
    const est = ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-3',
      data: hojeISO(),
      hora: '15:00',
      cliente: 'Ana Souza',
      profissional: 'Diego',
      servico: 'Barba',
      valor: 40,
      desconto: 0,
      formaPagamento: 'cartao_credito',
      statusAgendamento: 'confirmado',
    })
    idEstornar = est.id
  })
  // act separado: o estorno precisa ler a lista já atualizada
  act(() => {
    ctxCaixa.estornar(idEstornar)
  })
}

/** Normaliza o espaço não separável do toLocaleString('pt-BR'). */
function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

const brl = (v: number) => norm(formatarBRL(v))

function valorKpi(container: HTMLElement, rotulo: string): string {
  const candidatos = within(container).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P')
  if (!rotuloEl) throw new Error(`KPI não encontrado: ${rotulo}`)
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

beforeEach(() => {
  localStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
})

describe('Integração Caixa ↔ Relatórios', () => {
  it('mesmos números de receita, despesa, estorno e produto', () => {
    montar(
      <div data-testid="rel">
        <Relatorios />
      </div>,
    )
    semear()

    // Fonte do Caixa para o dia de hoje
    const resumoDia = ctxCaixa.resumoDoDia(hojeISO())

    fireEvent.click(screen.getByText('Hoje'))

    const rel = screen.getByTestId('rel')
    expect(valorKpi(rel, 'Receita total')).toBe(brl(resumoDia.totalRecebido))
    expect(valorKpi(rel, 'Receita de serviços')).toBe(
      brl(resumoDia.receitasAtendimentos),
    )
    expect(valorKpi(rel, 'Receita de produtos')).toBe(
      brl(resumoDia.receitasProdutos),
    )
    expect(valorKpi(rel, 'Despesas')).toBe(brl(resumoDia.despesas))
    expect(valorKpi(rel, 'Resultado líquido')).toBe(brl(resumoDia.liquido))
    expect(valorKpi(rel, 'Atendimentos pagos')).toBe(
      String(resumoDia.qtdAtendimentos),
    )
    // Estorno não compõe a receita (40 fora)
    expect(valorKpi(rel, 'Estornos')).toBe(brl(40))
    expect(valorKpi(rel, 'Receita total')).toBe(brl(160))
    expect(valorKpi(rel, 'Despesas')).toBe(brl(100))
  })
})

describe('Integração Dashboard ↔ Relatórios', () => {
  it('KPIs de mês idênticos nos dois painéis', () => {
    montar(
      <div>
        <div data-testid="rel">
          <Relatorios />
        </div>
        <div data-testid="dash">
          <Dashboard onNovo={() => undefined} />
        </div>
      </div>,
    )
    semear()

    const rel = screen.getByTestId('rel')
    const dash = screen.getByTestId('dash')

    expect(valorKpi(rel, 'Receita total')).toBe(valorKpi(dash, 'Receita do mês'))
    expect(valorKpi(rel, 'Despesas')).toBe(valorKpi(dash, 'Despesas do mês'))
    expect(valorKpi(rel, 'Ticket médio')).toBe(valorKpi(dash, 'Ticket médio'))
    expect(valorKpi(rel, 'Comissões a pagar')).toBe(
      valorKpi(dash, 'Comissões a pagar'),
    )

    // Valores conferidos: receita 80 + 50 + 30 = 160; despesa 100
    expect(valorKpi(rel, 'Receita total')).toBe('R$ 160,00')
    expect(valorKpi(rel, 'Despesas')).toBe('R$ 100,00')
    // Ticket médio = 130 / 2 atendimentos = 65
    expect(valorKpi(rel, 'Ticket médio')).toBe('R$ 65,00')
    // Comissões: Audax 40% de 80 = 32 · Diego 40% de 50 = 20 → 52
    expect(valorKpi(rel, 'Comissões a pagar')).toBe('R$ 52,00')
  })
})

describe('Integração Comissões ↔ Relatórios', () => {
  it('produção e comissão batem por profissional e no total', () => {
    montar(
      <div>
        <div data-testid="rel">
          <Relatorios />
        </div>
        <div data-testid="comis">
          <Comissoes />
        </div>
      </div>,
    )
    semear()

    const rel = screen.getByTestId('rel')
    const comis = screen.getByTestId('comis')

    // Total idêntico
    expect(valorKpi(rel, 'Comissões a pagar')).toBe(
      valorKpi(comis, 'Comissões a pagar'),
    )
    expect(valorKpi(rel, 'Comissões a pagar')).toBe('R$ 52,00')

    // Linha do Audax: mesma produção e mesma comissão nas duas telas
    const linhaComis = within(comis).getByText('Audax').closest('tr') as HTMLElement
    const cellsComis = within(linhaComis).getAllByRole('cell')
    const secaoRel = screen
      .getByText('Comissões do período')
      .closest('section') as HTMLElement
    const linhaRel = within(secaoRel)
      .getByText('Audax')
      .closest('tr') as HTMLElement
    const cellsRel = within(linhaRel).getAllByRole('cell')

    // Comissões: [nome, atend, produção, %, comissão, ações]
    // Relatórios: [nome, %, produção, comissão]
    expect(cellsComis[2].textContent).toBe(cellsRel[2].textContent) // produção
    expect(cellsComis[4].textContent).toBe(cellsRel[3].textContent) // comissão
    expect(norm(cellsComis[4].textContent)).toContain('R$ 32,00')
  })
})

describe('Integração Relatórios ↔ persistência', () => {
  it('F5 (remontagem) mantém os mesmos resultados', () => {
    const primeiro = montar(
      <div data-testid="rel">
        <Relatorios />
      </div>,
    )
    semear()

    fireEvent.click(screen.getByText('Hoje'))
    const antes = valorKpi(screen.getByTestId('rel'), 'Receita total')
    expect(antes).toBe('R$ 160,00')

    primeiro.unmount()
    montar(
      <div data-testid="rel">
        <Relatorios />
      </div>,
    )
    fireEvent.click(screen.getByText('Hoje'))
    const depois = valorKpi(screen.getByTestId('rel'), 'Receita total')
    expect(depois).toBe(antes)
  })
})
