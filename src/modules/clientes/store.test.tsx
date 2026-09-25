import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ClientesProvider, useClientes } from './store'
import type { Cliente } from './types'

const CHAVE = 'studio-audax:clientes:v1'

let ctx: ReturnType<typeof useClientes>

function Captura() {
  const valor = useClientes()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function Tela() {
  const { clientes, adicionar, atualizar, remover } = useClientes()
  const primeiro = clientes[0]
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(clientes)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            nome: 'Lucas Mendes',
            telefone: '(11) 98888-7777',
            email: 'lucas@email.com',
            observacao: '',
          })
        }
      >
        criar
      </button>
      {primeiro && (
        <>
          <button
            type="button"
            onClick={() =>
              atualizar(primeiro.id, {
                nome: 'Lucas Mendes',
                telefone: '(11) 90000-1111',
                email: 'editado@email.com',
                observacao: 'cliente fixo',
              })
            }
          >
            editar
          </button>
          <button type="button" onClick={() => remover(primeiro.id)}>
            excluir
          </button>
        </>
      )}
    </div>
  )
}

function lerLista(): Cliente[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <ClientesProvider>
      <Captura />
      <Tela />
    </ClientesProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useClientes>
})

describe('Clientes — store', () => {
  it('cria cliente com telefone, e-mail e observação', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].nome).toBe('Lucas Mendes')
    expect(lista[0].telefone).toBe('(11) 98888-7777')
    expect(lista[0].email).toBe('lucas@email.com')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage).toHaveLength(1)
    expect(noStorage[0].nome).toBe('Lucas Mendes')
  })

  it('edita telefone, e-mail e observação', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('editar'))
    const salvo = lerLista()[0]
    expect(salvo.telefone).toBe('(11) 90000-1111')
    expect(salvo.email).toBe('editado@email.com')
    expect(salvo.observacao).toBe('cliente fixo')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage[0].telefone).toBe('(11) 90000-1111')
  })

  it('exclui cliente (exclusão onde permitido)', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('excluir'))
    expect(lerLista()).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')).toHaveLength(0)
  })

  it('simula F5: dados continuam corretos ao reabrir o sistema', () => {
    const primeiro = montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('editar'))
    primeiro.unmount()

    montar()
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].telefone).toBe('(11) 90000-1111')
    expect(lista[0].email).toBe('editado@email.com')
  })

  it('rejeita cliente duplicado por nome e por telefone', () => {
    montar()
    act(() => {
      ctx.adicionar({
        nome: 'Lucas Mendes',
        telefone: '(11) 98888-7777',
        email: '',
        observacao: '',
      })
    })
    expect(() =>
      ctx.adicionar({
        nome: 'lucas mendes',
        telefone: '(11) 90000-0000',
        email: '',
        observacao: '',
      }),
    ).toThrow(/Já existe um cliente com este nome/)
    expect(ctx.clientes).toHaveLength(1)

    expect(() =>
      ctx.adicionar({
        nome: 'Ana Dias',
        telefone: '(11) 98888-7777',
        email: '',
        observacao: '',
      }),
    ).toThrow(/Já existe um cliente com este telefone/)
    expect(ctx.clientes).toHaveLength(1)
  })
})
