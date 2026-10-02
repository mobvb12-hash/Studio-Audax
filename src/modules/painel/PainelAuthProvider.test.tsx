import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PainelAuthProvider } from './PainelAuthProvider'
import { AVISO_LINK_ENVIADO } from './regras'
import { usePainelAuth } from './usePainelAuth'
import {
  criarClientePainelFalso,
  sessaoValidaPainel,
} from './clientePainelFalso'
import type { ClientePainelFalso } from './clientePainelFalso'

function Probe() {
  const {
    estado,
    erro,
    processando,
    entrar,
    cadastrar,
    recuperar,
    redefinir,
    vincular,
    atualizar,
    sair,
  } = usePainelAuth()
  return (
    <div>
      <p data-testid="status">{estado.status}</p>
      {estado.status === 'sem_sessao' && estado.aviso && (
        <p data-testid="aviso-estado">{estado.aviso}</p>
      )}
      {estado.status === 'confirme_email' && (
        <p data-testid="email">{estado.email}</p>
      )}
      {estado.status === 'precisa_vinculo' && (
        <>
          <p data-testid="aviso-estado">{estado.aviso}</p>
          <span data-testid="nasc-mostra">
            {estado.mostrarNascimento ? 'sim' : 'nao'}
          </span>
          <span data-testid="nasc-obrig">
            {estado.nascimentoObrigatorio ? 'sim' : 'nao'}
          </span>
        </>
      )}
      {erro && <p role="alert">{erro}</p>}
      <span data-testid="processando">{processando ? 'sim' : 'nao'}</span>
      <button
        type="button"
        onClick={() => void entrar('ana@studio.com', 'segredo')}
      >
        Entrar
      </button>
      <button
        type="button"
        onClick={() =>
          void cadastrar({
            nome: 'Ana Silva',
            email: 'ana@studio.com',
            telefone: '(11) 98888-7777',
            senha: 'segredo123',
          })
        }
      >
        Cadastrar
      </button>
      <button
        type="button"
        onClick={() => void recuperar('ana@studio.com')}
      >
        Recuperar
      </button>
      <button type="button" onClick={() => void redefinir('novasenha1')}>
        Redefinir
      </button>
      <button
        type="button"
        onClick={() =>
          void vincular('Ana Silva', '(11) 98888-7777', '1990-05-20')
        }
      >
        Vincular
      </button>
      <button
        type="button"
        onClick={() =>
          void atualizar({
            nome: ' Ana Silva ',
            telefone: ' (11) 98888-7777 ',
            nascimento: '1990-05-20',
            genero: 'feminino',
          })
        }
      >
        Atualizar
      </button>
      <button
        type="button"
        onClick={() =>
          void atualizar({
            nome: 'A',
            telefone: '(11) 98888-7777',
            nascimento: '',
            genero: 'nao_informado',
          })
        }
      >
        Atualizar nome curto
      </button>
      <button
        type="button"
        onClick={() =>
          void atualizar({
            nome: 'Ana Silva',
            telefone: '123',
            nascimento: '',
            genero: 'nao_informado',
          })
        }
      >
        Atualizar telefone ruim
      </button>
      <button type="button" onClick={() => void sair()}>
        Sair
      </button>
    </div>
  )
}

function renderizar(cliente: ClientePainelFalso | null) {
  return render(
    <PainelAuthProvider cliente={cliente}>
      <Probe />
    </PainelAuthProvider>,
  )
}

function status(): string {
  return screen.getByTestId('status').textContent ?? ''
}

describe('PainelAuthProvider — autenticação do cliente', () => {
  it('sem Supabase o painel fica desabilitado', () => {
    renderizar(null)
    expect(status()).toBe('sem_supabase')
  })

  it('sem sessão cai na tela de acesso', async () => {
    renderizar(criarClientePainelFalso(null))
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sessão válida com vínculo concluído abre o painel', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    expect(cliente.chamadasVincular[0]).toEqual({
      nome: null,
      telefone: null,
      nascimento: '',
    })
  })

  it('sem dados de cadastro abre o formulário de vínculo (sem nascimento)', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    cliente.vincularResultado = new Error('Informe seu nome.')
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('precisa_vinculo'))
    expect(screen.getByTestId('nasc-mostra').textContent).toBe('nao')
    expect(screen.getByTestId('nasc-obrig').textContent).toBe('nao')
    expect(screen.getByTestId('aviso-estado').textContent).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('estado ambíguo exige nascimento e conclui o vínculo com ele', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    cliente.filaVincular = [
      { estado: 'ambiguo' },
      { estado: 'vinculado', clienteId: 'cli-2' },
    ]
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('precisa_vinculo'))
    expect(screen.getByTestId('nasc-mostra').textContent).toBe('sim')
    expect(screen.getByTestId('nasc-obrig').textContent).toBe('sim')
    expect(screen.getByTestId('aviso-estado').textContent).toMatch(
      /data de nascimento/i,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))
    await waitFor(() => expect(status()).toBe('pronto'))
    expect(cliente.chamadasVincular[1]).toEqual({
      nome: 'Ana Silva',
      telefone: '(11) 98888-7777',
      nascimento: '1990-05-20',
    })
  })

  it('login com sucesso faz o vínculo automático e abre o painel', async () => {
    const cliente = criarClientePainelFalso(null)
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(status()).toBe('pronto'))
    expect(cliente.entradas).toEqual([
      { email: 'ana@studio.com', senha: 'segredo' },
    ])
    expect(cliente.chamadasVincular[0]).toEqual({
      nome: null,
      telefone: null,
      nascimento: '',
    })
  })

  it('login com falha mostra mensagem amigável e segue sem sessão', async () => {
    const cliente = criarClientePainelFalso(null)
    cliente.erroEntrada = new Error('Invalid login credentials')
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'E-mail ou senha inválidos.',
      ),
    )
    expect(status()).toBe('sem_sessao')
  })

  it('cadastro com confirmação de e-mail ativa espera a confirmação', async () => {
    const cliente = criarClientePainelFalso(null)
    cliente.cadastroSemSessao = true
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await waitFor(() => expect(status()).toBe('confirme_email'))
    expect(screen.getByTestId('email').textContent).toBe('ana@studio.com')
    expect(cliente.cadastros[0].nome).toBe('Ana Silva')
    expect(cliente.chamadasVincular).toHaveLength(0)
  })

  it('cadastro com sessão vincula com nome e telefone informados', async () => {
    const cliente = criarClientePainelFalso(null)
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }))
    await waitFor(() => expect(status()).toBe('pronto'))
    expect(cliente.chamadasVincular[0]).toEqual({
      nome: 'Ana Silva',
      telefone: '(11) 98888-7777',
      nascimento: '',
    })
  })

  it('recuperação de senha responde sem vazar se o e-mail existe', async () => {
    const cliente = criarClientePainelFalso(null)
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar' }))
    await waitFor(() =>
      expect(screen.getByTestId('aviso-estado').textContent).toBe(
        AVISO_LINK_ENVIADO,
      ),
    )
    expect(cliente.chamadasRecuperar).toEqual(['ana@studio.com'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('redefinir a senha grava a nova e mantém o painel pronto', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir' }))
    await waitFor(() =>
      expect(cliente.chamadasRedefinir).toEqual(['novasenha1']),
    )
    expect(status()).toBe('pronto')
  })

  it('sessão de recuperação expirada vira aviso amigável', async () => {
    const cliente = criarClientePainelFalso(null)
    cliente.erroRedefinicao = new Error('Auth session missing!')
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'A sessão de recuperação expirou. Solicite um novo link.',
      ),
    )
    expect(status()).toBe('sem_sessao')
  })

  it('sair encerra o vínculo e volta para o acesso', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(status()).toBe('sem_sessao'))
    expect(cliente.sessaoAtual).toBeNull()
  })
})

describe('PainelAuthProvider — atualizar perfil (RPC 018)', () => {
  it('salva com os dados normalizados e sem erro', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() =>
      expect(cliente.chamadasAtualizar).toHaveLength(1),
    )
    expect(cliente.chamadasAtualizar[0]).toEqual({
      nome: 'Ana Silva',
      telefone: '(11) 98888-7777',
      nascimento: '1990-05-20',
      genero: 'feminino',
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('nome muito curto não chega ao servidor', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Atualizar nome curto' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Informe seu nome.'),
    )
    expect(cliente.chamadasAtualizar).toHaveLength(0)
  })

  it('telefone incompleto não chega ao servidor', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Atualizar telefone ruim' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Informe um telefone válido com DDD.',
      ),
    )
    expect(cliente.chamadasAtualizar).toHaveLength(0)
  })

  it('erro conhecido da RPC aparece com o texto original', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    cliente.erroAtualizar = new Error('Sessão expirada. Entre novamente.')
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Sessão expirada. Entre novamente.',
      ),
    )
    expect(cliente.chamadasAtualizar).toHaveLength(1)
  })

  it('erro desconhecido vira frase genérica (não vaza o banco)', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    cliente.erroAtualizar = new Error('P0001: coluna "x" inexistente')
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Não foi possível salvar o cadastro. Tente novamente.',
      ),
    )
  })

  it('falha de conexão vira aviso de conexão', async () => {
    const cliente = criarClientePainelFalso(sessaoValidaPainel())
    cliente.erroAtualizar = new Error('Failed to fetch')
    renderizar(cliente)
    await waitFor(() => expect(status()).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Falha de conexão. Tente novamente.',
      ),
    )
  })
})
