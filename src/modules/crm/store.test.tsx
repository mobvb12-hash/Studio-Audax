import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CrmProvider, useCrm } from './store'
import type { Interacao } from './types'

const CHAVE = 'studio-audax:crm:v1'

let ctx: ReturnType<typeof useCrm>

function Captura() {
  const crm = useCrm()
  useEffect(() => {
    ctx = crm
  })
  return null
}

function montar() {
  return render(
    <CrmProvider>
      <Captura />
    </CrmProvider>,
  )
}

function lerLista(): Interacao[] {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useCrm>
})

describe('CRM store — interações', () => {
  it('adiciona interação, normaliza e persiste no localStorage', () => {
    montar()
    let nova: Interacao | undefined
    act(() => {
      nova = ctx.adicionarInteracao({
        clienteId: 'c-1',
        texto: '  Cliente pediu contato no WhatsApp.  ',
      })
    })
    expect(nova?.texto).toBe('Cliente pediu contato no WhatsApp.')
    expect(nova?.tipo).toBe('nota')
    expect(nova?.clienteId).toBe('c-1')

    const salvo = lerLista()
    expect(salvo).toHaveLength(1)
    expect(salvo[0].texto).toBe('Cliente pediu contato no WhatsApp.')
  })

  it('aceita tipos diferentes de interação', () => {
    montar()
    act(() => {
      ctx.adicionarInteracao({ clienteId: 'c-1', tipo: 'ligacao', texto: 'Ligou para remarcar' })
      ctx.adicionarInteracao({ clienteId: 'c-1', tipo: 'presencial', texto: 'Elogiou o corte' })
    })
    expect(ctx.interacoes.map((i) => i.tipo)).toEqual(['presencial', 'ligacao'])
  })

  it('valida antes de gravar: texto curto e cliente ausente', () => {
    montar()
    expect(() =>
      ctx.adicionarInteracao({ clienteId: 'c-1', texto: '  ' }),
    ).toThrow('Informe a interação (mínimo 3 letras).')
    expect(() =>
      ctx.adicionarInteracao({ clienteId: '', texto: 'Texto válido aqui' }),
    ).toThrow('Selecione um cliente para registrar a interação.')
    expect(ctx.interacoes).toHaveLength(0)
    expect(lerLista()).toHaveLength(0)
  })

  it('interacoesDoCliente devolve apenas as do cliente, mais recentes primeiro', () => {
    montar()
    act(() => {
      ctx.adicionarInteracao({ clienteId: 'c-1', texto: 'Primeira nota' })
      ctx.adicionarInteracao({ clienteId: 'c-2', texto: 'Nota do outro' })
      ctx.adicionarInteracao({ clienteId: 'c-1', texto: 'Segunda nota' })
    })
    expect(
      ctx.interacoesDoCliente('c-1').map((i) => i.texto),
    ).toEqual(['Segunda nota', 'Primeira nota'])
    expect(ctx.interacoesDoCliente('c-2')).toHaveLength(1)
    expect(ctx.interacoesDoCliente('c-3')).toHaveLength(0)
  })

  it('histórico é preservado entre sessões (simula F5)', () => {
    montar()
    act(() => {
      ctx.adicionarInteracao({ clienteId: 'c-1', texto: 'Sobrevive ao reload' })
    })
    ctx = undefined as unknown as ReturnType<typeof useCrm>
    montar()
    expect(ctx.interacoes).toHaveLength(1)
    expect(ctx.interacoes[0].texto).toBe('Sobrevive ao reload')
  })

  it('migra registros antigos sem apagar nada', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([{ id: 'i-1', clienteId: 'c-1', texto: 'Nota antiga' }]),
    )
    montar()
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].tipo).toBe('nota')
    expect(lista[0].criadoEm).toBeTruthy()
    expect(ctx.interacoes[0].texto).toBe('Nota antiga')
  })
})
