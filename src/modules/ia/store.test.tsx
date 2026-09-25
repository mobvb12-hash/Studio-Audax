import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { IaProvider, useIa } from './store'

const CHAVE = 'studio-audax:ia:v1'

let ctx: ReturnType<typeof useIa>

function Captura() {
  const ia = useIa()
  useEffect(() => {
    ctx = ia
  })
  return null
}

function montar() {
  return render(
    <IaProvider>
      <Captura />
    </IaProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useIa>
})

describe('IA store — aceitas e descartadas', () => {
  it('começa vazio e persiste marações', () => {
    montar()
    expect(ctx.aceitas).toEqual([])
    expect(ctx.descartadas).toEqual([])

    act(() => {
      ctx.marcarAceita('reativacao:c-ana')
    })
    expect(ctx.aceitas).toEqual(['reativacao:c-ana'])
    expect(ctx.tratada('reativacao:c-ana')).toBe(true)
    expect(ctx.tratada('oportunidade:c-bruno')).toBe(false)

    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '{}')
    expect(salvo.aceitas).toEqual(['reativacao:c-ana'])
  })

  it('não duplica marcações repetidas', () => {
    montar()
    act(() => {
      ctx.marcarAceita('sug-1')
      ctx.marcarAceita('sug-1')
      ctx.marcarDescartada('sug-2')
      ctx.marcarDescartada('sug-2')
    })
    expect(ctx.aceitas).toEqual(['sug-1'])
    expect(ctx.descartadas).toEqual(['sug-2'])
  })

  it('confirmar depois de descartar move a sugestão entre as listas', () => {
    montar()
    act(() => {
      ctx.marcarDescartada('sug-1')
    })
    act(() => {
      ctx.marcarAceita('sug-1')
    })
    expect(ctx.aceitas).toEqual(['sug-1'])
    expect(ctx.descartadas).toEqual([])
  })

  it('sobrevive ao reload (simula F5)', () => {
    montar()
    act(() => {
      ctx.marcarAceita('sug-1')
      ctx.marcarDescartada('sug-2')
    })
    ctx = undefined as unknown as ReturnType<typeof useIa>
    montar()
    expect(ctx.aceitas).toEqual(['sug-1'])
    expect(ctx.descartadas).toEqual(['sug-2'])
  })

  it('migra dados corrompidos sem quebrar (não-array vira vazio)', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify({ aceitas: 'nada', descartadas: [1, 'ok', null] }),
    )
    montar()
    expect(ctx.aceitas).toEqual([])
    expect(ctx.descartadas).toEqual(['ok'])
  })
})
