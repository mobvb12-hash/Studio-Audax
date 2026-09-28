import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

/**
 * Confirma o portão de acesso do Studio Audax no App completo.
 *
 * O portão é allow-list: SOMENTE sessãoAutenticada abre o painel, e "válida"
 * aqui significa confirmada pelo SERVIDOR, não só um objeto com cara de
 * sessão no localStorage. `getSession()` é validação local (o auth-js só
 * confere a presença de `access_token`/`refresh_token`/`expires_at` e o
 * relógio da máquina); quem decide é `getUser()`, que pergunta ao Supabase
 * Auth. Por isso o cliente do Supabase é dublado: o teste precisa decidir o
 * que o SERVIDOR responde, sem rede.
 *
 * Sem Supabase configurado o sistema NÃO abre. Com Supabase e sem sessão, a
 * TelaLogin aparece.
 */

const URL_TESTE = 'https://audax-teste.supabase.co'
const CHAVE_SESSAO = 'sb-audax-teste-auth-token'

/** O que o SERVIDOR responde em `getUser()`. */
const servidor = vi.hoisted(() => ({ usuarioAceito: false }))

vi.mock('@/lib/supabase', () => {
  const sessao = {
    access_token: 'token-de-teste',
    refresh_token: 'refresh-de-teste',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'usuario-de-teste', aud: 'authenticated', role: 'authenticated', email: 'audax@studio.com.br' },
  }
  return {
    supabase: () => {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        return null
      }
      return {
        auth: {
          async getSession() {
            const bruta = localStorage.getItem(CHAVE_SESSAO)
            return {
              data: { session: bruta ? JSON.parse(bruta) : null },
              error: null,
            }
          },
          // é isto que decide: o Auth valida a assinatura do JWT
          async getUser() {
            return servidor.usuarioAceito
              ? { data: { user: sessao.user }, error: null }
              : { data: { user: null }, error: { message: 'invalid JWT' } }
          },
          onAuthStateChange() {
            return { data: { subscription: { unsubscribe: () => {} } } }
          },
        },
        from() {
          const builder = {
            select: () => builder,
            eq: () => builder,
            order: () => builder,
            limit: () => builder,
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            upsert: async () => ({ data: null, error: null }),
            insert: async () => ({ data: null, error: null }),
            update: async () => ({ data: null, error: null }),
            delete: async () => ({ data: null, error: null }),
          }
          return builder
        },
      }
    },
  }
})

function comSupabase() {
  vi.stubEnv('VITE_SUPABASE_URL', URL_TESTE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-anon-de-teste')
}

/** Objeto de sessão no localStorage — presente, com forma correta. */
function semearSessaoNoStorage() {
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
  servidor.usuarioAceito = false
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('App — portão de acesso Supabase', () => {
  it('sem Supabase configurado o sistema NÃO abre: mostra a tela de ausência de configuração', () => {
    // vaza do .env em execuções locais — zera para simular o ambiente sem acesso
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    render(<App />)
    // o painel NÃO pode aparecer — nem login, que também não teria como validar
    expect(screen.queryByRole('heading', { name: 'Painel' })).toBeNull()
    expect(screen.queryByLabelText('Senha')).toBeNull()
    expect(screen.getByText(/Supabase não foi encontrado/)).toBeTruthy()
  })

  it('com Supabase configurado e sem sessão a TelaLogin aparece', async () => {
    comSupabase()
    render(<App />)
    expect(await screen.findByLabelText('Senha')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Studio Audax' })).toBeTruthy()
    expect(screen.queryByText('Dados salvos automaticamente')).toBeNull()
  })

  it('sessão confirmada pelo servidor libera o sistema sem mostrar o login', async () => {
    comSupabase()
    semearSessaoNoStorage()
    servidor.usuarioAceito = true
    render(<App />)
    expect(await screen.findByText('Dados salvos automaticamente')).toBeTruthy()
    expect(screen.queryByLabelText('Senha')).toBeNull()
  })

  it('sessão só no localStorage, recusada pelo servidor, NÃO abre o sistema', async () => {
    comSupabase()
    semearSessaoNoStorage()
    // o servidor rejeita o JWT: revogação, senha trocada ou token adulterado
    servidor.usuarioAceito = false
    render(<App />)
    // o painel fica fechado e o aviso de sessão expirada aparece
    expect(await screen.findByText('Sessão expirada. Entre novamente.')).toBeTruthy()
    expect(screen.queryByText('Dados salvos automaticamente')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Painel' })).toBeNull()
  })
})
