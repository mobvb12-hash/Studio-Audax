import { fireEvent, render, screen, within } from '@testing-library/react'
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
        profissional: 'Cleiton Silva',
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
        profissional: 'Cleiton Silva',
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
    expect(screen.getByText('Cleiton Silva')).toBeTruthy()
    expect(screen.getByText('Ítalo Santos')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Agendar 10:00 com Cleiton Silva'))
    expect(onNovo).toHaveBeenCalledWith({
      data: DIA,
      horario: '10:00',
      profissional: 'Cleiton Silva',
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
    expect(screen.getByLabelText('Bloqueado 15:00 com Cleiton Silva')).toBeTruthy()
    expect(screen.queryByLabelText('Agendar 15:00 com Cleiton Silva')).toBeNull()
    expect(screen.getByText('Folga — viagem')).toBeTruthy()
    expect(screen.getByLabelText('Agendar 15:00 com Ítalo Santos')).toBeTruthy()
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
      profissional: 'Cleiton Silva',
    })
  })

  it('agendamentos e bloqueios aparecem na semana', () => {
    semearAgendamento()
    semearBloqueio()
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(screen.getByText('Lucas Mendes')).toBeTruthy()
    expect(screen.getByText(/10:00 · Cleiton Silva/)).toBeTruthy()
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
      profissional: 'Cleiton Silva',
      tipo: 'folga',
      inicio: '08:00',
      fim: '20:00',
    })
    expect(screen.getAllByText('Folga').length).toBeGreaterThan(1)
  })

  // Auditoria F18: o modal fica aberto após criar (lote de períodos);
  // clique duplo não pode cadastrar o mesmo bloqueio duas vezes.
  it('duplo clique em "Criar bloqueio" não cadastra duas vezes', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Bloqueios' }))
    fireEvent.click(screen.getByText('Criar bloqueio'))
    fireEvent.click(screen.getByText('Criar bloqueio'))

    const lista = JSON.parse(localStorage.getItem(CHAVE_BLK) ?? '[]')
    expect(lista).toHaveLength(1)
    expect(screen.getByText('Este bloqueio já foi cadastrado.')).toBeTruthy()
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
      profissional: 'Cleiton Silva',
    })
  })
})

// Auditoria Fase 11 — agendamentos × expediente: um horário que saiu da
// grade (expediente encurtado depois do encaixe) não pode sumir da tela —
// ele segue listado abaixo da grade, clicável, nas duas visualizações.
describe('Agenda — agendamentos fora do expediente', () => {
  function semearDoisAgendamentos() {
    localStorage.setItem(
      'studio-audax:expediente:v1',
      JSON.stringify({
        inicio: '10:00',
        fim: '18:00',
        almocoInicio: '12:00',
        almocoFim: '13:00',
      }),
    )
    localStorage.setItem(
      CHAVE_AG,
      JSON.stringify([
        {
          id: 'ag-fora',
          cliente: 'Rita Alves',
          telefone: '(11) 97777-6666',
          servico: 'Corte Degradê',
          profissional: 'Cleiton Silva',
          data: DIA,
          horario: '08:30',
          status: 'pendente',
          observacao: '',
          criadoEm: '2026-09-01T00:00:00.000Z',
          duracaoMin: 40,
        },
        {
          id: 'ag-dentro',
          cliente: 'Pedro Dias',
          telefone: '(11) 96666-5555',
          servico: 'Corte Degradê',
          profissional: 'Cleiton Silva',
          data: DIA,
          horario: '14:00',
          status: 'confirmado',
          observacao: '',
          criadoEm: '2026-09-01T00:00:00.000Z',
          duracaoMin: 40,
        },
      ]),
    )
  }

  it('no dia, o agendamento fora da grade aparece na lista de apoio', () => {
    semearDoisAgendamentos()
    montar()

    const secao = screen.getByTestId('fora-do-expediente')
    expect(secao.textContent).toContain('Fora do expediente atual (10:00 às 18:00)')
    expect(within(secao).getByText('Rita Alves')).toBeTruthy()
    expect(within(secao).getByText(/08:30/)).toBeTruthy()
    // aparece uma única vez (na lista, não duplicado na grade)
    expect(screen.getAllByText('Rita Alves')).toHaveLength(1)

    // o de dentro continua na grade e NÃO entra na lista de apoio
    expect(screen.getByText('Pedro Dias')).toBeTruthy()
    expect(within(secao).queryByText('Pedro Dias')).toBeNull()
  })

  it('clicar no item fora da grade abre o detalhe do agendamento', () => {
    semearDoisAgendamentos()
    montar()

    const secao = screen.getByTestId('fora-do-expediente')
    fireEvent.click(within(secao).getByText('Rita Alves'))
    // nome agora na lista de apoio + no cabeçalho do detalhe
    expect(screen.getAllByText('Rita Alves')).toHaveLength(2)
    expect(screen.getByText('Horário')).toBeTruthy()
  })

  it('na semana, o agendamento fora da grade também continua visível', () => {
    semearDoisAgendamentos()
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
    const secao = screen.getByTestId('fora-do-expediente')
    expect(within(secao).getByText('Rita Alves')).toBeTruthy()
    expect(within(secao).queryByText('Pedro Dias')).toBeNull()
  })
})
