import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { AVISO_SESSAO_EXPIRADA } from './regras'
import { criarClienteAuthFalso } from './clienteAuthFalso'
import type { ClienteAuthFalso } from './clienteAuthFalso'
import { useAuth } from './useAuth'
import type { SessaoInfo } from './tipos'

function sessaoValida(email = 'audax@studio.com.br'): SessaoInfo {
  return { email, expiraEm: Math.floor(Date.now() / 1000) + 3600 }
}

function sessaoVencida(email = 'audax@studio.com.br'): SessaoInfo {
  return { email, expiraEm: Math.floor(Date.now() / 1000) - 60 }
}

function Painel() {
  const { estado, erroEntrada, entrando, entrar, sair } = useAuth()
  return (
    <div>
      <p data-testid="status">{estado.status}</p>
      {estado.status === 'autenticado' && (
        <p data-testid="email">{estado.email}</p>
      )}
      {estado.status === 'deslogado' && estado.aviso && (
        <p role="alert">{estado.aviso}</p>
      )}
      {erroEntrada && <p role="alert">{erroEntrada}</p>}
      <span data-testid="entrando">{entrando ? 'sim' : 'nao'}</span>
      <button type="button" onClick={() => void entrar('ana@studio.com', 'segredo')}>
        Entrar
      </button>
      <button type="button" onClick={() => void sair()}>
        Sair
      </button>
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

describe('AuthProvider — portão de acesso do Studio Audax', () => {
  it('sem Supabase configurado o acesso fica desabilitado (app segue local)', () => {
    renderizar(null)
    expect(screen.getByTestId('status').textContent).toBe('desabilitado')
  })

  it('sessão válida salva libera o painel', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    expect(screen.getByTestId('email').textContent).toBe('audax@studio.com.br')
  })

  it('sem sessão exige login sem aviso', async () => {
    const cliente = criarClienteAuthFalso(null)
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sessão já vencida cai no login com aviso de expirada', async () => {
    const cliente = criarClienteAuthFalso(sessaoVencida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.getByRole('alert').textContent).toBe(AVISO_SESSAO_EXPIRADA)
  })

  it('login com sucesso autentica e registra as credenciais', async () => {
    const cliente = criarClienteAuthFalso(null)
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    expect(screen.getByTestId('email').textContent).toBe('ana@studio.com')
    expect(cliente.entradas).toEqual([
      { email: 'ana@studio.com', senha: 'segredo' },
    ])
    expect(screen.getByTestId('entrando').textContent).toBe('nao')
  })

  it('login com falha mostra a mensagem amigável e segue deslogado', async () => {
    const cliente = criarClienteAuthFalso(null)
    cliente.erroEntrada = new Error('Invalid login credentials')
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'E-mail ou senha inválidos.',
      ),
    )
    expect(screen.getByTestId('status').textContent).toBe('deslogado')
  })

  it('logout volta para o login sem aviso', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('expiração durante o uso derruba a sessão com aviso', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    act(() => cliente.disparar(null, 'expirada'))
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.getByRole('alert').textContent).toBe(AVISO_SESSAO_EXPIRADA)
  })

  it('sair normal (evento do provedor) não mostra aviso de expirada', async () => {
    const cliente = criarClienteAuthFalso(sessaoValida())
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    act(() => cliente.disparar(null, 'saiu'))
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
