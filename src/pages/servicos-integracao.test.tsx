import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider, useServicos } from '@/modules/servicos/store'
import Servicos from './Servicos'

const DIA = hojeISO()

let ctxServicos: ReturnType<typeof useServicos>
let ctxAgenda: ReturnType<typeof useAgenda>
let ctxCaixa: ReturnType<typeof useCaixa>

function Captura() {
  const servicos = useServicos()
  const agenda = useAgenda()
  const caixa = useCaixa()
  useEffect(() => {
    ctxServicos = servicos
    ctxAgenda = agenda
    ctxCaixa = caixa
  })
  return null
}

function env(elemento: ReactNode) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <CaixaProvider>
              <Captura />
              {elemento}
            </CaixaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function idDoServico(nome: string): string {
  const alvo = ctxServicos.servicos.find((s) => s.nome === nome)
  if (!alvo) throw new Error(`serviço não encontrado: ${nome}`)
  return alvo.id
}

function semearHistorico() {
  act(() => {
    ctxAgenda.adicionar({
      cliente: 'Ana Souza',
      telefone: '',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: DIA,
      horario: '10:00',
      observacao: '',
    })
    ctxCaixa.registrarPagamento({
      agendamentoId: 'ag-hist',
      data: DIA,
      hora: '10:00',
      cliente: 'Ana Souza',
      profissional: 'Audax',
      servico: 'Corte Degradê',
      valor: 70,
      desconto: 0,
      formaPagamento: 'pix',
      statusAgendamento: 'concluido',
    })
  })
}

function montarModal(onFechar: () => void) {
  return env(
    <NovoAgendamentoModal
      dataInicial={DIA}
      horarioInicial="14:00"
      onFechar={onFechar}
    />,
  )
}

function montarPagina() {
  return env(<Servicos />)
}

beforeEach(() => {
  localStorage.clear()
  ctxServicos = undefined as unknown as ReturnType<typeof useServicos>
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
  ctxCaixa = undefined as unknown as ReturnType<typeof useCaixa>
})

describe('Serviços inativos × novos agendamentos', () => {
  it('serviço inativo não aparece no modal e o ativo é usado por padrão', () => {
    localStorage.setItem(
      'studio-audax:servicos:v1',
      JSON.stringify([
        {
          id: 'srv-barba',
          nome: 'Barba',
          preco: 30,
          duracaoMin: 30,
          categoria: 'Barba',
          ativo: false,
          criadoEm: '2026-01-01T00:00:00.000Z',
          atualizadoEm: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'srv-corte',
          nome: 'Corte Degradê',
          preco: 70,
          duracaoMin: 40,
          categoria: 'Cabelo',
          ativo: true,
          criadoEm: '2026-01-01T00:00:00.000Z',
          atualizadoEm: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    const onFechar = vi.fn()
    montarModal(onFechar)

    const select = screen.getByLabelText('Serviço')
    expect(select.textContent).toContain('Corte Degradê')
    expect(select.textContent).not.toContain('Barba')
    // ativo fica selecionado por padrão
    expect(
      (screen.getByLabelText('Serviço') as HTMLSelectElement).value,
    ).toBe('Corte Degradê')

    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(onFechar).toHaveBeenCalledTimes(1)
    const salvo = JSON.parse(
      localStorage.getItem('studio-audax:agendamentos:v1') ?? '[]',
    )
    expect(salvo[0].servico).toBe('Corte Degradê')
  })

  it('inativar com o modal aberto recusa salvar serviço inativo', () => {
    const onFechar = vi.fn()
    montarModal(onFechar)
    act(() => {
      ctxServicos.alternarAtivo(idDoServico('Barba'))
    })
    expect(
      (screen.getByLabelText('Serviço') as HTMLSelectElement).value,
    ).not.toBe('Barba')

    fireEvent.change(screen.getByLabelText('Cliente *'), {
      target: { value: 'Ana Souza' },
    })
    fireEvent.click(screen.getByText('Salvar agendamento'))
    expect(screen.getByText('Serviço inativo — escolha outro serviço.')).toBeTruthy()
    expect(onFechar).not.toHaveBeenCalled()
    expect(ctxAgenda.agendamentos).toHaveLength(0)
  })
})

describe('Serviços — exclusão protegida pelo histórico', () => {
  it('recusa excluir serviço usado em agendamento e caixa, preservando tudo', async () => {
    montarPagina()
    semearHistorico()

    fireEvent.click(screen.getByLabelText('Excluir Corte Degradê'))
    expect(screen.getByText('Excluir serviço')).toBeTruthy()
    fireEvent.click(screen.getByText('Sim, excluir'))

    expect(
      await screen.findByText(/não é possível excluí-lo/),
    ).toBeTruthy()
    // nada foi apagado
    expect(screen.getByLabelText('Excluir Corte Degradê')).toBeTruthy()
    expect(ctxServicos.servicos.some((s) => s.nome === 'Corte Degradê')).toBe(true)
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxCaixa.lancamentos).toHaveLength(1)

    fireEvent.click(screen.getByText('Voltar'))
    await waitFor(() =>
      expect(screen.queryByText('Excluir serviço')).toBeNull(),
    )
  })

  it('excluir serviço nunca usado continua permitido', async () => {
    montarPagina()
    fireEvent.click(screen.getByLabelText('Excluir Barba'))
    fireEvent.click(screen.getByText('Sim, excluir'))
    await waitFor(() =>
      expect(screen.queryByLabelText('Excluir Barba')).toBeNull(),
    )
    expect(ctxServicos.servicos.some((s) => s.nome === 'Barba')).toBe(false)
  })
})

describe('Serviços — inativar sem apagar histórico', () => {
  it('inativar preserva agendamentos e caixa e some das listas de novos agendamentos', () => {
    montarPagina()
    semearHistorico()

    act(() => {
      ctxServicos.alternarAtivo(idDoServico('Corte Degradê'))
    })

    // página mostra o status sem excluir nada
    const card = screen.getByText('Corte Degradê').closest('li') as HTMLElement
    expect(within(card).getByText('Inativo')).toBeTruthy()
    expect(
      within(card).getByLabelText('Reativar Corte Degradê'),
    ).toBeTruthy()

    // histórico intacto
    expect(ctxAgenda.agendamentos).toHaveLength(1)
    expect(ctxAgenda.agendamentos[0].servico).toBe('Corte Degradê')
    expect(ctxCaixa.lancamentos).toHaveLength(1)

    // some dos novos agendamentos
    const onFechar = vi.fn()
    montarModal(onFechar)
    expect(screen.getByLabelText('Serviço').textContent).not.toContain(
      'Corte Degradê',
    )
  })

  it('editar o preço não altera valores já registrados no caixa', () => {
    montarPagina()
    semearHistorico()

    act(() => {
      ctxServicos.atualizar(idDoServico('Corte Degradê'), {
        nome: 'Corte Degradê',
        preco: 120,
        duracaoMin: 40,
      })
    })

    expect(ctxServicos.porId(idDoServico('Corte Degradê'))?.preco).toBe(120)
    // histórico de preço preservado no lançamento já realizado
    expect(ctxCaixa.lancamentos[0].valor).toBe(70)
  })
})

describe('Página Serviços — cadastro, categoria e status', () => {
  it('valida preço e duração inválidos no formulário', () => {
    montarPagina()
    fireEvent.click(screen.getByText('+ Novo serviço'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Pezinho' },
    })
    fireEvent.change(screen.getByLabelText(/Preço/), {
      target: { value: '-5' },
    })
    fireEvent.change(screen.getByLabelText(/Duração/), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByText('Cadastrar serviço'))
    expect(screen.getByText(/preço válido/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Preço/), {
      target: { value: '25,50' },
    })
    fireEvent.change(screen.getByLabelText(/Duração/), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByText('Cadastrar serviço'))
    expect(screen.getByText(/mínimo 5/)).toBeTruthy()
    expect(ctxServicos.servicos.some((s) => s.nome === 'Pezinho')).toBe(false)
  })

  it('cadastra com categoria, alterna inativar/reativar e mantém tudo na lista', async () => {
    montarPagina()
    fireEvent.click(screen.getByText('+ Novo serviço'))
    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Pezinho' },
    })
    fireEvent.change(screen.getByLabelText(/Preço/), {
      target: { value: '25,50' },
    })
    fireEvent.change(screen.getByLabelText(/Duração/), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('Categoria'), {
      target: { value: 'Barba' },
    })
    fireEvent.click(screen.getByText('Cadastrar serviço'))
    await waitFor(() =>
      expect(screen.queryByText('Novo serviço')).toBeNull(),
    )

    const card = screen.getByText('Pezinho').closest('li') as HTMLElement
    expect(within(card).getByText('Ativo')).toBeTruthy()
    expect(within(card).getByText('Barba')).toBeTruthy()

    fireEvent.click(within(card).getByLabelText('Inativar Pezinho'))
    expect(within(card).getByText('Inativo')).toBeTruthy()
    expect(within(card).getByLabelText('Reativar Pezinho')).toBeTruthy()
    expect(
      ctxServicos.servicos.find((s) => s.nome === 'Pezinho')?.ativo,
    ).toBe(false)

    fireEvent.click(within(card).getByLabelText('Reativar Pezinho'))
    expect(within(card).getByText('Ativo')).toBeTruthy()
    expect(
      ctxServicos.servicos.find((s) => s.nome === 'Pezinho')?.ativo,
    ).toBe(true)
  })
})
