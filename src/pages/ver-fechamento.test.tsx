// Fase 11.1 — Ver Fechamento de Conta (somente leitura)
//
// Cobre a abertura do "Ver Fechamento" a partir do detalhe do atendimento e
// garante que a tela apenas LÊ dados já gravados: nenhum lançamento novo,
// nenhuma baixa de estoque e nenhuma alteração de comissão ao visualizar.
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VerFechamentoModal from '@/components/VerFechamentoModal'
import DetalheAgendamento from '@/modules/agenda/components/DetalheAgendamento'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import { calcularProducao } from '@/modules/comissoes/producao'
import { CaixaProvider } from '@/modules/caixa/store'
import type { Lancamento } from '@/modules/caixa/types'
import { ClientesProvider } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { formatarBRL } from '@/lib/moeda'

const DIA = hojeISO()
const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_CLIENTES = 'studio-audax:clientes:v1'
const CHAVE_CLUBE = 'studio-audax:clube:v1'
const CHAVE_MOV = 'studio-audax:estoque:movimentacoes:v1'
const CHAVE_PROD = 'studio-audax:produtos:v1'
const CHAVE_COM_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_COM_FECH = 'studio-audax:comissoes:fechamentos:v1'
const CHAVE_COM_AUD = 'studio-audax:comissoes:auditoria:v1'

const AGENDAMENTO: Agendamento = {
  id: 'ag-1',
  cliente: 'Ana Souza',
  telefone: '11 99999-0000',
  servico: 'Corte Degradê',
  profissional: 'Audax',
  data: DIA,
  horario: '10:00',
  status: 'concluido',
  observacao: '',
  criadoEm: '2026-09-01T00:00:00.000Z',
  duracaoMin: 40,
}

function lancamento(override: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 'lan-1',
    tipo: 'receita',
    origem: 'atendimento',
    data: DIA,
    hora: '10:00',
    descricao: 'Corte Degradê — Ana Souza',
    valor: 70,
    desconto: 10,
    valorLiquido: 60,
    formaPagamento: 'pix',
    cliente: 'Ana Souza',
    clienteId: 'cli-1',
    profissional: 'Audax',
    servico: 'Corte Degradê',
    agendamentoId: 'ag-1',
    recebido: 60,
    criadoEm: '2026-09-30T10:05:00.000Z',
    ...override,
  }
}

function cliente() {
  return {
    id: 'cli-1',
    nome: 'Ana Souza',
    telefone: '11 99999-0000',
    email: 'ana@email.com',
    observacao: '',
    ativo: true,
    genero: 'nao_informado',
    cpf: '',
    cnpj: '',
    nascimento: '',
    etiquetas: [],
    telefones: [],
  }
}

function produto(override: Partial<Produto> = {}): Produto {
  return {
    id: 'prod-1',
    nome: 'Shampoo',
    preco: 35,
    custo: 15,
    estoque: 8,
    estoqueMinimo: 2,
    categoria: 'Higiene',
    foto: '',
    ativo: true,
    criadoEm: DIA,
    atualizadoEm: DIA,
    ...override,
  }
}

type Semente = {
  lancamentos?: Lancamento[]
  clube?: boolean
  mov?: unknown[]
  produtos?: Produto[]
}

function semear(s: Semente = {}) {
  localStorage.clear()
  localStorage.setItem(
    CHAVE_LANC,
    JSON.stringify(s.lancamentos ?? [lancamento()]),
  )
  localStorage.setItem(CHAVE_CLIENTES, JSON.stringify([cliente()]))
  if (s.clube) {
    localStorage.setItem(
      CHAVE_CLUBE,
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
  if (s.mov) localStorage.setItem(CHAVE_MOV, JSON.stringify(s.mov))
  if (s.produtos) localStorage.setItem(CHAVE_PROD, JSON.stringify(s.produtos))
}

function montarModal() {
  return render(
    <ClientesProvider>
      <ProdutosProvider>
        <EstoqueProvider>
          <CaixaProvider>
            <ClubeProvider>
              <VerFechamentoModal agendamento={AGENDAMENTO} onFechar={vi.fn()} />
            </ClubeProvider>
          </CaixaProvider>
        </EstoqueProvider>
      </ProdutosProvider>
    </ClientesProvider>,
  )
}

function montarDetalhe() {
  return render(
    <ClientesProvider>
      <ProdutosProvider>
        <EstoqueProvider>
          <CaixaProvider>
            <ClubeProvider>
              <DetalheAgendamento
                ag={AGENDAMENTO}
                duracaoDo={() => 40}
                mudarStatus={vi.fn()}
                remover={vi.fn()}
                pago
                onPagar={vi.fn()}
                onRemarcar={vi.fn()}
                onEditar={vi.fn()}
                onFechar={vi.fn()}
              />
            </ClubeProvider>
          </CaixaProvider>
        </EstoqueProvider>
      </ProdutosProvider>
    </ClientesProvider>,
  )
}

/** Texto do bloco (linha) cujo rótulo é `rotulo` — dt e dd são irmãos. */
function valorDe(rotulo: string): string {
  return screen.getByText(rotulo).parentElement?.textContent ?? ''
}

function lancamentosGravados(): Lancamento[] {
  return JSON.parse(localStorage.getItem(CHAVE_LANC) ?? '[]') as Lancamento[]
}

beforeEach(() => {
  localStorage.clear()
})

describe('Fase 11.1 — Ver Fechamento de Conta (somente leitura)', () => {
  it('abre o Ver Fechamento de um atendimento pago pelo detalhe', () => {
    semear()
    montarDetalhe()

    expect(screen.getByText('Pago')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver Fechamento' }))

    expect(screen.getByText('FECHAMENTO DE CONTA')).toBeTruthy()
    expect(screen.getByText('11 99999-0000 · Audax · 10:00')).toBeTruthy()
    expect(screen.getByText('ana@email.com')).toBeTruthy()
    expect(screen.getByText('Itens da conta')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy()
  })

  it('mostra o serviço e os valores corretamente (subtotal, descontos, total)', () => {
    semear()
    montarModal()

    expect(screen.getByText('Serviço · Corte Degradê')).toBeTruthy()
    // valores em BRL têm NBSP (Intl) — regex cobre o espaço normalizado do nó
    expect(screen.getAllByText(/R\$\s*70,00/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/R\$\s*10,00/).length).toBeGreaterThan(0)
    expect(valorDe('Subtotal')).toContain(formatarBRL(70))
    expect(valorDe('Descontos')).toContain(formatarBRL(10))
    expect(valorDe('Total final')).toContain(formatarBRL(60))
  })

  it('mostra forma de pagamento, recebido, troco, falta e gorjeta', () => {
    semear({
      lancamentos: [lancamento({ recebido: 50, falta: 15, gorjeta: 5 })],
    })
    montarModal()

    expect(valorDe('Forma de pagamento')).toContain('PIX')
    expect(valorDe('Total pago')).toContain(formatarBRL(60))
    expect(valorDe('Recebido')).toContain(formatarBRL(50))
    expect(valorDe('Troco')).toContain(formatarBRL(0))
    expect(valorDe('Falta')).toContain(formatarBRL(15))
    expect(valorDe('Gorjeta')).toContain(formatarBRL(5))
  })

  it('mostra fechamento de atendimento Club com R$ 0,00 coberto pelo plano', () => {
    semear({
      clube: true,
      lancamentos: [
        lancamento({ valor: 70, desconto: 70, valorLiquido: 0, recebido: 0 }),
      ],
    })
    const clubeAntes = localStorage.getItem(CHAVE_CLUBE)
    const lancesAntes = localStorage.getItem(CHAVE_LANC)

    montarModal()

    expect(
      screen.getByText('Atendimento realizado pelo plano Audax Club'),
    ).toBeTruthy()
    expect(screen.getByText(/plano Cabelo/)).toBeTruthy()
    expect(valorDe('Total final')).toContain(formatarBRL(0))
    expect(valorDe('Total pago')).toContain(formatarBRL(0))
    // sem cobrança nova e sem mexer no cadastro da assinatura
    expect(localStorage.getItem(CHAVE_CLUBE)).toBe(clubeAntes)
    expect(localStorage.getItem(CHAVE_LANC)).toBe(lancesAntes)
    expect(lancamentosGravados()).toHaveLength(1)
  })

  it('mostra fechamento estornado como histórico, com os valores originais', () => {
    semear({
      lancamentos: [
        lancamento({
          estornado: true,
          estornadoEm: '2026-10-01T12:00:00.000Z',
        }),
      ],
    })
    montarModal()

    expect(screen.getByText('FECHAMENTO ESTORNADO')).toBeTruthy()
    expect(screen.getByText(/somente leitura/)).toBeTruthy()
    expect(valorDe('Total final')).toContain(formatarBRL(60))
    expect(valorDe('Total pago')).toContain(formatarBRL(60))
  })

  it('visualizar o fechamento não cria lançamento novo', () => {
    semear()
    montarDetalhe()
    const antes = localStorage.getItem(CHAVE_LANC)

    fireEvent.click(screen.getByRole('button', { name: 'Ver Fechamento' }))

    expect(screen.getByText('FECHAMENTO DE CONTA')).toBeTruthy()
    expect(localStorage.getItem(CHAVE_LANC)).toBe(antes)
    expect(lancamentosGravados()).toHaveLength(1)
    expect(lancamentosGravados()[0].id).toBe('lan-1')
  })

  it('visualizar o fechamento não altera estoque (movimentações nem produtos)', () => {
    semear({
      produtos: [produto()],
      mov: [
        {
          id: 'mov-1',
          produtoId: 'prod-1',
          produto: 'Shampoo',
          tipo: 'venda',
          quantidade: -2,
          estoqueAntes: 10,
          estoqueDepois: 8,
          custoUnitario: 15,
          data: DIA,
          hora: '10:05',
          origem: 'pdv',
          vendaId: 'lan-9',
          criadoEm: '2026-09-30T10:05:00.000Z',
        },
      ],
    })
    montarDetalhe()
    const movAntes = localStorage.getItem(CHAVE_MOV)
    const prodAntes = localStorage.getItem(CHAVE_PROD)

    fireEvent.click(screen.getByRole('button', { name: 'Ver Fechamento' }))

    expect(screen.getByText('FECHAMENTO DE CONTA')).toBeTruthy()
    expect(localStorage.getItem(CHAVE_MOV)).toBe(movAntes)
    expect(localStorage.getItem(CHAVE_PROD)).toBe(prodAntes)
  })

  it('visualizar o fechamento não altera a comissão (produção idêntica)', () => {
    semear()
    montarDetalhe()
    const periodo = { inicio: DIA, fim: DIA }
    const producaoAntes = calcularProducao(lancamentosGravados(), 'Audax', periodo)
    const configsAntes = localStorage.getItem(CHAVE_COM_CONFIGS)
    const fechAntes = localStorage.getItem(CHAVE_COM_FECH)
    const audAntes = localStorage.getItem(CHAVE_COM_AUD)

    fireEvent.click(screen.getByRole('button', { name: 'Ver Fechamento' }))

    expect(screen.getByText('FECHAMENTO DE CONTA')).toBeTruthy()
    const producaoDepois = calcularProducao(
      lancamentosGravados(),
      'Audax',
      periodo,
    )
    expect(producaoDepois).toEqual(producaoAntes)
    expect(producaoDepois.liquido).toBe(60)
    expect(localStorage.getItem(CHAVE_COM_CONFIGS)).toBe(configsAntes)
    expect(localStorage.getItem(CHAVE_COM_FECH)).toBe(fechAntes)
    expect(localStorage.getItem(CHAVE_COM_AUD)).toBe(audAntes)
  })
})
