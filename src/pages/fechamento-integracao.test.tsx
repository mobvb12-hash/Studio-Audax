import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import ClienteDetalheModal from '@/components/ClienteDetalheModal'
import FechamentoCaixaModal from '@/components/FechamentoCaixaModal'
import PagamentoModal from '@/components/PagamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import type { CaixaContexto } from '@/modules/caixa/store'
import type { Lancamento } from '@/modules/caixa/types'
import { calcularComissao, calcularProducao } from '@/modules/comissoes/producao'
import { periodoHoje } from '@/modules/comissoes/periodo'
import { ClientesProvider } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import { preferenciasPadrao } from '@/modules/clientes/types'
import { ClubeProvider } from '@/modules/clube/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import type { Produto } from '@/modules/produtos/types'
import { formasPagamento, resumoFinanceiro } from '@/modules/relatorios/calculos'
import { ServicosProvider } from '@/modules/servicos/store'

const DIA = hojeISO()
const PERIODO = periodoHoje()
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

const PRODUTO: Produto = {
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
}

const CLIENTE: Cliente = {
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
  instagram: '',
  comoNosConheceu: '',
  telefones: [],
  endereco: null,
  preferencias: preferenciasPadrao(),
  criadoEm: DIA,
  atualizadoEm: DIA,
}

let ctx: CaixaContexto | null = null

function Captura() {
  const caixa = useCaixa()
  useEffect(() => {
    ctx = caixa
  })
  return null
}

function semear() {
  localStorage.clear()
  localStorage.setItem(CHAVE_AG, JSON.stringify([AGENDAMENTO]))
  localStorage.setItem(CHAVE_PROD, JSON.stringify([PRODUTO]))
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
  localStorage.setItem('studio-audax:clientes:v1', JSON.stringify([CLIENTE]))
}

function montar() {
  return render(
    <ClientesProvider>
      <ServicosProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <ProfissionaisProvider>
              <CaixaProvider>
                <AgendaProvider>
                  <Captura />
                  <PagamentoModal
                    agendamento={AGENDAMENTO}
                    onFechar={() => undefined}
                  />
                </AgendaProvider>
              </CaixaProvider>
            </ProfissionaisProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ServicosProvider>
    </ClientesProvider>,
  )
}

function lancamentos(): Lancamento[] {
  return JSON.parse(localStorage.getItem(CHAVE_LANC) ?? '[]') as Lancamento[]
}

function digitar(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}

function fecharConta() {
  fireEvent.click(screen.getByRole('button', { name: /^Fechar Conta/ }))
}

function adicionarProduto() {
  fireEvent.change(screen.getByLabelText('Produto'), {
    target: { value: 'prod-1' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
}

beforeEach(() => {
  localStorage.clear()
  ctx = null
})

describe('Fechamento de conta — Caixa, Relatórios e Comissão', () => {
  it('serviço + produto + desconto alimentam o Caixa do dia e os relatórios', () => {
    semear()
    montar()

    adicionarProduto()
    digitar('Desconto (R$)', '10')
    digitar('Desconto em Shampoo (R$)', '5')
    digitar('Forma de pagamento *', 'pix')
    fecharConta()

    const lances = lancamentos()
    expect(lances).toHaveLength(2)

    // --- Caixa do dia -------------------------------------------------------
    const resumo = ctx!.resumoDoDia(DIA)
    expect(resumo.receitasAtendimentos).toBe(60) // 70 − 10
    expect(resumo.receitasProdutos).toBe(30) // 35 − 5
    expect(resumo.totalRecebido).toBe(90)
    expect(resumo.descontos).toBe(15)
    expect(resumo.porForma.pix).toBe(90)
    expect(resumo.qtdAtendimentos).toBe(1)
    expect(resumo.qtdProdutos).toBe(1)
    expect(resumo.gorjetas).toBe(0)
    expect(resumo.dividas).toBe(0)

    // --- Relatórios --------------------------------------------------------
    const financeiro = resumoFinanceiro(lances, PERIODO)
    expect(financeiro.receitaServicos).toBe(60)
    expect(financeiro.receitaProdutos).toBe(30)
    expect(financeiro.receitaTotal).toBe(90)
    expect(financeiro.qtdAtendimentosPagos).toBe(1)

    const porForma = formasPagamento(lances, PERIODO)
    expect(porForma.total).toBe(90)
    const pix = porForma.linhas.find((l) => l.forma === 'pix')
    expect(pix).toMatchObject({ valor: 90, qtd: 2 })

    // --- Comissão ----------------------------------------------------------
    const producao = calcularProducao(lances, 'Audax', PERIODO)
    expect(producao.liquido).toBe(60)
    expect(producao.producaoProdutos).toBe(30)
    expect(calcularComissao(producao.liquido, 40)).toBe(24)
  })

  it('gorjeta fica fora da receita, do relatório e da base de comissão', () => {
    semear()
    montar()

    digitar('Recebido (R$)', '80')
    digitar('Gorjeta (R$)', '10')
    fecharConta()

    const lances = lancamentos()
    expect(lances).toHaveLength(1)
    expect(lances[0].gorjeta).toBe(10)
    expect(lances[0].valorLiquido).toBe(70)
    expect(lances[0].recebido).toBe(80)
    expect(lances[0].troco).toBeUndefined()

    const resumo = ctx!.resumoDoDia(DIA)
    expect(resumo.receitasAtendimentos).toBe(70)
    expect(resumo.totalRecebido).toBe(70)
    expect(resumo.gorjetas).toBe(10)

    const financeiro = resumoFinanceiro(lances, PERIODO)
    expect(financeiro.receitaTotal).toBe(70)

    const producao = calcularProducao(lances, 'Audax', PERIODO)
    expect(producao.liquido).toBe(70)
    expect(calcularComissao(producao.liquido, 40)).toBe(28)
  })

  it('dívida fica registrada e aparece no Caixa como valor em aberto', () => {
    semear()
    montar()

    digitar('Recebido (R$)', '40')
    fecharConta()
    expect(screen.getByText(/Restam R\$ 30,00 em aberto/)).toBeTruthy()

    fireEvent.click(
      screen.getByLabelText('Registrar o restante como dívida (R$ 30,00)'),
    )
    fecharConta()

    const lances = lancamentos()
    expect(lances).toHaveLength(1)
    expect(lances[0].recebido).toBe(40)
    expect(lances[0].falta).toBe(30)

    const resumo = ctx!.resumoDoDia(DIA)
    expect(resumo.dividas).toBe(30)
    expect(resumo.totalRecebido).toBe(70)

    // O faturamento continua sendo o do fechamento; a dívida é acompanhada
    // pelo Caixa (em aberto) e pelo histórico do cliente.
    const financeiro = resumoFinanceiro(lances, PERIODO)
    expect(financeiro.receitaTotal).toBe(70)
  })

  it('baixa de estoque acontece junto com o fechamento (produto + serviço)', () => {
    semear()
    montar()

    adicionarProduto()
    fecharConta()

    const movs = JSON.parse(
      localStorage.getItem(CHAVE_MOV) ?? '[]',
    ) as { produtoId: string; quantidade: number }[]
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({ produtoId: 'prod-1', quantidade: -1 })

    const produtos = JSON.parse(
      localStorage.getItem(CHAVE_PROD) ?? '[]',
    ) as Produto[]
    expect(produtos[0].estoque).toBe(9)

    expect(ctx!.resumoDoDia(DIA).receitasAtendimentos).toBe(70)
    expect(ctx!.resumoDoDia(DIA).receitasProdutos).toBe(35)
  })
})

function montarFechamentoCaixa() {
  render(
    <CaixaProvider>
      <FechamentoCaixaModal data={DIA} onFechar={() => undefined} />
    </CaixaProvider>,
  )
}

function montarDetalheDoCliente() {
  render(
    <ClientesProvider>
      <AgendaProvider>
        <CaixaProvider>
          <ClubeProvider>
            <ClienteDetalheModal cliente={CLIENTE} onFechar={() => undefined} />
          </ClubeProvider>
        </CaixaProvider>
      </AgendaProvider>
    </ClientesProvider>,
  )
}

function linha(rotulo: string): string {
  const el = screen.getByText(rotulo)
  return (el.parentElement?.textContent ?? '').replace(/[\u00A0\u202F]/g, ' ')
}

describe('Fechamento de conta — tela de fechamento do caixa', () => {
  it('mostra a gorjeta como linha fora da receita', () => {
    semear()
    const r = montar()
    digitar('Recebido (R$)', '80')
    digitar('Gorjeta (R$)', '10')
    fecharConta()
    r.unmount()

    montarFechamentoCaixa()

    expect(linha('Atendimentos recebidos (1)')).toContain('R$ 70,00')
    expect(linha('Total recebido')).toContain('R$ 70,00')
    expect(linha('Gorjetas (fora da receita)')).toContain('R$ 10,00')
    expect(screen.queryByText('Dívidas em aberto (a receber)')).toBeNull()
  })

  it('mostra a dívida em aberto sem mexer no total recebido', () => {
    semear()
    const r = montar()
    digitar('Recebido (R$)', '40')
    fecharConta()
    fireEvent.click(
      screen.getByLabelText('Registrar o restante como dívida (R$ 30,00)'),
    )
    fecharConta()
    r.unmount()

    montarFechamentoCaixa()

    expect(linha('Atendimentos recebidos (1)')).toContain('R$ 70,00')
    expect(linha('Total recebido')).toContain('R$ 70,00')
    expect(linha('Dívidas em aberto (a receber)')).toContain('R$ 30,00')
    expect(screen.queryByText('Gorjetas (fora da receita)')).toBeNull()
  })
})

describe('Fechamento de conta — histórico do cliente', () => {
  it('dívida aparece como em aberto no detalhe do cliente', () => {
    semear()
    const r = montar()
    digitar('Recebido (R$)', '40')
    fecharConta()
    fireEvent.click(
      screen.getByLabelText('Registrar o restante como dívida (R$ 30,00)'),
    )
    fecharConta()
    r.unmount()

    montarDetalheDoCliente()

    expect(screen.getByText('Em aberto')).toBeTruthy()
    expect(screen.getByText('Em aberto R$ 30,00')).toBeTruthy()
    expect(screen.getByText(/Dinheiro/)).toBeTruthy()
    expect(screen.getByText('Pagamentos de atendimentos')).toBeTruthy()
  })
})
