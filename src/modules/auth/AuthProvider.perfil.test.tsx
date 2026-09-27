import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { criarClienteAuthFalso } from './clienteAuthFalso'
import type { ClienteAuthFalso } from './clienteAuthFalso'
import { useAuth } from './useAuth'
import type { SessaoInfo } from './tipos'

function sessaoValida(email = 'audax@studio.com.br'): SessaoInfo {
  return { email, expiraEm: Math.floor(Date.now() / 1000) + 3600 }
}

function Painel() {
  const { estado, perfil, sair } = useAuth()
  return (
    <div>
      <p data-testid="status">{estado.status}</p>
      {estado.status === 'autenticado' && (
        <>
          <p data-testid="email">{estado.email}</p>
          <p data-testid="perfil-nome">{perfil?.nome ?? 'sem-perfil'}</p>
          <p data-testid="perfil-papel">{perfil?.papel ?? 'sem-papel'}</p>
          <p data-testid="perfil-ativo">{perfil?.ativo ? 'sim' : 'nao'}</p>
          <button type="button" onClick={() => void sair()}>
            Sair
          </button>
        </>
      )}
    </div>
  )
}

function renderizar(cliente: ClienteAuthFalso | null) {
  return render(
    <AuthProvider cliente={cliente}>
      <Painel />
    </AuthProvider>,
  )
}

describe('AuthProvider — perfil do usuário', () => {
  it('sem Supabase configurado não carrega perfil (desabilitado)', () => {
    renderizar(null)
    expect(screen.getByTestId('status').textContent).toBe('desabilitado')
    expect(screen.queryByTestId('perfil-nome')).toBeNull()
  })

  it('usuário autenticado inicia com perfil null e carrega depois', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    expect(screen.getByTestId('perfil-nome').textContent).toBe('sem-perfil')
  })

  it('perfil é exposto no contexto quando autenticado', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    expect(screen.getByTestId('email').textContent).toBe('audax@studio.com.br')
  })

  it('logout limpa o perfil', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.queryByTestId('perfil-nome')).toBeNull()
  })
})
