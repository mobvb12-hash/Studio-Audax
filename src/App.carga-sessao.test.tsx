// Auditoria de produção (I9): a carga do Supabase só pode acontecer com
// sessão válida.
//
// Sem isto, os módulos que leem/gravam no Supabase montam antes do portão de
// autenticação, disparam a carga sem token, a RLS recusa — e como a carga não
// se repete sozinha, o primeiro login do sistema abre o painel VAZIO mesmo com
// tudo salvo no servidor. O teste trava a ordem correta: nada é lido enquanto
// deslogado e a carga acontece depois da sessão.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const consultas = vi.hoisted(() => ({ lista: [] as { tabela: string; autenticado: boolean }[] }))
const sessao = vi.hoisted(() => ({ ativa: false }))

vi.mock('@/lib/supabase', () => {
  /** Cliente falso com a mesma surface usada pelo app (auth + tabelas). */
  function criarCliente() {
    const observadores: ((evento: string, s: unknown) => void)[] = []
    const sessaoAtual = () =>
      sessao.ativa
        ? {
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: 'u-1', email: 'audax@studio.com.br' },
          }
        : null
    const client = {
      auth: {
        async getSession() {
          return { data: { session: sessaoAtual() }, error: null }
        },
        onAuthStateChange(cb: (evento: string, s: unknown) => void) {
          observadores.push(cb)
          return { data: { subscription: { unsubscribe: () => {} } } }
        },
        async signInWithPassword() {
          sessao.ativa = true
          const s = sessaoAtual()
          observadores.forEach((cb) => cb('SIGNED_IN', s))
          return { data: { session: s }, error: null }
        },
        async signOut() {
          sessao.ativa = false
          return { error: null }
        },
        async getUser() {
          return { data: { user: sessaoAtual()?.user ?? null }, error: null }
        },
      },
      from(tabela: string) {
        // Toda consulta é anotada com o estado da sessão no momento do envio.
        const registrar = () => {
          consultas.lista.push({ tabela, autenticado: sessao.ativa })
        }
        const cadeia = {
          select: () => {
            registrar()
            return cadeia
          },
          eq: () => cadeia,
          order: () => cadeia,
          limit: () => cadeia,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          upsert: async () => {
            registrar()
            return { data: null, error: null }
          },
          insert: async () => {
            registrar()
            return { data: null, error: null }
          },
          update: async () => {
            registrar()
            return { data: null, error: null }
          },
        }
        return cadeia
      },
    }
    return client
  }
  return { supabase: () => criarCliente() }
})

beforeEach(() => {
  localStorage.clear()
  consultas.lista = []
  sessao.ativa = false
})

describe('App — a carga do Supabase espera a sessão', () => {
  it('não consulta nada enquanto deslogado e carrega depois do login', async () => {
    render(<App />)

    // deslogado: a tela de login aparece e NENHUMA tabela é consultada
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy())
    expect(consultas.lista).toEqual([])

    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'audax@studio.com.br' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'segredo-seguro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    // autenticado: a carga dos módulos roda com sessão
    await waitFor(() => expect(consultas.lista.length).toBeGreaterThan(0), {
      timeout: 3000,
    })
    const foraDaSessao = consultas.lista.filter((c) => !c.autenticado)
    expect(
      foraDaSessao,
      `consultas sem sessão: ${JSON.stringify(foraDaSessao)}`,
    ).toEqual([])
    // a carga inicial de clientes acontece depois do login
    expect(consultas.lista.some((c) => c.tabela === 'clientes')).toBe(true)
    // e o painel abre de verdade (conteúdo interno, não a tela de login)
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull()
  })
})
