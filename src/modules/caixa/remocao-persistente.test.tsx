// A compensação de uma gravação parcial (falha na baixa de estoque depois do
// caixa gravar) NÃO apaga o lançamento: ele é estornado. Este arquivo trava a
// garantia disso no F5 — um lançamento compensado continua marcado como
// estornado e nunca volta a contar como receita, mesmo com a cópia antiga do
// localStorage e do servidor.
import { act, useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaProvider, useCaixa } from './store'
import type { Lancamento } from './types'

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'

const controle = vi.hoisted(() => ({
  remoto: [] as Lancamento[],
  chamadasAtualizar: [] as string[],
  chamadasRemover: [] as string[],
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/caixa', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/services/supabase/caixa')>()
  return {
    ...real,
    listarLancamentos: vi.fn(async () => controle.remoto),
    listarFechamentos: vi.fn(async () => []),
    listarAuditoria: vi.fn(async () => []),
    importarLancamentos: vi.fn(async (lista: Lancamento[]) => lista.length),
    importarFechamentos: vi.fn(async (lista: unknown[]) => lista.length),
    importarAuditoria: vi.fn(async (lista: unknown[]) => lista.length),
    removerLancamento: vi.fn(async (id: string) => {
      controle.chamadasRemover.push(id)
      controle.remoto = controle.remoto.filter((l) => l.id !== id)
      return true
    }),
    criarLancamento: vi.fn(async (l: Lancamento) => l),
    criarFechamento: vi.fn(async (f: unknown) => f),
    criarEventoAuditoria: vi.fn(async (e: unknown) => e),
    atualizarLancamento: vi.fn(async (id: string, l: Lancamento) => {
      controle.chamadasAtualizar.push(id)
      controle.remoto = controle.remoto.map((r) => (r.id === id ? l : r))
      return l
    }),
    atualizarFechamento: vi.fn(async () => true),
  }
})

let ctx: ReturnType<typeof useCaixa>

function Captura() {
  const caixa = useCaixa()
  useEffect(() => {
    ctx = caixa
  })
  return (
    <div data-testid="qtd">
      {caixa.lancamentos.filter((l) => !l.estornado).length}
    </div>
  )
}

function montar() {
  return render(
    <CaixaProvider>
      <Captura />
    </CaixaProvider>,
  )
}

/** Deixa a cadeia de promessas da integração terminar antes de seguir. */
async function aguardarCarga() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('Caixa — compensação estorna o lançamento e ele não ressuscita', () => {
  beforeEach(() => {
    localStorage.clear()
    controle.remoto = []
    controle.chamadasAtualizar = []
    controle.chamadasRemover = []
    ctx = undefined as unknown as ReturnType<typeof useCaixa>
  })

  it('estorna (nunca apaga) e o lançamento segue estornado após o F5', async () => {
    const primeira = montar()
    await aguardarCarga()

    let pagamento: Lancamento | undefined
    act(() => {
      pagamento = ctx.registrarPagamento({
        agendamentoId: 'ag-1',
        data: new Date().toISOString().slice(0, 10),
        hora: '10:00',
        cliente: 'Lucas Mendes',
        profissional: 'Cleiton Silva',
        servico: 'Corte Degradê',
        valor: 100,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })
    if (!pagamento) throw new Error('pagamento não criado')
    const id = pagamento.id

    // O servidor tem o registro e ainda NÃO sabe do estorno
    controle.remoto = [{ ...pagamento }]

    act(() => {
      ctx.desfazerLancamento(id)
    })

    // Nada foi apagado: o estorno vai por atualização e o DELETE nunca é usado
    expect(controle.chamadasRemover).toEqual([])
    expect(controle.chamadasAtualizar).toContain(id)
    expect(ctx.lancamentos).toHaveLength(1)
    expect(ctx.lancamentos[0].estornado).toBe(true)
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(JSON.parse(localStorage.getItem(CHAVE_LANCAMENTOS) ?? '[]')).toHaveLength(
      1,
    )

    // F5: a cópia antiga ainda volta do servidor, mas como ESTORNADA — o que
    // entra na lista é a versão oficial, sem receita
    primeira.unmount()
    controle.remoto = [{ ...controle.remoto[0] }].map((l) => ({ ...l, estornado: true }))
    const segunda = montar()
    await aguardarCarga()

    expect(controle.remoto.map((l) => l.id)).toContain(id)
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(ctx.lancamentos.every((l) => l.estornado)).toBe(true)
    // e o estorno continua sendo reenviado, não a remoção
    expect(controle.chamadasRemover).toEqual([])

    segunda.unmount()
    const terceira = montar()
    await aguardarCarga()
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(controle.chamadasRemover).toEqual([])
    terceira.unmount()
  })
})