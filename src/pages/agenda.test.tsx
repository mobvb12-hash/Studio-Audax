import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatarDataCurta,
  hojeISO,
  inicioSemana,
} from '@/modules/agenda/catalogo'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda from './Agenda'

const DIA = hojeISO()
const CHAVE_AG = 'studio-audax:agendamentos:v1'
const CHAVE_BLK = 'studio-audax:bloqueios:v1'

function rotuloDia(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const texto = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'short',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

function semearAgendamento() {
  localStorage.setItem(
    CHAVE_AG,
    JSON.stringify([
      {
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
        duracaoMin: 40,
      },
    ]),
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
        inicio: '15:00',
        fim: '17:00',
        tipo: 'folga',
        motivo: 'viagem',
        criadoEm: '2026-09-01T00:00:00.000Z',
      },
    ]),
  )
}

function montar() {
  const onNovo = vi.fn()
  render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <Agenda onNovo={onNovo} />
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
  return onNovo
}

beforeEach(() => {
  localStorage.clear()
})

describe('Agenda — visão dia', () => {
  it('colunas por profissional e clique no horário vazio abre novo', () => {
    const onNovo = montar()
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy()
    expect(screen.getByText('Audax')).toBeTruthy()
    expect(screen.getByText('Diego')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Agendar 10:00 com Audax'))
    expect(onNovo).toHaveBeenCalledWith({
      data: DIA,
      horario: '10:00',
      profissional: 'Audax',
    })
  })

  it('agendamento aparece na grade e detalhe mostra status e ações', () => {
    semearAgendamento()
    montar()
    fireEvent.click(screen.getByText('Lucas Mendes'))
    expect(screen.getByText('Confirmado')).toBeTruthy()
    expect(screen.getByText('Remarcar')).toBeTruthy()
    expect(screen.getByText('Concluir e receber')).toBeTruthy()
    expect(screen.getByText('Cancelar')).toBeTruthy()
  })

  it('célula de bloqueio fica desabilitada só para o profissional afetado', () => {
    semearBloqueio()
    montar()
    expect(screen.getByLabelText('Bloqueado 15:00 com Audax')).toBeTruthy()
    expect(screen.queryByLabelText('Agendar 15:00 com Audax')).toBeNull()
    expect(screen.getByText('Folga — viagem')).toBeTruthy()
    expect(screen.getByLabelText('Agendar 15:00 com Diego')).toBeTruthy()
  })

  it('faixa de almoço segue o expediente configurado', () => {
    montar()
    expect(screen.getByText('Almoço — 12:00 às 13:00')).toBeTruthy()
  })
})

describe('Agenda — visão semana', () => {
  it('alterna para semana com 7 dias e agenda no dia clicado', () => {
    const onNovo = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))

    const segunda = inicioSemana(DIA)
    expect(
      screen.getByText(`${rotuloDia(segunda)} · ${formatarDataCurta(segunda)}`),
    ).toBeTruthy()
    expect(
      screen.getByText(`${rotuloDia(DIA)} · ${formatarDataCurta(DIA)}`),
    ).toBeTruthy()

    fireEvent.click(
      screen.getByLabelText(
        `Agendar 10:00 em ${formatarDataCurta(DIA)}`,
      ),
    )
    expect(onNovo).toHaveBeenCalledWith({
      data: DIA,
      horario: '10:00',
      profissional: 'Audax',
    })
  })

  it('agendamentos e bloqueios aparecem na semana', () => {
    semearAgendamento()
    semearBloqueio()
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()
    expect(screen.getByText(/10:00 · Audax/)).toBeTruthy()
    expect(screen.getByText(/Folga — viagem/)).toBeTruthy()
  })
})

describe('Agenda — modais de expediente e bloqueios', () => {
  it('expediente: valida erro e reflete na grade ao salvar', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Expediente' }))
    expect(screen.getByText('Expediente de trabalho')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Início do expediente *'), {
      target: { value: '21:00' },
    })
    fireEvent.click(screen.getByText('Salvar expediente'))
    expect(
      screen.getByText('O fim do expediente deve ser depois do início.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Início do expediente *'), {
      target: { value: '08:00' },
    })
    fireEvent.change(screen.getByLabelText('Fim do expediente *'), {
      target: { value: '17:00' },
    })
    fireEvent.click(screen.getByText('Salvar expediente'))
    expect(screen.queryByText('Expediente de trabalho')).toBeNull()

    expect(screen.getByText('16:30')).toBeTruthy()
    expect(screen.queryByText('19:30')).toBeNull()
  })

  it('bloqueios: cria pelo formulário e lista o cadastro', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Bloqueios' }))
    expect(screen.getByText('Bloqueios da agenda')).toBeTruthy()
    expect(screen.getByText('Nenhum bloqueio cadastrado.')).toBeTruthy()

    fireEvent.click(screen.getByText('Criar bloqueio'))
    const lista = JSON.parse(localStorage.getItem(CHAVE_BLK) ?? '[]')
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      profissional: 'Audax',
      tipo: 'folga',
      inicio: '08:00',
      fim: '20:00',
    })
    expect(screen.getAllByText('Folga').length).toBeGreaterThan(1)
  })
})

describe('Agenda — remarcação pela interface', () => {
  it('remarcar move o agendamento e preserva o histórico', () => {
    semearAgendamento()
    montar()
    fireEvent.click(screen.getByText('Lucas Mendes'))
    fireEvent.click(screen.getByText('Remarcar'))
    expect(screen.getByText('Remarcar agendamento')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '11:00' }))
    fireEvent.click(screen.getByText('Confirmar remarcação'))
    expect(screen.queryByText('Remarcar agendamento')).toBeNull()

    const lista = JSON.parse(localStorage.getItem(CHAVE_AG) ?? '[]')
    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe('ag-1')
    expect(lista[0].horario).toBe('11:00')
    expect(lista[0].remarcacoes).toHaveLength(1)
    expect(lista[0].remarcacoes[0].de).toMatchObject({
      horario: '10:00',
      profissional: 'Audax',
    })
  })
})
