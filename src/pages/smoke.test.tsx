import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import Agenda from './Agenda'
import Caixa from './Caixa'

beforeEach(() => {
  localStorage.clear()
})

describe('Smoke — páginas renderizam sem erros de console', () => {
  it('Caixa renderiza cabeçalho, KPIs e cartões', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <CaixaProvider>
        <Caixa />
      </CaixaProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Caixa' })).toBeTruthy()
    expect(screen.getByText('Recebido no dia')).toBeTruthy()
    expect(screen.getByText('Fechar caixa')).toBeTruthy()
    expect(screen.getByText('Recebimentos do dia')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })

  it('Agenda renderiza grade com colunas de profissionais', () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ClientesProvider>
        <ProfissionaisProvider>
          <ServicosProvider>
            <AgendaProvider>
              <CaixaProvider>
                <Agenda onNovo={() => undefined} />
              </CaixaProvider>
            </AgendaProvider>
          </ServicosProvider>
        </ProfissionaisProvider>
      </ClientesProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeTruthy()
    expect(screen.getByText('Audax')).toBeTruthy()
    expect(screen.getByText('Diego')).toBeTruthy()
    expect(screen.getByText('+ Agendar')).toBeTruthy()
    expect(erros).not.toHaveBeenCalled()
    erros.mockRestore()
  })
})
