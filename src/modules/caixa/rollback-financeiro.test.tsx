// FASE 1 — rollback financeiro do Caixa.
//
// A compensação de uma gravação parcial (falha na baixa de estoque depois do
// caixa gravar) NÃO pode apagar a receita: ela estorna, reaproveitando as
// colunas que já existem no schema (`estornado`, `estornado_em`) e o evento de
// auditoria. Aqui estão travadas todas as garantias pedidas.
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaProvider, useCaixa } from './store'
import type { CaixaContexto } from './store'
import type { FormaPagamento, Lancamento } from './types'

const DIA = '2026-09-25'

const controle = vi.hoisted(() => ({
  remoto: [] as Lancamento[],
  chamadasRemover: [] as string[],
  chamadasAtualizar: [] as string[],
  chamadasCriarAuditoria: [] as string[],
  removerFalha: false,
  removerLancamento: null as ((id: string) => Promise<boolean>) | null,
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
    criarLancamento: vi.fn(async (l: Lancamento) => {
      controle.remoto = [...controle.remoto, l]
      return l
    }),
    atualizarLancamento: vi.fn(async (id: string, l: Lancamento) => {
      controle.chamadasAtualizar.push(id)
      controle.remoto = controle.remoto.map((r) => (r.id === id ? l : r))
      return l
    }),
    criarEventoAuditoria: vi.fn(async (e: { id: string }) => {
      controle.chamadasCriarAuditoria.push(e.id)
      return e
    }),
    removerLancamento: vi.fn((id: string) =>
      controle.removerLancamento
        ? controle.removerLancamento(id)
        : Promise.resolve(true),
    ),
    importarLancamentos: vi.fn(async (l: Lancamento[]) => l.length),
    importarFechamentos: vi.fn(async (l: unknown[]) => l.length),
    importarAuditoria: vi.fn(async (l: unknown[]) => l.length),
  }
})

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

function pagamento(
  override: Partial<Parameters<CaixaContexto['registrarPagamento']>[0]> = {},
) {
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

async function aguardar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => {
  localStorage.clear()
  controle.remoto = []
  controle.chamadasRemover = []
  controle.chamadasAtualizar = []
  controle.chamadasCriarAuditoria = []
  controle.removerFalha = false
  controle.removerLancamento = null
  ctx = undefined as unknown as CaixaContexto
})

describe('Caixa — rollback financeiro estorna e nunca apaga', () => {
  it('1. venda normal permanece no caixa', async () => {
    montar()
    await aguardar()

    act(() => {
      ctx.registrarVenda({
        data: DIA,
        itens: [{ produtoId: 'p1', produto: 'Pomada', quantidade: 2, preco: 30 }],
        desconto: 0,
        formaPagamento: 'pix',
        profissional: 'Audax',
      })
    })

    expect(ctx.lancamentos).toHaveLength(1)
    expect(ctx.lancamentos[0].estornado).toBeFalsy()
    expect(ctx.resumoDoDia(DIA).receitasProdutos).toBe(60)
  })

  it('2. o rollback não faz DELETE físico (nenhuma remoção é enviada)', async () => {
    montar()
    await aguardar()

    let lancamento!: Lancamento
    act(() => {
      lancamento = ctx.registrarPagamento(pagamento())
    })

    act(() => {
      ctx.desfazerLancamento(lancamento)
    })

    expect(controle.chamadasRemover).toEqual([])
    // o caminho de atualização é o usado (upsert por id, sem apagar)
    expect(controle.chamadasAtualizar).toContain(lancamento.id)
  })

  it('3. o lançamento original continua no histórico, identificável como estornado', async () => {
    montar()
    await aguardar()

    let lancamento!: Lancamento
    act(() => {
      lancamento = ctx.registrarPagamento(pagamento())
    })
    act(() => {
      ctx.desfazerLancamento(lancamento)
    })

    const preservado = ctx.lancamentos.find((l) => l.id === lancamento.id)
    expect(preservado).toBeDefined()
    expect(preservado?.estornado).toBe(true)
    expect(preservado?.estornadoEm).toBeTruthy()
    // valores originais preservados
    expect(preservado?.valor).toBe(lancamento.valor)
    expect(preservado?.descricao).toBe(lancamento.descricao)
    expect(preservado?.agendamentoId).toBe(lancamento.agendamentoId)
    // e há evento de auditoria do estorno
    expect(ctx.auditoria.some((a) => a.acao === 'estorno')).toBe(true)
  })

  it('4. o valor líquido do dia fica correto depois do estorno', async () => {
    montar()
    await aguardar()

    act(() => {
      ctx.registrarPagamento(pagamento())
    })
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(70)

    let alvo!: Lancamento
    act(() => {
      alvo = ctx.registrarVenda({
        data: DIA,
        itens: [{ produtoId: 'p1', produto: 'Pomada', quantidade: 1, preco: 30 }],
        desconto: 0,
        formaPagamento: 'pix',
        profissional: 'Audax',
      })
    })
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(100)

    act(() => {
      ctx.desfazerLancamento(alvo)
    })

    const resumo = ctx.resumoDoDia(DIA)
    expect(resumo.totalRecebido).toBe(70)
    expect(resumo.receitasProdutos).toBe(0)
    expect(resumo.liquido).toBe(70)
  })

  it('5. a receita não depende de DELETE: o caminho usado é o update', async () => {
    montar()
    await aguardar()
    let lancamento!: Lancamento
    act(() => {
      lancamento = ctx.registrarPagamento(pagamento())
    })
    await aguardar()

    act(() => {
      ctx.desfazerLancamento(lancamento)
    })
    await aguardar()

    // o servidor recebeu o mesmo registro, agora estornado (não apagado)
    const noServidor = controle.remoto.find((l) => l.id === lancamento.id)
    expect(noServidor).toBeDefined()
    expect(noServidor?.estornado).toBe(true)
  })

  it('6. o estorno não permite duplicação (mesmo id, uma linha só)', async () => {
    montar()
    await aguardar()
    let lancamento!: Lancamento
    act(() => {
      lancamento = ctx.registrarPagamento(pagamento())
    })
    act(() => {
      ctx.desfazerLancamento(lancamento)
    })

    expect(ctx.lancamentos.filter((l) => l.id === lancamento.id)).toHaveLength(1)
    await aguardar()
    expect(controle.remoto.filter((l) => l.id === lancamento.id)).toHaveLength(1)
  })

  it('7. repetir o estorno não gera dois contra-lançamentos', async () => {
    montar()
    await aguardar()
    let lancamento!: Lancamento
    act(() => {
      lancamento = ctx.registrarPagamento(pagamento())
    })

    act(() => {
      ctx.desfazerLancamento(lancamento)
    })
    const auditoriaDepoisDaPrimeira = ctx.auditoria.length
    const listaDepoisDaPrimeira = JSON.stringify(ctx.lancamentos)

    act(() => {
      ctx.desfazerLancamento(lancamento)
    })
    act(() => {
      ctx.desfazerLancamento(lancamento)
    })

    expect(ctx.auditoria).toHaveLength(auditoriaDepoisDaPrimeira)
    expect(JSON.stringify(ctx.lancamentos)).toBe(listaDepoisDaPrimeira)
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(0)
  })

  it('8. falha ao gravar o estorno não apaga nada localmente', async () => {
    montar()
    await aguardar()
    controle.removerLancamento = async () => {
      throw new Error('sem permissão')
    }
    let lancamento!: Lancamento
    act(() => {
      lancamento = ctx.registrarPagamento(pagamento())
    })

    act(() => {
      ctx.desfazerLancamento(lancamento)
    })

    // localmente segue estornado (a fila reenvia na próxima carga)
    expect(ctx.lancamentos[0].estornado).toBe(true)
    expect(controle.chamadasRemover).toEqual([])
  })
})