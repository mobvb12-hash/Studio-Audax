import { act, useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeISO } from '@/modules/agenda/catalogo'
import { AgendaProvider, useAgenda } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ClubeProvider } from '@/modules/clube/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import type { PaginaId } from '@/layouts/AppLayout'
import Dashboard from './Dashboard'

let ctxAgenda: ReturnType<typeof useAgenda>

function Captura() {
  const agenda = useAgenda()
  useEffect(() => {
    ctxAgenda = agenda
  })
  return null
}

function montar(onIrPara?: (pagina: PaginaId) => void) {
  return render(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ProdutosProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <ComissoesProvider>
                  <ClubeProvider>
                    <Captura />
                    <Dashboard onNovo={() => undefined} onIrPara={onIrPara} />
                  </ClubeProvider>
                </ComissoesProvider>
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProdutosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
  )
}

function agendar(horario: string, profissional: string) {
  act(() => {
    ctxAgenda.adicionar({
      cliente: 'Ana Souza',
      telefone: '',
      servico: 'Corte Degradê',
      profissional,
      data: hojeISO(),
      horario,
      observacao: '',
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  ctxAgenda = undefined as unknown as ReturnType<typeof useAgenda>
})

describe('Dashboard — acessos rápidos para os módulos', () => {
  it('cada link navega para a página correspondente', () => {
    const onIrPara = vi.fn()
    montar(onIrPara)

    expect(screen.getByText('Acessos rápidos')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))
    expect(onIrPara).toHaveBeenCalledWith('agenda')
    fireEvent.click(screen.getByRole('button', { name: 'Caixa' }))
    expect(onIrPara).toHaveBeenCalledWith('caixa')
    fireEvent.click(screen.getByRole('button', { name: 'Comissões' }))
    expect(onIrPara).toHaveBeenCalledWith('comissoes')
    fireEvent.click(
      screen.getByRole('button', { name: 'Clube de assinaturas' }),
    )
    expect(onIrPara).toHaveBeenCalledWith('clube')
    fireEvent.click(screen.getByRole('button', { name: 'Relatórios' }))
    expect(onIrPara).toHaveBeenCalledWith('relatorios')
    fireEvent.click(screen.getByRole('button', { name: 'Produtos / Estoque' }))
    expect(onIrPara).toHaveBeenCalledWith('estoque')
  })

  it('sem onIrPara os links não aparecem', () => {
    montar()
    expect(screen.queryByText('Acessos rápidos')).toBeNull()
  })
})

describe('Dashboard — horários disponíveis (dados reais)', () => {
  it('expediente cheio mostra a capacidade total (22 slots × 2 profissionais)', () => {
    montar()

    expect(screen.getByText('Horários disponíveis hoje')).toBeTruthy()
    expect(screen.getByText(/22 horário\(s\) · 44 vaga\(s\)/)).toBeTruthy()
    expect(screen.getByText(/Próximos: 08:00, 08:30, 09:00, 09:30/)).toBeTruthy()
  })

  it('agendamentos de hoje reduzem horários e vagas', () => {
    montar()
    agendar('10:00', 'Cleiton Silva')
    agendar('10:00', 'Ítalo Santos')

    // 10:00 e 10:30 ficam sem nenhuma vaga (atendimento de 40 min)
    expect(screen.getByText(/20 horário\(s\) · 40 vaga\(s\)/)).toBeTruthy()
    expect(screen.queryByText(/22 horário\(s\)/)).toBeNull()
  })

  it('sem profissionais não inventa vagas', () => {
    // lista salva (mesmo vazia) é preservada pelo ProfissionaisProvider
    localStorage.setItem('studio-audax:profissionais:v1', '[]')
    montar()
    expect(screen.getByText(/0 horário\(s\) · 0 vaga\(s\)/)).toBeTruthy()
    expect(screen.getByText('Sem vagas no expediente de hoje.')).toBeTruthy()
  })
})
