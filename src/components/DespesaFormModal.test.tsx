import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import DespesaFormModal from './DespesaFormModal'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'

const DIA = '2026-09-25'

function Captura() {
  const { lancamentos } = useCaixa()
  return (
    <output data-testid="estado">
      {JSON.stringify({
        despesas: lancamentos
          .filter((l) => l.tipo === 'despesa')
          .map((l) => ({ valor: l.valor })),
      })}
    </output>
  )
}

function montar() {
  return render(
    <CaixaProvider>
      <Captura />
      <DespesaFormModal data={DIA} onFechar={() => undefined} />
    </CaixaProvider>,
  )
}

function lerEstado() {
  return JSON.parse(screen.getByTestId('estado').textContent ?? '{}')
}

beforeEach(() => {
  localStorage.clear()
})

describe('DespesaFormModal — anti duplo clique', () => {
  it('duplo clique não duplica despesa no Caixa', () => {
    montar()

    fireEvent.change(screen.getByLabelText('Descrição *'), {
      target: { value: 'Energia elétrica' },
    })
    fireEvent.change(screen.getByLabelText('Valor (R$) *'), {
      target: { value: '250,00' },
    })

    fireEvent.click(screen.getByText('Lançar despesa'))
    fireEvent.click(screen.getByText('Lançar despesa'))

    const estado = lerEstado()
    expect(estado.despesas).toHaveLength(1)
    expect(estado.despesas[0].valor).toBe(250)
  })

  it('cliques rápidos consecutivos continuam registrando uma única despesa', () => {
    montar()

    fireEvent.change(screen.getByLabelText('Descrição *'), {
      target: { value: 'Aluguel' },
    })
    fireEvent.change(screen.getByLabelText('Valor (R$) *'), {
      target: { value: '1500,00' },
    })

    fireEvent.click(screen.getByText('Lançar despesa'))
    fireEvent.click(screen.getByText('Lançar despesa'))
    fireEvent.click(screen.getByText('Lançar despesa'))

    expect(lerEstado().despesas).toHaveLength(1)
  })
})
