import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { criarClienteAuthFalso } from './clienteAuthFalso'
import { AVISO_PERFIL_INATIVO } from './regras'
import { useAuth } from './useAuth'
import type { SessaoInfo } from './tipos'

// `carregarPerfil` lê o Supabase direto (`@/lib/supabase`), então o mock
// precisa existir antes do import do provider; o estado do perfil é
// controlado pelo teste via `perfilCarregado`.
const cenario = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  perfilCarregado: null as null | {
    id: string
    userId: string
    nome: string
    email: string
    papel: 'admin' | 'recepcao' | 'profissional'
    ativo: boolean
    criadoEm: string
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u-1' } } }),
      signOut: cenario.signOut,
    },
  }),
}))

vi.mock('@/services/supabase/perfis', async (orig) => {
  const original =
    await orig<typeof import('@/services/supabase/perfis')>()
  return {
    ...original,
    obterPerfil: vi.fn(async () => cenario.perfilCarregado),
  }
})

function sessaoValida(): SessaoInfo {
  return { email: 'audax@studio.com.br', expiraEm: Math.floor(Date.now() / 1000) + 3600 }
}

function Painel() {
  const { estado, perfil } = useAuth()
  return (
    <div>
      <p data-testid="status">{estado.status}</p>
      <p data-testid="aviso">{estado.status === 'deslogado' ? estado.aviso : ''}</p>
      <p data-testid="perfil-nome">{perfil?.nome ?? 'sem-perfil'}</p>
    </div>
  )
}

function renderizar() {
  return render(
    <AuthProvider cliente={criarClienteAuthFalso(sessaoValida())}>
      <Painel />
    </AuthProvider>,
  )
}

function perfilDe(extras: Partial<{ ativo: boolean; papel: 'admin' }> = {}) {
  return {
    id: 'p-1',
    userId: 'u-1',
    nome: 'Cleiton',
    email: 'audax@studio.com.br',
    papel: (extras.papel ?? 'admin') as 'admin',
    ativo: extras.ativo ?? true,
    criadoEm: '2026-01-01T00:00:00.000Z',
  }
}

describe('AuthProvider — perfil inativo não segue autenticado', () => {
  it('perfil ativo carrega normalmente e a sessão segue aberta', async () => {
    cenario.perfilCarregado = perfilDe({ ativo: true })
    renderizar()
    await waitFor(() =>
      expect(screen.getByTestId('perfil-nome').textContent).toBe('Cleiton'),
    )
    expect(screen.getByTestId('status').textContent).toBe('autenticado')
    expect(cenario.signOut).not.toHaveBeenCalled()
  })

  it('perfil inativo encerra a sessão com aviso e desloga', async () => {
    cenario.perfilCarregado = perfilDe({ ativo: false })
    renderizar()
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('deslogado'),
    )
    expect(screen.getByTestId('aviso').textContent).toBe(AVISO_PERFIL_INATIVO)
    expect(cenario.signOut).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('perfil-nome').textContent).toBe('sem-perfil')
  })

  it('erro de leitura do perfil NÃO desloga (rede falha, sessão continua)', async () => {
    const original = cenario.perfilCarregado
    vi.mocked(
      (await import('@/services/supabase/perfis')).obterPerfil,
    ).mockRejectedValueOnce(new Error('Falha de rede'))
    cenario.perfilCarregado = original
    renderizar()
    // segue autenticado sem perfil (comportamento anterior preservado)
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('autenticado'),
    )
    expect(cenario.signOut).not.toHaveBeenCalled()
  })
})
