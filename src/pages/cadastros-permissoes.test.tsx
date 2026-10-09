// Auditoria de encerramento — gates de ação em Serviços, Profissionais,
// Espera e Comissões.
//
// O mapa único (permissoes.ts) é a mesma regra do RLS:
//   servicos:ativar_inativar       → dono/admin/gerente (058: UPDATE = gerente+)
//   profissionais:ativar_inativar  → dono/admin/gerente (058: UPDATE = gerente+)
//   profissionais:comissoes_configurar → dono/admin/gerente (RLS: gerente+)
//   espera:pedido_editar           → dono/admin/gerente/recepção (RLS: recepção+)
//
// Sem AuthProvider (testes legados/render isolado) os botões seguem como
// antes — em produção a página só existe dentro do AuthProvider.
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AgendaProvider } from '@/modules/agenda/store'
import { CaixaProvider } from '@/modules/caixa/store'
import { ClientesProvider, useClientes } from '@/modules/clientes/store'
import { ComissoesProvider } from '@/modules/comissoes/store'
import { EsperaProvider } from '@/modules/espera/store'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import { ServicosProvider } from '@/modules/servicos/store'
import { ContextoAuth } from '@/modules/auth/contexto'
import type { ContextoAuth as ContextoValor } from '@/modules/auth/contexto'
import type { PapelPerfil, PerfilInfo } from '@/modules/auth/tipos'
import { escolherCliente } from '@/test-utils/escolherCliente'
import Comissoes from './Comissoes'
import Espera from './Espera'
import Profissionais from './Profissionais'
import Servicos from './Servicos'

const CHAVE_PROF = 'studio-audax:profissionais:v1'

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

function montar(arvore: ReactNode, papel?: PapelPerfil, userId = 'user-1') {
  if (!papel) return render(arvore)
  return render(
    <ContextoAuth.Provider value={valorAuth(papel, userId)}>
      {arvore}
    </ContextoAuth.Provider>,
  )
}

function envServicos(children: ReactNode, papel?: PapelPerfil) {
  return montar(
    <ServicosProvider>
      <AgendaProvider>
        <CaixaProvider>{children}</CaixaProvider>
      </AgendaProvider>
    </ServicosProvider>,
    papel,
  )
}

function envProfissionais(children: ReactNode, papel?: PapelPerfil) {
  return montar(
    <ProfissionaisProvider>
      <AgendaProvider>
        <CaixaProvider>{children}</CaixaProvider>
      </AgendaProvider>
    </ProfissionaisProvider>,
    papel,
  )
}

function envComissoes(children: ReactNode, papel?: PapelPerfil) {
  return montar(
    <ProfissionaisProvider>
      <ComissoesProvider>
        <CaixaProvider>{children}</CaixaProvider>
      </ComissoesProvider>
    </ProfissionaisProvider>,
    papel,
  )
}

let ctxClientes: ReturnType<typeof useClientes>

function CapturaClientes() {
  const clientes = useClientes()
  useEffect(() => {
    ctxClientes = clientes
  })
  return null
}

function envEspera(children: ReactNode, papel?: PapelPerfil, userId = 'user-1') {
  return montar(
    <ClientesProvider>
      <ProfissionaisProvider>
        <ServicosProvider>
          <AgendaProvider>
            <EsperaProvider>
              <CapturaClientes />
              {children}
            </EsperaProvider>
          </AgendaProvider>
        </ServicosProvider>
      </ProfissionaisProvider>
    </ClientesProvider>,
    papel,
    userId,
  )
}

function semearClientes() {
  act(() => {
    ctxClientes.adicionar({
      nome: 'Ana Souza',
      telefone: '(11) 91111-2222',
      email: '',
      observacao: '',
    })
  })
}

async function adicionarPedido(nome: string, servico: string) {
  await escolherCliente(nome.split(' ')[0])
  fireEvent.change(screen.getByLabelText('Serviço desejado'), {
    target: { value: servico },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar à fila' }))
}

beforeEach(() => {
  localStorage.clear()
  ctxClientes = undefined as unknown as ReturnType<typeof useClientes>
})

describe('Serviços — Inativar/Reativar segue servicos:ativar_inativar', () => {
  it('sem sessão de auth mantém o botão (legado)', () => {
    envServicos(<Servicos />)
    expect(screen.getByLabelText('Inativar Corte Degradê')).toBeTruthy()
  })

  it('recepção e profissional não veem Inativar', () => {
    envServicos(<Servicos />, 'recepcao')
    expect(screen.queryByLabelText(/Inativar Corte Degradê/)).toBeNull()
    expect(screen.queryByLabelText(/Reativar Corte Degradê/)).toBeNull()
  })

  it('gerente vê Inativar', () => {
    envServicos(<Servicos />, 'gerente')
    expect(screen.getByLabelText('Inativar Corte Degradê')).toBeTruthy()
  })
})

describe('Profissionais — Inativar/Reativar segue profissionais:ativar_inativar', () => {
  it('sem sessão de auth mantém o botão (legado)', () => {
    envProfissionais(<Profissionais />)
    expect(screen.getByLabelText('Inativar Cleiton Silva')).toBeTruthy()
  })

  it('recepção e profissional não veem Inativar', () => {
    envProfissionais(<Profissionais />, 'recepcao')
    expect(screen.queryByLabelText(/Inativar Cleiton Silva/)).toBeNull()
    expect(screen.queryByLabelText(/Reativar Cleiton Silva/)).toBeNull()
  })

  it('gerente vê Inativar', () => {
    envProfissionais(<Profissionais />, 'gerente')
    expect(screen.getByLabelText('Inativar Cleiton Silva')).toBeTruthy()
  })
})

describe('Comissões — Configurar segue profissionais:comissoes_configurar', () => {
  it('profissional vê a própria linha, sem Configurar', () => {
    semearProfissionais()
    envComissoes(<Comissoes />, 'profissional')
    expect(
      screen.getByRole('button', { name: 'Ver detalhes de Ana Souza' }),
    ).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: 'Configurar' })).toHaveLength(0)
  })

  it('gerente vê Configurar', () => {
    semearProfissionais()
    envComissoes(<Comissoes />, 'gerente')
    expect(screen.getAllByRole('button', { name: 'Configurar' }).length).toBeGreaterThan(0)
  })

  it('sem sessão de auth mantém Configurar (legado)', () => {
    semearProfissionais()
    envComissoes(<Comissoes />)
    expect(screen.getAllByRole('button', { name: 'Configurar' }).length).toBeGreaterThan(0)
  })
})

describe('Espera — Editar segue espera:pedido_editar', () => {
  it('profissional não vê Editar no pedido', async () => {
    envEspera(<Espera />, 'profissional')
    semearClientes()
    await adicionarPedido('Ana Souza', 'Corte Degradê')
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remover' })).toBeTruthy()
  })

  it('recepção vê Editar no pedido', async () => {
    envEspera(<Espera />, 'recepcao', 'user-recepcao')
    semearClientes()
    await adicionarPedido('Ana Souza', 'Corte Degradê')
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
  })
})
