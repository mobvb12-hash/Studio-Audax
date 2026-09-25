import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import PagamentoModal from './PagamentoModal'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ServicosProvider } from '@/modules/servicos/store'

const DIA = '2026-09-25'

const AG: Agendamento = {
  id: 'ag-1',
  cliente: 'Lucas Mendes',
  telefone: '(11) 98888-7777',
  servico: 'Corte Degradê',
  profissional: 'Audax',
  data: DIA,
  horario: '10:00',
  status: 'confirmado',
  observacao: '',
  criadoEm: '2026-09-01T00:00:00.000Z',
}

function Estado() {
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  return (
    <output data-testid="estado">
      {JSON.stringify({
        status: agendamentos[0]?.status ?? 'removido',
        pagamentos: lancamentos.map((l) => ({
          valorLiquido: l.valorLiquido,
          formaPagamento: l.formaPagamento,
        })),
      })}
    </output>
  )
}

function montar(ag = AG, fechado = false) {
  localStorage.setItem('studio-audax:agendamentos:v1', JSON.stringify([ag]))
  if (fechado) {
    localStorage.setItem(
      'studio-audax:caixa:fechamentos:v1',
      JSON.stringify([
        {
          id: 'f1',
          data: DIA,
          fechadoEm: '2026-09-25T23:00:00.000Z',
          resumo: {},
        },
      ]),
    )
  }
  return render(
    <ClientesProvider>
      <ServicosProvider>
        <AgendaProvider>
          <CaixaProvider>
            <Estado />
            <PagamentoModal agendamento={ag} onFechar={() => undefined} />
          </CaixaProvider>
        </AgendaProvider>
      </ServicosProvider>
    </ClientesProvider>,
  )
}

function lerEstado() {
  return JSON.parse(screen.getByTestId('estado').textContent ?? '{}')
}

beforeEach(() => {
  localStorage.clear()
})

describe('PagamentoModal', () => {
  it('registra receita com desconto e muda o status para concluído', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Valor do serviço (R$) *'), {
      target: { value: '70' },
    })
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Forma de pagamento *'), {
      target: { value: 'pix' },
    })
    fireEvent.click(screen.getByText('Receber R$ 60,00'))

    const estado = lerEstado()
    expect(estado.status).toBe('concluido')
    expect(estado.pagamentos).toHaveLength(1)
    expect(estado.pagamentos[0].valorLiquido).toBe(60)
    expect(estado.pagamentos[0].formaPagamento).toBe('pix')
  })

  it('bloqueia desconto maior que o valor do serviço', () => {
    montar()
    fireEvent.change(screen.getByLabelText('Desconto (R$)'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByText('Receber R$ 0,00'))
    expect(
      screen.getByText(/desconto não pode ser maior/),
    ).toBeTruthy()
    expect(lerEstado().pagamentos).toHaveLength(0)
  })

  it('mostra aviso imediato e bloqueia quando o caixa do dia está fechado', () => {
    montar(AG, true)
    expect(
      screen.getByText(/O caixa de 2026-09-25 está fechado/),
    ).toBeTruthy()
    fireEvent.click(screen.getByText('Receber R$ 70,00'))
    expect(lerEstado().pagamentos).toHaveLength(0)
  })

  it('impede pagamento duplicado do mesmo atendimento', () => {
    montar()
    fireEvent.click(screen.getByText('Receber R$ 70,00'))
    expect(lerEstado().pagamentos).toHaveLength(1)

    fireEvent.click(screen.getByText('Receber R$ 70,00'))
    expect(screen.getByText(/já foi pago/)).toBeTruthy()
    expect(lerEstado().pagamentos).toHaveLength(1)
  })
})
