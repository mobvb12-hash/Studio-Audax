import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ServicosProvider, useServicos } from './store'
import type { Servico } from './types'

const CHAVE = 'studio-audax:servicos:v1'

let ctx: ReturnType<typeof useServicos>

function Captura() {
  const valor = useServicos()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function Tela() {
  const { servicos, adicionar, atualizar, remover } = useServicos()
  const alvo = servicos.find((s) => s.nome === 'Pezinho')
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(servicos)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({ nome: 'Pezinho', preco: 25, duracaoMin: 20 })
        }
      >
        criar
      </button>
      {alvo && (
        <>
          <button
            type="button"
            onClick={() =>
              atualizar(alvo.id, {
                nome: alvo.nome,
                preco: 85,
                duracaoMin: 45,
              })
            }
          >
            editar
          </button>
          <button type="button" onClick={() => remover(alvo.id)}>
            excluir
          </button>
        </>
      )}
    </div>
  )
}

function lerLista(): Servico[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <ServicosProvider>
      <Captura />
      <Tela />
    </ServicosProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useServicos>
})

describe('Serviços — store', () => {
  it('instalação nova inicia com os serviços do catálogo', () => {
    montar()
    const lista = lerLista()
    expect(lista.length).toBeGreaterThan(0)
    expect(lista.map((s) => s.nome)).toContain('Corte Degradê')
    const corte = lista.find((s) => s.nome === 'Corte Degradê')
    expect(corte?.preco).toBe(70)
    expect(corte?.duracaoMin).toBe(40)
  })

  it('cria serviço com nome, preço e duração e grava no localStorage', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    const novo = lerLista().find((s) => s.nome === 'Pezinho')
    expect(novo).toBeTruthy()
    expect(novo?.preco).toBe(25)
    expect(novo?.duracaoMin).toBe(20)

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage.find((s: Servico) => s.nome === 'Pezinho')?.preco).toBe(25)
  })

  it('edita preço e duração (reflete em novos agendamentos)', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('editar'))
    const alvo = lerLista().find((s) => s.nome === 'Pezinho')
    expect(alvo?.preco).toBe(85)
    expect(alvo?.duracaoMin).toBe(45)

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage.find((s: Servico) => s.nome === 'Pezinho')?.duracaoMin).toBe(
      45,
    )
  })

  it('exclui serviço (exclusão onde permitido)', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    const antes = lerLista().length
    fireEvent.click(screen.getByText('excluir'))
    expect(lerLista()).toHaveLength(antes - 1)
  })

  it('simula F5: dados continuam corretos ao reabrir o sistema', () => {
    const primeiro = montar()
    fireEvent.click(screen.getByText('criar'))
    primeiro.unmount()

    montar()
    const novo = lerLista().find((s) => s.nome === 'Pezinho')
    expect(novo).toBeTruthy()
    expect(novo?.preco).toBe(25)
    // catálogo original preservado
    expect(lerLista().map((s) => s.nome)).toContain('Corte Degradê')
  })

  it('rejeita serviço duplicado por nome', () => {
    montar()
    expect(() =>
      ctx.adicionar({ nome: 'corte degradê', preco: 60, duracaoMin: 30 }),
    ).toThrow(/Já existe um serviço com este nome/)

    act(() => {
      ctx.adicionar({ nome: 'Pezinho', preco: 25, duracaoMin: 20 })
    })
    expect(() =>
      ctx.adicionar({ nome: 'Pezinho', preco: 30, duracaoMin: 15 }),
    ).toThrow(/Já existe um serviço com este nome/)
    expect(ctx.servicos.filter((s) => s.nome === 'Pezinho')).toHaveLength(1)
  })
})
