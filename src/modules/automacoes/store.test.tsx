import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  avisosPersistencia,
  limparAvisosPersistencia,
} from '@/lib/persistencia'
import { AutomacoesProvider, useAutomacoes } from './store'

const CHAVE = 'studio-audax:automacoes:v1'

let ctx: ReturnType<typeof useAutomacoes>

function Captura() {
  const automacoes = useAutomacoes()
  useEffect(() => {
    ctx = automacoes
  })
  return null
}

function montar() {
  return render(
    <AutomacoesProvider>
      <Captura />
    </AutomacoesProvider>,
  )
}

function gravadas(): string[] {
  const bruto = localStorage.getItem(CHAVE)
  if (!bruto) return []
  return (JSON.parse(bruto) as { tratadas: string[] }).tratadas
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useAutomacoes>
})

afterEach(() => {
  limparAvisosPersistencia()
})

describe('Automações store — trava anti-duplicação', () => {
  it('começa vazio e persiste cada chave tratada', () => {
    montar()
    expect(ctx.tratadas).toEqual([])
    act(() => ctx.marcarTratada('confirmacao:a1'))
    expect(ctx.tratadas).toEqual(['confirmacao:a1'])
    expect(gravadas()).toEqual(['confirmacao:a1'])
  })

  it('é idempotente: repetir a mesma chave não duplica', () => {
    montar()
    act(() => ctx.marcarTratada('lembrete:a1'))
    act(() => ctx.marcarTratada('lembrete:a1'))
    expect(ctx.tratadas).toEqual(['lembrete:a1'])
    expect(gravadas()).toEqual(['lembrete:a1'])
  })

  it('recusa chave vazia com mensagem pronta', () => {
    montar()
    expect(() => ctx.marcarTratada('   ')).toThrow(
      'Informe a chave da automação.',
    )
    expect(ctx.tratadas).toEqual([])
  })

  it('marcarTratadas faz lote ignorando vazias e repetidas', () => {
    montar()
    act(() => ctx.marcarTratadas(['confirmacao:a1', 'aniversario:c1:2026']))
    act(() =>
      ctx.marcarTratadas(['confirmacao:a1', '  ', 'horario_liberado:a1:p1']),
    )
    expect(ctx.tratadas).toEqual([
      'confirmacao:a1',
      'aniversario:c1:2026',
      'horario_liberado:a1:p1',
    ])
    expect(gravadas()).toHaveLength(3)
  })

  it('reabre com as chaves tratadas (sobrevive a reload)', () => {
    const primeiro = montar()
    act(() => ctx.marcarTratada('vencimento_clube:as1:2026-10-05'))
    primeiro.unmount()
    ctx = undefined as unknown as ReturnType<typeof useAutomacoes>
    montar()
    expect(ctx.tratadas).toEqual(['vencimento_clube:as1:2026-10-05'])
  })

  it('dado corrompido vira estado vazio com cópia preservada', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ quebrado: true }))
    montar()
    expect(ctx.tratadas).toEqual([])
    expect(localStorage.getItem(`${CHAVE}:corrompido`)).not.toBeNull()
    expect(avisosPersistencia().length).toBeGreaterThan(0)
  })

  it('fora do provider lança erro claro', () => {
    function Orfao() {
      useAutomacoes()
      return null
    }
    expect(() => render(<Orfao />)).toThrow(
      'useAutomacoes deve ser usado dentro de AutomacoesProvider',
    )
  })
})
