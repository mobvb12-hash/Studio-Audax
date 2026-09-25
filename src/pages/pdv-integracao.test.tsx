import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import ClienteDetalheModal from '@/components/ClienteDetalheModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { linhasDetalhadasDoPeriodo, totaisDoPeriodo } from '@/modules/comissoes/resumo'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider, useProfissionais } from '@/modules/profissionais/store'
import { periodoSemana } from '@/modules/relatorios/periodo'
import { ServicosProvider } from '@/modules/servicos/store'
import Dashboard from './Dashboard'
import PDV from './PDV'
import Relatorios from './Relatorios'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClientes: ReturnType<typeof useClientes>
let ctxProdutos: ReturnType<typeof useProdutos>
let ctxComissoes: ReturnType<typeof useComissoes>
let ctxProfissionais: ReturnType<typeof useProfissionais>

function Captura() {
  const caixa = useCaixa()
  const clientes = useClientes()
  const produtos = useProdutos()
  const comissoes = useComissoes()
  const profissionais = useProfissionais()
  useEffect(() => {
    ctxCaixa = caixa
    ctxClientes = clientes
    ctxProdutos = produtos
    ctxComissoes = comissoes
    ctxProfissionais = profissionais
  })
  return null
}

function env(children: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <ServicosProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <ComissoesProvider>
                    <Captura />
                    {children}
                  </ComissoesProvider>
                </CaixaProvider>
              </AgendaProvider>
            </ServicosProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

/** Cliente + atendimento de R$100 (Audax) + produtos Creme 30 / Pomada 50. */
function semearBase() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      email: '',
      observacao: '',
    })
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-1',
      data: hojeISO(),
      hora: '09:00',
      cliente: 'Lucas Mendes',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 100,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'confirmado',
    })
    ctxProdutos.adicionar({ nome: 'Creme capilar', preco: 30 })
    ctxProdutos.adicionar({ nome: 'Pomada modeladora', preco: 50 })
  })
  // act separado: lê o cliente já salvo pelo render anterior
  act(() => {
    ctxCaixa.registrarVenda({
      data: hojeISO(),
      itens: [
        { produto: 'Creme capilar', quantidade: 2, preco: 30 },
        { produto: 'Pomada modeladora', quantidade: 1, preco: 50 },
      ],
      desconto: 10,
      formaPagamento: 'dinheiro',
      cliente: 'Lucas Mendes',
      clienteId: ctxClientes.clientes[0]?.id,
      profissional: 'Diego',
    })
  })
}

function celulaKpi(rotulo: string): string {
  const candidatos = within(screen.getByTestId('relatorios')).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P')
  if (!rotuloEl) throw new Error(`KPI não encontrado: ${rotulo}`)
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

function kpiDashboard(rotulo: string): HTMLElement {
  return screen.getByText(rotulo).parentElement as HTMLElement
}

function addItem(id: string, qtd: string) {
  fireEvent.change(screen.getByLabelText('Produto *'), {
    target: { value: id },
  })
  fireEvent.change(screen.getByLabelText('Quantidade *'), {
    target: { value: qtd },
  })
  fireEvent.click(screen.getByText('Adicionar ao carrinho'))
}

beforeEach(() => {
  localStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
  ctxComissoes = undefined as unknown as ReturnType<typeof useComissoes>
  ctxProfissionais = undefined as unknown as ReturnType<typeof useProfissionais>
})

describe('PDV ↔ Caixa — auditoria numérica', () => {
  it('venda via interface: 2×30 + 1×50 − 10 = R$100 em um único lançamento', () => {
    env(<PDV />)
    act(() => {
      ctxClientes.adicionar({
        nome: 'Lucas Mendes',
        telefone: '(11) 98888-7777',
        email: '',
        observacao: '',
      })
      ctxProdutos.adicionar({ nome: 'Creme capilar', preco: 30, estoque: 10 })
      ctxProdutos.adicionar({
        nome: 'Pomada modeladora',
        preco: 50,
        estoque: 10,
      })
    })
    const creme = ctxProdutos.produtos.find((p) => p.nome === 'Creme capilar')!
    const pomada = ctxProdutos.produtos.find(
      (p) => p.nome === 'Pomada modeladora',
    )!
    addItem(creme.id, '2')
    addItem(pomada.id, '1')
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Cliente (opcional)'), {
      target: { value: ctxClientes.clientes[0].id },
    })
    fireEvent.change(screen.getByLabelText('Profissional (opcional)'), {
      target: { value: 'Diego' },
    })
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'dinheiro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar venda' }))

    // Caixa: exatamente UM lançamento de produto com os números certos
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    const venda = ctxCaixa.lancamentos[0]
    expect(venda.origem).toBe('produto')
    expect(venda.valor).toBe(110)
    expect(venda.desconto).toBe(10)
    expect(venda.valorLiquido).toBe(100)
    expect(venda.quantidade).toBe(3)

    // Resumo do dia do Caixa
    const resumo = ctxCaixa.resumoDoDia(hojeISO())
    expect(resumo.receitasProdutos).toBe(100)
    expect(resumo.receitasAtendimentos).toBe(0)
    expect(resumo.totalRecebido).toBe(100)
    expect(resumo.descontos).toBe(10)
    expect(resumo.qtdProdutos).toBe(1)
    expect(resumo.qtdAtendimentos).toBe(0)
    expect(resumo.porForma.dinheiro).toBe(100)

    // Venda atribuída ao profissional no Caixa
    const diego = resumo.porProfissional.find((p) => p.nome === 'Diego')
    expect(diego?.valor).toBe(100)
    expect(diego?.qtd).toBe(1)

    // Estoque: baixa automática de 2 Creme + 1 Pomada (10 → 8 e 10 → 9)
    const cremeDepois = ctxProdutos.produtos.find(
      (p) => p.nome === 'Creme capilar',
    )!
    const pomadaDepois = ctxProdutos.produtos.find(
      (p) => p.nome === 'Pomada modeladora',
    )!
    expect(cremeDepois.estoque).toBe(8)
    expect(pomadaDepois.estoque).toBe(9)
  })
})

describe('PDV ↔ Relatórios', () => {
  it('Receita de produtos R$100 soma à Receita total do período', () => {
    const result = env(
      <div data-testid="relatorios">
        <Relatorios />
      </div>,
    )
    semearBase()

    fireEvent.click(
      within(screen.getByTestId('relatorios')).getByText('Hoje'),
    )
    expect(celulaKpi('Receita de serviços')).toContain('R$ 100,00')
    expect(celulaKpi('Receita de produtos')).toContain('R$ 100,00')
    expect(celulaKpi('Receita total')).toContain('R$ 200,00')
    expect(celulaKpi('Atendimentos pagos')).toBe('1')
    expect(result.container).toBeTruthy()
  })
})

describe('PDV ↔ Dashboard', () => {
  it('Receita do mês soma venda e atendimento; comissões não mudam', () => {
    env(<Dashboard onNovo={() => undefined} />)
    semearBase()

    expect(
      within(kpiDashboard('Receita do mês')).getByText('R$ 200,00'),
    ).toBeTruthy()
    // Comissão só do atendimento de Audax (100 × 40%) — venda não gera comissão
    expect(
      within(kpiDashboard('Comissões a pagar')).getByText('R$ 40,00'),
    ).toBeTruthy()
    // Ticket médio usa apenas atendimentos: 100 / 1
    expect(
      within(kpiDashboard('Ticket médio')).getByText('R$ 100,00'),
    ).toBeTruthy()
  })
})

describe('PDV ↔ Clientes', () => {
  it('histórico do cliente separa pagamentos de atendimento e compras de produtos', () => {
    const r1 = env(null)
    semearBase()
    const lucas = ctxClientes.clientes[0]
    r1.unmount()

    env(<ClienteDetalheModal cliente={lucas} onFechar={() => undefined} />)

    expect(screen.getByText('Pagamentos de atendimentos')).toBeTruthy()
    expect(screen.getByText('Compras de produtos')).toBeTruthy()
    const compras = screen
      .getByText('Compras de produtos')
      .parentElement as HTMLElement
    expect(
      within(compras).getByText('2× Creme capilar, 1× Pomada modeladora'),
    ).toBeTruthy()
    expect(within(compras).getByText('R$ 100,00')).toBeTruthy()
    const pagamentos = screen
      .getByText('Pagamentos de atendimentos')
      .parentElement as HTMLElement
    expect(within(pagamentos).getByText('R$ 100,00')).toBeTruthy()
    // Total gasto sem duplicidade: 100 (atendimento) + 100 (venda)
    expect(
      within(screen.getByText('Total gasto').parentElement as HTMLElement).getByText(
        'R$ 200,00',
      ),
    ).toBeTruthy()
  })
})

describe('PDV ↔ Profissionais e Comissões', () => {
  it('venda com profissional não gera comissão; comissão do atendimento permanece', () => {
    env(null)
    semearBase()

    const linhas = linhasDetalhadasDoPeriodo(
      ctxCaixa.lancamentos,
      ctxProfissionais.profissionais,
      ctxComissoes.configDe,
      periodoSemana(),
    )
    const audax = linhas.find((l) => l.nome === 'Audax')!
    expect(audax.producao).toBe(100)
    expect(audax.comissao).toBe(40)
    expect(audax.qtd).toBe(1)

    // Diego recebeu a venda no Caixa, mas produtos não entram na comissão
    const diego = linhas.find((l) => l.nome === 'Diego')!
    expect(diego.producao).toBe(0)
    expect(diego.comissao).toBe(0)
    expect(diego.qtd).toBe(0)
    expect(diego.producaoProdutos).toBe(100)

    expect(totaisDoPeriodo(linhas).comissao).toBe(40)
  })
})
