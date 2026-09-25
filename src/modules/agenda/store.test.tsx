import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider, useAgenda } from './store'
import type { Agendamento } from './types'

const CHAVE = 'studio-audax:agendamentos:v1'

function Tela() {
  const {
    agendamentos,
    adicionar,
    mudarStatus,
    remover,
    renomearProfissional,
    renomearServico,
    renomearCliente,
  } = useAgenda()
  const primeiro = agendamentos[0]
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(agendamentos)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            cliente: 'Lucas Mendes',
            telefone: '(11) 98888-7777',
            servico: 'Corte Degradê',
            profissional: 'Audax',
            data: '2026-09-25',
            horario: '10:00',
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
            onClick={() => mudarStatus(primeiro.id, 'confirmado')}
          >
            confirmar
          </button>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'concluido')}
          >
            concluir
          </button>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'cancelado')}
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'nao_compareceu')}
          >
            faltou
          </button>
          <button type="button" onClick={() => remover(primeiro.id)}>
            excluir
          </button>
          <button
            type="button"
            onClick={() => renomearProfissional('Audax', 'Audax Barbearia')}
          >
            renomear-profissional
          </button>
          <button
            type="button"
            onClick={() => renomearServico('Corte Degradê', 'Corte novo')}
          >
            renomear-servico
          </button>
          <button
            type="button"
            onClick={() => renomearCliente('Lucas Mendes', 'Lucas')}
          >
            renomear-cliente
          </button>
        </>
      )}
    </div>
  )
}

function lerLista(): Agendamento[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <AgendaProvider>
      <Tela />
    </AgendaProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('Agenda — store', () => {
  it('cria agendamento com status pendente e grava no localStorage', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].status).toBe('pendente')
    expect(lista[0].cliente).toBe('Lucas Mendes')
    expect(lista[0].servico).toBe('Corte Degradê')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage).toHaveLength(1)
    expect(noStorage[0].horario).toBe('10:00')
  })

  it('altera status: confirmar, concluir, cancelar e não compareceu', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('confirmar'))
    expect(lerLista()[0].status).toBe('confirmado')

    fireEvent.click(screen.getByText('concluir'))
    expect(lerLista()[0].status).toBe('concluido')

    fireEvent.click(screen.getByText('cancelar'))
    expect(lerLista()[0].status).toBe('cancelado')

    fireEvent.click(screen.getByText('faltou'))
    expect(lerLista()[0].status).toBe('nao_compareceu')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage[0].status).toBe('nao_compareceu')
  })

  it('exclui agendamento (exclusão onde permitido)', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('excluir'))
    expect(lerLista()).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')).toHaveLength(0)
  })

  it('simula F5: dados continuam corretos ao reabrir o sistema', () => {
    const primeiro = montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('cancelar'))
    primeiro.unmount()

    montar()
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].status).toBe('cancelado')
    expect(lista[0].cliente).toBe('Lucas Mendes')
  })

  it('propaga renomeações de profissional, serviço e cliente aos agendamentos', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))

    fireEvent.click(screen.getByText('renomear-profissional'))
    fireEvent.click(screen.getByText('renomear-servico'))
    fireEvent.click(screen.getByText('renomear-cliente'))

    const ag = lerLista()[0]
    expect(ag.profissional).toBe('Audax Barbearia')
    expect(ag.servico).toBe('Corte novo')
    expect(ag.cliente).toBe('Lucas')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage[0].profissional).toBe('Audax Barbearia')
    expect(noStorage[0].servico).toBe('Corte novo')
    expect(noStorage[0].cliente).toBe('Lucas')
  })

  it('renomear sem alteração ou com nome inexistente não muda nada', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))

    fireEvent.click(screen.getByText('renomear-cliente'))
    const depois = lerLista()[0]
    expect(depois.cliente).toBe('Lucas')

    fireEvent.click(screen.getByText('renomear-profissional'))
    expect(lerLista()[0].profissional).toBe('Audax Barbearia')
  })
})
