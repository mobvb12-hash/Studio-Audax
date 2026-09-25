import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NovoAgendamentoModal from './NovoAgendamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'

const CHAVE_AG = 'studio-audax:agendamentos:v1'
const DIA = '2026-09-25'

function semear(horario: string, profissional = 'Audax') {
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify([
      {
        id: 'ag-existente',
        cliente: 'Lucas Mendes',
        telefone: '',
        servico: 'Corte Degradê',
        profissional,
        data: DIA,
        horario,
        status: 'confirmado',
        observacao: '',
        criadoEm: '2026-09-01T00:00:00.000Z',
      },
    ]),
  )
}

function montar(horarioInicial = '10:30', profissionalInicial = 'Audax') {
  const onFechar = vi.fn()
  render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <NovoAgendamentoModal
              dataInicial={DIA}
              horarioInicial={horarioInicial}
              profissionalInicial={profissionalInicial}
              onFechar={onFechar}
            />
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
  return onFechar
}

beforeEach(() => {
  localStorage.clear()
})

describe('NovoAgendamentoModal — conflito de horários', () => {
  it('bloqueia sobreposição parcial (10:00 de 40min + 10:30)', () => {
    semear('10:00')
    const onFechar = montar('10:30')
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(screen.getByText(/Conflito:/)).toBeTruthy()
    expect(screen.getByText(/10:00–10:40/)).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
  })

  it('profissional diferente no mesmo horário não conflita', () => {
    semear('10:30', 'Audax')
    const onFechar = montar('10:30', 'Diego')
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(screen.queryByText(/Conflito:/)).toBeNull()
    expect(onFechar).toHaveBeenCalledTimes(1)
  })

  it('horário livre salva normalmente', () => {
    semear('10:00')
    const onFechar = montar('14:00')
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(screen.queryByText(/Conflito:/)).toBeNull()
    expect(onFechar).toHaveBeenCalledTimes(1)
    const lista = JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
    expect(lista).toHaveLength(2)
    expect(lista[1].cliente).toBe('Ana Souza')
  })

  it('valida nome do cliente antes de salvar', () => {
    semear('10:00')
    const onFechar = montar('14:00')
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(screen.getByText('Informe o nome do cliente.')).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
  })
})

describe('NovoAgendamentoModal — cliente duplicado no horário', () => {
  it('bloqueia mesmo cliente no mesmo horário mesmo com profissional diferente', () => {
    semear('10:00', 'Audax')
    const onFechar = montar('10:00', 'Diego')
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'lucas mendes' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(
      screen.getByText(/Cliente já tem agendamento neste horário/),
    ).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
  })

  it('cliente diferente no mesmo horário salva normalmente', () => {
    semear('10:00', 'Audax')
    const onFechar = montar('10:00', 'Diego')
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(onFechar).toHaveBeenCalledTimes(1)
    const lista = JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
    expect(lista).toHaveLength(2)
  })
})
