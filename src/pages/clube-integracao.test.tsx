import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import ClienteDetalheModal from '@/components/ClienteDetalheModal'
import FechamentoCaixaModal from '@/components/FechamentoCaixaModal'
import { addMonthsISO } from '@/modules/clube/regras'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider, useClube } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Dashboard from './Dashboard'
import PDV from './PDV'
import Relatorios from './Relatorios'

const DIA = hojeISO()

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxClientes: ReturnType<typeof useClientes>
let ctxProdutos: ReturnType<typeof useProdutos>
let ctxClube: ReturnType<typeof useClube>

function Captura() {
  const caixa = useCaixa()
  const clientes = useClientes()
  const produtos = useProdutos()
  const clube = useClube()
  useEffect(() => {
    ctxCaixa = caixa
    ctxClientes = clientes
    ctxProdutos = produtos
    ctxClube = clube
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
                    <ClubeProvider>
                      <Captura />
                      {children}
                    </ClubeProvider>
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

/** Cliente + produto R$100 (estoque 10) + assinatura. Retorna o id do cliente. */
function semear(
  dataAssinatura: string = DIA,
  valorMensal = 99.9,
): string {
  const r: { clienteId?: string } = {}
  act(() => {
    r.clienteId = ctxClientes.adicionar({
      nome: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      email: '',
      observacao: '',
    }).id
    ctxProdutos.adicionar({ nome: 'Pomada Black', preco: 100, estoque: 10 })
    ctxClube.assinar({
      clienteId: r.clienteId,
      cliente: 'Lucas Mendes',
      plano: 'cabelo_barba',
      valorMensal,
      dataAssinatura,
    })
  })
  return r.clienteId as string
}

function produtoId(): string {
  return ctxProdutos.produtos.find((p) => p.nome === 'Pomada Black')!.id
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

function selecionarCliente(id: string) {
  fireEvent.change(screen.getByLabelText('Cliente (opcional)'), {
    target: { value: id },
  })
}

function finalizar() {
  fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
    target: { value: 'pix' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar venda' }))
}

function norm(s: string | null | undefined): string {
  return (s ?? '').replace(/\u00a0/g, ' ')
}

function linha(rótulo: string): string {
  return norm(
    (screen.getByText(rótulo).parentElement as HTMLElement).textContent,
  )
}

function celulaKpi(rotulo: string): string {
  const candidatos = within(screen.getByTestId('relatorios')).getAllByText(rotulo)
  const rotuloEl = candidatos.find((el) => el.tagName === 'P')
  if (!rotuloEl) throw new Error(`KPI não encontrado: ${rotulo}`)
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

function valorDashboard(rotulo: string): string {
  const rotuloEl = screen
    .getAllByText(rotulo)
    .find((el) => el.tagName === 'P') as HTMLElement
  const ps = rotuloEl.parentElement?.querySelectorAll('p')
  return norm(ps?.[1]?.textContent).trim()
}

beforeEach(() => {
  localStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
  ctxClube = undefined as unknown as ReturnType<typeof useClube>
})

describe('Audax Club ↔ PDV — desconto do assinante', () => {
  it('assinante vigente ganha 10% no subtotal e o desconto entra na venda', () => {
    env(<PDV />)
    const clienteId = semear()
    addItem(produtoId(), '1')

    // sem cliente: nada de desconto
    expect(
      screen.queryByText('Desconto assinante Audax Club (10%)'),
    ).toBeNull()
    expect(linha('Total da venda')).toContain('R$ 100,00')

    selecionarCliente(clienteId)
    expect(screen.getByText('Desconto assinante Audax Club (10%)')).toBeTruthy()
    expect(
      (screen.getByText('Desconto assinante Audax Club (10%)')
        .parentElement as HTMLElement).textContent,
    ).toContain('10,00')
    expect(screen.getByText(/desconto de 10% aplicado/)).toBeTruthy()
    expect(linha('Total da venda')).toContain('R$ 90,00')

    finalizar()

    expect(ctxCaixa.lancamentos).toHaveLength(1)
    const venda = ctxCaixa.lancamentos[0]
    expect(venda.origem).toBe('produto')
    expect(venda.valor).toBe(100)
    expect(venda.desconto).toBe(10)
    expect(venda.valorLiquido).toBe(90)

    const resumo = ctxCaixa.resumoDoDia(DIA)
    expect(resumo.receitasProdutos).toBe(90)
    expect(resumo.descontos).toBe(10)
    expect(resumo.totalRecebido).toBe(90)

    expect(ctxProdutos.produtos[0].estoque).toBe(9)
  })

  it('assinatura atrasada não ganha desconto e avisa na tela', () => {
    env(<PDV />)
    // vencimento há 5 dias → atrasada (não vigente)
    const clienteId = semear(addMonthsISO(somarDias(DIA, -5), -1))
    addItem(produtoId(), '1')
    selecionarCliente(clienteId)

    expect(
      screen.queryByText('Desconto assinante Audax Club (10%)'),
    ).toBeNull()
    expect(screen.getByText(/sem desconto de assinante/)).toBeTruthy()
    expect(linha('Total da venda')).toContain('R$ 100,00')

    finalizar()

    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos[0].desconto).toBe(0)
    expect(ctxCaixa.lancamentos[0].valorLiquido).toBe(100)
    expect(ctxCaixa.resumoDoDia(DIA).receitasProdutos).toBe(100)
  })

  it('desconto manual é limitado ao restante do subtotal do assinante', () => {
    env(<PDV />)
    const clienteId = semear()
    addItem(produtoId(), '1')
    selecionarCliente(clienteId)

    // subtotal 100 − 10 (assinante) = limite de 90
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '95' },
    })
    finalizar()
    expect(
      screen.getByText('O desconto não pode ser maior que o total da venda.'),
    ).toBeTruthy()
    expect(ctxCaixa.lancamentos).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '80' },
    })
    finalizar()

    expect(ctxCaixa.lancamentos).toHaveLength(1)
    const venda = ctxCaixa.lancamentos[0]
    expect(venda.desconto).toBe(90) // 10 (assinante) + 80 (manual)
    expect(venda.valorLiquido).toBe(10)
    expect(ctxCaixa.resumoDoDia(DIA).descontos).toBe(90)
  })
})

describe('Audax Club ↔ Caixa — receita e estorno', () => {
  it('pagamento vira receita do dia com origem clube; estorno zera o resumo', () => {
    env(null)
    const clienteId = semear()

    let lancamentoId = ''
    act(() => {
      lancamentoId = ctxClube.registrarPagamento({
        assinaturaId: ctxClube.assinaturas[0].id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      }).pagamento.caixaLancamentoId as string
    })

    const l = ctxCaixa.lancamentos.find((x) => x.id === lancamentoId)!
    expect(l.origem).toBe('clube')
    expect(l.valorLiquido).toBe(99.9)
    expect(l.clienteId).toBe(clienteId)
    expect(l.descricao).toContain('Assinatura')

    const resumo = ctxCaixa.resumoDoDia(DIA)
    expect(resumo.receitasClube).toBe(99.9)
    expect(resumo.receitasAtendimentos).toBe(0)
    expect(resumo.receitasProdutos).toBe(0)
    expect(resumo.totalRecebido).toBe(99.9)
    expect(resumo.porForma.pix).toBe(99.9)

    act(() => {
      ctxCaixa.estornar(lancamentoId)
    })

    const depois = ctxCaixa.resumoDoDia(DIA)
    expect(depois.receitasClube).toBe(0)
    expect(depois.totalRecebido).toBe(0)
    // histórico do clube é preservado mesmo com o estorno no caixa
    expect(ctxClube.pagamentos).toHaveLength(1)
  })

  it('fechamento do caixa exibe a linha de assinaturas do clube', () => {
    env(<FechamentoCaixaModal data={DIA} onFechar={() => undefined} />)
    const clienteId = semear()
    expect(clienteId).toBeTruthy()

    act(() => {
      ctxClube.registrarPagamento({
        assinaturaId: ctxClube.assinaturas[0].id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
    })

    expect(linha('Assinaturas do clube')).toContain('R$ 99,90')
    expect(linha('Total recebido')).toContain('R$ 99,90')
  })
})

describe('Audax Club ↔ Dashboard', () => {
  it('KPI, cartão e chips refletem assinaturas e pagamentos do mês', () => {
    env(<Dashboard onNovo={() => undefined} />)
    semear(DIA, 99.9) // vigente
    // segunda assinatura atrasada (não conta em "ativas")
    act(() => {
      const cliente = ctxClientes.adicionar({
        nome: 'Ana Souza',
        telefone: '',
        email: '',
        observacao: '',
      })
      ctxClube.assinar({
        clienteId: cliente.id,
        cliente: 'Ana Souza',
        plano: 'cabelo',
        valorMensal: 79.9,
        dataAssinatura: addMonthsISO(somarDias(DIA, -5), -1),
      })
      ctxClube.registrarPagamento({
        assinaturaId: ctxClube.assinaturas[0].id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
    })

    expect(valorDashboard('Assinaturas ativas')).toBe('1')

    // cartão "Assinaturas"
    const prevista = norm(
      (
        screen.getByText('Receita recorrente prevista/mês')
          .parentElement as HTMLElement
      ).textContent,
    )
    expect(prevista).toContain('R$ 179,80') // 99,90 + 79,90 (não canceladas)

    const pago = norm(
      (
        screen.getByText('Pagamentos do clube este mês')
          .parentElement as HTMLElement
      ).textContent,
    )
    expect(pago).toContain('R$ 99,90')

    expect(screen.getByText('1 ativas')).toBeTruthy()
    expect(screen.getByText('1 atrasada(s)')).toBeTruthy()
  })
})

describe('Audax Club ↔ Relatórios', () => {
  it('receita de assinaturas soma na receita total do período', () => {
    env(
      <div data-testid="relatorios">
        <Relatorios />
      </div>,
    )
    semear()

    act(() => {
      ctxClube.registrarPagamento({
        assinaturaId: ctxClube.assinaturas[0].id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
    })

    fireEvent.click(
      within(screen.getByTestId('relatorios')).getByText('Hoje'),
    )
    expect(celulaKpi('Receita de assinaturas')).toContain('R$ 99,90')
    expect(celulaKpi('Receita total')).toContain('R$ 99,90')
    expect(celulaKpi('Receita de serviços')).toContain('R$ 0,00')
    expect(celulaKpi('Atendimentos pagos')).toBe('0')
  })
})

describe('Audax Club ↔ ClienteDetalheModal', () => {
  it('pagamento de assinatura aparece em Audax Club e não duplica em atendimentos', () => {
    const r1 = env(null)
    const clienteId = semear()

    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: DIA,
        hora: '09:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 100,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'concluido',
      })
      ctxClube.registrarPagamento({
        assinaturaId: ctxClube.assinaturas[0].id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'cartao_credito',
      })
    })
    const cliente = ctxClientes.clientes.find((c) => c.id === clienteId)!
    r1.unmount()

    env(<ClienteDetalheModal cliente={cliente} onFechar={() => undefined} />)

    const clube = screen.getByText('Audax Club (assinaturas)')
      .parentElement as HTMLElement
    expect(norm(clube.textContent)).toContain('R$ 99,90')
    expect(norm(clube.textContent)).toContain('Assinatura')

    const atendimentos = screen.getByText('Pagamentos de atendimentos')
      .parentElement as HTMLElement
    expect(norm(atendimentos.textContent)).toContain('R$ 100,00')
    expect(norm(atendimentos.textContent)).not.toContain('R$ 99,90')

    const total = screen.getByText('Total gasto').parentElement as HTMLElement
    expect(norm(total.textContent)).toContain('R$ 199,90')
  })
})
