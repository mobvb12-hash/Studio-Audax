import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda, { type SlotAgendamento } from './Agenda'

const DIA = hojeISO()
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_BLK = 'studio-audax:bloqueios:v1'

type Semente = {
  id: string
  cliente: string
  profissional: string
  horario: string
  status?: string
}

function semearAgendamentos(lista: Semente[]) {
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify(
      lista.map((s) => ({
        id: s.id,
        cliente: s.cliente,
        telefone: '',
        servico: 'Corte Degradê',
        profissional: s.profissional,
        data: DIA,
        horario: s.horario,
        status: s.status ?? 'confirmado',
        observacao: '',
        criadoEm: '2026-09-01T00:00:00.000Z',
        duracaoMin: 40,
      })),
    ),
  )
}

function semearBloqueio() {
  localStorage.setItem(
    CHAVE_BLK,
    JSON.stringify([
      {
        id: 'blk-1',
        profissional: 'Audax',
        data: DIA,
        inicio: '11:30',
        fim: '12:00',
        tipo: 'folga',
        motivo: 'viagem',
        criadoEm: '2026-09-01T00:00:00.000Z',
      },
    ]),
  )
}

let ctxCaixa: ReturnType<typeof useCaixa>

function Captura() {
  const caixa = useCaixa()
  useEffect(() => {
    ctxCaixa = caixa
  })
  return null
}

/** Reproduz a navegação do App: clique na grade abre o NovoAgendamentoModal */
function AppAgenda() {
  const [inicial, setInicial] = useState<SlotAgendamento | null>(null)
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Agenda
        onNovo={(slot) => {
          setInicial(slot ?? null)
          setAberto(true)
        }}
      />
      {aberto && (
        <NovoAgendamentoModal
          dataInicial={inicial?.data}
          horarioInicial={inicial?.horario}
          profissionalInicial={inicial?.profissional}
          onFechar={() => setAberto(false)}
        />
      )}
    </>
  )
}

function montar() {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <Captura />
              <AppAgenda />
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function lerAgendamentos() {
  return JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
})

describe('Integração Agenda → NovoAgendamentoModal', () => {
  it('conflito de horário é recusado e o modal permanece aberto', () => {
    semearAgendamentos([
      { id: 'ag-1', cliente: 'Lucas Mendes', profissional: 'Audax', horario: '10:00' },
    ])
    montar()
    fireEvent.click(screen.getByLabelText('Agendar 10:30 com Audax'))
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Bruno Dias' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))

    expect(screen.getByText(/Conflito:/)).toBeTruthy()
    expect(screen.getByText(/ocupa 10:00–10:40/)).toBeTruthy()
    expect(screen.getByText('Novo agendamento')).toBeTruthy()
    expect(lerAgendamentos()).toHaveLength(1)
  })

  it('serviço longo que cruza o almoço é recusado', () => {
    montar()
    fireEvent.click(screen.getByLabelText('Agendar 11:00 com Audax'))
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Bruno Dias' },
    })
    fireEvent.change(screen.getByLabelText('Serviço'), {
      target: { value: 'Platinado / Luzes' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))

    expect(screen.getByText(/almoço/)).toBeTruthy()
    expect(screen.getByText('Novo agendamento')).toBeTruthy()
    expect(lerAgendamentos()).toHaveLength(0)
  })

  it('horário coberto por bloqueio é recusado', () => {
    semearBloqueio()
    montar()
    fireEvent.click(screen.getByLabelText('Agendar 11:00 com Audax'))
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Bruno Dias' },
    })
    fireEvent.change(screen.getByLabelText('Serviço'), {
      target: { value: 'Corte Degradê' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))

    expect(
      screen.getByText(/Horário bloqueado: Folga — viagem/),
    ).toBeTruthy()
    expect(lerAgendamentos()).toHaveLength(0)
  })
})

describe('Integração status → horário liberado', () => {
  it('cancelar pela interface libera o horário para novo agendamento', () => {
    semearAgendamentos([
      { id: 'ag-1', cliente: 'Lucas Mendes', profissional: 'Audax', horario: '10:00' },
    ])
    montar()
    fireEvent.click(screen.getByText('Lucas Mendes'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(lerAgendamentos()[0].status).toBe('cancelado')

    fireEvent.click(screen.getByLabelText('Agendar 10:00 com Audax'))
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Bruno Dias' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))

    const lista = lerAgendamentos()
    expect(lista).toHaveLength(2)
    expect(
      lista.filter(
        (a: { horario: string; status: string }) =>
          a.horario === '10:00' && a.status !== 'cancelado',
      ),
    ).toHaveLength(1)
    expect(screen.queryByText('Novo agendamento')).toBeNull()
  })
})

describe('Integração remarcação pela interface', () => {
  it('recusa remarcar para horário ocupado sem alterar nada', () => {
    semearAgendamentos([
      { id: 'ag-1', cliente: 'Lucas Mendes', profissional: 'Audax', horario: '10:00' },
      { id: 'ag-2', cliente: 'Carla Lima', profissional: 'Audax', horario: '11:00' },
    ])
    montar()
    fireEvent.click(screen.getByText('Lucas Mendes'))
    fireEvent.click(screen.getByText('Remarcar'))
    fireEvent.click(screen.getByRole('button', { name: '11:00' }))
    fireEvent.click(screen.getByText('Confirmar remarcação'))

    expect(screen.getByText(/Conflito:/)).toBeTruthy()
    expect(screen.getByText('Remarcar agendamento')).toBeTruthy()
    const lista = lerAgendamentos()
    expect(lista.find((a: { id: string }) => a.id === 'ag-1').horario).toBe(
      '10:00',
    )
    expect(lista.find((a: { id: string }) => a.id === 'ag-1').remarcacoes)
      .toBeUndefined()
  })

  it('agendamento pago não oferece remarcação nem exclusão', () => {
    semearAgendamentos([
      { id: 'ag-1', cliente: 'Lucas Mendes', profissional: 'Audax', horario: '10:00' },
    ])
    montar()
    act(() => {
      ctxCaixa.registrarPagamento({
        agendamentoId: 'ag-1',
        data: DIA,
        hora: '10:00',
        cliente: 'Lucas Mendes',
        profissional: 'Audax',
        servico: 'Corte Degradê',
        valor: 70,
        desconto: 0,
        formaPagamento: 'pix',
        statusAgendamento: 'confirmado',
      })
    })

    fireEvent.click(screen.getByText('Lucas Mendes'))
    expect(screen.getByText('Pago')).toBeTruthy()
    expect(screen.queryByText('Remarcar')).toBeNull()
    expect(screen.queryByText('Excluir')).toBeNull()
    expect(
      screen.getByText('Pagamento registrado — opções liberadas apenas no Caixa'),
    ).toBeTruthy()
  })
})

describe('Integração do usoAgenda com a grade', () => {
  it('agendamento criado pelo modal aparece na grade no mesmo horário', () => {
    montar()
    fireEvent.click(screen.getByLabelText('Agendar 14:00 com Diego'))
    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Bruno Dias' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))

    expect(screen.getByText('Bruno Dias')).toBeTruthy()
    const lista = lerAgendamentos()
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      cliente: 'Bruno Dias',
      profissional: 'Diego',
      horario: '14:00',
      status: 'pendente',
      servico: 'Barba',
      duracaoMin: 30,
    })
  })
})
