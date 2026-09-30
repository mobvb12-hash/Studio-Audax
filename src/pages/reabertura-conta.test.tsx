// Fase 11.2 — REABRIR CONTA PARA EDIÇÃO
//
// Modelo obrigatório coberto aqui:
//   fechamento → reabrir (motivo obrigatório) → histórico preservado →
//   estorno do financeiro anterior (primitiva existente) → edição →
//   novo fechamento (sem duplicar Caixa/Estoque/Comissão).
//
// Cenários: A (reabertura simples), B (produto 10→9→10→9), C (adicionar
// produto), D (correção de serviço/valor), E (motivo), F (histórico),
// G (Caixa), H (Comissão), I (Club R$0), J (reabertura duplicada),
// K (estorno existente intacto), L (trava de comissão fechada).
import { act, useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PagamentoModal from '@/components/PagamentoModal'
import VerFechamentoModal from '@/components/VerFechamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import DetalheAgendamento from '@/modules/agenda/components/DetalheAgendamento'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import type { EventoAuditoria, Lancamento } from '@/modules/caixa/types'
import { ClientesProvider } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import { preferenciasPadrao } from '@/modules/clientes/types'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { calcularComissao, calcularProducao } from '@/modules/comissoes/producao'
import { periodoHoje } from '@/modules/comissoes/periodo'
import { EstoqueProvider, useEstoque } from '@/modules/estoque/store'
import { ProdutosProvider, useProdutos } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import type { Produto } from '@/modules/produtos/types'
import { ServicosProvider } from '@/modules/servicos/store'

const DIA = hojeISO()
const PERIODO = periodoHoje()
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_AUD = 'studio-audax:caixa:auditoria:v1'
const CHAVE_PROD = 'studio-audax:produtos:v1'
const CHAVE_CLUBE = 'studio-audax:clube:v1'
const CHAVE_COM_FECH = 'studio-audax:comissoes:fechamentos:v1'

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

/** Providers do app + PagamentoModal + VerFechamentoModal. */
function env(children: ReactNode) {
  return render(
    <ClientesProvider>
      <ServicosProvider>
        <ProdutosProvider>
          <EstoqueProvider>
            <ProfissionaisProvider>
              <CaixaProvider>
                <AgendaProvider>
                  <ComissoesProvider>
                    <ClubeProvider>
                      <Captura />
                      {children}
                    </ClubeProvider>
                  </ComissoesProvider>
                </AgendaProvider>
              </CaixaProvider>
            </ProfissionaisProvider>
          </EstoqueProvider>
        </ProdutosProvider>
      </ServicosProvider>
    </ClientesProvider>,
  )
}

type Semente = { clube?: boolean; comissaoFechada?: boolean }

function semear(s: Semente = {}) {
  localStorage.clear()
  sessionStorage.clear()
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
  if (s.comissaoFechada) {
    localStorage.setItem(
      CHAVE_COM_FECH,
      JSON.stringify([
        {
          id: 'com-1',
          profissionalId: 'prof-1',
          profissionalNome: 'Audax',
          periodo: { inicio: DIA, fim: DIA },
          qtdAtendimentos: 1,
          producao: 70,
          percentual: 40,
          comissao: 28,
          fechadoEm: `${DIA}T12:00:00.000Z`,
        },
      ]),
    )
  }
}

function montar() {
  return env(
    <>
      <PagamentoModal agendamento={AGENDAMENTO} onFechar={() => undefined} />
      <VerFechamentoModal
        agendamento={AGENDAMENTO}
        onFechar={() => undefined}
      />
    </>,
  )
}

function montarDetalhe(pago: boolean) {
  return env(
    <DetalheAgendamento
      ag={AGENDAMENTO}
      duracaoDo={() => 40}
      mudarStatus={vi.fn()}
      remover={vi.fn()}
      pago={pago}
      onPagar={vi.fn()}
      onRemarcar={vi.fn()}
      onEditar={vi.fn()}
      onFechar={vi.fn()}
    />,
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

/** Reabertura pela primitiva da store (orquestração de estoque idempotente). */
function reabrir(motivo = 'Correção de desconto') {
  act(() => {
    ctxCaixa.reabrirConta('ag-1', motivo, (vendas) => {
      for (const venda of vendas) ctxEstoque.reverterVenda(venda)
    })
  })
}

function lancamentos(): Lancamento[] {
  return ctxCaixa.lancamentos
}

function gravados(chave: string): unknown[] {
  return JSON.parse(localStorage.getItem(chave) ?? '[]') as unknown[]
}

function estoqueDoShampoo() {
  return ctxProdutos.porId('prod-1')?.estoque
}

function tiposDeMov() {
  return ctxEstoque.movimentacoes.map((m) => m.tipo)
}

function eventos(acao: 'estorno' | 'reabertura'): EventoAuditoria[] {
  return ctxCaixa.auditoria.filter((e) => e.acao === acao)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
  ctxEstoque = undefined as unknown as ReturnType<typeof useEstoque>
  ctxProdutos = undefined as unknown as ReturnType<typeof useProdutos>
})

describe('A) Reabrir atendimento simples — histórico e liberação', () => {
  it('reabre preservando o lançamento e liberando um novo fechamento', () => {
    semear()
    montar()
    fecharConta()
    expect(ctxCaixa.jaPago('ag-1')).toBeTruthy()
    const original = lancamentos()[0]

    reabrir('Correção de desconto')

    // Histórico preservado: marcado, nunca apagado, valores intactos
    expect(lancamentos()).toHaveLength(1)
    const estornado = lancamentos().find((l) => l.id === original.id)!
    expect(estornado).toMatchObject({
      estornado: true,
      origem: 'atendimento',
      valor: 70,
      valorLiquido: 70,
    })
    expect(estornado.estornadoEm).toBeTruthy()

    // Atendimento liberado: fora dos resumos e novo pagamento aceito
    expect(ctxCaixa.jaPago('ag-1')).toBeUndefined()
    expect(ctxCaixa.possuiFechamento('ag-1')).toBe(true)
    expect(ctxCaixa.resumoDoDia(DIA).totalRecebido).toBe(0)

    let novoId = ''
    act(() => {
      novoId = ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: DIA,
        hora: '10:00',
        cliente: 'Ana Souza',
        clienteId: 'cli-1',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'concluido',
      }).id
    })
    expect(novoId).not.toBe(original.id)
    expect(ctxCaixa.jaPago('ag-1')!.id).toBe(novoId)
    expect(lancamentos()).toHaveLength(2)

    // Auditoria: estorno do anterior + reabertura com motivo e identificação
    expect(eventos('estorno')).toHaveLength(1)
    const reb = eventos('reabertura')[0]
    expect(reb.motivo).toBe('Correção de desconto')
    expect(reb.descricao.endsWith('atendimento ag-1')).toBe(true)
  })

  it('após reabertura, o detalhe volta a liberar edição e o histórico', () => {
    semear()
    const { unmount } = montar()
    fecharConta()
    reabrir()
    unmount()

    montarDetalhe(false)

    // Conta em edição: em aberto, com caminho para novo fechamento
    expect(screen.getByText('Em aberto')).toBeTruthy()
    expect(
      screen.getByText('Conta em correção — fechamento anterior no histórico'),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Finalizar atendimento' }),
    ).toBeTruthy()

    // Histórico acessível e sem permitir nova reabertura
    fireEvent.click(screen.getByRole('button', { name: 'Ver Fechamento' }))
    expect(screen.getByText('FECHAMENTO ESTORNADO')).toBeTruthy()
    expect(screen.getByText(/não permite nova reabertura/)).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Reabrir Conta' }),
    ).toBeNull()
  })
})

describe('B) Reabrir com produto — estoque 10 → 9 → 10 → 9', () => {
  it('devolve a baixa na reabertura e baixa de novo só na nova venda', () => {
    semear()
    montar()
    adicionarProduto()
    fecharConta()
    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda'])

    reabrir()
    expect(estoqueDoShampoo()).toBe(10)
    expect(tiposDeMov()).toEqual(['venda', 'estorno'])
    expect(
      lancamentos().find((l) => l.origem === 'produto')?.estornado,
    ).toBe(true)

    // Novo fechamento com o produto: baixa de novo (id novo, sem dupla)
    // — o modal segue montado com o carrinho da primeira conta.
    fecharConta()
    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda', 'estorno', 'venda'])
    const vendas = lancamentos().filter((l) => l.origem === 'produto')
    expect(vendas).toHaveLength(2)
    expect(new Set(vendas.map((v) => v.id)).size).toBe(2)
    expect(vendas.find((v) => !v.estornado)!.agendamentoId).toBe('ag-1')
    const movs = ctxEstoque.movimentacoes
    expect(movs.filter((m) => m.tipo === 'venda')).toHaveLength(2)
    expect(movs.filter((m) => m.tipo === 'estorno')).toHaveLength(1)
  })
})

describe('C) Reabrir e adicionar produto', () => {
  it('fechamento original sem produto → só a nova venda gera baixa', () => {
    semear()
    montar()
    fecharConta()
    expect(tiposDeMov()).toEqual([])

    reabrir()
    adicionarProduto()
    fecharConta()

    expect(estoqueDoShampoo()).toBe(9)
    expect(tiposDeMov()).toEqual(['venda'])
    const vendas = lancamentos().filter((l) => l.origem === 'produto')
    expect(vendas).toHaveLength(1)
    expect(vendas[0].agendamentoId).toBe('ag-1')
    expect(vendas[0].estornado).toBeFalsy()
    const atendimentos = lancamentos().filter(
      (l) => l.origem === 'atendimento',
    )
    expect(atendimentos).toHaveLength(2)
    expect(atendimentos.filter((l) => l.estornado)).toHaveLength(1)
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      receitasAtendimentos: 70,
      receitasProdutos: 35,
      totalRecebido: 105,
      qtdAtendimentos: 1,
      qtdProdutos: 1,
    })
  })
})

describe('D) Reabrir e corrigir o serviço (adicionar serviço/valor)', () => {
  it('novo fechamento com o valor correto, sem somar o anterior', () => {
    semear()
    montar()
    fecharConta()
    expect(ctxCaixa.resumoDoDia(DIA).receitasAtendimentos).toBe(70)

    reabrir()
    // Correção do serviço/valor no mesmo fechamento (conta em edição)
    digitar('Valor do serviço (R$) *', '150')
    fecharConta()

    const atendimentos = lancamentos().filter(
      (l) => l.origem === 'atendimento',
    )
    expect(atendimentos).toHaveLength(2)
    const ativo = atendimentos.find((l) => !l.estornado)!
    expect(ativo).toMatchObject({ valor: 150, valorLiquido: 150 })
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      receitasAtendimentos: 150,
      totalRecebido: 150,
      qtdAtendimentos: 1,
    })
    const producao = calcularProducao(lancamentos(), 'Audax', PERIODO)
    expect(producao).toMatchObject({
      qtdAtendimentos: 1,
      liquido: 150,
      qtdEstornos: 1,
      valorEstornos: 70,
    })
    expect(calcularComissao(producao.liquido, 40)).toBe(60)
  })
})

describe('E) Motivo obrigatório', () => {
  it('bloqueia sem motivo e grava a auditoria com motivo ao confirmar', () => {
    semear()
    montar()
    fecharConta()

    // Pelo código: motivo curto é rejeitado pela store
    act(() => {
      expect(() => ctxCaixa.reabrirConta('ag-1', 'ab')).toThrow(
        'Informe o motivo da reabertura (mín. 3 letras).',
      )
    })
    expect(ctxCaixa.jaPago('ag-1')).toBeTruthy()

    // Pela UI: confirmação desabilitada até escolher o motivo
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir Conta' }))
    const confirmar = screen.getByRole('button', {
      name: 'Confirmar reabertura',
    }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    expect(screen.getByLabelText('Motivo da reabertura')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Motivo da reabertura'), {
      target: { value: 'Correção de pagamento' },
    })
    expect(
      (screen.getByRole('button', {
        name: 'Confirmar reabertura',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reabertura' }))

    // Com motivo: permitido — estornado + auditoria com motivo
    expect(ctxCaixa.jaPago('ag-1')).toBeUndefined()
    expect(lancamentos()[0].estornado).toBe(true)
    const reb = eventos('reabertura')[0]
    expect(reb.motivo).toBe('Correção de pagamento')
    expect(reb.data).toBe(DIA)
    expect(reb.descricao.endsWith('atendimento ag-1')).toBe(true)

    // Estado histórico na mesma tela: sem nova reabertura
    expect(screen.getByText('FECHAMENTO ESTORNADO')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Reabrir Conta' }),
    ).toBeNull()
  })
})

describe('F) Fechamento anterior preservado e marcado', () => {
  it('mantém o lançamento original e o evento de reabertura no storage', () => {
    semear()
    montar()
    fecharConta()
    const antes = gravados(CHAVE_LANC)[0] as Lancamento

    reabrir('Produto não lançado')

    const depois = gravados(CHAVE_LANC) as Lancamento[]
    expect(depois).toHaveLength(1)
    expect(depois[0]).toMatchObject({
      id: antes.id,
      valor: 70,
      valorLiquido: 70,
      estornado: true,
    })
    expect(depois[0].estornadoEm).toBeTruthy()

    const aud = gravados(CHAVE_AUD) as EventoAuditoria[]
    expect(aud.filter((e) => e.acao === 'estorno')).toHaveLength(1)
    const reb = aud.filter((e) => e.acao === 'reabertura')
    expect(reb).toHaveLength(1)
    expect(reb[0].motivo).toBe('Produto não lançado')

    // Modal mostra o histórico como estornado/reaberto, com o motivo
    expect(screen.getByText('FECHAMENTO ESTORNADO')).toBeTruthy()
    expect(
      screen.getByText('Motivo da reabertura: Produto não lançado'),
    ).toBeTruthy()
    expect(screen.getByText(/não permite nova reabertura/)).toBeTruthy()
  })
})

describe('G) Caixa — não duplicar receita', () => {
  it('só o novo fechamento conta no resumo do dia', () => {
    semear()
    montar()
    fecharConta()
    expect(ctxCaixa.resumoDoDia(DIA).totalRecebido).toBe(70)

    reabrir()
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      totalRecebido: 0,
      receitasAtendimentos: 0,
      qtdAtendimentos: 0,
    })

    fecharConta()
    expect(ctxCaixa.resumoDoDia(DIA)).toMatchObject({
      receitasAtendimentos: 70,
      receitasProdutos: 0,
      totalRecebido: 70,
      qtdAtendimentos: 1,
    })
    // Dois lançamentos no histórico, um só ativo — receita contada 1x
    const atendimentos = lancamentos().filter(
      (l) => l.origem === 'atendimento',
    )
    expect(atendimentos).toHaveLength(2)
    expect(atendimentos.filter((l) => !l.estornado)).toHaveLength(1)
  })
})

describe('H) Comissão — antigo e novo nunca simultâneos', () => {
  it('produção conta só o novo fechamento; o estornado fica à parte', () => {
    semear()
    montar()
    fecharConta()
    reabrir()
    fecharConta()

    const producao = calcularProducao(lancamentos(), 'Audax', PERIODO)
    expect(producao).toMatchObject({
      qtdAtendimentos: 1,
      liquido: 70,
      qtdEstornos: 1,
      valorEstornos: 70,
    })
    expect(producao.liquido).not.toBe(140)
    expect(calcularComissao(producao.liquido, 40)).toBe(28)
  })
})

describe('I) Audax Club — serviço coberto pelo plano continua R$ 0,00', () => {
  it('reabertura e novo fechamento preservam R$ 0,00 e a assinatura', () => {
    semear({ clube: true })
    montar()
    digitar('Desconto (R$)', '70')
    fecharConta()
    expect(lancamentos()[0].valorLiquido).toBe(0)

    reabrir()
    digitar('Desconto (R$)', '70')
    fecharConta()

    const ativo = lancamentos().find(
      (l) => l.origem === 'atendimento' && !l.estornado,
    )!
    expect(ativo).toMatchObject({ valor: 70, desconto: 70, valorLiquido: 0 })
    expect(calcularProducao(lancamentos(), 'Audax', PERIODO).liquido).toBe(0)

    // Banner de plano continua correto e assinatura intocada
    expect(
      screen.getByText('Atendimento realizado pelo plano Audax Club'),
    ).toBeTruthy()
    const clube = JSON.parse(localStorage.getItem(CHAVE_CLUBE) ?? '{}') as {
      assinaturas?: { id: string; cancelada: boolean }[]
    }
    expect(clube.assinaturas?.[0]).toMatchObject({
      id: 'as-1',
      cancelada: false,
    })
  })
})

describe('J) Reabertura duplicada', () => {
  it('não permite duas reaberturas do mesmo fechamento', () => {
    semear()
    montar()
    fecharConta()
    reabrir('Correção de desconto')

    act(() => {
      expect(() =>
        ctxCaixa.reabrirConta('ag-1', 'Outro motivo válido'),
      ).toThrow('Não há fechamento ativo para reabrir neste atendimento.')
    })

    expect(eventos('reabertura')).toHaveLength(1)
    expect(lancamentos().filter((l) => l.estornado)).toHaveLength(1)
    // UI: fechamento estornado não oferece o botão (coberto também em A/E/F)
    expect(
      screen.queryByRole('button', { name: 'Reabrir Conta' }),
    ).toBeNull()
  })
})

describe('K) Estorno existente — fluxo intacto', () => {
  it('estorno direto continua funcionando e a reabertura não dispara sozinha', () => {
    semear()
    montar()
    adicionarProduto()
    fecharConta()
    // Venda avulsa (sem vínculo com o atendimento)
    act(() => {
      ctxCaixa.registrarVenda({
        data: DIA,
        itens: [
          { produtoId: 'prod-1', produto: 'Shampoo', quantidade: 1, preco: 35 },
        ],
        desconto: 0,
        formaPagamento: 'dinheiro',
      })
    })
    const atendimento = lancamentos().find((l) => l.origem === 'atendimento')!

    act(() => {
      ctxCaixa.estornar(atendimento.id)
    })

    // Estorno existente: marca, audita, zera resumo — nada apagado
    expect(eventos('estorno')).toHaveLength(1)
    expect(eventos('reabertura')).toHaveLength(0)
    expect(ctxCaixa.jaPago('ag-1')).toBeUndefined()
    expect(ctxCaixa.resumoDoDia(DIA).receitasAtendimentos).toBe(0)

    // Reabertura sem fechamento ativo é bloqueada e não toca nas vendas
    act(() => {
      expect(() =>
        ctxCaixa.reabrirConta('ag-1', 'Motivo qualquer'),
      ).toThrow('Não há fechamento ativo para reabrir neste atendimento.')
    })
    const vendas = lancamentos().filter((l) => l.origem === 'produto')
    expect(vendas).toHaveLength(2)
    expect(vendas.every((v) => !v.estornado)).toBe(true)
    expect(tiposDeMov()).toEqual(['venda'])
    expect(eventos('reabertura')).toHaveLength(0)
    expect(lancamentos().find((l) => l.id === atendimento.id)).toMatchObject({
      estornado: true,
      valorLiquido: 70,
    })
  })
})

describe('L) Conflito com período de comissão fechado', () => {
  it('bloqueia a reabertura e orienta reabrir a comissão primeiro', () => {
    semear({ comissaoFechada: true })
    montar()
    fecharConta()

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir Conta' }))

    expect(screen.getByText('Reabertura bloqueada')).toBeTruthy()
    expect(screen.getByText(/Reabra a comissão/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`período ${DIA} a ${DIA}`))).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Confirmar reabertura' }),
    ).toBeNull()
    expect(screen.queryByLabelText('Motivo da reabertura')).toBeNull()

    // Nada mudou: fechamento ativo, sem estorno e sem auditoria
    expect(ctxCaixa.jaPago('ag-1')).toBeTruthy()
    expect((gravados(CHAVE_LANC)[0] as Lancamento).estornado).toBeFalsy()
    expect(ctxCaixa.auditoria).toHaveLength(0)
  })
})
