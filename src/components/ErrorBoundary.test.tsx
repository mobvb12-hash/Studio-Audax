import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

let quebrado = true

function Fragil() {
  if (quebrado) throw new Error('falha simulada de render')
  return <p>conteúdo restabelecido</p>
}

function silenciarErrosReact() {
  return vi.spyOn(console, 'error').mockImplementation(() => {})
}

afterEach(() => {
  quebrado = true
  vi.restoreAllMocks()
})

describe('ErrorBoundary — barreira de render (auditoria Fase 11)', () => {
  it('mostra o painel de erro em vez de deixar a tela em branco', () => {
    const erros = silenciarErrosReact()
    render(
      <ErrorBoundary>
        <Fragil />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo deu errado')).toBeTruthy()
    expect(screen.getByText('falha simulada de render')).toBeTruthy()
    expect(screen.queryByText('conteúdo restabelecido')).toBeNull()
    expect(erros).toHaveBeenCalled()
  })

  it('“Tentar novamente” volta a renderizar quando a falha passa', () => {
    silenciarErrosReact()
    render(
      <ErrorBoundary>
        <Fragil />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo deu errado')).toBeTruthy()

    quebrado = false
    fireEvent.click(screen.getByText('Tentar novamente'))
    expect(screen.getByText('conteúdo restabelecido')).toBeTruthy()
    expect(screen.queryByText('Algo deu errado')).toBeNull()
  })

  it('um erro num filho não derruba os irmãos protegidos', () => {
    silenciarErrosReact()
    render(
      <div>
        <span>sidebar intacta</span>
        <ErrorBoundary>
          <Fragil />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByText('sidebar intacta')).toBeTruthy()
    expect(screen.getByText('Algo deu errado')).toBeTruthy()
  })
})
