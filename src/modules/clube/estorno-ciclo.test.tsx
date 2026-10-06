// FASE 1 — estorno da mensalidade do Audax Club.
//
// Risco travado aqui: o pagamento avançava `proximoVencimento` e o estorno do
// lançamento no Caixa NÃO revertia esse avanço. O pagamento seguinte passava a
// cobrir o ciclo seguinte e o assinante ficava com um mês de cobertura que
// ninguém pagou — um pagamento, dois meses.
//
// O ciclo agora parte sempre do vencimento realmente coberto por um pagamento
// cujo lançamento não foi estornado.
import { act, useEffect } from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClubeProvider, useClube } from './store'

const DIA = '2026-03-10'
let clube: ReturnType<typeof useClube>
let caixa: ReturnType<typeof useCaixa>

function Captura() {
  const clubeCtx = useClube()
  const caixaCtx = useCaixa()
  useEffect(() => {
    clube = clubeCtx
    caixa = caixaCtx
  })
  return null
}

function montar() {
  return render(
    <CaixaProvider>
      <ClubeProvider>
        <Captura />
      </ClubeProvider>
    </CaixaProvider>,
  )
}

const receitasClube = () =>
  caixa.lancamentos.filter((l) => l.origem === 'clube' && !l.estornado)

const estornados = () =>
  caixa.lancamentos.filter((l) => l.origem === 'clube' && l.estornado)

function assinar(clienteId: string, cliente: string) {
  act(() => {
    clube.assinar({
      clienteId,
      cliente,
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      dataAssinatura: DIA,
    })
  })
}

function pagar(data = DIA) {
  act(() => {
    clube.registrarPagamento({
      assinaturaId: clube.assinaturas[0].id,
      data,
      valor: 99.9,
      formaPagamento: 'dinheiro',
    })
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('Club — estorno da mensalidade reverte só o ciclo daquele pagamento', () => {
  it('1. pagamento cria o ciclo correto', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const vencimentoInicial = clube.assinaturas[0].proximoVencimento

    pagar()

    expect(receitasClube()).toHaveLength(1)
    expect(clube.pagamentos).toHaveLength(1)
    expect(clube.pagamentos[0].vencimentoCoberto).toBe(vencimentoInicial)
    expect(clube.assinaturas[0].proximoVencimento).not.toBe(vencimentoInicial)
  })

  it('2. estorno reverte somente aquele ciclo', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const vencimentoInicial = clube.assinaturas[0].proximoVencimento
    pagar()
    const lancamento = receitasClube()[0]

    act(() => {
      caixa.estornar(lancamento.id)
    })

    expect(estornados()).toHaveLength(1)
    // o pagamento continua no histórico (não é apagado)
    expect(clube.pagamentos).toHaveLength(1)
    // e o ciclo volta a ser exigível
    expect(() =>
      act(() => {
        clube.registrarPagamento({
          assinaturaId: clube.assinaturas[0].id,
          data: DIA,
          valor: 99.9,
          formaPagamento: 'dinheiro',
        })
      }),
    ).not.toThrow()
    expect(clube.pagamentos).toHaveLength(2)
    // o novo pagamento cobre DE NOVO o ciclo original, não o seguinte
    expect(clube.pagamentos[1].vencimentoCoberto).toBe(vencimentoInicial)
  })

  it('3. um pagamento estornado não cobre o período futuro', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const vencimentoInicial = clube.assinaturas[0].proximoVencimento
    pagar()
    const lancamento = receitasClube()[0]

    act(() => {
      caixa.estornar(lancamento.id)
    })

    pagar()

    // somente o ciclo inicial foi coberto — nenhum mês extra de graça
    const cobertos = new Set(clube.pagamentos.map((p) => p.vencimentoCoberto))
    expect(cobertos).toEqual(new Set([vencimentoInicial]))
    expect(clube.pagamentos[1].vencimentoCoberto).toBe(vencimentoInicial)
  })

  it('4. não ocorre cobertura duplicada: o mesmo ciclo não é cobrado duas vezes', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const ciclo0 = clube.assinaturas[0].proximoVencimento

    // duplo clique no mesmo lote: o segundo pagamento é recusado porque o
    // ciclo ainda é o mesmo (a marca de idempotência do lote cobre isso)
    let erro = ''
    act(() => {
      const pagamento = {
        assinaturaId: clube.assinaturas[0].id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'dinheiro' as const,
      }
      try {
        clube.registrarPagamento(pagamento)
        clube.registrarPagamento(pagamento)
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e)
      }
    })
    expect(erro).toMatch(/já foi paga/i)

    // nenhum ciclo pode ter dois pagamentos
    const porCiclo = new Map<string, number>()
    for (const p of clube.pagamentos) {
      const ciclo = p.vencimentoCoberto ?? ''
      porCiclo.set(ciclo, (porCiclo.get(ciclo) ?? 0) + 1)
    }
    expect([...porCiclo.values()].every((n) => n === 1)).toBe(true)
    expect(porCiclo.size).toBeLessThanOrEqual(1)

    // depois do estorno, o MESMO ciclo pode ser pago de novo — e só ele
    const primeiroLancamento = receitasClube()[0]
    act(() => {
      caixa.estornar(primeiroLancamento.id)
    })
    pagar()

    expect(clube.pagamentos).toHaveLength(2)
    expect(clube.pagamentos[1].vencimentoCoberto).toBe(ciclo0)
    // nenhum pagamento cobriu um ciclo além do inicial
    const cobertos = new Set(clube.pagamentos.map((p) => p.vencimentoCoberto))
    expect(cobertos).toEqual(new Set([ciclo0]))
  })

  it('5. repetir o estorno é recusado e não duplica efeito', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    pagar()
    const lancamento = receitasClube()[0]

    act(() => {
      caixa.estornar(lancamento.id)
    })
    expect(() =>
      act(() => {
        caixa.estornar(lancamento.id)
      }),
    ).toThrow(/já foi estornado/i)

    expect(estornados()).toHaveLength(1)
    expect(clube.pagamentos).toHaveLength(1)
  })

  it('6. histórico preservado: pagamento e lançamento continuam no registro', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    pagar()
    const lancamento = receitasClube()[0]

    act(() => {
      caixa.estornar(lancamento.id)
    })

    // lançamento no histórico, marcado como estornado
    expect(caixa.lancamentos.find((l) => l.id === lancamento.id)?.estornado).toBe(
      true,
    )
    // evento de auditoria do estorno
    expect(caixa.auditoria.some((a) => a.acao === 'estorno')).toBe(true)
    // pagamento do clube preservado com o vínculo
    expect(clube.pagamentos[0].caixaLancamentoId).toBe(lancamento.id)
    // e a receita não entra mais no dia
    expect(caixa.resumoDoDia(DIA).receitasClube).toBe(0)
  })

  it('7. pagamento posterior válido permanece intacto quando outro é estornado', () => {
    montar()
    assinar('cli-1', 'Lucas Mendes')
    const ciclo0 = clube.assinaturas[0].proximoVencimento
    pagar('2026-03-10') // cobre ciclo0
    pagar('2026-04-10') // cobre o ciclo seguinte

    expect(clube.pagamentos).toHaveLength(2)
    expect(clube.pagamentos[1].vencimentoCoberto).not.toBe(ciclo0)

    // estorna SÓ o primeiro
    const primeiro = receitasClube().find(
      (l) => l.id === clube.pagamentos[0].caixaLancamentoId,
    )
    act(() => {
      caixa.estornar(primeiro!.id)
    })

    // o segundo pagamento continua válido e ainda cobre o ciclo dele
    expect(receitasClube()).toHaveLength(1)
    expect(clube.pagamentos).toHaveLength(2)
    const aindaCobertos = clube.pagamentos
      .filter((p) => p.id !== clube.pagamentos[0].id)
      .map((p) => p.vencimentoCoberto)
    expect(aindaCobertos).toHaveLength(1)
  })
})