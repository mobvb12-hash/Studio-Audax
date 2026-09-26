import { act, useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider, useComissoes } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import PDV from './PDV'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxProdutos: ReturnType<typeof useProdutos>
let ctxComissoes: ReturnType<typeof useComissoes>
let ctxClientes: ReturnType<typeof useClientes>

function Captura() {
  const caixa = useCaixa()
  const produtos = useProdutos()
  const comissoes = useComissoes()
  const clientes = useClientes()
  useEffect(() => {
    ctxCaixa = caixa
    ctxProdutos = produtos
    ctxComissoes = comissoes
    ctxClientes = clientes
  })
  return null
}

function montar() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <ClubeProvider>
                    <Captura />
                    <div data-testid="pdv">
                      <PDV />
                    </div>
                  </ClubeProvider>
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function criarProduto(
  nome: string,
  preco: number,
  estoque: number = 10,
): string {
  let id = ''
  act(() => {
    id = ctxProdutos.adicionar({ nome, preco, estoque }).id
  })
  return id
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

function escolherForma(forma: string) {
  fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
    target: { value: forma },
  })
}

function finalizar(): HTMLElement {
  const botao = screen.getByRole('button', { name: 'Finalizar venda' })
  fireEvent.click(botao)
  return botao
}

function erroVisivel(texto: string): boolean {
  try {
    screen.getByText(texto)
    return true
  } catch {
    return false
  }
}

function semearVendaBasica() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Lucas Mendes',
      telefone: '(11) 98888-7777',
      email: '',
      observacao: '',
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
  ctxComissoes = undefined as unknown as ReturnType<typeof useComissoes>
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
})

describe('PDV — venda completa', () => {
  it('finaliza venda com cliente, profissional, desconto e forma de pagamento', () => {
    montar()
    semearVendaBasica()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '2')
    expect(screen.getByText('Creme capilar')).toBeTruthy()
    expect(screen.getAllByText('R$ 60,00').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '10' },
    })
    expect(screen.getByText('R$ 50,00')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Cliente (opcional)'), {
      target: { value: ctxClientes.clientes[0].id },
    })
    fireEvent.change(screen.getByLabelText('Profissional (opcional)'), {
      target: { value: 'Ítalo Santos' },
    })
    escolherForma('dinheiro')
    finalizar()

    expect(screen.getByText(/registrada no caixa/)).toBeTruthy()
    expect(screen.getByText('Carrinho vazio.')).toBeTruthy()

    expect(ctxCaixa.lancamentos).toHaveLength(1)
    const venda = ctxCaixa.lancamentos[0]
    expect(venda.origem).toBe('produto')
    expect(venda.data).toBe(hojeISO())
    expect(venda.valor).toBe(60)
    expect(venda.desconto).toBe(10)
    expect(venda.valorLiquido).toBe(50)
    expect(venda.quantidade).toBe(2)
    expect(venda.descricao).toBe('2× Creme capilar')
    expect(venda.formaPagamento).toBe('dinheiro')
    expect(venda.cliente).toBe('Lucas Mendes')
    expect(venda.clienteId).toBe(ctxClientes.clientes[0].id)
    expect(venda.profissional).toBe('Ítalo Santos')
    expect(venda.itens).toHaveLength(1)
    expect(venda.itens?.[0]).toEqual({
      produtoId: id,
      produto: 'Creme capilar',
      quantidade: 2,
      preco: 30,
    })
  })

  it('soma itens diferentes em um único lançamento com descrição agregada', () => {
    montar()
    const creme = criarProduto('Creme capilar', 30)
    const pomada = criarProduto('Pomada modeladora', 50)
    addItem(creme, '2')
    addItem(pomada, '1')
    escolherForma('pix')
    finalizar()

    expect(ctxCaixa.lancamentos).toHaveLength(1)
    const venda = ctxCaixa.lancamentos[0]
    expect(venda.valor).toBe(110)
    expect(venda.valorLiquido).toBe(110)
    expect(venda.quantidade).toBe(3)
    expect(venda.produto).toBe('Creme capilar, Pomada modeladora')
    expect(venda.descricao).toBe('2× Creme capilar, 1× Pomada modeladora')
    expect(venda.itens).toHaveLength(2)
  })

  it('impede dupla finalização — dois cliques geram um único lançamento', () => {
    montar()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '1')
    escolherForma('pix')
    finalizar()
    finalizar()
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(screen.getByText('Carrinho vazio.')).toBeTruthy()
  })

  it('mantém a venda após recarregar a página (F5)', () => {
    const { unmount } = montar()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '1')
    escolherForma('pix')
    finalizar()
    expect(ctxCaixa.lancamentos).toHaveLength(1)

    unmount()
    montar()
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos[0].origem).toBe('produto')
    expect(ctxProdutos.produtos).toHaveLength(1)
  })

  it('mostra a venda no histórico com status Concluída e permite estornar sem apagar', () => {
    montar()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '1')
    escolherForma('pix')
    finalizar()

    fireEvent.click(screen.getByText('Histórico de vendas'))
    expect(
      screen.getByRole('heading', { name: 'Histórico de vendas' }),
    ).toBeTruthy()
    expect(screen.getByText('1× Creme capilar')).toBeTruthy()
    expect(screen.getByText('Concluída')).toBeTruthy()

    act(() => {
      ctxCaixa.estornar(ctxCaixa.lancamentos[0].id)
    })
    expect(screen.getByText('Estornado')).toBeTruthy()
    expect(screen.getByText('1× Creme capilar')).toBeTruthy()
    expect(ctxCaixa.lancamentos).toHaveLength(1)
  })
})

describe('PDV — validações', () => {
  it('começa com botão desabilitado e carrinho vazio', () => {
    montar()
    expect(screen.getByText('Carrinho vazio.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Finalizar venda' }),
    ).toHaveProperty('disabled', true)
  })

  it('valida quantidade inteira maior que zero', () => {
    montar()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '0')
    expect(erroVisivel('Quantidade deve ser um número inteiro maior que zero.')).toBe(
      true,
    )
    addItem(id, 'abc')
    expect(erroVisivel('Quantidade deve ser um número inteiro maior que zero.')).toBe(
      true,
    )
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })

  it('valida desconto maior que o total e desconto negativo', () => {
    montar()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '1')
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '999' },
    })
    escolherForma('pix')
    finalizar()
    expect(
      erroVisivel('O desconto não pode ser maior que o total da venda.'),
    ).toBe(true)
    expect(ctxCaixa.lancamentos).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '-5' },
    })
    finalizar()
    expect(erroVisivel('Desconto inválido.')).toBe(true)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })

  it('exige forma de pagamento', () => {
    montar()
    const id = criarProduto('Creme capilar', 30)
    addItem(id, '1')
    finalizar()
    expect(erroVisivel('Selecione a forma de pagamento.')).toBe(true)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })

  it('produto sem estoque não aparece: inativo e zerado saem da lista do PDV', () => {
    montar()
    const ativo = criarProduto('Creme capilar', 30)
    const inativo = criarProduto('Pomada modeladora', 50)
    criarProduto('Sérum seco', 20, 0)
    act(() => {
      ctxProdutos.alternarAtivo(inativo)
    })
    expect(screen.getByRole('option', { name: /Creme capilar/ })).toBeTruthy()
    expect(
      screen.queryByRole('option', { name: /Pomada modeladora/ }),
    ).toBeNull()
    expect(
      screen.queryByRole('option', { name: /Sérum seco/ }),
    ).toBeNull()
    expect(
      screen.getByRole('option', { name: 'Selecione um produto...' }),
    ).toBeTruthy()
    expect(ativo).toBeTruthy()
  })
})

describe('PDV — caixa fechado', () => {
  it('bloqueia finalização com aviso imediato e sem lançamento', () => {
    montar()
    const id = criarProduto('Creme capilar', 30)
    act(() => {
      ctxCaixa.fecharCaixa(hojeISO())
    })
    expect(screen.getByText(/Caixa fechado/)).toBeTruthy()
    addItem(id, '1')
    escolherForma('pix')
    const botao = screen.getByRole('button', { name: 'Finalizar venda' })
    expect(botao).toHaveProperty('disabled', true)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })

  it('store bloqueia registrarVenda direto quando o dia está fechado', () => {
    montar()
    act(() => {
      ctxCaixa.fecharCaixa(hojeISO())
    })
    expect(() =>
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [{ produto: 'Creme capilar', quantidade: 1, preco: 30 }],
        desconto: 0,
        formaPagamento: 'pix',
      }),
    ).toThrow(/fechado/)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })
})

describe('PDV — validações de carrinho (store)', () => {
  it('registrarVenda rejeita carrinho vazio, quantidade e preço inválidos', () => {
    montar()
    expect(() =>
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [],
        desconto: 0,
        formaPagamento: 'pix',
      }),
    ).toThrow(/pelo menos um produto/)
    expect(() =>
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [{ produto: 'Creme', quantidade: 0, preco: 30 }],
        desconto: 0,
        formaPagamento: 'pix',
      }),
    ).toThrow(/Quantidade/)
    expect(() =>
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [{ produto: 'Creme', quantidade: 1, preco: 0 }],
        desconto: 0,
        formaPagamento: 'pix',
      }),
    ).toThrow(/preço/)
    expect(() =>
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [{ produto: 'Creme', quantidade: 1, preco: 30 }],
        desconto: 99,
        formaPagamento: 'pix',
      }),
    ).toThrow(/desconto/)
    expect(() =>
      ctxCaixa.registrarVenda({
        data: hojeISO(),
        itens: [{ produto: 'Creme', quantidade: 1, preco: 30 }],
        desconto: 0,
        formaPagamento: '' as never,
      }),
    ).toThrow(/forma de pagamento/)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })
})

describe('PDV — profissionais', () => {
  it('não oferece profissional inativo na nova venda', () => {
    montar()
    act(() => {
      ctxComissoes.salvarConfig('prof-cleiton-silva', {
        percentual: 40,
        ativo: false,
      })
    })
    const select = screen.getByLabelText('Profissional (opcional)')
    expect(select.textContent).toContain('Ítalo Santos')
    expect(select.textContent).not.toContain('Cleiton Silva')
  })
})

describe('PDV — sem erros de console', () => {
  it('renderiza a página sem erros de console', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    expect(screen.getByRole('heading', { name: 'PDV' })).toBeTruthy()
    expect(screen.getByText('Nova venda')).toBeTruthy()
    expect(screen.getByText('Histórico de vendas')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })
})
