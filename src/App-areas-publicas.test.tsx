import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

/**
 * As DUAS ÁREAS PÚBLICAS no App completo.
 *
 * Este é o teste que fecha a §21 (segurança) na prática: as duas URLs que o
 * dono vai divulgar precisam abrir sem login de profissional e, principalmente,
 * NÃO podem cair no painel administrativo — nem deixar o cliente chegar nele.
 *
 * O que é verificado em cada URL pública:
 *   • abre sem sessão de profissional (sem TelaLogin, sem "Painel");
 *   • não mostra nenhum conteúdo de staff (Caixa, Comissões, Pote, Financeiro,
 *     Estoque, Configurações, WhatsApp);
 *   • não monta os providers do app interno.
 */

const URL_TESTE = 'https://audax-teste.supabase.co'
const CHAVE_SESSAO = 'sb-audax-teste-auth-token'

vi.mock('@/lib/supabase', () => ({
  supabase: () => {
    if (
      !import.meta.env.VITE_SUPABASE_URL ||
      !import.meta.env.VITE_SUPABASE_ANON_KEY
    ) {
      return null
    }
    return {
      auth: {
        async getSession() {
          return { data: { session: null }, error: null }
        },
        async getUser() {
          return { data: { user: null }, error: { message: 'sem sessão' } }
        },
        onAuthStateChange() {
          return { data: { subscription: { unsubscribe() {} } } }
        },
      },
      from() {
        const builder = {
          select: () => builder,
          insert: () => builder,
          update: () => builder,
          delete: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          then: (res: (v: unknown) => void) => res({ data: [], error: null }),
        }
        return builder
      },
      rpc() {
        return Promise.resolve({ data: null, error: null })
      },
    }
  },
}))

/** O que a área do cliente faz quando não há sessão: pede identificação. */
// SÓ o conteúdo público do Clube: a casa não tem nada configurado neste
// cenário, e a seção do Club deve simplesmente não aparecer. O resto do
// módulo é o de verdade — o painel do cliente depende dele.
vi.mock('@/services/supabase/painel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/supabase/painel')>()),
  carregarBeneficiosClube: () => Promise.resolve(null),
}))

vi.mock('@/services/supabase/agendaPublica', () => ({
  carregarCatalogo: () =>
    Promise.resolve({
      servicos: [
        {
          id: 's1',
          nome: 'Corte',
          preco: 30,
          duracaoMin: 30,
          complementos: [],
        },
      ],
      profissionais: [
        { nome: 'Cleiton' },
        { nome: 'Ítalo' },
      ],
      barbearia: { endereco: '', telefone: '', instagram: '', mapa: '' },
    }),
  criarAgendamentoPublico: () => Promise.resolve({}),
  horariosPublicosPorProfissional: () => Promise.resolve([]),
  listarServicosPublicos: () => Promise.resolve([]),
}))

function comSupabase() {
  vi.stubEnv('VITE_SUPABASE_URL', URL_TESTE)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-de-teste')
  localStorage.setItem(CHAVE_SESSAO, '{}')
}

function ficaEm(url: string) {
  window.history.replaceState(null, '', url)
}

/** Nenhum destes textos pode aparecer para quem está nas áreas públicas. */
const VAZAMENTOS = [
  'Caixa',
  'Comissões',
  'Pote',
  'Financeiro',
  'Estoque',
  'Configurações',
  'WhatsApp',
  'Relatórios',
  'CRM',
  'Profissionais',
  'Fila de espera',
]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  ficaEm('/')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('App — /agendar abre o agendamento público, sem porta de staff', () => {
  it('abre sem login e mostra o fluxo de agendamento', async () => {
    comSupabase()
    ficaEm('/agendar')
    render(<App />)

    // O fluxo público, não o login do app interno.
    expect(await screen.findByText('Agende seu horário')).toBeTruthy()
    expect(screen.queryByLabelText('Senha')).toBeNull()
  })

  it('não mostra NENHUM item do painel administrativo', async () => {
    comSupabase()
    ficaEm('/agendar')
    render(<App />)

    await screen.findByText('Agende seu horário')
    for (const texto of VAZAMENTOS) {
      expect(screen.queryByText(texto), texto).toBeNull()
    }
    // E o login do app interno também não.
    expect(screen.queryByLabelText('Senha')).toBeNull()
  })

  it('o serviço do catálogo oficial aparece com o botão ESCOLHER', async () => {
    comSupabase()
    ficaEm('/agendar')
    render(<App />)

    expect(await screen.findByText('Corte')).toBeTruthy()
    expect(screen.getAllByText('Escolher').length).toBeGreaterThan(0)
  })
})

describe('App — /cliente abre a Área do Cliente, sem porta de staff', () => {
  it('abre sem login de profissional e pede a identificação do cliente', async () => {
    comSupabase()
    ficaEm('/cliente')
    render(<App />)

    // A entrada da área do cliente: identificar-se, não o login da equipe.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Studio Audax' }),
      ).toBeTruthy(),
    )
    expect(screen.queryByText('Agende seu horário')).toBeNull()
    // O formulário de entrada é o do cliente (e-mail e senha do cliente).
    await waitFor(() => expect(screen.getByLabelText('Senha')).toBeTruthy())
  })

  it('não mostra NENHUM item do painel administrativo', async () => {
    comSupabase()
    ficaEm('/cliente')
    render(<App />)

    await waitFor(() => expect(screen.getByLabelText('Senha')).toBeTruthy())
    for (const texto of VAZAMENTOS) {
      expect(screen.queryByText(texto), texto).toBeNull()
    }
  })

  it('/cliente não abre o dashboard nem a agenda interna', async () => {
    comSupabase()
    ficaEm('/cliente')
    render(<App />)

    await waitFor(() => expect(screen.getByLabelText('Senha')).toBeTruthy())
    // A agenda interna mostra estes; se qualquer um aparecer, é a área errada.
    expect(screen.queryByText('Dados salvos automaticamente')).toBeNull()
    expect(screen.queryByText('Novo agendamento')).toBeNull()
    expect(screen.queryByText('Fechar caixa')).toBeNull()
  })
})

describe('App — a raiz continua exigindo login de profissional', () => {
  it('em "/" sem sessão, aparece o login da equipe (nada de cliente)', async () => {
    comSupabase()
    ficaEm('/')
    render(<App />)

    expect(await screen.findByLabelText('Senha')).toBeTruthy()
    // Nenhuma das áreas públicas pode ter vazado para a raiz.
    expect(screen.queryByText('Agende seu horário')).toBeNull()
  })
})
