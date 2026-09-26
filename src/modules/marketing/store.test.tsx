import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MarketingProvider, useMarketing } from './store'
import type { ListaPublico } from './types'

const CHAVE = 'studio-audax:marketing:v1'

let ctx: ReturnType<typeof useMarketing>

function Captura() {
  const marketing = useMarketing()
  useEffect(() => {
    ctx = marketing
  })
  return null
}

function montar() {
  return render(
    <MarketingProvider>
      <Captura />
    </MarketingProvider>,
  )
}

function lerListas(): ListaPublico[] {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useMarketing>
})

describe('Marketing store — listas de público', () => {
  it('cria lista com público e persiste no localStorage', () => {
    montar()
    let nova: ListaPublico | undefined
    act(() => {
      nova = ctx.criarLista({ nome: '  Reativação setembro  ', publico: 'inativos' })
    })
    expect(nova?.nome).toBe('Reativação setembro')
    expect(nova?.publico).toBe('inativos')
    expect(ctx.listas).toHaveLength(1)

    const salvo = lerListas()
    expect(salvo).toHaveLength(1)
    expect(salvo[0].nome).toBe('Reativação setembro')
  })

  it('valida nome curto e público inválido antes de gravar', () => {
    montar()
    expect(() => ctx.criarLista({ nome: 'ab', publico: 'inativos' })).toThrow(
      'Informe um nome para a lista (mínimo 3 letras).',
    )
    expect(() =>
      ctx.criarLista({ nome: 'Lista válida', publico: 'xxx' as never }),
    ).toThrow('Público inválido.')
    expect(ctx.listas).toHaveLength(0)
    expect(lerListas()).toHaveLength(0)
  })

  it('nome repetido (ignorando maiúsculas) é recusado', () => {
    montar()
    act(() => {
      ctx.criarLista({ nome: 'Reativação', publico: 'inativos' })
    })
    expect(() =>
      ctx.criarLista({ nome: 'reativação', publico: 'sem_retorno' }),
    ).toThrow('Já existe uma lista com este nome.')
    expect(ctx.listas).toHaveLength(1)
  })

  it('remove lista e o dado sobrevive ao reload (simula F5)', () => {
    montar()
    act(() => {
      ctx.criarLista({ nome: 'Aniversários do mês', publico: 'aniversariantes' })
    })
    ctx = undefined as unknown as ReturnType<typeof useMarketing>
    montar()
    expect(ctx.listas).toHaveLength(1)

    act(() => {
      ctx.removerLista(ctx.listas[0].id)
    })
    expect(ctx.listas).toHaveLength(0)
    expect(lerListas()).toHaveLength(0)
  })
})
