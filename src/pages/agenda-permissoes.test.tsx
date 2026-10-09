// Auditoria de encerramento — pendências A (Comissões) e B (Agenda).
//
// O mapa único (permissoes.ts) é a mesma regra do RLS:
//   agenda:ver_todas            → dono/admin/gerente/recepção (profissional não)
//   agenda:expediente_gerenciar → dono/admin/gerente
//   agenda:bloqueios_gerenciar  → dono/admin/gerente
//   comissoes:ver_todas         → dono/admin/gerente (recepção e profissional não)
//
// O que a RLS (014/059) já devolve sozinha não é repetido aqui: o que a UI
// mostra a partir de fontes OUTRAS (colunas da grade, produção do Caixa) é.
// Sem AuthProvider (testes legados/render isolado) nada é filtrado — em
// produção a página só existe dentro do AuthProvider.
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider } from '@/modules/clientes/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EstoqueProvider } from '@/modules/estoque/store'
import { ProdutosProvider } from '@/modules/produtos/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import { WhatsProvider } from '@/modules/whatsapp/store'
import { ContextoAuth } from '@/modules/auth/contexto'
import type { ContextoAuth as ContextoValor } from '@/modules/auth/contexto'
import type { PapelPerfil, PerfilInfo } from '@/modules/auth/tipos'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import Agenda from './Agenda'
import Comissoes from './Comissoes'

const CHAVE_PROF = 'studio-audax:profissionais:v1'
// `user-1` é o vínculo (`profissionais.user_id`) de Ana Souza: é o que dá
// posse ao profissional no RLS e na UI.
function semearProfissionais() {
  localStorage.setItem(
    CHAVE_PROF,
    JSON.stringify([
      { id: 'p-1', nome: 'Ana Souza', ativo: true, userId: 'user-1' },
      { id: 'p-2', nome: 'Bruno Lima', ativo: true, userId: null },
    ]),
  )
}

function valorAuth(papel: PapelPerfil, userId = 'user-1'): ContextoValor {
  const perfil: PerfilInfo = {
    id: 'perf-1',
    userId,
    nome: 'Teste',
    email: 'teste@studio.dev',
    papel,
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
  }
  return {
    estado: { status: 'autenticado', email: perfil.email, perfil },
    erroEntrada: '',
    entrando: false,
    entrar: async () => true,
    sair: async () => true,
    saindo: false,
    erroSaida: '',
    perfil,
  }
}

function env(children: ReactNode, papel?: PapelPerfil, userId = 'user-1') {
  const arvore = (
    <ProdutosProvider>
      <EstoqueProvider>
        <ClientesProvider>
          <ProfissionaisProvider>
            <ServicosProvider>
              <AgendaProvider>
                <CaixaProvider>
                  <ComissoesProvider>
                    <WhatsProvider>{children}</WhatsProvider>
                  </ComissoesProvider>
                </CaixaProvider>
              </AgendaProvider>
            </ServicosProvider>
          </ProfissionaisProvider>
        </ClientesProvider>
      </EstoqueProvider>
    </ProdutosProvider>
  )
  if (!papel) return render(arvore)
  return render(
    <ContextoAuth.Provider value={valorAuth(papel, userId)}>
      {arvore}
    </ContextoAuth.Provider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('Agenda — colunas e ações seguem o mapa único', () => {
  it('sem sessão de auth mantém todas as colunas e o Expediente (legado)', () => {
    semearProfissionais()
    env(<Agenda onNovo={vi.fn()} />)
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expediente' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bloqueios' })).toBeTruthy()
  })

  it('profissional com vínculo vê só a própria coluna e não edita expediente', () => {
    semearProfissionais()
    env(<Agenda onNovo={vi.fn()} />, 'profissional')
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.queryByText('Bruno Lima')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expediente' })).toBeNull()
    // `agenda:bloqueios_gerenciar` = dono/admin/gerente (não profissional)
    expect(screen.queryByRole('button', { name: 'Bloqueios' })).toBeNull()
  })

  it('recepção vê as colunas todas (agenda:ver_todas), mas não edita expediente', () => {
    semearProfissionais()
    env(<Agenda onNovo={vi.fn()} />, 'recepcao')
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Expediente' })).toBeNull()
    // `agenda:bloqueios_gerenciar` também não é de recepção
    expect(screen.queryByRole('button', { name: 'Bloqueios' })).toBeNull()
  })

  it('admin vê todas as colunas e edita o expediente', () => {
    semearProfissionais()
    env(<Agenda onNovo={vi.fn()} />, 'admin')
    expect(screen.getByText('Ana Souza')).toBeTruthy()
    expect(screen.getByText('Bruno Lima')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Expediente' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Bloqueios' })).toBeTruthy()
  })
})

describe('Comissões — só com ver_todas se vê a produção dos colegas', () => {
  function linha(nome: string) {
    return screen.queryByRole('button', { name: `Ver detalhes de ${nome}` })
  }

  it('sem sessão de auth mantém as duas linhas (legado)', () => {
    semearProfissionais()
    env(<Comissoes />)
    expect(linha('Ana Souza')).toBeTruthy()
    expect(linha('Bruno Lima')).toBeTruthy()
  })

  it('profissional com vínculo vê só a própria linha', () => {
    semearProfissionais()
    env(<Comissoes />, 'profissional')
    expect(linha('Ana Souza')).toBeTruthy()
    expect(linha('Bruno Lima')).toBeNull()
  })

  it('recepção (ver_proprias, sem vínculo) não vê a produção de ninguém', () => {
    semearProfissionais()
    // recepção não tem cadastro em `profissionais` → sem linha própria
    env(<Comissoes />, 'recepcao', 'user-recepcao')
    expect(linha('Ana Souza')).toBeNull()
    expect(linha('Bruno Lima')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Comissões' })).toBeTruthy()
    expect(screen.getByText(/Nenhum profissional cadastrado/)).toBeTruthy()
  })

  it('admin vê todas as linhas', () => {
    semearProfissionais()
    env(<Comissoes />, 'admin')
    expect(linha('Ana Souza')).toBeTruthy()
    expect(linha('Bruno Lima')).toBeTruthy()
  })
})

describe('Novo agendamento — quem só tem a agenda própria não agenda em colega', () => {
  function opcoesProfissional(): string[] {
    const select = screen.getByLabelText('Profissional') as HTMLSelectElement
    return Array.from(select.options).map((o) => o.value)
  }

  it('sem sessão de auth escolhe qualquer profissional (legado)', () => {
    semearProfissionais()
    env(<NovoAgendamentoModal onFechar={vi.fn()} />)
    expect(opcoesProfissional()).toEqual(['Ana Souza', 'Bruno Lima'])
  })

  it('profissional com vínculo só escolhe o próprio cadastro', () => {
    semearProfissionais()
    env(<NovoAgendamentoModal onFechar={vi.fn()} />, 'profissional')
    expect(opcoesProfissional()).toEqual(['Ana Souza'])
  })

  it('admin escolhe qualquer profissional', () => {
    semearProfissionais()
    env(<NovoAgendamentoModal onFechar={vi.fn()} />, 'admin')
    expect(opcoesProfissional()).toEqual(['Ana Souza', 'Bruno Lima'])
  })

  it('profissional sem vínculo não encolhe a lista (o banco já barra)', () => {
    semearProfissionais()
    // perfil sem correspondência em profissionais.user_id → sem restrição
    // de UI: o RLS é quem nega a escrita (a migration 059 avisa o caso).
    env(<NovoAgendamentoModal onFechar={vi.fn()} />, 'profissional', 'user-x')
    expect(opcoesProfissional()).toEqual(['Ana Souza', 'Bruno Lima'])
  })
})
