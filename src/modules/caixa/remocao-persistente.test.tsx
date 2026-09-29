// 🟠5 — a remoção de lançamento precisa sobreviver ao F5. O tombstone mora no
// localStorage, é reaplicado na fusão com o servidor (a lista remota não
// devolve o registro) e a remoção remota que não chegou a valer é reenviada
// na carga seguinte, sem duplicar nada.
import { act, useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaProvider, useCaixa } from './store'
import type { Lancamento } from './types'

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_REMOVIDOS = 'studio-audax:caixa:removidos:v1'

const controle = vi.hoisted(() => ({
  remoto: [] as Lancamento[],
  removerFalha: false,
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
      if (controle.removerFalha) throw new Error('remoção não confirmada')
      controle.remoto = controle.remoto.filter((l) => l.id !== id)
      return true
    }),
    criarLancamento: vi.fn(async (l: Lancamento) => l),
    criarFechamento: vi.fn(async (f: unknown) => f),
    criarEventoAuditoria: vi.fn(async (e: unknown) => e),
    atualizarLancamento: vi.fn(async () => true),
    atualizarFechamento: vi.fn(async () => true),
  }
})

let ctx: ReturnType<typeof useCaixa>

function Captura() {
  const caixa = useCaixa()
  useEffect(() => {
    ctx = caixa
  })
  return <div data-testid="qtd">{caixa.lancamentos.length}</div>
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

describe('Caixa — remoção de lançamento (tombstone persistido)', () => {
  beforeEach(() => {
    localStorage.clear()
    controle.remoto = []
    controle.removerFalha = false
    controle.chamadasRemover = []
    ctx = undefined as unknown as ReturnType<typeof useCaixa>
  })

  it('remoção não confirmada no servidor não volta no F5 e é reenviada', async () => {
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

    // O servidor ainda tem o registro: a remoção remota falhou
    controle.remoto = [{ ...pagamento }]
    controle.removerFalha = true
    act(() => {
      ctx.desfazerLancamento(id)
    })

    // Tombstone gravado antes do F5 e lançamento fora do local
    expect(
      JSON.parse(localStorage.getItem(CHAVE_REMOVIDOS) ?? '[]'),
    ).toContain(id)
    expect(ctx.lancamentos).toHaveLength(0)
    expect(localStorage.getItem(CHAVE_LANCAMENTOS)).not.toBeNull()

    // F5: a lista remota ainda devolveria o registro…
    primeira.unmount()
    controle.removerFalha = false
    const segundaSessao = montar()
    expect(controle.remoto.map((l) => l.id)).toContain(id)

    await aguardarCarga()

    // …mas a fusão respeita o tombstone e o registro não ressuscita
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(ctx.lancamentos).toHaveLength(0)
    // a remoção pendente é reenviada (apagar de novo é idempotente)
    expect(controle.chamadasRemover).toContain(id)

    // Próximo F5: servidor sem o registro → tombstone é descartado
    segundaSessao.unmount()
    montar()
    await aguardarCarga()
    expect(screen.getByTestId('qtd').textContent).toBe('0')
    expect(
      JSON.parse(localStorage.getItem(CHAVE_REMOVIDOS) ?? '["pendente"]'),
    ).toEqual([])
    expect(controle.remoto).toHaveLength(0)
  })
})
