import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import VendaProdutoModal from './VendaProdutoModal'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'

const DIA = '2026-09-25'

type Estado = {
  vendas: { valor: number }[]
  saidas: number
  estoque: number | undefined
}

function Captura({ produtoId }: { produtoId: string }) {
  const { lancamentos } = useCaixa()
  const { movimentacoes } = useEstoque()
  const { porId } = useProdutos()
  const estado: Estado = {
    vendas: lancamentos
      .filter((l) => l.origem === 'produto')
      .map((l) => ({ valor: l.valor })),
    saidas: movimentacoes.filter((m) => m.tipo === 'venda').length,
    estoque: porId(produtoId)?.estoque,
  }
  return <output data-testid="estado">{JSON.stringify(estado)}</output>
}

function semearProduto(nome: string, preco: number, estoque: number) {
  const novo = {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nome,
    preco,
    custo: 0,
    estoque,
    estoqueMinimo: 0,
    categoria: '',
    foto: '',
    ativo: true,
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  }
  localStorage.setItem('studio-audax:produtos:v1', JSON.stringify([novo]))
  localStorage.setItem(
    'studio-audax:estoque:movimentacoes:v1',
    JSON.stringify([
      {
        id: `m-${novo.id}`,
        produtoId: novo.id,
        produto: nome,
        tipo: 'inicial',
        quantidade: estoque,
        estoqueAntes: 0,
        estoqueDepois: estoque,
        custoUnitario: 0,
        data: DIA,
        origem: 'cadastro',
        criadoEm: novo.criadoEm,
      },
    ]),
  )
  return novo
}

function montar(produtoId: string) {
  return render(
    <ProdutosProvider>
      <EstoqueProvider>
        <ProfissionaisProvider>
          <CaixaProvider>
            <Captura produtoId={produtoId} />
            <VendaProdutoModal data={DIA} onFechar={() => undefined} />
          </CaixaProvider>
        </ProfissionaisProvider>
      </EstoqueProvider>
    </ProdutosProvider>,
  )
}

function lerEstado(): Estado {
  return JSON.parse(screen.getByTestId('estado').textContent ?? '{}')
}

beforeEach(() => {
  localStorage.clear()
})

describe('VendaProdutoModal — anti duplo clique', () => {
  it('duplo clique não duplica receita no Caixa nem baixa de estoque', () => {
    const prod = semearProduto('Pomada modeladora', 30, 10)
    montar(prod.id)

    const select = screen.getByLabelText('Produto *') as HTMLSelectElement
    fireEvent.change(select, { target: { value: prod.id } })

    const botao = screen.getByText('Registrar venda')
    fireEvent.click(botao)
    fireEvent.click(botao)

    const estado = lerEstado()
    expect(estado.vendas).toHaveLength(1)
    expect(estado.vendas[0].valor).toBe(30)
    expect(estado.saidas).toBe(1)
    expect(estado.estoque).toBe(9)
  })

  it('cliques rápidos consecutivos continuam registrando uma única venda', () => {
    const prod = semearProduto('Creme capilar', 25, 5)
    montar(prod.id)

    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: prod.id },
    })

    fireEvent.click(screen.getByText('Registrar venda'))
    fireEvent.click(screen.getByText('Registrar venda'))
    fireEvent.click(screen.getByText('Registrar venda'))

    const estado = lerEstado()
    expect(estado.vendas).toHaveLength(1)
    expect(estado.estoque).toBe(4)
  })
})
