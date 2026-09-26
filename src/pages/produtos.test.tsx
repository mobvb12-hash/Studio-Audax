import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import Produtos from './Produtos'

beforeEach(() => {
  localStorage.clear()
})

function montar() {
  return render(
    <ProdutosProvider>
      <EstoqueProvider>
        <Produtos />
      </EstoqueProvider>
    </ProdutosProvider>,
  )
}

function criar(nome: string, preco: string) {
  fireEvent.click(screen.getByText('+ Novo produto'))
  fireEvent.change(screen.getByLabelText('Nome *'), {
    target: { value: nome },
  })
  fireEvent.change(screen.getByLabelText('Preço de venda (R$) *'), {
    target: { value: preco },
  })
  fireEvent.click(screen.getByText('Cadastrar produto'))
}

function cartao(nome: string): HTMLElement {
  const itens = screen.getAllByRole('listitem')
  const alvo = itens.find((li) => li.textContent?.includes(nome))
  if (!alvo) throw new Error(`Produto não encontrado na lista: ${nome}`)
  return alvo
}

function indicador(rotulo: string): HTMLElement {
  const alvo = screen.getByText(rotulo).parentElement
  if (!alvo) throw new Error(`Card de indicador não encontrado: ${rotulo}`)
  return alvo
}

function valorIndicador(rotulo: string, esperado: string): void {
  expect(within(indicador(rotulo)).getByText(esperado)).toBeTruthy()
}

describe('Página Produtos — cadastro mínimo', () => {
  it('renderiza estado vazio sem erros de console', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    expect(screen.getByRole('heading', { name: 'Produtos' })).toBeTruthy()
    expect(screen.getByText(/Nenhum produto cadastrado/)).toBeTruthy()
    expect(screen.getByText('+ Novo produto')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('cadastra produto e mostra na lista como Ativo', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    criar('Creme capilar', '30,00')
    expect(screen.getByText('Creme capilar')).toBeTruthy()
    expect(within(cartao('Creme capilar')).getByText('Ativo')).toBeTruthy()
    expect(screen.queryByText(/Nenhum produto cadastrado/)).toBeNull()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('impede nome duplicado exibindo aviso no modal', () => {
    montar()
    criar('Creme capilar', '30,00')
    criar('Creme capilar', '10,00')
    expect(screen.getByText('Já existe um produto com este nome.')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('valida nome e preço no formulário', () => {
    montar()
    criar('A', '30,00')
    expect(screen.getByText('Informe o nome do produto.')).toBeTruthy()
    fireEvent.click(screen.getByText('Cadastrar produto'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Creme capilar' },
    })
    fireEvent.change(screen.getByLabelText('Preço de venda (R$) *'), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByText('Cadastrar produto'))
    expect(screen.getByText('O preço deve ser maior que zero.')).toBeTruthy()
  })

  it('edita produto abrindo modal já preenchido', () => {
    montar()
    criar('Creme capilar', '30,00')
    fireEvent.click(within(cartao('Creme capilar')).getByText('Editar'))
    expect(screen.getByLabelText('Nome *')).toHaveProperty('value', 'Creme capilar')
    fireEvent.change(screen.getByLabelText('Preço de venda (R$) *'), {
      target: { value: '35,00' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))
    expect(screen.getByText('Creme capilar')).toBeTruthy()
    expect(screen.queryByText('Editar produto')).toBeNull()
  })

  it('desativa e reativa produto (badge muda sem excluir)', () => {
    montar()
    criar('Creme capilar', '30,00')
    fireEvent.click(within(cartao('Creme capilar')).getByText('Desativar'))
    expect(within(cartao('Creme capilar')).getByText('Inativo')).toBeTruthy()
    fireEvent.click(within(cartao('Creme capilar')).getByText('Ativar'))
    expect(within(cartao('Creme capilar')).getByText('Ativo')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('Página Produtos — indicadores de estoque', () => {
  it('estado vazio zera todos os indicadores', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    valorIndicador('Total de produtos', '0')
    valorIndicador('Produtos ativos', '0')
    valorIndicador('Produtos inativos', '0')
    valorIndicador('Unidades em estoque', '0')
    valorIndicador('Produtos com estoque baixo', '0')
    valorIndicador('Produtos sem estoque', '0')
    expect(
      within(indicador('Valor estimado do estoque')).getByText(
        /R\$\s*0,00/,
      ),
    ).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('mostra os indicadores com dados reais após cadastro com estoque e custo', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    fireEvent.click(screen.getByText('+ Novo produto'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Creme capilar' },
    })
    fireEvent.change(screen.getByLabelText('Preço de venda (R$) *'), {
      target: { value: '30,00' },
    })
    fireEvent.change(screen.getByLabelText('Custo (R$)'), {
      target: { value: '12,00' },
    })
    fireEvent.change(screen.getByLabelText('Estoque inicial'), {
      target: { value: '10' },
    })
    fireEvent.click(screen.getByText('Cadastrar produto'))

    valorIndicador('Total de produtos', '1')
    valorIndicador('Produtos ativos', '1')
    valorIndicador('Produtos inativos', '0')
    valorIndicador('Unidades em estoque', '10')
    valorIndicador('Produtos com estoque baixo', '0')
    valorIndicador('Produtos sem estoque', '0')
    expect(
      within(indicador('Valor estimado do estoque')).getByText(
        /R\$\s*120,00/,
      ),
    ).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('produto sem estoque alimenta os alertas e some deles ao ficar inativo', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    montar()
    criar('Sérum seco', '50,00')
    valorIndicador('Produtos sem estoque', '1')
    valorIndicador('Produtos com estoque baixo', '1')
    valorIndicador('Produtos ativos', '1')

    fireEvent.click(within(cartao('Sérum seco')).getByText('Desativar'))
    valorIndicador('Produtos sem estoque', '0')
    valorIndicador('Produtos com estoque baixo', '0')
    valorIndicador('Produtos ativos', '0')
    valorIndicador('Produtos inativos', '1')
    valorIndicador('Unidades em estoque', '0')
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })
})
