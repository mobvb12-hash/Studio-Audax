// Integração de Comissões com o Supabase (I7).
// Foco: a comissão não pode ser duplicada nem paga duas vezes, o fechamento
// continua imutável, a auditoria é só acrescida, e nenhuma falha de leitura ou
// escrita vira sucesso silencioso.
import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import { ComissoesProvider, useComissoes } from './store'
import type {
  ConfigComissao,
  EventoAuditoriaComissao,
  FechamentoComissao,
} from './types'

const CHAVE_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_FECHAMENTOS = 'studio-audax:comissoes:fechamentos:v1'
const CHAVE_AUDITORIA = 'studio-audax:comissoes:auditoria:v1'
const PERIODO = { inicio: '2026-03-01', fim: '2026-03-31' }

// Tabelas remotas em memória (mesma semântica do Supabase nos testes).
const remoto = vi.hoisted(() => ({
  configs: [] as unknown[],
  fechamentos: [] as unknown[],
  auditoria: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  parcial: false,
  reiniciar() {
    remoto.configs = []
    remoto.fechamentos = []
    remoto.auditoria = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
    remoto.parcial = false
  },
  gravarEm(caixa: unknown[], chave: string, linha: Record<string, unknown>) {
    const indice = caixa.findIndex(
      (item) => (item as Record<string, unknown>)[chave] === linha[chave],
    )
    if (indice >= 0) caixa[indice] = linha
    else caixa.push(linha)
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/comissoes', () => ({
  listarConfigs: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.configs] as never
  }),
  listarFechamentos: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.fechamentos] as never
  }),
  listarAuditoria: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('permission denied')
    return [...remoto.auditoria] as never
  }),
  gravarConfig: vi.fn(async (c: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(
      remoto.configs,
      'profissionalId',
      c as Record<string, unknown>,
    )
    return c as never
  }),
  gravarFechamento: vi.fn(async (f: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.fechamentos, 'id', f as Record<string, unknown>)
    return f as never
  }),
  gravarEvento: vi.fn(async (a: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravarEm(remoto.auditoria, 'id', a as Record<string, unknown>)
    return a as never
  }),
  importarConfigs: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    if (remoto.parcial) return 0
    for (const item of lista) {
      remoto.gravarEm(
        remoto.configs,
        'profissionalId',
        item as Record<string, unknown>,
      )
    }
    return lista.length
  }),
  importarFechamentos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    if (remoto.parcial) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.fechamentos, 'id', item as Record<string, unknown>)
    }
    return lista.length
  }),
  importarAuditoria: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    if (remoto.parcial) return 0
    for (const item of lista) {
      remoto.gravarEm(remoto.auditoria, 'id', item as Record<string, unknown>)
    }
    return lista.length
  }),
}))

let ctx: ReturnType<typeof useComissoes>

function Captura() {
  const valor = useComissoes()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function montar() {
  return render(
    <ComissoesProvider>
      <Captura />
    </ComissoesProvider>,
  )
}

function executar<T>(acao: () => T): T {
  let resultado!: T
  act(() => {
    resultado = acao()
  })
  return resultado
}

function config(extra: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    profissionalId: 'prof-1',
    percentual: 40,
    ativo: true,
    atualizadoEm: '2026-03-31T12:00:00.000Z',
    ...extra,
  }
}

function fechamento(extra: Partial<FechamentoComissao> = {}): FechamentoComissao {
  return {
    id: 'fec-1',
    profissionalId: 'prof-1',
    profissionalNome: 'Cleiton',
    periodo: PERIODO,
    qtdAtendimentos: 6,
    producao: 900,
    percentual: 40,
    comissao: 360,
    fechadoEm: '2026-04-01T12:00:00.000Z',
    ...extra,
  }
}

function evento(extra: Partial<EventoAuditoriaComissao> = {}): EventoAuditoriaComissao {
  return {
    id: 'aud-1',
    acao: 'fechamento',
    profissionalId: 'prof-1',
    profissionalNome: 'Cleiton',
    periodo: PERIODO,
    descricao: 'Comissão de Cleiton fechada',
    criadoEm: '2026-04-01T12:00:00.000Z',
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

function fechar(
  profissionalId = 'prof-1',
  profissionalNome = 'Cleiton',
  periodo = PERIODO,
) {
  return executar(() =>
    ctx.fecharComissao({
      profissionalId,
      profissionalNome,
      periodo,
      qtdAtendimentos: 6,
      producao: 900,
      percentual: 40,
      comissao: 360,
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useComissoes>
})

describe('Comissões — carga e envio', () => {
  it('config, fechamento e auditoria remotos entram no estado e no localStorage', async () => {
    remoto.configs = [config()]
    remoto.fechamentos = [fechamento()]
    remoto.auditoria = [evento()]

    montar()

    await waitFor(() => expect(ctx.fechamentos).toHaveLength(1))
    expect(ctx.configDe('prof-1').percentual).toBe(40)
    expect(ctx.fechamentos[0]).toMatchObject({
      id: 'fec-1',
      producao: 900,
      percentual: 40,
      comissao: 360,
    })
    expect(ctx.auditoria[0].acao).toBe('fechamento')
    await waitFor(() => expect(salvo(CHAVE_FECHAMENTOS)).toHaveLength(1))
    expect(salvo(CHAVE_AUDITORIA)).toHaveLength(1)
    expect(avisosPersistencia()).toEqual([])
  })

  it('banco vazio não é erro: com Supabase e nada no servidor, a lista fica vazia', async () => {
    montar()

    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    expect(avisosPersistencia()).toEqual([])
  })

  it('pendência local vai para o Supabase (comissões já fechadas antes da integração)', async () => {
    // pendência legítima: já houve sincronização antes e o registro é
    // posterior à marca
    marcarComoSincronizado(CHAVE_CONFIGS, CHAVE_FECHAMENTOS, CHAVE_AUDITORIA)
    localStorage.setItem(CHAVE_CONFIGS, JSON.stringify([config()]))
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))
    localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify([evento()]))

    montar()

    await waitFor(() => expect(remoto.fechamentos).toHaveLength(1))
    expect(remoto.configs).toHaveLength(1)
    expect(remoto.auditoria).toHaveLength(1)
    expect(ctx.fechamentos[0].comissao).toBe(360)
  })

  it('J — fechamento anterior à última sincronização não volta (resquício fica no snapshot)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { importarFechamentos } = await import('@/services/supabase/comissoes')
    marcarComoSincronizadoAgora(CHAVE_CONFIGS, CHAVE_FECHAMENTOS, CHAVE_AUDITORIA)
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))

    montar()

    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    expect(remoto.fechamentos).toHaveLength(0)
    expect(importarFechamentos).not.toHaveBeenCalled()
    expect(
      Object.keys(localStorage).filter((c) =>
        c.startsWith(`${CHAVE_FECHAMENTOS}:backup:`),
      ),
    ).toHaveLength(1)
    aviso.mockRestore()
  })

  it('J — marca inexistente: fechamento local não é enviado', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { importarFechamentos } = await import('@/services/supabase/comissoes')
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))

    montar()

    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    expect(remoto.fechamentos).toHaveLength(0)
    expect(importarFechamentos).not.toHaveBeenCalled()
    expect(
      localStorage.getItem(`${CHAVE_FECHAMENTOS}:sincronizado_em:v1`),
    ).not.toBeNull()
    aviso.mockRestore()
  })

  it('instalação nova adota o servidor sem reenviar nada', async () => {
    // storage vazio = instalação nova
    remoto.configs = [config()]
    remoto.fechamentos = [fechamento()]
    remoto.auditoria = [evento()]

    montar()

    await waitFor(() => expect(ctx.fechamentos).toHaveLength(1))
    expect(ctx.fechamentos[0].id).toBe('fec-1')
    expect(remoto.fechamentos).toHaveLength(1)
  })

  it('falha de leitura não vira banco vazio: mantém o local e não reenvia', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))
    remoto.fechamentos = [fechamento({ id: 'fec-9', comissao: 999 })]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(ctx.fechamentos).toHaveLength(1))
    expect(ctx.fechamentos[0].comissao).toBe(360)
    expect(remoto.fechamentos).toHaveLength(1)
    expect((remoto.fechamentos[0] as { comissao: number }).comissao).toBe(999)
    aviso.mockRestore()
  })
})

describe('Comissões — escrita, imutabilidade e não duplicação', () => {
  it('fechar comissão grava local e envia o MESMO id do fechamento e do evento', async () => {
    montar()
    await waitFor(() => expect(ctx.fechamentos).toEqual([]))

    const criado = fechar()

    await waitFor(() => expect(remoto.fechamentos).toHaveLength(1))
    await waitFor(() => expect(remoto.auditoria).toHaveLength(1))
    expect((remoto.fechamentos[0] as { id: string }).id).toBe(criado.id)
    expect(remoto.fechamentos[0]).toMatchObject({
      producao: 900,
      percentual: 40,
      comissao: 360,
    })
    expect(remoto.auditoria[0]).toMatchObject({ acao: 'fechamento' })
    expect(ctx.auditoria).toHaveLength(1)
  })

  it('período já fechado continua bloqueado (mesma trava de pagamento em dobro)', async () => {
    montar()
    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    fechar()

    expect(() => fechar()).toThrow(/já existe comissão fechada/i)
    expect(ctx.fechamentos).toHaveLength(1)
  })

  it('carregar o mesmo fechamento de novo não duplica a comissão no servidor', async () => {
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))
    localStorage.setItem(CHAVE_AUDITORIA, JSON.stringify([evento()]))
    const { importarFechamentos, importarAuditoria } =
      await import('@/services/supabase/comissoes')
    remoto.fechamentos = [fechamento()]
    remoto.auditoria = [evento()]

    montar()

    await waitFor(() => expect(ctx.fechamentos).toHaveLength(1))
    expect(remoto.fechamentos).toHaveLength(1)
    // conteúdo igual no servidor: nada é reenviado (evita pagamento duplo)
    expect(importarFechamentos).not.toHaveBeenCalled()
    expect(importarAuditoria).not.toHaveBeenCalled()
  })

  it('reenvio da pendência continua sendo UM fechamento (falha na escrita não vira duplicata)', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    marcarComoSincronizado(CHAVE_CONFIGS, CHAVE_FECHAMENTOS, CHAVE_AUDITORIA)
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))
    remoto.falhaEscrita = true
    const primeira = montar()
    await waitFor(() => expect(ctx.fechamentos).toHaveLength(1))
    expect(remoto.fechamentos).toHaveLength(0)

    primeira.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() => expect(remoto.fechamentos).toHaveLength(1))
    expect(remoto.fechamentos).toHaveLength(1)
    expect(ctx.fechamentos).toHaveLength(1)
    aviso.mockRestore()
  })

  it('falha de escrita avisa falha_sincronizacao e a comissão continua salva no dispositivo', async () => {
    montar()
    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    remoto.falhaEscrita = true

    const criado = fechar()

    expect(ctx.fechamentos).toHaveLength(1)
    await waitFor(() => expect(salvo(CHAVE_FECHAMENTOS)).toHaveLength(1))
    await waitFor(() =>
      expect(avisosPersistencia().map((a) => a.tipo)).toContain(
        'falha_sincronizacao',
      ),
    )
    expect(remoto.fechamentos).toHaveLength(0)
    expect(criado.comissao).toBe(360)
  })

  it('salvar configuração envia pela chave profissional_id (uma config por profissional)', async () => {
    montar()
    await waitFor(() => expect(ctx.configs).toEqual([]))

    executar(() => ctx.salvarConfig('prof-1', { percentual: 50, ativo: false }))

    await waitFor(() => expect(remoto.configs).toHaveLength(1))
    expect(remoto.configs[0]).toMatchObject({
      profissionalId: 'prof-1',
      percentual: 50,
      ativo: false,
    })
    await waitFor(() => expect(salvo(CHAVE_CONFIGS)).toHaveLength(1))

    // mesma config de novo: continua UMA linha (upsert pela chave)
    executar(() => ctx.salvarConfig('prof-1', { percentual: 55, ativo: true }))
    await waitFor(() => expect(remoto.configs).toHaveLength(1))
    expect((remoto.configs[0] as { percentual: number }).percentual).toBe(55)
  })

  it('reabertura marca reaberto sem tocar em produção, percentual ou comissão, e só acrescenta auditoria', async () => {
    montar()
    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    const criado = fechar()

    executar(() => ctx.reabrirComissao(criado.id, 'erro de digitação'))

    await waitFor(() => expect(ctx.fechamentos[0].reaberto).toBeDefined())
    expect(ctx.fechamentos[0]).toMatchObject({
      producao: 900,
      percentual: 40,
      comissao: 360,
    })
    expect(ctx.fechamentos[0].reaberto?.motivo).toBe('erro de digitação')
    // trilha histórica: o evento de fechamento continua lá
    expect(ctx.auditoria).toHaveLength(2)
    expect(ctx.auditoria[0].acao).toBe('fechamento')
    expect(ctx.auditoria[1].acao).toBe('reabertura')
    await waitFor(() => expect(remoto.fechamentos[0]).toMatchObject({
      reaberto: { motivo: 'erro de digitação' },
    }))
    expect(remoto.auditoria).toHaveLength(2)
  })

  it('renomear profissional propaga o rótulo do fechamento e sincroniza', async () => {
    montar()
    await waitFor(() => expect(ctx.fechamentos).toEqual([]))
    fechar()

    executar(() => ctx.renomearProfissional('Cleiton', 'Cleiton Audax'))

    expect(ctx.fechamentos[0].profissionalNome).toBe('Cleiton Audax')
    await waitFor(() =>
      expect(remoto.fechamentos[0]).toMatchObject({
        profissionalNome: 'Cleiton Audax',
      }),
    )
    // a auditoria é trilha histórica: continua com o nome antigo
    expect(ctx.auditoria[0].profissionalNome).toBe('Cleiton')
  })
})

describe('Comissões — divergência entre dispositivos', () => {
  it('config: vence o carimbo mais recente e o perdedor vai para o snapshot', async () => {
    localStorage.setItem(
      CHAVE_CONFIGS,
      JSON.stringify([
        config({ percentual: 55, atualizadoEm: '2026-04-02T10:00:00.000Z' }),
      ]),
    )
    remoto.configs = [
      config({ percentual: 40, atualizadoEm: '2026-04-01T10:00:00.000Z' }),
    ]

    montar()

    await waitFor(() => expect(ctx.configDe('prof-1').percentual).toBe(55))
    await waitFor(() =>
      expect((remoto.configs[0] as { percentual: number }).percentual).toBe(55),
    )
    const chaves = Object.keys(localStorage).filter((chave) =>
      chave.startsWith(`${CHAVE_CONFIGS}:backup:`),
    )
    expect(chaves).toHaveLength(1)
    expect(
      JSON.parse(localStorage.getItem(chaves[0]) ?? '[]')[0].percentual,
    ).toBe(40)
  })

  it('config remota mais recente não é rebaixada pelo dispositivo velho', async () => {
    localStorage.setItem(
      CHAVE_CONFIGS,
      JSON.stringify([
        config({ percentual: 30, atualizadoEm: '2026-04-01T10:00:00.000Z' }),
      ]),
    )
    remoto.configs = [
      config({ percentual: 60, atualizadoEm: '2026-04-05T10:00:00.000Z' }),
    ]

    montar()

    await waitFor(() => expect(ctx.configDe('prof-1').percentual).toBe(60))
    expect((remoto.configs[0] as { percentual: number }).percentual).toBe(60)
  })

  it('fechamento: reabertura remota (mais recente) não é perdida pelo cadastro antigo', async () => {
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))
    remoto.fechamentos = [
      fechamento({
        atualizadoEm: '2026-04-03T10:00:00.000Z',
        reaberto: { em: '2026-04-03T10:00:00.000Z', motivo: 'corrigido no caixa' },
      }),
    ]

    montar()

    await waitFor(() => expect(ctx.fechamentos[0].reaberto).toBeDefined())
    expect(ctx.fechamentos[0].reaberto?.motivo).toBe('corrigido no caixa')
    expect(remoto.fechamentos).toHaveLength(1)
  })

  it('fechamento alterado localmente mais tarde vai para o servidor (carimbo da renomeação)', async () => {
    localStorage.setItem(
      CHAVE_FECHAMENTOS,
      JSON.stringify([
        fechamento({ atualizadoEm: '2026-04-05T10:00:00.000Z' }),
      ]),
    )
    remoto.fechamentos = [
      fechamento({ profissionalNome: 'Nome antigo' }),
    ]

    montar()

    await waitFor(() =>
      expect(remoto.fechamentos[0]).toMatchObject({
        profissionalNome: 'Cleiton',
      }),
    )
    expect(remoto.fechamentos).toHaveLength(1)
  })

  it('envio parcial não trava a integração: a pendência segue para a próxima carga', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    marcarComoSincronizado(CHAVE_CONFIGS, CHAVE_FECHAMENTOS, CHAVE_AUDITORIA)
    localStorage.setItem(CHAVE_FECHAMENTOS, JSON.stringify([fechamento()]))
    remoto.parcial = true

    const primeira = montar()
    await waitFor(() => expect(ctx.fechamentos).toHaveLength(1))
    expect(remoto.fechamentos).toHaveLength(0)

    primeira.unmount()
    remoto.parcial = false
    montar()

    await waitFor(() => expect(remoto.fechamentos).toHaveLength(1))
    expect(remoto.fechamentos).toHaveLength(1)
    aviso.mockRestore()
  })
})
