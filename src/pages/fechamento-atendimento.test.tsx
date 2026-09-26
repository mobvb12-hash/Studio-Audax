import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PagamentoModal from '@/components/PagamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { ServicosProvider } from '@/modules/servicos/store'

const DIA = hojeISO()
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_MOV = 'studio-audax:estoque:movimentacoes:v1'
const CHAVE_PROD = 'studio-audax:produtos:v1'

const AGENDAMENTO: Agendamento = {
  id: 'ag-1',
  cliente: 'Ana Souza',
  telefone: '11 99999-0000',
  servico: 'Corte Degradê',
  profissional: 'Audax',
  data: DIA,
  horario: '10:00',
  status: 'confirmado',
  observacao: '',
  criadoEm: '2026-09-01T00:00:00.000Z',
  duracaoMin: 40,
}

function produto(override: Partial<Produto> = {}): Produto {
  return {
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
    ...override,
  }
}

function semear(produtos: Produto[]) {
  localStorage.clear()
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify([{ ...AGENDAMENTO }]),
  )
  localStorage.setItem(CHAVE_PROD, JSON.stringify(produtos))
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
        genero: 'nao_informado',
        cpf: '',
        cnpj: '',
        nascimento: '',
        etiquetas: [],
      },
    ]),
  )
  // Assinatura vigente do Audax Club de propósito: se existisse desconto
  // automático de assinante no fechamento, os totais dos testes mudariam.
  localStorage.setItem(
    'studio-audax:clube:v1',
    JSON.stringify({
      assinaturas: [
        {
          id: 'as-1',
          clienteId: 'cli-1',
          cliente: 'Ana Souza',
          plano: 'cabelo',
          valorMensal: 99.9,
          dataAssinatura: DIA,
          proximoVencimento: '2099-12-31',
          cancelada: false,
          criadoEm: DIA,
        },
      ],
      pagamentos: [],
    }),
  )
}

function montar() {
  const onFechar = vi.fn()
  const utils = render(
    <ClientesProvider>
      <ServicosProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <CaixaProvider>
              <ClubeProvider>
                <AgendaProvider>
                  <PagamentoModal agendamento={AGENDAMENTO} onFechar={onFechar} />
                </AgendaProvider>
              </ClubeProvider>
            </CaixaProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ServicosProvider>
    </ClientesProvider>,
  )
  return { ...utils, onFechar }
}

function ler<T>(chave: string, padrao: string): T {
  return JSON.parse(localStorage.getItem(chave) ?? padrao) as T
}

function lancamentos() {
  return ler<
    {
      id: string
      origem: string
      valor: number
      desconto: number
      valorLiquido: number
      formaPagamento: string
      cliente?: string
      clienteId?: string
      agendamentoId?: string
      itens?: { produtoId?: string; produto: string; quantidade: number }[]
      quantidade?: number
      estornado?: boolean
    }[]
  >(CHAVE_LANC, '[]')
}

function movimentacoes() {
  return ler<
    {
      tipo: string
      produtoId: string
      quantidade: number
      vendaId?: string
      estoqueAntes: number
      estoqueDepois: number
    }[]
  >(CHAVE_MOV, '[]')
}

function estoqueDe(id: string): number {
  return ler<Produto[]>(CHAVE_PROD, '[]').find((p) => p.id === id)!.estoque
}

function statusAgendamento(): string {
  return ler<{ status: string }[]>(CHAVE_AG, '[]')[0].status
}

function adicionarProduto(produtoId: string, quantidade: string) {
  fireEvent.change(screen.getByLabelText('Produto'), {
    target: { value: produtoId },
  })
  fireEvent.change(screen.getByLabelText('Quantidade'), {
    target: { value: quantidade },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
}

function receber() {
  fireEvent.click(screen.getByRole('button', { name: /^Receber/ }))
}

function definirDescontoProdutos(valor: string) {
  fireEvent.change(screen.getByLabelText('Desconto nos produtos (R$)'), {
    target: { value: valor },
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('Fase 3 — produtos no fechamento do atendimento', () => {
  it('fecha atendimento + produto num único fechamento, com receitas separadas', () => {
    semear([produto()])
    const { onFechar } = montar()

    // total a receber = serviço líquido (70) + 2 shampoo (70)
    adicionarProduto('prod-1', '2')
    expect(
      screen.getByRole('button', { name: /^Receber\s+R\$\s*140,00/ }),
    ).toBeTruthy()
    receber()

    const lances = lancamentos()
    expect(lances).toHaveLength(2)

    const atendimento = lances.find((l) => l.origem === 'atendimento')!
    expect(atendimento.valor).toBe(70)
    expect(atendimento.desconto).toBe(0)
    expect(atendimento.valorLiquido).toBe(70)
    expect(atendimento.formaPagamento).toBe('dinheiro')
    expect(atendimento.agendamentoId).toBe('ag-1')
    expect(atendimento.cliente).toBe('Ana Souza')

    const venda = lances.find((l) => l.origem === 'produto')!
    // sem desconto digitado: nenhum desconto automático (nem Audax Club,
    // cuja assinatura vigente está semeada de propósito)
    expect(venda.valor).toBe(70)
    expect(venda.desconto).toBe(0)
    expect(venda.valorLiquido).toBe(70)
    expect(venda.formaPagamento).toBe('dinheiro')
    expect(venda.cliente).toBe('Ana Souza')
    expect(venda.clienteId).toBe('cli-1')
    expect(venda.itens).toHaveLength(1)
    expect(venda.itens![0]).toMatchObject({
      produtoId: 'prod-1',
      produto: 'Shampoo',
      quantidade: 2,
    })
    expect(venda.quantidade).toBe(2)

    // baixa de estoque exatamente uma vez, ligada à venda de produto
    const movs = movimentacoes()
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({
      tipo: 'venda',
      produtoId: 'prod-1',
      quantidade: -2,
      estoqueAntes: 10,
      estoqueDepois: 8,
    })
    expect(movs[0].vendaId).toBe(venda.id)
    expect(estoqueDe('prod-1')).toBe(8)

    expect(statusAgendamento()).toBe('concluido')
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('sem produtos mantém o comportamento atual: só receita de atendimento', () => {
    semear([produto()])
    const { onFechar } = montar()

    receber()

    const lances = lancamentos()
    expect(lances).toHaveLength(1)
    expect(lances[0].origem).toBe('atendimento')
    expect(lances[0].valorLiquido).toBe(70)
    expect(movimentacoes()).toHaveLength(0)
    expect(estoqueDe('prod-1')).toBe(10)
    expect(statusAgendamento()).toBe('concluido')
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('vários produtos entram no mesmo fechamento (uma venda, várias baixas)', () => {
    semear([
      produto(),
      produto({ id: 'prod-2', nome: 'Pomada', preco: 40, estoque: 6 }),
    ])
    const { onFechar } = montar()

    adicionarProduto('prod-1', '1')
    adicionarProduto('prod-2', '3')
    receber()

    const lances = lancamentos()
    expect(lances).toHaveLength(2)
    const venda = lances.find((l) => l.origem === 'produto')!
    expect(venda.itens).toHaveLength(2)
    expect(venda.valorLiquido).toBe(35 + 3 * 40)

    const movs = movimentacoes()
    expect(movs).toHaveLength(2)
    expect(estoqueDe('prod-1')).toBe(9)
    expect(estoqueDe('prod-2')).toBe(3)
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('segundo clique não duplica receita nem baixa de estoque', () => {
    semear([produto()])
    montar()

    adicionarProduto('prod-1', '1')
    receber()
    receber()

    const lances = lancamentos()
    expect(lances).toHaveLength(2)
    expect(lances.filter((l) => l.origem === 'atendimento')).toHaveLength(1)
    expect(lances.filter((l) => l.origem === 'produto')).toHaveLength(1)
    expect(movimentacoes()).toHaveLength(1)
    expect(estoqueDe('prod-1')).toBe(9)
    expect(
      screen.getByText(/já foi pago|Já foi pago|duplicar/),
    ).toBeTruthy()
  })

  it('recusa quantidade acima do estoque sem lançar nada', () => {
    semear([produto({ estoque: 1 })])
    const { onFechar } = montar()

    adicionarProduto('prod-1', '5')
    expect(screen.getByText(/Estoque insuficiente/)).toBeTruthy()
    expect(screen.getByText('Nenhum produto neste fechamento.')).toBeTruthy()

    receber()

    // só o atendimento; nenhum lançamento de produto e nenhuma baixa
    const lances = lancamentos()
    expect(lances).toHaveLength(1)
    expect(lances[0].origem).toBe('atendimento')
    expect(movimentacoes()).toHaveLength(0)
    expect(estoqueDe('prod-1')).toBe(1)
    expect(statusAgendamento()).toBe('concluido')
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('produto sem estoque não é oferecido no fechamento', () => {
    semear([produto({ estoque: 0 })])
    montar()

    const opcoes = Array.from(
      screen.getByLabelText('Produto').querySelectorAll('option'),
    ).map((o) => o.textContent)
    expect(opcoes.some((t) => t?.includes('Shampoo'))).toBe(false)
    expect(opcoes.some((t) => t?.includes('Selecione um produto'))).toBe(true)
  })

  it('desconto definido no fechamento é aplicado aos produtos e atualiza o total', () => {
    semear([produto()])
    const { onFechar } = montar()

    adicionarProduto('prod-1', '2') // 2 × 35 = 70 em produtos
    definirDescontoProdutos('10')

    // total = serviço 70 + produtos 70 − desconto 10
    expect(
      screen.getByRole('button', { name: /^Receber\s+R\$\s*130,00/ }),
    ).toBeTruthy()
    receber()

    const lances = lancamentos()
    expect(lances).toHaveLength(2)

    const atendimento = lances.find((l) => l.origem === 'atendimento')!
    expect(atendimento.valor).toBe(70)
    expect(atendimento.desconto).toBe(0)
    expect(atendimento.valorLiquido).toBe(70)

    const venda = lances.find((l) => l.origem === 'produto')!
    expect(venda.valor).toBe(70)
    expect(venda.desconto).toBe(10)
    expect(venda.valorLiquido).toBe(60)

    // estoque não é afetado pelo desconto
    expect(movimentacoes()).toHaveLength(1)
    expect(estoqueDe('prod-1')).toBe(8)
    expect(statusAgendamento()).toBe('concluido')
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('desconto maior que o total dos produtos é recusado sem lançar nada', () => {
    semear([produto()])
    const { onFechar } = montar()

    adicionarProduto('prod-1', '1') // produtos = 35
    definirDescontoProdutos('50')
    receber()

    expect(screen.getByText(/Desconto dos produtos inválido/)).toBeTruthy()

    // nenhum lançamento: nem atendimento, nem produto
    expect(lancamentos()).toHaveLength(0)
    expect(movimentacoes()).toHaveLength(0)
    expect(estoqueDe('prod-1')).toBe(10)
    expect(statusAgendamento()).toBe('confirmado')
    expect(onFechar).not.toHaveBeenCalled()
  })

  it('desconto digitado sem produtos no carrinho não altera total nem lançamento', () => {
    semear([produto()])
    montar()

    definirDescontoProdutos('10')
    // botão continua batendo com o que será lançado: só serviço, R$ 70,00
    expect(
      screen.getByRole('button', { name: /^Receber\s+R\$\s*70,00/ }),
    ).toBeTruthy()
    receber()

    const lances = lancamentos()
    expect(lances).toHaveLength(1)
    expect(lances[0].origem).toBe('atendimento')
    expect(lances[0].desconto).toBe(0)
    expect(lances[0].valorLiquido).toBe(70)
    expect(movimentacoes()).toHaveLength(0)
  })

  it('fechamento persiste após F5 (releitura do localStorage)', () => {
    semear([produto()])
    const primeiro = montar()

    adicionarProduto('prod-1', '2')
    definirDescontoProdutos('5')
    receber()

    // F5: desmonta e monta de novo com o mesmo armazenamento
    primeiro.unmount()
    montar()

    const lances = lancamentos()
    expect(lances).toHaveLength(2)
    const atendimento = lances.find((l) => l.origem === 'atendimento')!
    expect(atendimento.valorLiquido).toBe(70)
    const venda = lances.find((l) => l.origem === 'produto')!
    expect(venda.desconto).toBe(5)
    expect(venda.valorLiquido).toBe(65)

    expect(movimentacoes()).toHaveLength(1)
    expect(estoqueDe('prod-1')).toBe(8)
    expect(statusAgendamento()).toBe('concluido')
  })
})
