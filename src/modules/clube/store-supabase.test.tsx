// Integração do Audax Club com o Supabase (I8).
// Foco: nenhuma mensalidade entra duas vezes, o status continua derivado
// (nunca gravado), o pagamento segue alimentando o Caixa, cancelamento e
// histórico não somem, e nenhuma falha de leitura/escrita vira sucesso.
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClubeProvider, useClube } from './store'
import { statusAssinatura } from './regras'
import type { AssinaturaClube, PagamentoClube } from './types'

const CHAVE_CLUBE = 'studio-audax:clube:v1'
const DIA = hojeISO()

// Tabelas remotas em memória (mesma semântica do Supabase nos testes).
const remoto = vi.hoisted(() => ({
  assinaturas: [] as unknown[],
  pagamentos: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  parcial: false,
  reiniciar() {
    remoto.assinaturas = []
    remoto.pagamentos = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
    remoto.parcial = false
  },
  gravarEm(caixa: unknown[], linha: Record<string, unknown>) {
    const indice = caixa.findIndex(
      (item) => (item as Record<string, unknown>).id === linha.id,
    )
    if (indice >= 0) caixa[indice] = linha
    else caixa.push(linha)
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/clube', () => ({
  listarAssinaturas: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.assinaturas] as never
  }),
  listarPagamentos: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.pagamentos] as never
  }),
  gravarAssinatura: vi.fn(async (a: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.assinaturas, a as Record<string, unknown>)
    return a as never
  }),
  gravarPagamento: vi.fn(async (p: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.pagamentos, p as Record<string, unknown>)
    return p as never
  }),
  importarAssinaturas: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita || remoto.parcial) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.assinaturas, item as Record<string, unknown>)
    }
    return lista.length
  }),
  importarPagamentos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita || remoto.parcial) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.pagamentos, item as Record<string, unknown>)
    }
    return lista.length
  }),
}))

let ctx: ReturnType<typeof useClube>
let caixa: ReturnType<typeof useCaixa>

function Captura() {
  const clube = useClube()
  const caixaCtx = useCaixa()
  useEffect(() => {
    ctx = clube
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

function executar<T>(acao: () => T): T {
  let resultado!: T
  act(() => {
    resultado = acao()
  })
  return resultado
}

function assinar(clienteId = 'cli-1') {
  return executar(() =>
    ctx.assinar({
      clienteId,
      cliente: clienteId === 'cli-1' ? 'Lucas Mendes' : 'Rafael Souza',
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      dataAssinatura: DIA,
    }),
  )
}

function pagar(assinaturaId: string, data = DIA, valor = 99.9) {
  return executar(() =>
    ctx.registrarPagamento({
      assinaturaId,
      data,
      valor,
      formaPagamento: 'pix',
    }),
  )
}

function assinatura(extra: Partial<AssinaturaClube> = {}): AssinaturaClube {
  return {
    id: 'ass-1',
    clienteId: 'cli-1',
    cliente: 'Lucas Mendes',
    plano: 'cabelo_barba',
    valorMensal: 99.9,
    dataAssinatura: DIA,
    proximoVencimento: '2026-04-10',
    cancelada: false,
    criadoEm: '2026-03-10T12:00:00.000Z',
    atualizadoEm: '2026-03-10T12:00:00.000Z',
    ...extra,
  }
}

function pagamento(extra: Partial<PagamentoClube> = {}): PagamentoClube {
  return {
    id: 'pag-1',
    assinaturaId: 'ass-1',
    clienteId: 'cli-1',
    data: DIA,
    valor: 99.9,
    formaPagamento: 'pix',
    vencimentoCoberto: '2026-04-10',
    criadoEm: '2026-03-10T12:30:00.000Z',
    ...extra,
  }
}

function salvo(): { assinaturas: unknown[]; pagamentos: unknown[] } {
  const bruto = JSON.parse(localStorage.getItem(CHAVE_CLUBE) ?? '{}')
  return {
    assinaturas: Array.isArray(bruto?.assinaturas) ? bruto.assinaturas : [],
    pagamentos: Array.isArray(bruto?.pagamentos) ? bruto.pagamentos : [],
  }
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useClube>
  caixa = undefined as unknown as ReturnType<typeof useCaixa>
})

describe('Club — carga e envio', () => {
  it('assinatura e pagamento remotos entram no estado e no localStorage', async () => {
    remoto.assinaturas = [assinatura()]
    remoto.pagamentos = [pagamento()]

    montar()

    await waitFor(() => expect(ctx.assinaturas).toHaveLength(1))
    expect(ctx.assinaturas[0]).toMatchObject({
      id: 'ass-1',
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      proximoVencimento: '2026-04-10',
    })
    expect(ctx.pagamentos[0].id).toBe('pag-1')
    expect(ctx.pagamentosDaAssinatura('ass-1')).toHaveLength(1)
    await waitFor(() => expect(salvo().pagamentos).toHaveLength(1))
    expect(avisosPersistencia()).toEqual([])
  })

  it('banco vazio não é erro: com Supabase e nada no servidor, a lista fica vazia', async () => {
    montar()

    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    expect(avisosPersistencia()).toEqual([])
  })

  it('pendência local vai para o Supabase (assinaturas já existentes)', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [assinatura()], pagamentos: [pagamento()] }),
    )

    montar()

    await waitFor(() => expect(remoto.assinaturas).toHaveLength(1))
    expect(remoto.pagamentos).toHaveLength(1)
    expect(ctx.assinaturas[0].valorMensal).toBe(99.9)
  })

  it('instalação nova adota o servidor sem reenviar nada', async () => {
    // storage vazio = instalação nova
    remoto.assinaturas = [assinatura()]
    remoto.pagamentos = [pagamento()]

    montar()

    await waitFor(() => expect(ctx.assinaturas).toHaveLength(1))
    expect(remoto.assinaturas).toHaveLength(1)
    expect(remoto.pagamentos).toHaveLength(1)
  })

  it('falha de leitura não vira banco vazio: mantém o local e não reenvia', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [assinatura()], pagamentos: [] }),
    )
    remoto.assinaturas = [assinatura({ id: 'ass-9', valorMensal: 1 })]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(ctx.assinaturas).toHaveLength(1))
    expect(ctx.assinaturas[0].valorMensal).toBe(99.9)
    expect(remoto.assinaturas).toHaveLength(1)
    expect((remoto.assinaturas[0] as { valorMensal: number }).valorMensal).toBe(1)
    aviso.mockRestore()
  })
})

describe('Club — assinatura, cancelamento e edição', () => {
  it('assinar grava local e envia o MESMO id da assinatura', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))

    const nova = assinar()

    await waitFor(() => expect(remoto.assinaturas).toHaveLength(1))
    expect((remoto.assinaturas[0] as { id: string }).id).toBe(nova.id)
    expect(remoto.assinaturas[0]).toMatchObject({
      clienteId: 'cli-1',
      plano: 'cabelo_barba',
      valorMensal: 99.9,
      cancelada: false,
    })
    await waitFor(() => expect(salvo().assinaturas).toHaveLength(1))
  })

  it('recusa assinatura duplicada do mesmo cliente (uma em andamento)', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    assinar()

    expect(() => assinar()).toThrow(/já tem uma assinatura em andamento/i)
    expect(ctx.assinaturas).toHaveLength(1)
    await waitFor(() => expect(remoto.assinaturas).toHaveLength(1))
    expect(remoto.assinaturas).toHaveLength(1)
  })

  it('editar assinatura sincroniza plano e mensalidade (preço do plano não muda)', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    const nova = assinar()

    executar(() => ctx.atualizar(nova.id, { plano: 'barba', valorMensal: 59.9 }))

    await waitFor(() =>
      expect(remoto.assinaturas[0]).toMatchObject({
        plano: 'barba',
        valorMensal: 59.9,
      }),
    )
    // datas e histórico continuam intactos
    expect((remoto.assinaturas[0] as { dataAssinatura: string }).dataAssinatura).toBe(
      DIA,
    )
  })

  it('cancelar preserva assinatura e histórico, e sincroniza o cancelamento', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    const nova = assinar()
    pagar(nova.id)
    await waitFor(() => expect(remoto.pagamentos).toHaveLength(1))

    executar(() => ctx.cancelar(nova.id, 'mudou de cidade'))

    await waitFor(() =>
      expect(remoto.assinaturas[0]).toMatchObject({
        cancelada: true,
        motivoCancelamento: 'mudou de cidade',
      }),
    )
    expect(ctx.assinaturas[0].cancelada).toBe(true)
    // nada foi apagado: a assinatura e o pagamento continuam
    expect(ctx.assinaturas).toHaveLength(1)
    expect(ctx.pagamentos).toHaveLength(1)
    expect(ctx.podeAssinar('cli-1')).toBe(true)
    // status continua DERIVADO (cancelada), nunca gravado
    expect(statusAssinatura(ctx.assinaturas[0], DIA)).toBe('cancelada')
    expect(remoto.assinaturas[0]).not.toHaveProperty('status')
  })

  it('renomear cliente propaga o rótulo e sincroniza', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    assinar()

    executar(() => ctx.renomearCliente('Lucas Mendes', 'Lucas M. Souza'))

    expect(ctx.assinaturas[0].cliente).toBe('Lucas M. Souza')
    await waitFor(() =>
      expect(remoto.assinaturas[0]).toMatchObject({ cliente: 'Lucas M. Souza' }),
    )
    // o histórico de pagamento não é reescrito
    expect(remoto.pagamentos).toHaveLength(0)
  })
})

describe('Club — pagamento, Caixa e não duplicação', () => {
  it('pagamento grava assinatura renovada, pagamento e lançamento no Caixa', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    const nova = assinar()
    const vencimentoAntes = nova.proximoVencimento

    const resultado = pagar(nova.id)

    await waitFor(() => expect(remoto.pagamentos).toHaveLength(1))
    expect((remoto.pagamentos[0] as { id: string }).id).toBe(resultado.pagamento.id)
    // o lançamento do Caixa continua sendo ligado ao pagamento
    expect(resultado.pagamento.caixaLancamentoId).toBeTruthy()
    expect(caixa.lancamentos).toHaveLength(1)
    expect(caixa.lancamentos[0].assinaturaId).toBe(nova.id)
    expect(caixa.lancamentos[0].origem).toBe('clube')
    // ciclo renova: vencimento avança e o ciclo coberto fica gravado
    expect(ctx.assinaturas[0].proximoVencimento).not.toBe(vencimentoAntes)
    expect(resultado.pagamento.vencimentoCoberto).toBe(vencimentoAntes)
    await waitFor(() => expect(salvo().pagamentos).toHaveLength(1))
  })

  it('cobrança do mesmo ciclo é recusada no mesmo lote (duplo clique)', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    const nova = assinar()
    const registrar = () =>
      ctx.registrarPagamento({
        assinaturaId: nova.id,
        data: DIA,
        valor: 99.9,
        formaPagamento: 'pix',
      })

    act(() => {
      registrar()
      // segundo clique antes do re-render: mesmo ciclo, sem efeito algum
      expect(() => registrar()).toThrow(/cobrança já foi paga/i)
    })

    expect(ctx.pagamentos).toHaveLength(1)
    // o segundo clique não chega a lançar no Caixa nem a duplicar no servidor
    expect(caixa.lancamentos).toHaveLength(1)
    await waitFor(() => expect(remoto.pagamentos).toHaveLength(1))
    expect(remoto.pagamentos).toHaveLength(1)
  })

  it('reenvio da mesma carga não duplica assinatura nem pagamento', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [assinatura()], pagamentos: [pagamento()] }),
    )
    remoto.assinaturas = [assinatura()]
    remoto.pagamentos = [pagamento()]
    const { importarAssinaturas, importarPagamentos } =
      await import('@/services/supabase/clube')

    montar()

    await waitFor(() => expect(ctx.assinaturas).toHaveLength(1))
    // conteúdo igual no servidor: nada é reenviado
    expect(importarAssinaturas).not.toHaveBeenCalled()
    expect(importarPagamentos).not.toHaveBeenCalled()
    expect(remoto.assinaturas).toHaveLength(1)
    expect(remoto.pagamentos).toHaveLength(1)
  })

  it('reenvio da pendência continua sendo UM pagamento (falha não vira duplicata)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [assinatura()], pagamentos: [pagamento()] }),
    )
    remoto.falhaEscrita = true
    const primeira = montar()
    await waitFor(() => expect(ctx.pagamentos).toHaveLength(1))
    expect(remoto.pagamentos).toHaveLength(0)

    primeira.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() => expect(remoto.pagamentos).toHaveLength(1))
    expect(remoto.pagamentos).toHaveLength(1)
    expect(ctx.pagamentos).toHaveLength(1)
    aviso.mockRestore()
  })

  it('falha de escrita avisa falha_sincronizacao e o pagamento segue no dispositivo', async () => {
    montar()
    await waitFor(() => expect(ctx.assinaturas).toEqual([]))
    const nova = assinar()
    await waitFor(() => expect(remoto.assinaturas).toHaveLength(1))
    remoto.falhaEscrita = true

    const resultado = pagar(nova.id)

    expect(ctx.pagamentos).toHaveLength(1)
    expect(ctx.assinaturas[0].proximoVencimento).not.toBe(
      nova.proximoVencimento,
    )
    await waitFor(() => expect(salvo().pagamentos).toHaveLength(1))
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
    expect(remoto.pagamentos).toHaveLength(0)
    // o lançamento do Caixa não é desfeito: o dinheiro foi recebido
    expect(resultado.pagamento.valor).toBe(99.9)
  })

  it('envio parcial não trava a integração: a pendência segue para a próxima carga', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({ assinaturas: [assinatura()], pagamentos: [] }),
    )
    remoto.parcial = true
    const primeira = montar()
    await waitFor(() => expect(ctx.assinaturas).toHaveLength(1))
    expect(remoto.assinaturas).toHaveLength(0)

    primeira.unmount()
    remoto.parcial = false
    montar()

    await waitFor(() => expect(remoto.assinaturas).toHaveLength(1))
    expect(remoto.assinaturas).toHaveLength(1)
    aviso.mockRestore()
  })
})

describe('Club — divergência entre dispositivos', () => {
  it('assinatura: vence o carimbo mais recente e o perdedor vai para o snapshot', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [
          assinatura({
            valorMensal: 79.9,
            atualizadoEm: '2026-03-12T10:00:00.000Z',
          }),
        ],
        pagamentos: [],
      }),
    )
    remoto.assinaturas = [
      assinatura({
        valorMensal: 99.9,
        atualizadoEm: '2026-03-10T10:00:00.000Z',
      }),
    ]

    montar()

    await waitFor(() => expect(ctx.assinaturas[0].valorMensal).toBe(79.9))
    await waitFor(() =>
      expect((remoto.assinaturas[0] as { valorMensal: number }).valorMensal).toBe(
        79.9,
      ),
    )
    const chaves = Object.keys(localStorage).filter((chave) =>
      chave.startsWith(`${CHAVE_CLUBE}:backup:`),
    )
    expect(chaves).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(chaves[0]) ?? '[]')[0].valorMensal).toBe(
      99.9,
    )
  })

  it('cancelamento remoto mais recente não é rebaixado pelo cadastro velho', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [
          assinatura({ atualizadoEm: '2026-03-10T10:00:00.000Z' }),
        ],
        pagamentos: [],
      }),
    )
    remoto.assinaturas = [
      assinatura({
        cancelada: true,
        canceladaEm: DIA,
        motivoCancelamento: 'cancelada no outro aparelho',
        atualizadoEm: '2026-03-14T10:00:00.000Z',
      }),
    ]

    montar()

    await waitFor(() => expect(ctx.assinaturas[0].cancelada).toBe(true))
    expect(remoto.assinaturas).toHaveLength(1)
    expect(statusAssinatura(ctx.assinaturas[0], DIA)).toBe('cancelada')
  })

  it('ciclo pago no outro aparelho entra e trava a cobrança do mesmo vencimento', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [assinatura({ proximoVencimento: '2026-04-10' })],
        pagamentos: [],
      }),
    )
    remoto.assinaturas = [assinatura({ proximoVencimento: '2026-04-10' })]
    remoto.pagamentos = [pagamento({ vencimentoCoberto: '2026-04-10' })]

    montar()

    await waitFor(() => expect(ctx.pagamentos).toHaveLength(1))
    // o pagamento vindo do servidor já cobre o ciclo: nova cobrança é recusada
    expect(() => pagar('ass-1')).toThrow(/cobrança já foi paga/i)
    expect(caixa.lancamentos).toHaveLength(0)
    expect(remoto.pagamentos).toHaveLength(1)
  })

  it('vencimento renovado no outro aparelho entra e libera o próximo ciclo', async () => {
    localStorage.setItem(
      CHAVE_CLUBE,
      JSON.stringify({
        assinaturas: [assinatura({ proximoVencimento: '2026-04-10' })],
        pagamentos: [],
      }),
    )
    remoto.assinaturas = [assinatura({ proximoVencimento: '2026-05-10' })]
    remoto.pagamentos = [pagamento({ vencimentoCoberto: '2026-04-10' })]

    montar()

    await waitFor(() =>
      expect(ctx.assinaturas[0].proximoVencimento).toBe('2026-05-10'),
    )
    // ciclo novo: a cobrança é aceita e gera um pagamento novo (id novo)
    const resultado = pagar('ass-1')
    await waitFor(() => expect(remoto.pagamentos).toHaveLength(2))
    expect(resultado.pagamento.vencimentoCoberto).toBe('2026-05-10')
  })
})
