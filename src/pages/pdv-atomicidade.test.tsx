import { act, useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PagamentoModal from '@/components/PagamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Caixa from './Caixa'
import PDV from './PDV'

/**
 * Auditoria Fase 11 — atomicidade do PDV: injeta a falha exata da janela
 * (a baixa de estoque lança DEPOIS de o caixa gravar) para provar que a
 * compensação desfaz a gravação e que o retry não duplica receita.
 * A flag é checada NO MOMENTO DA CHAMADA porque os componentes capturam
 * `saidaPorVenda` por destructure no render. `vi.hoisted` garante que o
 * teste e a fábrica do mock enxerguem o mesmo objeto de controle.
 */
const controle = vi.hoisted(() => ({ falhar: false }))

vi.mock('@/modules/estoque/store', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/modules/estoque/store')>()
  return {
    ...actual,
    useEstoque: () => {
      const ctx = actual.useEstoque()
      return {
        ...ctx,
        saidaPorVenda: (
          ...args: Parameters<typeof ctx.saidaPorVenda>
        ) => {
          if (controle.falhar) {
            throw new Error('Falha simulada na baixa de estoque')
          }
          return ctx.saidaPorVenda(...args)
        },
      }
    },
  }
})

/**
 * ??2 — falha injetada DEPOIS da baixa de estoque. No fechamento do
 * atendimento a ordem é pagamento ? venda ? baixa ? mudarStatus ? onFechar;
 * aqui a falha acontece na etapa seguinte à baixa, para provar que o
 * rollback devolve o estoque e desfaz os lançamentos gravados.
 */
const controleAgenda = vi.hoisted(() => ({ falhar: false }))

vi.mock('@/modules/agenda/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/agenda/store')>()
  return {
    ...actual,
    useAgenda: () => {
      const ctx = actual.useAgenda()
      return {
        ...ctx,
        mudarStatus: (...args: Parameters<typeof ctx.mudarStatus>) => {
          if (controleAgenda.falhar) {
            throw new Error('Falha simulada DEPOIS da baixa de estoque')
          }
          return ctx.mudarStatus(...args)
        },
      }
    },
  }
})

const DIA = hojeISO()
const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_PROD = 'studio-audax:produtos:v1'
const CHAVE_AG = 'studio-audax:agendamentos:v1'

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxProdutos: ReturnType<typeof useProdutos>

function Captura() {
  const caixa = useCaixa()
  const produtos = useProdutos()
  useEffect(() => {
    ctxCaixa = caixa
    ctxProdutos = produtos
  })
  return null
}

function env(children: ReactNode) {
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
                    {children}
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

function criarProduto(nome: string, estoque: number): string {
  let id = ''
  act(() => {
    id = ctxProdutos.adicionar({ nome, preco: 30, estoque }).id
  })
  return id
}

function ler<T>(chave: string, padrao: string): T {
  return JSON.parse(localStorage.getItem(chave) ?? padrao) as T
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  controle.falhar = false
  controleAgenda.falhar = false
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
})

describe('PDV — atomicidade: falha na baixa desfaz a gravação', () => {
  it('caixa não fica com venda sem estoque e o retry grava uma única vez', () => {
    env(<PDV />)
    const id = criarProduto('Creme capilar', 5)

    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByText('Adicionar ao carrinho'))
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })

    controle.falhar = true
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar venda' }))

    // erro visível, NADA registrou (compensação) e o carrinho ficou intacto
    expect(screen.getByText('Falha simulada na baixa de estoque')).toBeTruthy()
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxProdutos.porId(id)?.estoque).toBe(5)
    expect(screen.getByDisplayValue('2')).toBeTruthy()

    // retry: agora sim — e sem duplicar a receita
    controle.falhar = false
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar venda' }))
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxProdutos.porId(id)?.estoque).toBe(3)
    expect(
      screen.getByText(/registrada no caixa e estoque baixado/),
    ).toBeTruthy()
  })

  it('venda avulsa no Caixa segue a mesma compensação', () => {
    env(<Caixa />)
    const id = criarProduto('Pomada modeladora', 5)

    fireEvent.click(screen.getByText('+ Venda de produto'))
    fireEvent.change(screen.getByLabelText('Produto *'), {
      target: { value: id },
    })
    fireEvent.change(screen.getByLabelText('Quantidade *'), {
      target: { value: '2' },
    })

    controle.falhar = true
    fireEvent.click(screen.getByText('Registrar venda'))
    expect(screen.getByText('Falha simulada na baixa de estoque')).toBeTruthy()
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxProdutos.porId(id)?.estoque).toBe(5)

    controle.falhar = false
    fireEvent.click(screen.getByText('Registrar venda'))
    expect(ctxCaixa.lancamentos).toHaveLength(1)
    expect(ctxProdutos.porId(id)?.estoque).toBe(3)
    expect(screen.queryByText('Falha simulada na baixa de estoque')).toBeNull()
  })
})

describe('Fechamento do atendimento — rollback total e retry', () => {
  const AGENDAMENTO: Agendamento = {
    id: 'ag-1',
    cliente: 'Ana Souza',
    telefone: '11 99999-0000',
    servico: 'Corte Degradê',
    profissional: 'Cleiton Silva',
    data: DIA,
    horario: '10:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    duracaoMin: 40,
  }

  function semear() {
    localStorage.setItem(CHAVE_AG, JSON.stringify([AGENDAMENTO]))
    localStorage.setItem(
      CHAVE_PROD,
      JSON.stringify([
        {
          id: 'prod-1',
          nome: 'Shampoo',
          preco: 35,
          custo: 15,
          estoque: 10,
          estoqueMinimo: 2,
          categoria: 'Higiene',
          foto: '',
          ativo: true,
          criadoEm: DIA,
          atualizadoEm: DIA,
        },
      ]),
    )
    localStorage.setItem(
      'studio-audax:servicos:v1',
      JSON.stringify([
        {
          id: 'sv-1',
          nome: 'Corte Degradê',
          preco: 70,
          duracaoMin: 40,
          categoria: 'Cabelo',
          ativo: true,
          criadoEm: DIA,
          atualizadoEm: DIA,
        },
      ]),
    )
    localStorage.setItem(
      'studio-audax:clientes:v1',
      JSON.stringify([
        {
          id: 'cli-1',
          nome: 'Ana Souza',
          telefone: '11 99999-0000',
          email: '',
          observacao: '',
          ativo: true,
        },
      ]),
    )
  }

  function montar() {
    const onFechar = vi.fn()
    render(
      <ClientesProvider>
        <ServicosProvider>
          <ProdutosProvider>
            <EstoqueProvider>
              <CaixaProvider>
                <AgendaProvider>
                  <Captura />
                  <PagamentoModal
                    agendamento={AGENDAMENTO}
                    onFechar={onFechar}
                  />
                </AgendaProvider>
              </CaixaProvider>
            </EstoqueProvider>
          </ProdutosProvider>
        </ServicosProvider>
      </ClientesProvider>,
    )
    return { onFechar }
  }

  function lancamentos() {
    return ler<{ origem: string }[]>(CHAVE_LANC, '[]')
  }

  function statusAgendamento(): string {
    return ler<{ status: string }[]>(CHAVE_AG, '[]')[0].status
  }

  function estoqueDe(id: string): number {
    return ler<{ id: string; estoque: number }[]>(CHAVE_PROD, '[]').find(
      (p) => p.id === id,
    )!.estoque
  }

  it('falha na baixa desfaz pagamento E venda — retry fecha o atendimento', () => {
    semear()
    const { onFechar } = montar()

    fireEvent.change(screen.getByLabelText('Produto'), {
      target: { value: 'prod-1' },
    })
    fireEvent.change(screen.getByLabelText('Quantidade'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    controle.falhar = true
    fireEvent.click(screen.getByRole('button', { name: /^Fechar Conta/ }))

    // rollback total: sem pagamento, sem venda, agenda intocada, modal aberto
    expect(screen.getByText('Falha simulada na baixa de estoque')).toBeTruthy()
    expect(lancamentos()).toHaveLength(0)
    expect(statusAgendamento()).toBe('confirmado')
    expect(estoqueDe('prod-1')).toBe(10)
    expect(onFechar).not.toHaveBeenCalled()

    // retry NÃO esbarra em "já foi pago": estado estava limpo
    controle.falhar = false
    fireEvent.click(screen.getByRole('button', { name: /^Fechar Conta/ }))
    expect(onFechar).toHaveBeenCalled()
    expect(lancamentos()).toHaveLength(2)
    expect(statusAgendamento()).toBe('concluido')
    expect(estoqueDe('prod-1')).toBe(8)
  })

  it('falha DEPOIS da baixa devolve o estoque e desfaz pagamento e venda', () => {
    semear()
    const { onFechar } = montar()

    fireEvent.change(screen.getByLabelText('Produto'), {
      target: { value: 'prod-1' },
    })
    fireEvent.change(screen.getByLabelText('Quantidade'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    // a baixa acontece; a falha vem na etapa seguinte (mudarStatus)
    controleAgenda.falhar = true
    fireEvent.click(screen.getByRole('button', { name: /^Fechar Conta/ }))

    // erro original preservado
    expect(
      screen.getByText('Falha simulada DEPOIS da baixa de estoque'),
    ).toBeTruthy()
    // estoque exatamente igual ao estado anterior à tentativa (10, não 8)
    expect(estoqueDe('prod-1')).toBe(10)
    // venda e pagamento desfeitos, agenda intocada, modal segue aberto
    expect(lancamentos()).toHaveLength(0)
    expect(statusAgendamento()).toBe('confirmado')
    expect(onFechar).not.toHaveBeenCalled()

    // retry fecha o atendimento com UMA única baixa (10 - 2 = 8, não 6)
    controleAgenda.falhar = false
    fireEvent.click(screen.getByRole('button', { name: /^Fechar Conta/ }))
    expect(onFechar).toHaveBeenCalled()
    expect(lancamentos()).toHaveLength(2)
    expect(statusAgendamento()).toBe('concluido')
    expect(estoqueDe('prod-1')).toBe(8)
  })
})
