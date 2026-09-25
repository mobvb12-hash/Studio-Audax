import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CaixaProvider, useCaixa } from './store'
import type { CaixaContexto } from './store'
import type { FormaPagamento } from './types'

const CHAVE_LANC = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_FECH = 'studio-audax:caixa:fechamentos:v1'
const CHAVE_AUD = 'studio-audax:caixa:auditoria:v1'

const DIA = '2026-09-25'

let ctx: CaixaContexto

function Captura() {
  const valor = useCaixa()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function montar() {
  return render(
    <CaixaProvider>
      <Captura />
    </CaixaProvider>,
  )
}

function pagamento(override: Partial<Parameters<CaixaContexto['registrarPagamento']>[0]> = {}) {
  return {
    agendamentoId: 'ag-1',
    data: DIA,
    hora: '10:00',
    cliente: 'Lucas Mendes',
    profissional: 'Audax',
    servico: 'Corte Degradê',
    valor: 70,
    desconto: 0,
    formaPagamento: 'dinheiro' as FormaPagamento,
    statusAgendamento: 'confirmado' as const,
    ...override,
  }
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as CaixaContexto
})

describe('Caixa — recebimento de atendimentos', () => {
  it('registra pagamento com preço, desconto, forma, profissional e cliente', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento({ desconto: 10, formaPagamento: 'pix' }))
    })
    const l = ctx.lancamentos[0]
    expect(l.origem).toBe('atendimento')
    expect(l.valor).toBe(70)
    expect(l.desconto).toBe(10)
    expect(l.valorLiquido).toBe(60)
    expect(l.formaPagamento).toBe('pix')
    expect(l.profissional).toBe('Audax')
    expect(l.cliente).toBe('Lucas Mendes')
    expect(l.servico).toBe('Corte Degradê')
    expect(l.data).toBe(DIA)
    expect(l.hora).toBe('10:00')
    expect(l.agendamentoId).toBe('ag-1')
    expect(JSON.parse(localStorage.getItem(CHAVE_LANC) ?? '[]')).toHaveLength(1)
  })

  it('impede pagamento duplicado do mesmo atendimento', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento())
    })
    expect(() => ctx.registrarPagamento(pagamento())).toThrow(/já foi pago/)
  })

  it('valida desconto maior que o valor, valor negativo e forma inválida', () => {
    montar()
    expect(() => ctx.registrarPagamento(pagamento({ desconto: 100 }))).toThrow(
      /desconto/,
    )
    expect(() => ctx.registrarPagamento(pagamento({ valor: -5 }))).toThrow(
      /inválido/i,
    )
    expect(() =>
      ctx.registrarPagamento(
        pagamento({ formaPagamento: 'boleto' as FormaPagamento }),
      ),
    ).toThrow(/forma de pagamento/)
  })

  it('não gera receita para agendamento cancelado ou não compareceu', () => {
    montar()
    expect(() =>
      ctx.registrarPagamento(pagamento({ statusAgendamento: 'cancelado' })),
    ).toThrow(/cancelado/)
    expect(() =>
      ctx.registrarPagamento(
        pagamento({ agendamentoId: 'ag-2', statusAgendamento: 'nao_compareceu' }),
      ),
    ).toThrow(/não compareceu/)
    expect(ctx.lancamentos).toHaveLength(0)
  })
})

describe('Caixa — produtos e despesas', () => {
  it('vende produto com quantidade, preço, desconto e forma de pagamento', () => {
    montar()
    act(() => {
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 2,
        preco: 30,
        desconto: 10,
        formaPagamento: 'cartao_debito',
        profissional: 'Diego',
      })
    })
    const l = ctx.lancamentos[0]
    expect(l.origem).toBe('produto')
    expect(l.valor).toBe(60)
    expect(l.valorLiquido).toBe(50)
    expect(l.quantidade).toBe(2)
    expect(ctx.resumoDoDia(DIA).receitasProdutos).toBe(50)
  })

  it('valida quantidade, preço e desconto da venda de produto', () => {
    montar()
    expect(() =>
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 0,
        preco: 10,
        desconto: 0,
        formaPagamento: 'dinheiro',
      }),
    ).toThrow(/quantidade/i)
    expect(() =>
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 1,
        preco: -1,
        desconto: 0,
        formaPagamento: 'dinheiro',
      }),
    ).toThrow(/preço/i)
    expect(() =>
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 1,
        preco: 0,
        desconto: 0,
        formaPagamento: 'dinheiro',
      }),
    ).toThrow(/preço/i)
    expect(() =>
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 1,
        preco: 10,
        desconto: 50,
        formaPagamento: 'dinheiro',
      }),
    ).toThrow(/desconto/)
  })

  it('lança despesa e valida valor > 0', () => {
    montar()
    expect(() =>
      ctx.adicionarDespesa({
        data: DIA,
        descricao: 'Energia',
        categoria: 'Energia / água',
        valor: 0,
        formaPagamento: 'pix',
      }),
    ).toThrow(/maior que zero/)
    act(() => {
      ctx.adicionarDespesa({
        data: DIA,
        descricao: 'Energia elétrica',
        categoria: 'Energia / água',
        valor: 250,
        formaPagamento: 'pix',
        observacao: 'setembro',
      })
    })
    expect(ctx.lancamentos[0].tipo).toBe('despesa')
    expect(ctx.resumoDoDia(DIA).despesas).toBe(250)
  })
})

describe('Caixa — resumo do dia', () => {
  it('calcula totais, formas de pagamento e produção por profissional', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento())
      ctx.registrarPagamento(
        pagamento({
          agendamentoId: 'ag-2',
          hora: '11:00',
          profissional: 'Diego',
          servico: 'Barba',
          valor: 50,
          formaPagamento: 'pix',
        }),
      )
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 1,
        preco: 30,
        desconto: 0,
        formaPagamento: 'cartao_credito',
        profissional: 'Audax',
      })
      ctx.adicionarDespesa({
        data: DIA,
        descricao: 'Aluguel',
        categoria: 'Aluguel',
        valor: 100,
        formaPagamento: 'dinheiro',
      })
    })

    const r = ctx.resumoDoDia(DIA)
    expect(r.receitasAtendimentos).toBe(120)
    expect(r.receitasProdutos).toBe(30)
    expect(r.totalRecebido).toBe(150)
    expect(r.despesas).toBe(100)
    expect(r.liquido).toBe(50)
    expect(r.qtdAtendimentos).toBe(2)
    expect(r.qtdProdutos).toBe(1)
    expect(r.porForma.dinheiro).toBe(70)
    expect(r.porForma.pix).toBe(50)
    expect(r.porForma.cartao_credito).toBe(30)
    expect(r.porProfissional).toEqual([
      { nome: 'Audax', valor: 100, qtd: 2 },
      { nome: 'Diego', valor: 50, qtd: 1 },
    ])
  })

  it('estorno remove do resumo e registra auditoria', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento())
    })
    const id = ctx.lancamentos[0].id
    act(() => {
      ctx.estornar(id)
    })
    expect(ctx.lancamentos[0].estornado).toBe(true)
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(0)
    expect(ctx.auditoria).toHaveLength(1)
    expect(ctx.auditoria[0].acao).toBe('estorno')
    expect(() => ctx.estornar(id)).toThrow(/já foi estornado/)
    expect(JSON.parse(localStorage.getItem(CHAVE_AUD) ?? '[]')).toHaveLength(1)
  })
})

describe('Caixa — fechamento e reabertura', () => {
  it('fecha o caixa, bloqueia novos lançamentos e preserva histórico', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento())
    })
    act(() => {
      ctx.fecharCaixa(DIA)
    })

    expect(ctx.diaFechado(DIA)).toBe(true)
    expect(ctx.fechamentoAtivo(DIA)?.resumo.totalRecebido).toBe(70)
    expect(() =>
      ctx.registrarPagamento(pagamento({ agendamentoId: 'ag-9' })),
    ).toThrow(/fechado/)
    expect(() => ctx.venderProduto({
      data: DIA,
      produto: 'X',
      quantidade: 1,
      preco: 1,
      desconto: 0,
      formaPagamento: 'dinheiro',
    })).toThrow(/fechado/)
    expect(() => ctx.adicionarDespesa({
      data: DIA,
      descricao: 'X',
      categoria: 'Outros',
      valor: 10,
      formaPagamento: 'dinheiro',
    })).toThrow(/fechado/)
    expect(() => ctx.fecharCaixa(DIA)).toThrow(/já está fechado/)
    expect(() => ctx.estornar(ctx.lancamentos[0].id)).toThrow(/fechado/)
  })

  it('reabertura exige motivo, gera auditoria e permite novo fechamento', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento())
    })
    act(() => {
      ctx.fecharCaixa(DIA)
    })

    expect(() => act(() => ctx.reabrirCaixa(DIA, 'ok'))).toThrow(/motivo/)
    act(() => {
      ctx.reabrirCaixa(DIA, 'correção de lançamento')
    })
    expect(ctx.diaFechado(DIA)).toBe(false)
    expect(ctx.auditoria.some((a) => a.acao === 'reabertura')).toBe(true)
    expect(
      ctx.fechamentos[0].reaberto?.motivo,
    ).toBe('correção de lançamento')

    act(() => {
      ctx.registrarPagamento(pagamento({ agendamentoId: 'ag-2' }))
    })
    act(() => {
      ctx.fecharCaixa(DIA)
    })
    expect(ctx.fechamentos).toHaveLength(2)
    expect(ctx.fechamentos[1].resumo.totalRecebido).toBe(140)
    expect(JSON.parse(localStorage.getItem(CHAVE_FECH) ?? '[]')).toHaveLength(2)
  })

  it('impede lançamentos e estornos quando o dia já está fechado (sem apagar dados)', () => {
    montar()
    act(() => {
      ctx.registrarPagamento(pagamento())
    })
    act(() => {
      ctx.fecharCaixa(DIA)
    })
    expect(() => ctx.estornar(ctx.lancamentos[0].id)).toThrow(/fechado/)
    expect(ctx.lancamentos).toHaveLength(1)
    expect(ctx.lancamentos[0].estornado).toBeFalsy()
  })
})

describe('Caixa — persistência (F5)', () => {
  it('mantém lançamentos, fechamentos e auditoria após recarregar', () => {
    const primeiro = montar()
    let pagamentoId = ''
    act(() => {
      pagamentoId = ctx.registrarPagamento(pagamento()).id
    })
    act(() => {
      ctx.venderProduto({
        data: DIA,
        produto: 'Pomada',
        quantidade: 1,
        preco: 30,
        desconto: 0,
        formaPagamento: 'pix',
        profissional: 'Diego',
      })
    })
    act(() => {
      ctx.adicionarDespesa({
        data: DIA,
        descricao: 'Água',
        categoria: 'Energia / água',
        valor: 40,
        formaPagamento: 'dinheiro',
      })
    })
    act(() => {
      ctx.estornar(pagamentoId)
    })
    act(() => {
      ctx.fecharCaixa(DIA)
    })
    act(() => {
      ctx.reabrirCaixa(DIA, 'correção de lançamento')
    })
    primeiro.unmount()

    montar()
    expect(ctx.lancamentos).toHaveLength(3)
    expect(ctx.lancamentos[0].estornado).toBe(true)
    expect(ctx.fechamentos).toHaveLength(1)
    expect(ctx.fechamentos[0].reaberto?.motivo).toBe(
      'correção de lançamento',
    )
    expect(ctx.auditoria).toHaveLength(2)
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(30)
  })
})
