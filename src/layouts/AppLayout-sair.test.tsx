// Regressão de R1 e R2 (auditoria de Autenticação e Sessão).
//
// R1 — não havia logout na interface: `sair()` existia no contexto mas
// nenhum componente consumia, e com `persistSession: true` a sessão
// sobrevivia a F5 e ao fechamento do navegador. Este arquivo trava a
// existência do botão "Sair" e do fluxo com confirmação.
//
// R2 — `sair()` engolia a falha de `auth.signOut()` e marcava `deslogado`
// mesmo assim: o estado local divergia do provedor, whose sessão seguia
// viva, e o próximo F5 entrava sozinho. Agora a falha é informada e o estado
// continua coerente.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppLayout from './AppLayout'
import {
  AuthProvider,
  type EstadoAuth,
} from '@/modules/auth/AuthProvider'
import { criarClienteAuthFalso, type ClienteAuthFalso } from '@/modules/auth/clienteAuthFalso'
import type { ClienteAuth, SessaoInfo } from '@/modules/auth/tipos'

let cliente: ClienteAuthFalso
let estadoAtual: EstadoAuth = { status: 'desabilitado' }

const SESSAO: SessaoInfo = {
  email: 'audax@studio.com.br',
  expiraEm: Math.floor(Date.now() / 1000) + 3600,
}

function Espelho() {
  // o AppLayout lê o mesmo contexto; este consumidor só captura o estado
  return null
}

function montar() {
  return render(
    <AuthProvider cliente={cliente}>
      <Espelho />
      <AppLayout paginaAtual="painel" onNavegar={() => {}}>
        <p>conteudo-protegido</p>
      </AppLayout>
    </AuthProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  estadoAtual = { status: 'desabilitado' }
  cliente = criarClienteAuthFalso(SESSAO)
})

describe('R1 — logout acessível na interface', () => {
  it('existe um botão "Sair" visível no painel autenticado', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy()
  })

  it('pede confirmação antes de sair e mantém o painel enquanto ela não vem', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))

    // confirmação aparece
    expect(screen.getByText('Sair do Studio Audax')).toBeTruthy()
    // e nada foi encerrado ainda
    expect(cliente.sessoes).not.toBeNull()

    // cancelar não encerra a sessão
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByText('Sair do Studio Audax')).toBeNull()
    expect(cliente.sessoes).not.toBeNull()
  })

  it('confirmar chama sair() e a sessão é encerrada no provedor', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))

    await waitFor(() => expect(cliente.sessoes).toBeNull())
  })
})

describe('R2 — falha ao encerrar sessão não vira logout falso', () => {
  it('signOut falhando mantém a sessão e informa o erro', async () => {
    cliente.sair = vi.fn(async () => {
      throw new Error('falha de rede')
    })
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    })

    // a sessão do provedor continua viva
    expect(cliente.sair).toHaveBeenCalled()
    // e o erro é visível
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível encerrar a sessão/),
    )
  })

  it('signOut bem-sucedido encerra sem mostrar erro', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    })

    await waitFor(() => expect(cliente.sessoes).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// o tipo do contexto precisa continuar aceitando o cliente falso
const _contrato: ClienteAuth = criarClienteAuthFalso()
void _contrato
void estadoAtual
