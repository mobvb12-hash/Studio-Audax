import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ServicosProvider, useServicos } from './store'
import type { Servico } from './types'

const CHAVE = 'studio-audax:servicos:v1'

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
      <Tela />
    </ServicosProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
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
})
