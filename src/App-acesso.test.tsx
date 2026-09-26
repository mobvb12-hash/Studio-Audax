import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

/**
 * Confirma o portão de acesso do Studio Audax no App completo:
 * sem Supabase configurado o sistema segue como sempre (localStorage);
 * com Supabase, a TelaLogin aparece e uma sessão válida libera o painel.
 * Sem rede: o Supabase só lê a sessão local (nenhuma chamada externa).
 */

const URL_TESTE = 'https://audax-teste.supabase.co'
const CHAVE_SESSAO = 'sb-audax-teste-auth-token'

function comSupabase() {
  vi.stubEnv('VITE_SUPABASE_URL', URL_TESTE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
}

function sessaoValidaLocal() {
  const agora = Math.floor(Date.now() / 1000)
  const b64 = (valor: object) =>
    btoa(JSON.stringify(valor)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: 'usuario-de-teste',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'audax@studio.com.br',
    exp: agora + 60 * 60,
  })}.assinatura-local`
  localStorage.setItem(
    CHAVE_SESSAO,
    JSON.stringify({
      access_token: token,
      refresh_token: 'refresh-de-teste',
      expires_at: agora + 60 * 60,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'usuario-de-teste',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'audax@studio.com.br',
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
      },
    }),
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('App — portão de acesso Supabase', () => {
  it('sem Supabase configurado o sistema continua funcionando como antes', () => {
    // vaza do .env em execuções locais — zera para simular o ambiente sem acesso
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    render(<App />)
    expect(screen.queryByLabelText('Senha')).toBeNull()
    expect(screen.getByText('Dados salvos automaticamente')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeTruthy()
  })

  it('com Supabase configurado a TelaLogin aparece', async () => {
    comSupabase()
    render(<App />)
    expect(await screen.findByLabelText('Senha')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Studio Audax' })).toBeTruthy()
    expect(screen.queryByText('Dados salvos automaticamente')).toBeNull()
  })

  it('sessão válida salva libera o sistema sem mostrar o login', async () => {
    comSupabase()
    sessaoValidaLocal()
    render(<App />)
    expect(await screen.findByText('Dados salvos automaticamente')).toBeTruthy()
    expect(screen.queryByLabelText('Senha')).toBeNull()
  })
})
