// Tela de Usuários e permissões — o que o administrador vê e o que ele
// consegue gravar. Aqui só testamos a UI: quem SEGURA o acesso é a RLS da
// migration 042 (coberta em supabase-schema.test.ts).
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextoAuth } from '@/modules/auth/contexto'
import type { ContextoAuth as ContextoValor } from '@/modules/auth/contexto'
import type { PapelPerfil, PerfilInfo } from '@/modules/auth/tipos'
import { ProfissionaisProvider } from '@/modules/profissionais/store'
import type { Perfil } from '@/services/supabase/perfis'
import {
  SEM_SUPABASE_PERMISSOES,
  atualizarPerfilDoUsuario,
  carregarPermissoesDaEquipe,
  criarUsuarioEquipe,
  definirPermissaoDoPerfil,
  listarPerfisEquipe,
} from '@/services/supabase/permissoes'
import UsuariosPermissoes from './UsuariosPermissoes'

vi.mock('@/lib/supabase', () => ({ supabase: () => null }))

vi.mock('@/services/supabase/permissoes', () => ({
  SEM_SUPABASE_PERMISSOES:
    'Permissões exigem Supabase conectado para serem gravadas no servidor.',
  listarPerfisEquipe: vi.fn(),
  carregarPermissoesDaEquipe: vi.fn(),
  definirPermissaoDoPerfil: vi.fn(),
  atualizarPerfilDoUsuario: vi.fn(),
  criarUsuarioEquipe: vi.fn(),
}))

const equipe: Perfil[] = [
  {
    id: 'perf-dono',
    userId: 'user-dono',
    nome: 'Dono',
    email: 'dono@studio.com',
    papel: 'dono',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'perf-gerente',
    userId: 'user-gerente',
    nome: 'Geraldo',
    email: 'gerente@studio.com',
    papel: 'gerente',
    ativo: true,
    criadoEm: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'perf-ana',
    userId: 'user-ana',
    nome: 'Ana',
    email: 'ana@studio.com',
    papel: 'recepcao',
    ativo: true,
    criadoEm: '2026-01-03T00:00:00.000Z',
  },
  {
    id: 'perf-bruno',
    userId: 'user-bruno',
    nome: 'Bruno',
    email: 'bruno@studio.com',
    papel: 'profissional',
    ativo: false,
    criadoEm: '2026-01-04T00:00:00.000Z',
  },
]

function valorAuth(papel: PapelPerfil): ContextoValor {
  const perfil: PerfilInfo = {
    id: papel === 'dono' ? 'perf-dono' : papel === 'gerente' ? 'perf-gerente' : 'perf-ana',
    userId: `user-${papel}`,
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

function env(children: ReactNode, papel: PapelPerfil = 'dono') {
  return render(
    <ContextoAuth.Provider value={valorAuth(papel)}>
      <ProfissionaisProvider>{children}</ProfissionaisProvider>
    </ContextoAuth.Provider>,
  )
}

function caixa(nomeAcao: string, quem: string): HTMLInputElement {
  return screen.getByRole('checkbox', { name: `${nomeAcao} — ${quem}` })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarPerfisEquipe).mockResolvedValue(equipe)
  vi.mocked(carregarPermissoesDaEquipe).mockResolvedValue({
    'perf-ana': { 'caixa:fechar': false },
  })
  vi.mocked(definirPermissaoDoPerfil).mockResolvedValue(undefined)
  vi.mocked(atualizarPerfilDoUsuario).mockImplementation(async (id, mudanca) => {
    const alvo = equipe.find((p) => p.id === id)
    return { ...alvo!, ...mudanca } as Perfil
  })
  vi.mocked(criarUsuarioEquipe).mockResolvedValue({ perfil: null, aviso: null })
})

describe('equipe', () => {
  it('lista os usuários com papel, situação e se seguem o padrão', async () => {
    env(<UsuariosPermissoes />)

    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.getByText('Bruno')).toBeTruthy()
    expect(screen.getByText('ana@studio.com')).toBeTruthy()

    expect(await screen.findByText('1 exceção(ões) ao papel')).toBeTruthy()
    expect(screen.getAllByText('Segue o padrão do papel').length).toBeGreaterThan(0)
    expect(screen.getByText('Inativo')).toBeTruthy()
    expect(screen.getByText('(você)')).toBeTruthy()
  })

  it('falha de leitura aparece na tela em vez de fingir que carregou', async () => {
    vi.mocked(listarPerfisEquipe).mockRejectedValue(new Error(SEM_SUPABASE_PERMISSOES))

    env(<UsuariosPermissoes />)

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toContain(SEM_SUPABASE_PERMISSOES)
  })
})

describe('exceções por pessoa', () => {
  it('marcar de volta o que a exceção revogava volta ao padrão (null)', async () => {
    env(<UsuariosPermissoes />)

    fireEvent.click(await screen.findByRole('button', { name: 'Permissões de Ana' }))
    const caixaFechar = caixa('Fechar o caixa', 'Ana')
    // recepcao tem caixa:fechar no papel e Ana está revogada pela exceção
    expect(caixaFechar.checked).toBe(false)

    fireEvent.click(caixaFechar)
    // igual ao padrão do papel → a linha é apagada, não gravada de novo
    await waitFor(() =>
      expect(definirPermissaoDoPerfil).toHaveBeenCalledWith('perf-ana', 'caixa:fechar', null),
    )
  })

  it('exceção false vira revogação quando o papel permite', async () => {
    vi.mocked(carregarPermissoesDaEquipe).mockResolvedValue({})
    env(<UsuariosPermissoes />)

    fireEvent.click(await screen.findByRole('button', { name: 'Permissões de Ana' }))
    const cadastrar = caixa('Cadastrar clientes', 'Ana')
    expect(cadastrar.checked).toBe(true)

    fireEvent.click(cadastrar)
    await waitFor(() =>
      expect(definirPermissaoDoPerfil).toHaveBeenCalledWith('perf-ana', 'clientes:criar', false),
    )
  })

  it('voltar ao padrão apaga a exceção (null), não grava o mesmo valor', async () => {
    vi.mocked(carregarPermissoesDaEquipe).mockResolvedValue({
      'perf-ana': { 'clientes:criar': false },
    })
    env(<UsuariosPermissoes />)

    fireEvent.click(await screen.findByRole('button', { name: 'Permissões de Ana' }))
    const cadastrar = caixa('Cadastrar clientes', 'Ana')
    expect(cadastrar.checked).toBe(false)

    fireEvent.click(cadastrar)
    await waitFor(() =>
      expect(definirPermissaoDoPerfil).toHaveBeenCalledWith('perf-ana', 'clientes:criar', null),
    )
  })

  it('a revogação de uma ação deixa as vizinhas do papel intactas', async () => {
    env(<UsuariosPermissoes />)

    fireEvent.click(await screen.findByRole('button', { name: 'Permissões de Ana' }))
    expect(caixa('Lançar receitas', 'Ana').checked).toBe(true)
    expect(caixa('Ver o caixa', 'Ana').checked).toBe(true)
    expect(caixa('Estornar lançamentos', 'Ana').checked).toBe(false)
  })
})

describe('dono é invariável na tela', () => {
  it('aparece com tudo marcado e travado, sem exceção possível', async () => {
    env(<UsuariosPermissoes />)

    fireEvent.click(await screen.findByRole('button', { name: 'Permissões de Dono' }))
    const estornar = caixa('Estornar lançamentos', 'Dono')
    expect(estornar.checked).toBe(true)
    expect(estornar.disabled).toBe(true)
    expect(screen.getByText(/O dono tem acesso total e não aceita exceção/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a equipe' }))
    expect(await screen.findByRole('button', { name: 'Permissões de Ana' })).toBeTruthy()
  })
})

describe('gestão de acesso', () => {
  it('quem não tem config:perfis_gerenciar vê a lista, mas não edita', async () => {
    env(<UsuariosPermissoes />, 'gerente')

    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '+ Novo usuário' })).toBeNull()
    expect(screen.queryByLabelText('Papel de Ana')).toBeNull()
    expect(screen.queryByLabelText('Desativar Ana')).toBeNull()
  })

  it('dono vê os controles de gestão', async () => {
    env(<UsuariosPermissoes />, 'dono')

    expect(await screen.findByRole('button', { name: '+ Novo usuário' })).toBeTruthy()
    expect(await screen.findByLabelText('Papel de Ana')).toBeTruthy()
    expect(screen.getByLabelText('Desativar Ana')).toBeTruthy()
  })

  it('criar usuário exige senha de 8 caracteres antes de chamar o servidor', async () => {
    env(<UsuariosPermissoes />, 'dono')

    fireEvent.click(await screen.findByRole('button', { name: '+ Novo usuário' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Carla' } })
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'carla@studio.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha (mínimo 8)'), {
      target: { value: '123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toMatch(/8 caracteres/)
    expect(criarUsuarioEquipe).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Senha (mínimo 8)'), {
      target: { value: 'senha-forte-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))

    await waitFor(() =>
      expect(criarUsuarioEquipe).toHaveBeenCalledWith({
        nome: 'Carla',
        email: 'carla@studio.com',
        senha: 'senha-forte-1',
        papel: 'profissional',
        profissionalId: null,
      }),
    )
  })

  it('trocar papel de alguém é confirmado na própria tela', async () => {
    env(<UsuariosPermissoes />, 'dono')

    fireEvent.change(await screen.findByLabelText('Papel de Ana'), {
      target: { value: 'gerente' },
    })

    await waitFor(() =>
      expect(atualizarPerfilDoUsuario).toHaveBeenCalledWith('perf-ana', { papel: 'gerente' }),
    )
    expect(await screen.findByText(/Papel alterado/)).toBeTruthy()
  })
})
