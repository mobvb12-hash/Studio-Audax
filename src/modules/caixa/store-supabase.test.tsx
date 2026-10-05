// Integração do Caixa com o Supabase (I4).
// Foco: nada se perde, nada duplica e nenhuma falha de escrita vira sucesso.
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import { CaixaProvider, useCaixa } from './store'
import type { Fechamento, Lancamento, NovoPagamentoInput } from './types'

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_AUDITORIA = 'studio-audax:caixa:auditoria:v1'
const DIA = '2026-03-10'

// Tabelas remotas em memória (mesma semântica do Supabase para os testes).
const remoto = vi.hoisted(() => ({
  lancamentos: [] as unknown[],
  fechamentos: [] as unknown[],
  auditoria: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  reiniciar() {
    remoto.lancamentos = []
    remoto.fechamentos = []
    remoto.auditoria = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
  },
  gravarEm(caixa: unknown[], linha: Record<string, unknown>) {
    const indice = caixa.findIndex(
      (item) => (item as { id: string }).id === linha.id,
    )
    if (indice >= 0) caixa[indice] = linha
    else caixa.push(linha)
  },
  removerDe(caixa: unknown[], id: string) {
    const indice = caixa.findIndex((item) => (item as { id: string }).id === id)
    if (indice >= 0) caixa.splice(indice, 1)
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/caixa', () => ({
  listarLancamentos: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.lancamentos] as never
  }),
  listarFechamentos: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.fechamentos] as never
  }),
  listarAuditoria: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.auditoria] as never
  }),
  criarLancamento: vi.fn(async (lancamento: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.lancamentos, lancamento as Record<string, unknown>)
    return lancamento as never
  }),
  atualizarLancamento: vi.fn(
    async (id: string, lancamento: Record<string, unknown>) => {
      if (remoto.falhaEscrita) throw new Error('permission denied')
      if (!remoto.lancamentos.some((l) => (l as { id: string }).id === id)) {
        throw new Error('O lançamento não existe mais no Supabase.')
      }
      remoto.gravarEm(remoto.lancamentos, { ...lancamento, id })
      return lancamento as never
    },
  ),
  removerLancamento: vi.fn(async (id: string) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.removerDe(remoto.lancamentos, id)
    return true
  }),
  criarFechamento: vi.fn(async (fechamento: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.fechamentos, fechamento as Record<string, unknown>)
    return fechamento as never
  }),
  atualizarFechamento: vi.fn(
    async (id: string, fechamento: Record<string, unknown>) => {
      if (remoto.falhaEscrita) throw new Error('permission denied')
      if (!remoto.fechamentos.some((f) => (f as { id: string }).id === id)) {
        throw new Error('O fechamento não existe mais no Supabase.')
      }
      remoto.gravarEm(remoto.fechamentos, { ...fechamento, id })
      return fechamento as never
    },
  ),
  criarEventoAuditoria: vi.fn(async (evento: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.auditoria, evento as Record<string, unknown>)
    return evento as never
  }),
  importarLancamentos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.lancamentos, item as Record<string, unknown>)
    }
    return lista.length
  }),
  importarFechamentos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.fechamentos, item as Record<string, unknown>)
    }
    return lista.length
  }),
  importarAuditoria: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.auditoria, item as Record<string, unknown>)
    }
    return lista.length
  }),
  linhaLancamento: (l: Lancamento) => ({ ...l, valor_liquido: l.valorLiquido }),
  linhaFechamento: (f: Fechamento) => ({ ...f }),
  linhaAuditoria: (a: unknown) => ({ ...(a as object) }),
}))

let ctx: ReturnType<typeof useCaixa>

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

function pagamento(extra: Partial<NovoPagamentoInput> = {}): NovoPagamentoInput {
  return {
    agendamentoId: 'ag-1',
    data: DIA,
    hora: '10:00',
    cliente: 'Ana',
    profissional: 'Cleiton',
    servico: 'Corte',
    valor: 70,
    desconto: 0,
    formaPagamento: 'pix',
    statusAgendamento: 'concluido',
    ...extra,
  }
}

function salvo(chave: string): unknown[] {
  return JSON.parse(localStorage.getItem(chave) ?? '[]')
}

/** Simula um aparelho que já sincronizou antes (marca presente). */
function marcarComoSincronizado(...chaves: string[]) {
  for (const chave of chaves) {
    localStorage.setItem(`${chave}:sincronizado_em:v1`, '2020-01-01T00:00:00.000Z')
  }
}

/** Marca já concluída agora: carimbo do registro é anterior → resquício. */
function marcarComoSincronizadoAgora(...chaves: string[]) {
  for (const chave of chaves) {
    localStorage.setItem(`${chave}:sincronizado_em:v1`, new Date().toISOString())
  }
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useCaixa>
})

describe('Caixa — lançamentos no Supabase', () => {
  it('lançamento local ausente no remoto é enviado (migração do que já existe)', async () => {
    const existente: Lancamento = {
      id: 'lan-1',
      tipo: 'receita',
      origem: 'atendimento',
      data: DIA,
      hora: '10:00',
      descricao: 'Corte — Ana',
      valor: 70,
      desconto: 0,
      valorLiquido: 70,
      formaPagamento: 'pix',
      cliente: 'Ana',
      profissional: 'Cleiton',
      servico: 'Corte',
      criadoEm: '2026-03-10T13:00:00.000Z',
    }
    // pendência legítima: já houve sincronização antes e o registro é
    // posterior à marca
    marcarComoSincronizado(CHAVE_LANCAMENTOS)
    localStorage.setItem(CHAVE_LANCAMENTOS, JSON.stringify([existente]))

    montar()

    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))
    expect((remoto.lancamentos[0] as { id: string }).id).toBe('lan-1')
    expect(ctx.lancamentos).toHaveLength(1)
    expect(avisosPersistencia()).toEqual([])
  })

  it('J — lançamento anterior à última sincronização não volta (resquício fica no snapshot)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { importarLancamentos } = await import('@/services/supabase/caixa')
    marcarComoSincronizadoAgora(CHAVE_LANCAMENTOS)
    localStorage.setItem(
      CHAVE_LANCAMENTOS,
      JSON.stringify([
        {
          id: 'lan-7',
          tipo: 'receita',
          origem: 'atendimento',
          data: DIA,
          hora: '10:00',
          descricao: 'Receita antiga',
          valor: 70,
          desconto: 0,
          valorLiquido: 70,
          formaPagamento: 'pix',
          cliente: 'Ana',
          profissional: 'Cleiton',
          servico: 'Corte',
          criadoEm: '2026-03-10T13:00:00.000Z',
        } satisfies Lancamento,
      ]),
    )

    montar()

    await waitFor(() => expect(ctx.lancamentos).toEqual([]))
    expect(remoto.lancamentos).toHaveLength(0)
    expect(importarLancamentos).not.toHaveBeenCalled()
    expect(
      Object.keys(localStorage).filter((c) =>
        c.startsWith(`${CHAVE_LANCAMENTOS}:backup:`),
      ),
    ).toHaveLength(1)
    aviso.mockRestore()
  })

  it('J — marca inexistente: lançamento local não é enviado', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { importarLancamentos } = await import('@/services/supabase/caixa')
    const existente: Lancamento = {
      id: 'lan-8',
      tipo: 'receita',
      origem: 'atendimento',
      data: DIA,
      hora: '10:00',
      descricao: 'Receita recente',
      valor: 70,
      desconto: 0,
      valorLiquido: 70,
      formaPagamento: 'pix',
      cliente: 'Ana',
      profissional: 'Cleiton',
      servico: 'Corte',
      criadoEm: '2026-03-10T13:00:00.000Z',
    }
    localStorage.setItem(CHAVE_LANCAMENTOS, JSON.stringify([existente]))

    montar()

    await waitFor(() => expect(ctx.lancamentos).toEqual([]))
    expect(remoto.lancamentos).toHaveLength(0)
    expect(importarLancamentos).not.toHaveBeenCalled()
    expect(
      localStorage.getItem(`${CHAVE_LANCAMENTOS}:sincronizado_em:v1`),
    ).not.toBeNull()
    aviso.mockRestore()
  })

  it('criar pagamento grava local e envia com o mesmo id (sem duplicar)', async () => {
    montar()
    await waitFor(() => expect(ctx.lancamentos).toEqual([]))

    let novo!: Lancamento
    act(() => {
      novo = ctx.registrarPagamento(pagamento())
    })

    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))
    expect((remoto.lancamentos[0] as { id: string }).id).toBe(novo.id)
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(70)
    await waitFor(() => expect(salvo(CHAVE_LANCAMENTOS)).toHaveLength(1))
  })

  it('reenviar a mesma carga não duplica lançamento nem valor no caixa', async () => {
    const existente: Lancamento = {
      id: 'lan-9',
      tipo: 'receita',
      origem: 'atendimento',
      data: DIA,
      hora: '09:00',
      descricao: 'Barba — Beto',
      valor: 40,
      desconto: 0,
      valorLiquido: 40,
      formaPagamento: 'dinheiro',
      criadoEm: '2026-03-10T12:00:00.000Z',
    }
    marcarComoSincronizado(CHAVE_LANCAMENTOS)
    localStorage.setItem(CHAVE_LANCAMENTOS, JSON.stringify([existente]))
    // o servidor ainda não tem o lançamento (primeira carga falha ao enviar)
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    remoto.falhaEscrita = true
    const primeira = montar()
    await waitFor(() => expect(ctx.lancamentos).toHaveLength(1))
    expect(remoto.lancamentos).toHaveLength(0)

    // segunda carga: pendência é reenviada e continua sem duplicar
    primeira.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))
    expect(ctx.lancamentos).toHaveLength(1)
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(40)

    // terceira carga: nada novo é enviado
    expect(remoto.lancamentos).toHaveLength(1)
    aviso.mockRestore()
  })

  it('fechamento de caixa e auditoria de reabertura vão para o Supabase', async () => {
    montar()
    await waitFor(() => expect(ctx.lancamentos).toEqual([]))

    act(() => ctx.registrarPagamento(pagamento()))
    act(() => ctx.fecharCaixa(DIA))
    expect(remoto.fechamentos).toHaveLength(1)
    expect(ctx.diaFechado(DIA)).toBe(true)

    act(() => ctx.reabrirCaixa(DIA, 'erro de digitação'))
    expect(ctx.diaFechado(DIA)).toBe(false)
    await waitFor(() => expect(remoto.auditoria).toHaveLength(1))
    expect((remoto.auditoria[0] as { acao: string }).acao).toBe('reabertura')
  })

  it('estorno marca o lançamento e registra a auditoria nos dois lados', async () => {
    montar()
    await waitFor(() => expect(ctx.lancamentos).toEqual([]))
    let criado!: Lancamento
    act(() => {
      criado = ctx.registrarPagamento(pagamento())
    })
    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))

    act(() => ctx.estornar(criado.id))

    expect(ctx.lancamentos[0].estornado).toBe(true)
    expect(ctx.auditoria).toHaveLength(1)
    await waitFor(() => expect(remoto.auditoria).toHaveLength(1))
    await waitFor(() => expect(salvo(CHAVE_AUDITORIA)).toHaveLength(1))
    // o valor estornado não entra no resumo do dia
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(0)
  })

  it('desfazer lançamento (compensação do PDV) remove dos dois lados', async () => {
    montar()
    await waitFor(() => expect(ctx.lancamentos).toEqual([]))
    let criado!: Lancamento
    act(() => {
      criado = ctx.registrarPagamento(pagamento())
    })
    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))

    act(() => ctx.desfazerLancamento(criado.id))

    expect(ctx.lancamentos).toHaveLength(0)
    await waitFor(() => expect(remoto.lancamentos).toHaveLength(0))
  })

  it('falha na escrita: mantém o lançamento local, avisa e não duplica', async () => {
    montar()
    await waitFor(() => expect(ctx.lancamentos).toEqual([]))
    remoto.falhaEscrita = true

    act(() => ctx.registrarPagamento(pagamento()))

    // o dado existe na tela e no storage…
    expect(ctx.lancamentos).toHaveLength(1)
    await waitFor(() => expect(salvo(CHAVE_LANCAMENTOS)).toHaveLength(1))
    // …e a tela sabe que o servidor não confirmou
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
    expect(remoto.lancamentos).toHaveLength(0)
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(70)
  })

  it('falha de leitura não vira banco vazio: não reenvia nem sobrescreve', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const existente: Lancamento = {
      id: 'lan-1',
      tipo: 'receita',
      origem: 'atendimento',
      data: DIA,
      hora: '10:00',
      descricao: 'Corte — Ana',
      valor: 70,
      desconto: 0,
      valorLiquido: 70,
      formaPagamento: 'pix',
      criadoEm: '2026-03-10T13:00:00.000Z',
    }
    localStorage.setItem(CHAVE_LANCAMENTOS, JSON.stringify([existente]))
    // o servidor tem o registro de outro aparelho
    remoto.lancamentos = [
      { ...existente, id: 'lan-2', descricao: 'Barba — Beto', valor: 40, valor_liquido: 40 },
    ]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('Supabase indisponível'),
      expect.any(Error),
    )
    // nada foi enviado e nada foi sobrescrito no servidor
    expect(remoto.lancamentos).toHaveLength(1)
    expect((remoto.lancamentos[0] as { id: string }).id).toBe('lan-2')
    // o caixa local segue como estava
    await waitFor(() => expect(ctx.lancamentos).toHaveLength(1))
    expect(ctx.lancamentos[0].id).toBe('lan-1')
    aviso.mockRestore()
  })

  it('registro que só existe no servidor entra na união (outro aparelho)', async () => {
    // o repositório está mockado: o "servidor" entrega no formato do app
    const doServidor: Lancamento = {
      id: 'lan-2',
      tipo: 'receita',
      origem: 'atendimento',
      data: DIA,
      hora: '11:00',
      descricao: 'Barba — Beto',
      valor: 40,
      desconto: 0,
      valorLiquido: 40,
      formaPagamento: 'dinheiro',
      criadoEm: '2026-03-10T14:00:00.000Z',
    }
    localStorage.setItem(CHAVE_LANCAMENTOS, JSON.stringify([]))
    remoto.lancamentos = [doServidor]

    montar()

    await waitFor(() => expect(ctx.lancamentos).toHaveLength(1))
    expect(ctx.lancamentos[0].descricao).toBe('Barba — Beto')
    expect(ctx.resumoDoDia(DIA).totalRecebido).toBe(40)
  })

  it('instalação nova adota a lista oficial sem reenviar nada', async () => {
    remoto.lancamentos = [
      {
        id: 'lan-5',
        tipo: 'receita',
        origem: 'produto',
        data: DIA,
        hora: '15:00',
        descricao: '1× Pomada',
        valor: 30,
        desconto: 0,
        valorLiquido: 30,
        formaPagamento: 'pix',
        criadoEm: '2026-03-10T18:00:00.000Z',
      },
    ]
    // storage vazio = instalação nova

    montar()

    await waitFor(() => expect(ctx.lancamentos).toHaveLength(1))
    expect(ctx.lancamentos[0].id).toBe('lan-5')
    expect(remoto.lancamentos).toHaveLength(1)
  })

  it('divergência: o caixa da tela vence, o remoto vai para o snapshot', async () => {
    const local: Lancamento = {
      id: 'lan-1',
      tipo: 'receita',
      origem: 'atendimento',
      data: DIA,
      hora: '10:00',
      descricao: 'Corte — Ana (editado)',
      valor: 80,
      desconto: 0,
      valorLiquido: 80,
      formaPagamento: 'pix',
      criadoEm: '2026-03-10T13:00:00.000Z',
    }
    localStorage.setItem(CHAVE_LANCAMENTOS, JSON.stringify([local]))
    remoto.lancamentos = [
      {
        id: 'lan-1',
        tipo: 'receita',
        origem: 'atendimento',
        data: DIA,
        hora: '10:00',
        descricao: 'Corte — Ana',
        valor: 70,
        desconto: 0,
        valorLiquido: 70,
        formaPagamento: 'pix',
        criadoEm: '2026-03-10T13:00:00.000Z',
      },
    ]

    montar()

    await waitFor(() => expect(ctx.lancamentos).toHaveLength(1))
    expect(ctx.lancamentos[0].valorLiquido).toBe(80)
    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))
    const chaves = Object.keys(localStorage).filter((chave) =>
      chave.startsWith(`${CHAVE_LANCAMENTOS}:backup:`),
    )
    expect(chaves).toHaveLength(1)
    const backup = JSON.parse(localStorage.getItem(chaves[0]) ?? '[]')
    expect(backup[0].valor_liquido ?? backup[0].valorLiquido).toBe(70)
  })

  it('renomear profissional propaga sem criar lançamento novo', async () => {
    montar()
    await waitFor(() => expect(ctx.lancamentos).toEqual([]))
    act(() => ctx.registrarPagamento(pagamento()))
    await waitFor(() => expect(remoto.lancamentos).toHaveLength(1))

    act(() => ctx.renomearProfissional('Cleiton', 'Cleiton Silva'))

    expect(ctx.lancamentos[0].profissional).toBe('Cleiton Silva')
    await waitFor(() =>
      expect(
        (remoto.lancamentos[0] as { profissional: string }).profissional,
      ).toBe('Cleiton Silva'),
    )
    expect(remoto.lancamentos).toHaveLength(1)
  })
})
