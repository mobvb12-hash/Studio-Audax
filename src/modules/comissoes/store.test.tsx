import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ComissoesProvider, useComissoes } from './store'
import type { ComissoesContexto } from './store'

const CHAVE_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_FECH = 'studio-audax:comissoes:fechamentos:v1'
const CHAVE_AUD = 'studio-audax:comissoes:auditoria:v1'

const PERIODO = { inicio: '2026-09-01', fim: '2026-09-30' }

let ctx: ComissoesContexto

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

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ComissoesContexto
})

describe('Comissões — configuração', () => {
  it('padrão é 40% ativo quando não existe configuração', () => {
    montar()
    const config = ctx.configDe('prof-1')
    expect(config.percentual).toBe(40)
    expect(config.ativo).toBe(true)
  })

  it('altera percentual e ativo e persiste no localStorage', () => {
    montar()
    act(() => {
      ctx.salvarConfig('prof-1', { percentual: 50, ativo: false })
    })
    expect(ctx.configDe('prof-1').percentual).toBe(50)
    expect(ctx.configDe('prof-1').ativo).toBe(false)
    const noStorage = JSON.parse(localStorage.getItem(CHAVE_CONFIGS) ?? '[]')
    expect(noStorage[0].percentual).toBe(50)
    expect(noStorage[0].ativo).toBe(false)
  })

  it('valida percentual negativo e maior que 100', () => {
    montar()
    expect(() =>
      ctx.salvarConfig('prof-1', { percentual: -1, ativo: true }),
    ).toThrow(/inválido/)
    expect(() =>
      ctx.salvarConfig('prof-1', { percentual: 101, ativo: true }),
    ).toThrow(/100/)
    expect(() => ctx.salvarConfig('', { percentual: 40, ativo: true })).toThrow(
      /identificação/,
    )
  })
})

describe('Comissões — fechamento', () => {
  function fechar(percentual = 40) {
    act(() => {
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: PERIODO,
        qtdAtendimentos: 3,
        producao: 180,
        percentual,
        comissao: (180 * percentual) / 100,
      })
    })
  }

  it('fecha a comissão com snapshot e auditoria', () => {
    montar()
    fechar()
    expect(ctx.fechamentos).toHaveLength(1)
    expect(ctx.fechamentos[0].comissao).toBe(72)
    expect(ctx.fechamentos[0].producao).toBe(180)
    expect(ctx.fechamentos[0].fechadoEm).toBeTruthy()
    expect(ctx.fechamentoAtivo('prof-1', PERIODO)).toBeTruthy()
    expect(ctx.auditoria).toHaveLength(1)
    expect(ctx.auditoria[0].acao).toBe('fechamento')
    expect(JSON.parse(localStorage.getItem(CHAVE_FECH) ?? '[]')).toHaveLength(1)
  })

  it('impede fechamento duplicado do mesmo período', () => {
    montar()
    fechar()
    expect(() =>
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: PERIODO,
        qtdAtendimentos: 2,
        producao: 100,
        percentual: 40,
        comissao: 40,
      }),
    ).toThrow(/já existe comissão fechada/i)
    expect(ctx.fechamentos).toHaveLength(1)
  })

  it('valida valores: produção/comissão negativa e percentual inválido', () => {
    montar()
    expect(() =>
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: PERIODO,
        qtdAtendimentos: 0,
        producao: -10,
        percentual: 40,
        comissao: 0,
      }),
    ).toThrow(/produção/i)
    expect(() =>
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: PERIODO,
        qtdAtendimentos: 0,
        producao: 10,
        percentual: 120,
        comissao: 0,
      }),
    ).toThrow(/percentual/i)
    expect(() =>
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: PERIODO,
        qtdAtendimentos: 0,
        producao: 10,
        percentual: 40,
        comissao: -1,
      }),
    ).toThrow(/comissão/i)
    expect(() =>
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: { inicio: '2026-10-01', fim: '2026-09-01' },
        qtdAtendimentos: 0,
        producao: 10,
        percentual: 40,
        comissao: 4,
      }),
    ).toThrow(/período/i)
    expect(ctx.fechamentos).toHaveLength(0)
  })

  it('reabertura exige motivo, preserva histórico e gera novo fechamento', () => {
    montar()
    fechar()
    const id = ctx.fechamentos[0].id

    expect(() => act(() => ctx.reabrirComissao(id, ''))).toThrow(/motivo/)
    act(() => {
      ctx.reabrirComissao(id, 'correção de pagamento')
    })

    expect(ctx.fechamentos[0].reaberto?.motivo).toBe('correção de pagamento')
    expect(ctx.fechamentoAtivo('prof-1', PERIODO)).toBeUndefined()
    expect(ctx.auditoria.some((a) => a.acao === 'reabertura')).toBe(true)

    // novo fechamento liberado após reabertura; histórico original preservado
    fechar(50)
    expect(ctx.fechamentos).toHaveLength(2)
    expect(ctx.fechamentos[0].percentual).toBe(40)
    expect(ctx.fechamentos[1].percentual).toBe(50)
    expect(() => act(() => ctx.reabrirComissao(id, 'de novo'))).toThrow(
      /já foi reaberta/,
    )
    expect(
      JSON.parse(localStorage.getItem(CHAVE_AUD) ?? '[]'),
    ).toHaveLength(3)
  })

  it('mantém configs, fechamentos e auditoria após F5', () => {
    const primeiro = montar()
    act(() => {
      ctx.salvarConfig('prof-1', { percentual: 45, ativo: true })
    })
    act(() => {
      ctx.fecharComissao({
        profissionalId: 'prof-1',
        profissionalNome: 'Audax',
        periodo: PERIODO,
        qtdAtendimentos: 3,
        producao: 180,
        percentual: 45,
        comissao: 81,
      })
    })
    primeiro.unmount()

    montar()
    expect(ctx.configDe('prof-1').percentual).toBe(45)
    expect(ctx.fechamentos).toHaveLength(1)
    expect(ctx.fechamentos[0].comissao).toBe(81)
    expect(ctx.auditoria).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(CHAVE_CONFIGS) ?? '[]')).toHaveLength(1)
  })
})
