import { act, useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { addMonthsISO, dataISOValida } from './regras'
import { ClubeProvider, useClube } from './store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { PLANOS_ROTULO, type AssinaturaClube, type PlanoClube } from './types'

const DIA = hojeISO()
const CHAVE_CLUBE = 'studio-audax:clube:v1'

let ctxClube: ReturnType<typeof useClube>
let ctxCaixa: ReturnType<typeof useCaixa>

function Captura() {
  const clube = useClube()
  const caixa = useCaixa()
  useEffect(() => {
    ctxClube = clube
    ctxCaixa = caixa
  })
  return null
}

/** Remontar = F5 (providers novos, mesmo localStorage). */
function montar() {
  return render(
    <CaixaProvider>
      <ClubeProvider>
        <Captura />
        <div>clube-pronto</div>
      </ClubeProvider>
    </CaixaProvider>,
  )
}

function criarAssinatura(opcoes: { clienteId?: string } = {}): AssinaturaClube {
  const r: { nova?: AssinaturaClube } = {}
  act(() => {
    r.nova = ctxClube.assinar({
      clienteId: opcoes.clienteId ?? 'cli-1',
      cliente: 'Lucas Mendes',
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      dataAssinatura: DIA,
    })
  })
  return r.nova as AssinaturaClube
}

beforeEach(() => {
  localStorage.clear()
})

describe('Audax Club — assinaturas', () => {
  it('cria assinatura com próximo vencimento de +1 mês', () => {
    montar()
    const nova = criarAssinatura()
    expect(ctxClube.assinaturas).toHaveLength(1)
    expect(nova.cliente).toBe('Lucas Mendes')
    expect(nova.plano).toBe('cabelo_barba')
    expect(nova.valorMensal).toBe(99.9)
    expect(nova.cancelada).toBe(false)
    expect(nova.proximoVencimento).toBe(addMonthsISO(DIA, 1))
    expect(dataISOValida(nova.proximoVencimento)).toBe(true)
  })

  it('valida cliente, plano, valor e data', () => {
    montar()
    expect(() =>
      ctxClube.assinar({
        clienteId: '',
        cliente: 'X',
        plano: 'cabelo',
        valorMensal: 50,
        dataAssinatura: DIA,
      }),
    ).toThrow('Selecione o cliente.')
    expect(() =>
      ctxClube.assinar({
        clienteId: 'c1',
        cliente: 'X',
        plano: 'invalido',
        valorMensal: 50,
        dataAssinatura: DIA,
      }),
    ).toThrow('Selecione o plano.')
    expect(() =>
      ctxClube.assinar({
        clienteId: 'c1',
        cliente: 'X',
        plano: 'cabelo',
        valorMensal: 0,
        dataAssinatura: DIA,
      }),
    ).toThrow('maior que zero')
    expect(() =>
      ctxClube.assinar({
        clienteId: 'c1',
        cliente: 'X',
        plano: 'cabelo',
        valorMensal: 50,
        dataAssinatura: '25/09/2026',
      }),
    ).toThrow('data de assinatura')
    expect(ctxClube.assinaturas).toHaveLength(0)
  })

  it('impede duplicidade: 1 assinatura não cancelada por cliente', () => {
    montar()
    criarAssinatura()
    expect(() =>
      ctxClube.assinar({
        clienteId: 'cli-1',
        cliente: 'Lucas Mendes',
        plano: 'barba',
        valorMensal: 59.9,
        dataAssinatura: DIA,
      }),
    ).toThrow('em andamento')
    expect(ctxClube.assinaturas).toHaveLength(1)
    expect(ctxClube.podeAssinar('cli-1')).toBe(false)
    expect(ctxClube.podeAssinar('cli-2')).toBe(true)
  })

  it('cancela sem apagar: assinatura e pagamentos permanecem', () => {
    montar()
    const ass = criarAssinatura()
    act(() => {
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
    })
    act(() => ctxClube.cancelar(ass.id, 'mudou de cidade'))

    expect(ctxClube.assinaturas).toHaveLength(1)
    expect(ctxClube.assinaturas[0].cancelada).toBe(true)
    expect(ctxClube.assinaturas[0].motivoCancelamento).toBe('mudou de cidade')
    expect(ctxClube.pagamentosDaAssinatura(ass.id)).toHaveLength(1)
    // libera o cliente para uma nova assinatura
    expect(ctxClube.podeAssinar('cli-1')).toBe(true)
    expect(() => ctxClube.cancelar(ass.id)).toThrow('já foi cancelada')
    expect(() => ctxClube.cancelar('nao-existe')).toThrow('não encontrada')
  })
})

describe('Audax Club — planos do clube', () => {
  it('cria assinatura em cada um dos 3 planos (Cabelo, Barba, Cabelo + Barba)', () => {
    montar()
    const planos: { id: PlanoClube; nome: string }[] = [
      { id: 'cabelo', nome: 'Cabelo' },
      { id: 'barba', nome: 'Barba' },
      { id: 'cabelo_barba', nome: 'Cabelo + Barba' },
    ]
    planos.forEach((plano, indice) => {
      const r: { nova?: AssinaturaClube } = {}
      act(() => {
        r.nova = ctxClube.assinar({
          clienteId: `cli-${indice}`,
          cliente: `Cliente ${indice}`,
          plano: plano.id,
          valorMensal: 50 + indice,
          dataAssinatura: DIA,
        })
      })
      expect(r.nova?.plano).toBe(plano.id)
      expect(PLANOS_ROTULO[r.nova!.plano]).toBe(plano.nome)
      expect(r.nova?.proximoVencimento).toBe(addMonthsISO(DIA, 1))
      expect(r.nova?.cancelada).toBe(false)
    })
    expect(ctxClube.assinaturas).toHaveLength(3)
  })
})

describe('Audax Club — edição de assinatura', () => {
  it('edita cliente, plano e mensalidade sem mexer em datas nem histórico', () => {
    montar()
    const ass = criarAssinatura()
    act(() => {
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
    })
    const vencPosPagamento = ctxClube.assinaturas[0].proximoVencimento

    let atualizada!: AssinaturaClube
    act(() => {
      atualizada = ctxClube.atualizar(ass.id, {
        plano: 'barba',
        valorMensal: 59.9,
      })
    })
    expect(atualizada.plano).toBe('barba')
    expect(atualizada.valorMensal).toBe(59.9)
    // datas e histórico intactos: vencimento só muda em pagamento/cancelamento
    expect(atualizada.proximoVencimento).toBe(vencPosPagamento)
    expect(atualizada.dataAssinatura).toBe(ass.dataAssinatura)
    expect(atualizada.id).toBe(ass.id)
    expect(ctxClube.pagamentos).toHaveLength(1)

    // trocar de cliente: permitido apenas para quem não tem assinatura
    act(() => {
      atualizada = ctxClube.atualizar(ass.id, {
        clienteId: 'cli-9',
        cliente: 'Novo Cliente',
      })
    })
    expect(atualizada.clienteId).toBe('cli-9')
    expect(atualizada.cliente).toBe('Novo Cliente')
    expect(ctxClube.podeAssinar('cli-1')).toBe(true)
  })

  it('valida assinatura, plano, valor e vínculo de cliente na edição', () => {
    montar()
    const ass = criarAssinatura()
    act(() => {
      ctxClube.assinar({
        clienteId: 'cli-2',
        cliente: 'Bruno Lima',
        plano: 'cabelo',
        valorMensal: 50,
        dataAssinatura: DIA,
      })
    })
    // cliente que já tem assinatura em andamento não pode receber outra
    expect(() =>
      ctxClube.atualizar(ass.id, { clienteId: 'cli-2', cliente: 'Bruno Lima' }),
    ).toThrow('em andamento')
    expect(() => ctxClube.atualizar(ass.id, { plano: 'invalido' })).toThrow(
      'Selecione o plano.',
    )
    expect(() => ctxClube.atualizar(ass.id, { valorMensal: 0 })).toThrow(
      'maior que zero',
    )
    expect(() =>
      ctxClube.atualizar('nao-existe', { valorMensal: 10 }),
    ).toThrow('não encontrada')
    // nada mudou no vínculo original
    expect(ctxClube.assinaturas[0].clienteId).toBe('cli-1')

    act(() => ctxClube.cancelar(ass.id))
    expect(() => ctxClube.atualizar(ass.id, { valorMensal: 10 })).toThrow(
      'cancelada',
    )
    expect(ctxClube.assinaturas).toHaveLength(2)
  })
})

describe('Audax Club — pagamentos e renovação', () => {
  it('pagamento gera receita no Caixa, renova o ciclo e liga tudo', () => {
    montar()
    const ass = criarAssinatura()
    const vencAntes = ass.proximoVencimento

    const r: { pagou?: { assinatura: AssinaturaClube } } = {}
    act(() => {
      r.pagou = ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'cartao_debito',
      })
    })

    // Caixa: um lançamento de receita com origem "clube"
    const lancamentos = ctxCaixa.lancamentos.filter(
      (l) => l.origem === 'clube',
    )
    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0].valorLiquido).toBe(99.9)
    expect(lancamentos[0].assinaturaId).toBe(ass.id)
    expect(lancamentos[0].clienteId).toBe('cli-1')
    expect(ctxCaixa.resumoDoDia(DIA).receitasClube).toBe(99.9)
    expect(ctxCaixa.resumoDoDia(DIA).totalRecebido).toBe(99.9)

    // Assinatura: vencimento renovado (+1 mês sobre o atual) e pagamento registrado
    expect(r.pagou?.assinatura.proximoVencimento).not.toBe(vencAntes)
    expect(r.pagou?.assinatura.proximoVencimento).toBe(
      addMonthsISO(addMonthsISO(DIA, 1), 1),
    )
    const pagamentos = ctxClube.pagamentosDaAssinatura(ass.id)
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0].caixaLancamentoId).toBe(lancamentos[0].id)
    expect(pagamentos[0].formaPagamento).toBe('cartao_debito')
  })

  it('rejeita pagamento inválido sem criar lançamento nem registro', () => {
    montar()
    const ass = criarAssinatura()
    expect(() =>
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 0,
        formaPagamento: 'pix',
      }),
    ).toThrow('maior que zero')
    expect(() =>
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: 'invalida',
        valor: 50,
        formaPagamento: 'pix',
      }),
    ).toThrow('data do pagamento')
    expect(() =>
      ctxClube.registrarPagamento({
        assinaturaId: 'nao-existe',
        data: DIA,
        valor: 50,
        formaPagamento: 'pix',
      }),
    ).toThrow('não encontrada')
    expect(ctxClube.pagamentos).toHaveLength(0)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxClube.assinaturas[0].proximoVencimento).toBe(addMonthsISO(DIA, 1))
  })

  it('caixa fechado bloqueia o pagamento sem efeitos parciais', () => {
    montar()
    const ass = criarAssinatura()
    act(() => {
      ctxCaixa.fecharCaixa(DIA)
    })
    expect(() =>
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      }),
    ).toThrow('fechado')
    expect(ctxClube.pagamentos).toHaveLength(0)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxClube.assinaturas[0].proximoVencimento).toBe(addMonthsISO(DIA, 1))
  })

  it('assinatura cancelada não recebe pagamento', () => {
    montar()
    const ass = criarAssinatura()
    act(() => ctxClube.cancelar(ass.id))
    expect(() =>
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      }),
    ).toThrow('cancelada')
    expect(ctxCaixa.lancamentos).toHaveLength(0)
  })
})

describe('Audax Club — pagamento duplicado da mesma cobrança', () => {
  it('recusa a mesma cobrança duas vezes no mesmo lote (duplo clique)', () => {
    montar()
    const ass = criarAssinatura()
    act(() => {
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
      // segundo clique antes do re-render: mesmo ciclo, sem efeito algum
      expect(() =>
        ctxClube.registrarPagamento({
          assinaturaId: ass.id,
          data: DIA,
          valor: 99.9,
          formaPagamento: 'pix',
        }),
      ).toThrow('já foi paga')
    })
    expect(ctxClube.pagamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos.filter((l) => l.origem === 'clube')).toHaveLength(1)
    expect(ctxClube.assinaturas[0].proximoVencimento).toBe(
      addMonthsISO(addMonthsISO(DIA, 1), 1),
    )
  })

  it('recusa pelo histórico persistido (cobrança do ciclo já gravada)', () => {
    const vencimento = addMonthsISO(DIA, 1)
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [
          {
            id: 'a1',
            clienteId: 'cli-1',
            cliente: 'Lucas Mendes',
            plano: 'cabelo',
            valorMensal: 89.9,
            dataAssinatura: DIA,
            proximoVencimento: vencimento,
            cancelada: false,
            criadoEm: DIA,
          },
        ],
        pagamentos: [
          {
            id: 'p1',
            assinaturaId: 'a1',
            clienteId: 'cli-1',
            data: DIA,
            valor: 89.9,
            formaPagamento: 'pix',
            vencimentoCoberto: vencimento,
            criadoEm: DIA,
          },
        ],
      }),
    )
    montar()
    expect(() =>
      ctxClube.registrarPagamento({
        assinaturaId: 'a1',
        data: DIA,
        valor: 89.9,
        formaPagamento: 'pix',
      }),
    ).toThrow('já foi paga')
    expect(ctxClube.pagamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos).toHaveLength(0)
    expect(ctxClube.assinaturas[0].proximoVencimento).toBe(vencimento)
  })

  it('pagamento legado sem vencimentoCoberto não bloqueia (dados preservados)', () => {
    const vencimento = addMonthsISO(DIA, 1)
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [
          {
            id: 'a1',
            clienteId: 'cli-1',
            cliente: 'Lucas Mendes',
            plano: 'cabelo',
            valorMensal: 89.9,
            dataAssinatura: DIA,
            proximoVencimento: vencimento,
            cancelada: false,
            criadoEm: DIA,
          },
        ],
        pagamentos: [
          {
            id: 'p-antigo',
            assinaturaId: 'a1',
            clienteId: 'cli-1',
            data: DIA,
            valor: 89.9,
            formaPagamento: 'pix',
            criadoEm: DIA,
          },
        ],
      }),
    )
    montar()
    act(() => {
      expect(() =>
        ctxClube.registrarPagamento({
          assinaturaId: 'a1',
          data: DIA,
          valor: 89.9,
          formaPagamento: 'pix',
        }),
      ).not.toThrow()
    })
    expect(ctxClube.pagamentos).toHaveLength(2)
    expect(ctxCaixa.lancamentos.filter((l) => l.origem === 'clube')).toHaveLength(1)
  })
})

describe('Audax Club — consultas e persistência', () => {
  it('assinaturaDoCliente retorna a em andamento (não cancelada)', () => {
    montar()
    const ass = criarAssinatura()
    expect(ctxClube.assinaturaDoCliente('cli-1')?.id).toBe(ass.id)
    expect(ctxClube.assinaturaDoCliente('cli-2')).toBeUndefined()
    act(() => ctxClube.cancelar(ass.id))
    expect(ctxClube.assinaturaDoCliente('cli-1')).toBeUndefined()
  })

  it('mantém assinaturas e pagamentos após remontar (F5)', () => {
    const { unmount } = montar()
    const ass = criarAssinatura()
    act(() => {
      ctxClube.registrarPagamento({
        assinaturaId: ass.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })
    })
    unmount()
    montar()
    expect(ctxClube.assinaturas).toHaveLength(1)
    expect(ctxClube.assinaturas[0].id).toBe(ass.id)
    expect(ctxClube.pagamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos.filter((l) => l.origem === 'clube')).toHaveLength(1)
    expect(screen.getByText('clube-pronto')).toBeTruthy()
  })
})
