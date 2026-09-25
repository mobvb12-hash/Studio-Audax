import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import Caixa from './Caixa'
import Dashboard from './Dashboard'
import PDV from './PDV'
import Produtos from './Produtos'
import Relatorios from './Relatorios'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxProdutos: ReturnType<typeof useProdutos>
let ctxEstoque: ReturnType<typeof useEstoque>

function Captura() {
  const caixa = useCaixa()
  const produtos = useProdutos()
  const estoque = useEstoque()
  useEffect(() => {
    ctxCaixa = caixa
    ctxProdutos = produtos
    ctxEstoque = estoque
  })
  return null
}

/** Monta a tela com todos os providers do app (remontar = F5). */
function env(children: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <Captura />
                  {children}
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function criarComEstoque(
  nome: string,
  estoque: number,
  opcoes: { custo?: number; estoqueMinimo?: number } = {},
): string {
  let id = ''
  act(() => {
    id = ctxProdutos.adicionar({
      nome,
      preco: 30,
      custo: opcoes.custo ?? 0,
      estoque,
      estoqueMinimo: opcoes.estoqueMinimo ?? 0,
    }).id
  })
  if (estoque > 0) {
    act(() => {
      ctxEstoque.registrarInicial(ctxProdutos.porId(id)!, estoque)
    })
  }
  return id
}

function erroVisivel(texto: string): boolean {
  try {
    screen.getByText(texto)
    return true
  } catch {
    return false
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
  ctxEstoque = undefined as unknown as ReturnType<typeof useEstoque>
})

describe('Estoque ↔ PDV — venda baixa estoque', () => {
  it('integridade: 10 → venda 3 → 7 → entrada 5 → 12 → estorno 3 → 15 → F5', () => {
    // 1) Cadastro com estoque inicial e venda de 3 no PDV
    let r = env(<PDV />)
    const id = criarComEstoque('Creme capilar', 10, { custo: 12 })
    expect(ctxProdutos.porId(id)?.estoque).toBe(10)

    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByText('Adicionar ao carrinho'))
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar venda' }))

    expect(screen.getByText(/estoque baixado/)).toBeTruthy()
    expect(ctxProdutos.porId(id)?.estoque).toBe(7)
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxEstoque.movimentacoes.map((m) => m.tipo)).toEqual([
      'inicial',
      'venda',
    ])
    r.unmount()

    // 2) Entrada de 5 pela tela de Produtos (modal)
    r = env(<Produtos />)
    fireEvent.click(screen.getByText('Entrada'))
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByLabelText('Custo unitário (R$)'), {
      target: { value: '12,00' },
    })
    fireEvent.change(screen.getByLabelText('Fornecedor'), {
      target: { value: 'Distribuidora X' },
    })
    fireEvent.click(screen.getByText('Registrar entrada'))
    expect(ctxProdutos.porId(id)?.estoque).toBe(12)
    const entrada = ctxEstoque.movimentacoes[2]
    expect(entrada.tipo).toBe('entrada')
    expect(entrada.estoqueAntes).toBe(7)
    expect(entrada.estoqueDepois).toBe(12)
    expect(entrada.fornecedor).toBe('Distribuidora X')
    r.unmount()

    // 3) Estorno pela tela do Caixa devolve 3
    r = env(<Caixa />)
    expect(screen.getByText(/3× Creme capilar/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Estornar' }))
    // modal de confirmação por cima — último botão "Estornar" é o de confirmar
    const botoes = screen.getAllByRole('button', { name: 'Estornar' })
    fireEvent.click(botoes[botoes.length - 1])

    expect(ctxProdutos.porId(id)?.estoque).toBe(15)
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos[0].estornado).toBe(true)
    expect(ctxEstoque.movimentacoes.map((m) => m.tipo)).toEqual([
      'inicial',
      'venda',
      'entrada',
      'estorno',
    ])
    r.unmount()

    // 4) F5: tudo persiste (produtos, movimentações e caixa)
    r = env(<Produtos />)
    expect(ctxProdutos.porId(id)?.estoque).toBe(15)
    expect(ctxEstoque.movimentacoes).toHaveLength(4)
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    const estorno = ctxEstoque.movimentacoes[3]
    expect(estorno.estoqueAntes).toBe(12)
    expect(estorno.estoqueDepois).toBe(15)
    expect(estorno.vendaId).toBe(ctxCaixa.lancamentos[0].id)

    // Histórico completo visível na aba Movimentações
    fireEvent.click(screen.getByText('Movimentações'))
    const tabela = screen.getByRole('table')
    expect(
      within(tabela).getAllByText('Creme capilar'),
    ).toHaveLength(4)
    expect(within(tabela).getByText('Estoque inicial')).toBeTruthy()
    expect(within(tabela).getAllByText('Estorno').length).toBeGreaterThan(0)
    r.unmount()
  })

  it('venda com estoque insuficiente não finaliza: sem lançamento e sem movimentação', () => {
    env(<PDV />)
    const id = criarComEstoque('Creme capilar', 5)

    // Quantidade acima do disponível é barrada ao adicionar
    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '6' },
    })
    fireEvent.click(screen.getByText('Adicionar ao carrinho'))
    expect(
      erroVisivel('Estoque insuficiente para "Creme capilar": disponível 5, solicitado 6.'),
    ).toBe(true)
    expect(screen.getByText('Carrinho vazio.')).toBeTruthy()

    // Mesmo válida no carrinho, a finalização revalida o estoque atual
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByText('Adicionar ao carrinho'))
    act(() => {
      ctxProdutos.aplicarEstoque(id, 1) // outro terminal baixou
    })
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar venda' }))

    expect(
      erroVisivel(
        'Estoque insuficiente para "Creme capilar": disponível 1, solicitado 2. Nenhuma venda foi registrada.',
      ),
    ).toBe(true)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxEstoque.movimentacoes.filter((m) => m.tipo === 'venda')).toHaveLength(0)
    expect(ctxProdutos.porId(id)?.estoque).toBe(1)
  })

  it('produto zerado some do PDV e produto inativo também', () => {
    env(<PDV />)
    criarComEstoque('Sérum seco', 0)
    const inativo = criarComEstoque('Gel fixador', 8)
    act(() => {
      ctxProdutos.alternarAtivo(inativo)
    })
    expect(
      screen.queryByRole('option', { name: /Sérum seco/ }),
    ).toBeNull()
    expect(
      screen.queryByRole('option', { name: /Gel fixador/ }),
    ).toBeNull()
  })
})

describe('Estoque ↔ Caixa — estorno e venda avulsa', () => {
  it('estornar venda antiga (sem baixa de estoque) não cria estoque do nada', () => {
    env(<Caixa />)
    const id = criarComEstoque('Creme capilar', 10)
    act(() => {
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [{ produto: 'Creme capilar', quantidade: 2, preco: 30 }],
        desconto: 0,
        formaPagamento: 'pix',
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Estornar' }))
    const botoes = screen.getAllByRole('button', { name: 'Estornar' })
    fireEvent.click(botoes[botoes.length - 1])

    expect(ctxCaixa.lancamentos[0].estornado).toBe(true)
    expect(ctxProdutos.porId(id)?.estoque).toBe(10)
    expect(
      ctxEstoque.movimentacoes.filter((m) => m.tipo === 'estorno'),
    ).toHaveLength(0)
  })

  it('venda de produto no Caixa baixa estoque e registra a movimentação', () => {
    env(<Caixa />)
    const id = criarComEstoque('Pomada modeladora', 10, { custo: 8 })
    fireEvent.click(screen.getByText('+ Venda de produto'))
    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByText('Registrar venda'))

    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos[0].origem).toBe('produto')
    expect(ctxProdutos.porId(id)?.estoque).toBe(8)
    const venda = ctxEstoque.movimentacoes.find((m) => m.tipo === 'venda')
    expect(venda?.estoqueAntes).toBe(10)
    expect(venda?.estoqueDepois).toBe(8)
    expect(venda?.vendaId).toBe(ctxCaixa.lancamentos[0].id)
  })

  it('venda de produto no Caixa respeita o estoque disponível', () => {
    env(<Caixa />)
    const id = criarComEstoque('Pomada modeladora', 1)
    fireEvent.click(screen.getByText('+ Venda de produto'))
    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByText('Registrar venda'))
    expect(
      erroVisivel(
        'Estoque insuficiente para "Pomada modeladora": disponível 1, solicitado 2.',
      ),
    ).toBe(true)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxProdutos.porId(id)?.estoque).toBe(1)
  })
})

describe('Produtos — cadastro e ajuste com histórico', () => {
  it('cadastrar com estoque inicial gera movimentação "Estoque inicial"', () => {
    env(<Produtos />)
    fireEvent.click(screen.getByText('+ Novo produto'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Creme capilar' },
    })
    fireEvent.change(screen.getByLabelText('Preço de venda (R$) *'), {
      target: { value: '30,00' },
    })
    fireEvent.change(screen.getByLabelText('Estoque inicial'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByText('Cadastrar produto'))

    expect(ctxProdutos.produtos).toHaveLength(1)
    const p = ctxProdutos.produtos[0]
    expect(p.estoque).toBe(10)
    expect(ctxEstoque.movimentacoes).toHaveLength(1)
    const m = ctxEstoque.movimentacoes[0]
    expect(m.tipo).toBe('inicial')
    expect(m.estoqueAntes).toBe(0)
    expect(m.estoqueDepois).toBe(10)
  })

  it('ajuste manual de saída com motivo registra histórico e não negativa', () => {
    env(<Produtos />)
    const id = criarComEstoque('Creme capilar', 10)
    // Ações de entrada/ajuste ficam na aba Movimentações
    fireEvent.click(screen.getByText('Movimentações'))
    fireEvent.click(screen.getByText('+ Ajuste'))
    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.click(screen.getByLabelText('Saída'))
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '3' },
    })
    fireEvent.change(screen.getByLabelText('Motivo *'), {
      target: { value: 'perda' },
    })
    fireEvent.click(screen.getByText('Registrar ajuste'))

    expect(ctxProdutos.porId(id)?.estoque).toBe(7)
    const ajuste = ctxEstoque.movimentacoes[1]
    expect(ajuste.tipo).toBe('ajuste')
    expect(ajuste.quantidade).toBe(-3)
    expect(ajuste.motivo).toBe('perda')

    // Saída acima do disponível é recusada
    fireEvent.click(screen.getByText('+ Ajuste'))
    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.click(screen.getByLabelText('Saída'))
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '99' },
    })
    fireEvent.change(screen.getByLabelText('Motivo *'), {
      target: { value: 'avaria' },
    })
    fireEvent.click(screen.getByText('Registrar ajuste'))
    expect(screen.getByText(/Estoque insuficiente/)).toBeTruthy()
    expect(ctxProdutos.porId(id)?.estoque).toBe(7)
    expect(ctxEstoque.movimentacoes).toHaveLength(2)
  })
})

describe('Dashboard — cartão Estoque baixo com dados reais', () => {
  it('mostra produtos baixos/zerados e permite ir para o estoque', () => {
    env(
      <Dashboard
        onNovo={() => undefined}
        onIrParaEstoque={() => undefined}
      />,
    )
    criarComEstoque('Creme capilar', 2, { estoqueMinimo: 3 })
    criarComEstoque('Pomada modeladora', 0)
    criarComEstoque('Gel fixador', 1, { estoqueMinimo: 0 })
    act(() => {
      const gel = ctxProdutos.produtos.find((p) => p.nome === 'Gel fixador')!
      ctxProdutos.alternarAtivo(gel.id) // inativo fora do indicador
    })

    const secao = screen
      .getByRole('heading', { name: 'Estoque baixo', level: 2 })
      .closest('section') as HTMLElement
    expect(within(secao).getByText('2')).toBeTruthy() // contador
    expect(within(secao).getByText('Creme capilar')).toBeTruthy()
    expect(within(secao).getByText('Pomada modeladora')).toBeTruthy()
    expect(within(secao).queryByText('Gel fixador')).toBeNull()
    expect(within(secao).getByText(/1 com estoque zerado/)).toBeTruthy()
    expect(within(secao).getByText('Ver estoque →')).toBeTruthy()
  })

  it('estado vazio: nenhum produto abaixo do mínimo', () => {
    env(<Dashboard onNovo={() => undefined} />)
    criarComEstoque('Creme capilar', 10, { estoqueMinimo: 2 })
    const secao = screen
      .getByRole('heading', { name: 'Estoque baixo', level: 2 })
      .closest('section') as HTMLElement
    expect(
      within(secao).getByText('Nenhum produto abaixo do mínimo.'),
    ).toBeTruthy()
    expect(within(secao).queryByText('Ver estoque →')).toBeNull()
  })
})

describe('Relatórios — seção Produtos', () => {
  it('mostra quantidade vendida, receita, estoque atual e status', () => {
    env(
      <div data-testid="relatorios">
        <Relatorios />
      </div>,
    )
    const id = criarComEstoque('Creme capilar', 4, {
      custo: 12,
      estoqueMinimo: 10,
    })
    act(() => {
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [
          { produtoId: id, produto: 'Creme capilar', quantidade: 2, preco: 30 },
        ],
        desconto: 0,
        formaPagamento: 'pix',
      })
    })

    const secao = screen
      .getByRole('heading', { name: 'Produtos', level: 2 })
      .closest('section') as HTMLElement
    expect(within(secao).getByText('Creme capilar')).toBeTruthy()
    expect(within(secao).getByText(/Vendidos no período: 2/)).toBeTruthy()
    expect(within(secao).getByText(/Receita de produtos: R\$\s60,00/)).toBeTruthy()
    expect(within(secao).getByText('Baixo')).toBeTruthy() // 4 <= mínimo 10
    expect(within(secao).getByText(/Estoque baixo\/zerado: 1/)).toBeTruthy()
  })

  it('sem produtos mostra estado vazio', () => {
    env(
      <div data-testid="relatorios">
        <Relatorios />
      </div>,
    )
    const secao = screen
      .getByRole('heading', { name: 'Produtos', level: 2 })
      .closest('section') as HTMLElement
    expect(
      within(secao).getByText('Nenhum produto cadastrado.'),
    ).toBeTruthy()
  })
})
