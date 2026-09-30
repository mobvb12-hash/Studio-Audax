// Auditoria de regressão do ESTORNO do fechamento de conta.
//
// A cobertura existente provava estorno de venda avulsa, ordem revert→estornar
// e estorno de atendimento isolado; faltava provar o fluxo COMPLETO da conta
// fechada pelo PagamentoModal:
//   1. estorno zera o resumo do dia (recebido/troco/gorjeta/divida/porForma)
//      sem apagar o lançamento original;
//   2. estornar só o serviço não devolve estoque; estornar a venda devolve
//      (orquestração real da tela de Caixa);
//   3. reprocessar a conta depois do estorno não duplica Caixa, Estoque
//      nem Comissão.
import { act, useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import PagamentoModal from '@/components/PagamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import { preferenciasPadrao } from '@/modules/clientes/types'
import { calcularComissao, calcularProducao } from '@/modules/comissoes/producao'
import { periodoHoje } from '@/modules/comissoes/periodo'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import type { Produto } from '@/modules/produtos/types'
import { ServicosProvider } from '@/modules/servicos/store'
import Caixa from './Caixa'

const DIA = hojeISO()
const PERIODO = periodoHoje()
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_AUD = 'studio-audax:caixa:auditoria:v1'
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

let ctxCaixa: ReturnType<typeof useCaixa>
let ctxEstoque: ReturnType<typeof useEstoque>
let ctxProdutos: ReturnType<typeof useProdutos>

function Captura() {
  const caixa = useCaixa()
  const estoque = useEstoque()
  const produtos = useProdutos()
  useEffect(() => {
    ctxCaixa = caixa
    ctxEstoque = estoque
    ctxProdutos = produtos
  })
  return null
}

/** Modal de fechamento + tela de Caixa, com os providers do app. */
function env(children: ReactNode) {
  return render(
    <ClientesProvider>
      <ServicosProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <ProfissionaisProvider>
              <CaixaProvider>
                <AgendaProvider>
                  <Captura />
                  {children}
                </AgendaProvider>
              </CaixaProvider>
            </ProfissionaisProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ServicosProvider>
    </ClientesProvider>,
  )
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

function montarTudo() {
  return env(
    <>
      <PagamentoModal agendamento={AGENDAMENTO} onFechar={() => undefined} />
      <Caixa />
    </>,
  )
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

/**
 * Estorno pela tela real: clica "Estornar" na linha do lançamento (dentro
 * do cartão "Recebimentos do dia") e confirma no modal por cima — a mesma
 * orquestração de `Caixa.tsx` (devolver estoque antes de estornar).
 */
function estornarLinha(descricao: RegExp) {
  const linha = screen
    .getAllByRole('listitem')
    .find((li) => descricao.test(li.textContent ?? ''))
  expect(linha).toBeTruthy()
  fireEvent.click(within(linha!).getByRole('button', { name: 'Estornar' }))
  // modal de confirmação por cima — o último "Estornar" do DOM é o de confirmar
  const botoes = screen.getAllByRole('button', { name: 'Estornar' })
  fireEvent.click(botoes[botoes.length - 1])
}

function lancamentos() {
  return ctxCaixa.lancamentos
}

function estoqueDoShampoo() {
  return ctxProdutos.porId('prod-1')?.estoque
}

function tiposDeMov() {
  return ctxEstoque.movimentacoes.map((m) => m.tipo)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxEstoque = undefined as unknown as ReturnType<typeof useEstoque>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
})

describe('Estorno da fechamento de conta — resumo do dia e auditoria', () => {
  it('estornar serviço + produto zera o resumo sem apagar nada', () => {
    semear()
    montarTudo()
    adicionarProduto()
    digitar('Recebido (R$)', '120')
    digitar('Gorjeta (R$)', '10')
    digitar('Forma de pagamento *', 'pix')
    fecharConta()

    expect(lancamentos()).toHaveLength(2)
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      receitasAtendimentos: 70,
      receitasProdutos: 35,
      totalRecebido: 105,
      gorjetas: 10,
      dividas: 0,
      descontos: 0,
      qtdAtendimentos: 1,
      qtdProdutos: 1,
      porForma: { pix: 105 },
    })

    estornarLinha(/Corte Degradê — Ana Souza/)
    estornarLinha(/1× Shampoo/)

    // Resumo zerado por completo — nada do estorno entra no resultado do dia
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      receitasAtendimentos: 0,
      receitasProdutos: 0,
      totalRecebido: 0,
      liquido: 0,
      descontos: 0,
      gorjetas: 0,
      dividas: 0,
      despesas: 0,
      qtdAtendimentos: 0,
      qtdProdutos: 0,
      porForma: { pix: 0 },
      porProfissional: [],
    })

    // Lançamentos preservados (só marcados), valores originais intactos
    const lances = lancamentos()
    expect(lances).toHaveLength(2)
    expect(lances.every((l) => l.estornado)).toBe(true)
    expect(lances.every((l) => l.estornadoEm)).toBe(true)
    const pagamento = lances.find((l) => l.origem === 'atendimento')!
    expect(pagamento).toMatchObject({
      valorLiquido: 70,
      recebido: 120,
      troco: 5,
      gorjeta: 10,
    })
    expect(lances.find((l) => l.origem === 'produto')).toMatchObject({
      valorLiquido: 35,
    })
    expect(JSON.parse(localStorage.getItem(CHAVE_LANC) ?? '[]')).toHaveLength(2)

    // Auditoria: um evento por estorno, com o valor original
    expect(ctxCaixa.auditoria).toHaveLength(2)
    expect(ctxCaixa.auditoria.every((ev) => ev.acao === 'estorno')).toBe(true)
    expect(ctxCaixa.auditoria.map((ev) => ev.descricao).join(' ')).toContain(
      'R$ 70.00',
    )
    expect(ctxCaixa.auditoria.map((ev) => ev.descricao).join(' ')).toContain(
      'R$ 35.00',
    )
    expect(JSON.parse(localStorage.getItem(CHAVE_AUD) ?? '[]')).toHaveLength(2)

    // UI: linhas marcadas, sem botão de estorno, contador zerado
    expect(screen.getAllByText(/· estornado/)).toHaveLength(2)
    expect(screen.queryAllByRole('button', { name: 'Estornar' })).toHaveLength(0)
    expect(screen.getAllByText('0 registro(s)')).toHaveLength(2)
  })

  it('estornar conta com dívida zera o valor em aberto e preserva a falta', () => {
    semear()
    montarTudo()
    digitar('Recebido (R$)', '40')
    fecharConta()
    expect(screen.getByText(/Restam R\$ 30,00 em aberto/)).toBeTruthy()
    fireEvent.click(
      screen.getByLabelText('Registrar o restante como dívida (R$ 30,00)'),
    )
    fecharConta()

    expect(lancamentos()).toHaveLength(1)
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      totalRecebido: 70,
      dividas: 30,
    })

    const id = lancamentos()[0].id
    act(() => {
      ctxCaixa.estornar(id)
    })

    // A dívida não pode continuar aparecendo como valor em aberto do dia
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      totalRecebido: 0,
      receitasAtendimentos: 0,
      dividas: 0,
      porForma: { dinheiro: 0 },
    })
    const lances = lancamentos()
    expect(lances).toHaveLength(1)
    expect(lances[0]).toMatchObject({
      estornado: true,
      recebido: 40,
      falta: 30,
      valorLiquido: 70,
    })
    expect(ctxCaixa.auditoria).toHaveLength(1)
    expect(ctxCaixa.jaPago('ag-1')).toBeUndefined()
  })
})

describe('Estorno da fechamento de conta — estoque', () => {
  it('estornar só o serviço não mexe no estoque; estornar a venda devolve', () => {
    semear()
    montarTudo()
    adicionarProduto()
    fecharConta()

    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda'])

    estornarLinha(/Corte Degradê — Ana Souza/)
    expect(lancamentos().find((l) => l.origem === 'atendimento')?.estornado).toBe(
      true,
    )
    expect(lancamentos().find((l) => l.origem === 'produto')?.estornado).toBeFalsy()
    // Pagamento não tem vínculo com estoque: nada devolvido, nada criado
    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda'])

    estornarLinha(/1× Shampoo/)
    expect(estoqueDoShampoo()).toBe(10)
    expect(tiposDeMov()).toEqual(['venda', 'estorno'])
    const venda = lancamentos().find((l) => l.origem === 'produto')!
    const movEstorno = ctxEstoque.movimentacoes.find((m) => m.tipo === 'estorno')!
    expect(movEstorno).toMatchObject({
      vendaId: venda.id,
      estoqueAntes: 9,
      estoqueDepois: 10,
      custoUnitario: 15,
    })
    expect(ctxCaixa.resumoDoDia(DIA).totalRecebido).toBe(0)
  })
})

describe('Estorno da fechamento de conta — reprocessamento', () => {
  it('nova conta após estorno não duplica Caixa, Estoque nem Comissão', () => {
    semear()
    montarTudo()
    adicionarProduto()
    fecharConta()

    // --- Primeira conta ----------------------------------------------------
    expect(lancamentos()).toHaveLength(2)
    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda'])
    let producao = calcularProducao(lancamentos(), 'Audax', PERIODO)
    expect(producao).toMatchObject({
      qtdAtendimentos: 1,
      liquido: 70,
      producaoProdutos: 35,
      qtdEstornos: 0,
    })
    expect(calcularComissao(producao.liquido, 40)).toBe(28)
    expect(ctxCaixa.resumoDoDia(DIA).totalRecebido).toBe(105)

    // --- Estorno completo pela tela ---------------------------------------
    estornarLinha(/Corte Degradê — Ana Souza/)
    estornarLinha(/1× Shampoo/)
    expect(estoqueDoShampoo()).toBe(10)
    expect(tiposDeMov()).toEqual(['venda', 'estorno'])
    expect(ctxCaixa.resumoDoDia(DIA).totalRecebido).toBe(0)
    producao = calcularProducao(lancamentos(), 'Audax', PERIODO)
    expect(producao).toMatchObject({
      qtdAtendimentos: 0,
      liquido: 0,
      producaoProdutos: 0,
      qtdEstornos: 1,
      valorEstornos: 70,
    })
    expect(calcularComissao(producao.liquido, 40)).toBe(0)

    // --- Reprocessa a MESMA conta (pagamento estornado não trava) ---------
    fecharConta()

    const lances = lancamentos()
    expect(lances).toHaveLength(4)
    expect(new Set(lances.map((l) => l.id)).size).toBe(4)

    const atendimentos = lances.filter((l) => l.origem === 'atendimento')
    expect(atendimentos).toHaveLength(2)
    expect(atendimentos.filter((l) => l.estornado)).toHaveLength(1)
    const novoPagamento = ctxCaixa.jaPago('ag-1')
    expect(novoPagamento).toBeTruthy()
    expect(novoPagamento!.id).not.toBe(
      atendimentos.find((l) => l.estornado)!.id,
    )

    // Conta: só o reprocessamento conta no dia; nada some do histórico
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      receitasAtendimentos: 70,
      receitasProdutos: 35,
      totalRecebido: 105,
      qtdAtendimentos: 1,
      qtdProdutos: 1,
    })
    expect(JSON.parse(localStorage.getItem(CHAVE_LANC) ?? '[]')).toHaveLength(4)

    // Estoque: baixa de novo (id novo), sem dobrar o estorno
    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda', 'estorno', 'venda'])
    const movsVenda = ctxEstoque.movimentacoes.filter((m) => m.tipo === 'venda')
    expect(movsVenda).toHaveLength(2)
    expect(movsVenda[0].vendaId).not.toBe(movsVenda[1].vendaId)
    expect(
      ctxEstoque.movimentacoes.filter((m) => m.tipo === 'estorno'),
    ).toHaveLength(1)

    // Comissão: produção conta 1x (o estorno fica só no histórico)
    producao = calcularProducao(lancamentos(), 'Audax', PERIODO)
    expect(producao).toMatchObject({
      qtdAtendimentos: 1,
      liquido: 70,
      producaoProdutos: 35,
      qtdEstornos: 1,
      valorEstornos: 70,
    })
    expect(calcularComissao(producao.liquido, 40)).toBe(28)

    // Reprocessamento não gera eventos novos de auditoria
    expect(ctxCaixa.auditoria).toHaveLength(2)
  })
})
