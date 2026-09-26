import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EditarAgendamentoModal from './EditarAgendamentoModal'
import { AgendaProvider } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'

const CHAVE_AG = 'studio-audax:agendamentos:v1'
const DIA = '2026-09-25'

function criarAg(extra: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'ag-1',
    cliente: 'Lucas Mendes',
    telefone: '(11) 98888-7777',
    servico: 'Corte Degradê',
    profissional: 'Cleiton Silva',
    data: DIA,
    horario: '10:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    duracaoMin: 40,
    ...extra,
  }
}

function semear(lista: Agendamento[]) {
  localStorage.setItem(CHAVE_AG, JSON.stringify(lista))
}

function montar(ag: Agendamento) {
  const onFechar = vi.fn()
  render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <EditarAgendamentoModal agendamento={ag} onFechar={onFechar} />
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
  return onFechar
}

function lerStorage(): Agendamento[] {
  return JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
})

describe('EditarAgendamentoModal — edição de campos', () => {
  it('edita cliente, telefone, serviço e observação preservando o resto', () => {
    const ag = criarAg()
    semear([ag])
    const onFechar = montar(ag)

    expect(screen.getByText('Editar agendamento')).toBeTruthy()
    expect(
      screen.getByText(/Lucas Mendes · .* às 10:00 com Cleiton Silva/),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.change(screen.getByLabelText('Telefone / WhatsApp'), {
      target: { value: '(11) 90000-0000' },
    })
    fireEvent.change(screen.getByLabelText('Serviço'), {
      target: { value: 'Barba' },
    })
    fireEvent.change(screen.getByLabelText('Observação'), {
      target: { value: 'prefere máquina baixa' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(onFechar).toHaveBeenCalledTimes(1)
    const lista = lerStorage()
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      id: 'ag-1',
      cliente: 'Ana Souza',
      telefone: '(11) 90000-0000',
      servico: 'Barba',
      duracaoMin: 30,
      observacao: 'prefere máquina baixa',
      status: 'confirmado',
      data: DIA,
      horario: '10:00',
      profissional: 'Cleiton Silva',
    })
  })

  it('recusa nome de cliente muito curto sem salvar', () => {
    const ag = criarAg()
    semear([ag])
    const onFechar = montar(ag)

    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'A' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(screen.getByText('Informe o nome do cliente.')).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
    expect(lerStorage()[0].cliente).toBe('Lucas Mendes')
  })

  it('serviço fora do catálogo segue disponível e a duração registrada é preservada', () => {
    const ag = criarAg({ servico: 'Corte Antigo', duracaoMin: 45 })
    semear([ag])
    const onFechar = montar(ag)

    expect(
      screen.getByRole('option', { name: 'Corte Antigo (fora do catálogo)' }),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Bruno Dias' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(onFechar).toHaveBeenCalledTimes(1)
    const lista = lerStorage()
    expect(lista[0].servico).toBe('Corte Antigo')
    expect(lista[0].duracaoMin).toBe(45)
    expect(lista[0].cliente).toBe('Bruno Dias')
  })
})

describe('EditarAgendamentoModal — validação de conflito', () => {
  it('recusa serviço mais longo que invade horário de outro agendamento', () => {
    const primeiro = criarAg()
    const segundo = criarAg({
      id: 'ag-2',
      cliente: 'Carla Lima',
      horario: '10:45',
      servico: 'Barba',
      duracaoMin: 30,
    })
    semear([primeiro, segundo])
    const onFechar = montar(primeiro)

    fireEvent.change(screen.getByLabelText('Serviço'), {
      target: { value: 'Platinado / Luzes' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(screen.getByText(/Conflito:/)).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
    const lista = lerStorage()
    expect(lista.find((a) => a.id === 'ag-1')?.servico).toBe('Corte Degradê')
    expect(lista.find((a) => a.id === 'ag-1')?.duracaoMin).toBe(40)
  })

  it('mesmo serviço sem mudança não gera conflito com o próprio horário', () => {
    const ag = criarAg()
    semear([ag])
    const onFechar = montar(ag)

    fireEvent.change(screen.getByLabelText('Observação'), {
      target: { value: 'observação nova' },
    })
    fireEvent.click(screen.getByText('Salvar alterações'))

    expect(screen.queryByText(/Conflito:/)).toBeNull()
    expect(onFechar).toHaveBeenCalledTimes(1)
    expect(lerStorage()[0].observacao).toBe('observação nova')
  })
})
