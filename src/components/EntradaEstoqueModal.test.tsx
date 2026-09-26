import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import EntradaEstoqueModal from './EntradaEstoqueModal'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'

function Captura({ produtoId }: { produtoId: string }) {
  const { movimentacoes } = useEstoque()
  const { porId } = useProdutos()
  return (
    <output data-testid="estado">
      {JSON.stringify({
        entradas: movimentacoes.filter((m) => m.tipo === 'entrada').length,
        estoque: porId(produtoId)?.estoque,
      })}
    </output>
  )
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
        data: '2026-09-25',
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
        <Captura produtoId={produtoId} />
        <EntradaEstoqueModal produtoId={produtoId} onFechar={() => undefined} />
      </EstoqueProvider>
    </ProdutosProvider>,
  )
}

function lerEstado() {
  return JSON.parse(screen.getByTestId('estado').textContent ?? '{}')
}

beforeEach(() => {
  localStorage.clear()
})

describe('EntradaEstoqueModal — anti duplo clique', () => {
  it('duplo clique não duplica entrada nem movimentação de estoque', () => {
    const prod = semearProduto('Pomada modeladora', 30, 10)
    montar(prod.id)

    fireEvent.click(screen.getByText('Registrar entrada'))
    fireEvent.click(screen.getByText('Registrar entrada'))

    const estado = lerEstado()
    expect(estado.entradas).toBe(1)
    expect(estado.estoque).toBe(11)
  })

  it('cliques rápidos consecutivos continuam registrando uma única entrada', () => {
    const prod = semearProduto('Creme capilar', 25, 5)
    montar(prod.id)

    fireEvent.click(screen.getByText('Registrar entrada'))
    fireEvent.click(screen.getByText('Registrar entrada'))
    fireEvent.click(screen.getByText('Registrar entrada'))

    const estado = lerEstado()
    expect(estado.entradas).toBe(1)
    expect(estado.estoque).toBe(6)
  })
})
