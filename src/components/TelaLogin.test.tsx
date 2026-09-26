import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { AVISO_SESSAO_EXPIRADA } from '@/modules/auth/regras'
import { criarClienteAuthFalso } from '@/modules/auth/clienteAuthFalso'
import TelaLogin from './TelaLogin'

function renderizar(cliente: ReturnType<typeof criarClienteAuthFalso>) {
  return render(
    <AuthProvider cliente={cliente}>
      <TelaLogin />
    </AuthProvider>,
  )
}

describe('TelaLogin', () => {
  it('exibe a marca, os campos e o botão de entrar', async () => {
    renderizar(criarClienteAuthFalso(null))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
    })
    expect(
      screen.getByRole('heading', { name: 'Studio Audax' }),
    ).toBeTruthy()
    expect(screen.getByLabelText('E-mail')).toBeTruthy()
    expect(screen.getByLabelText('Senha')).toBeTruthy()
    expect(screen.getByText(/abrir o painel/)).toBeTruthy()
  })

  it('envia as credenciais preenchidas', async () => {
    const cliente = criarClienteAuthFalso(null)
    renderizar(cliente)
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'audax@studio.com.br' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'segredo-seguro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(cliente.entradas).toHaveLength(1))
    expect(cliente.entradas[0]).toEqual({
      email: 'audax@studio.com.br',
      senha: 'segredo-seguro',
    })
  })

  it('falha de login exibe a mensagem amigável', async () => {
    const cliente = criarClienteAuthFalso(null)
    cliente.erroEntrada = new Error('Invalid login credentials')
    renderizar(cliente)
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'audax@studio.com.br' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'errada' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'E-mail ou senha inválidos.',
      ),
    )
  })

  it('sessão expirada chega exibindo o aviso', async () => {
    const cliente = criarClienteAuthFalso({
      email: 'audax@studio.com.br',
      expiraEm: Math.floor(Date.now() / 1000) - 60,
    })
    renderizar(cliente)
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        AVISO_SESSAO_EXPIRADA,
      ),
    )
  })
})
