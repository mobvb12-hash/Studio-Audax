import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PainelAuthProvider } from '../PainelAuthProvider'
import { criarClientePainelFalso } from '../clientePainelFalso'
import type { ClientePainelFalso } from '../clientePainelFalso'
import TelaCadastrarPainel from './TelaCadastrarPainel'

/**
 * O cadastro do cliente — a porta de entrada da Área do Cliente.
 *
 * São cinco dados obrigatórios, e este teste trava os cinco. A tela ainda
 * pede a confirmação da senha — que é detalhe da tela, não dado: ela não vai
 * para o servidor, só decide se a senha segue adiante. O que importa
 * aqui é o destino de cada um:
 *
 *   • nome, telefone e e-mail  → conta no Supabase (signUp) e ficha do cliente;
 *   • nascimento               → prova de vínculo da RPC 018, nunca no JWT;
 *   • senha                    → só no Supabase Auth.
 *
 * A prova de vínculo é o detalhe que não pode escapar: sem a data de
 * nascimento chegando inteira na RPC, quem tem mais de um cadastro parecido
 * fica sem jeito de provar quem é.
 */
function renderizar(
  cliente: ClientePainelFalso = criarClientePainelFalso(null),
) {
  const utils = render(
    <PainelAuthProvider cliente={cliente}>
      <TelaCadastrarPainel />
    </PainelAuthProvider>,
  )
  return { ...utils, cliente }
}

function campo(rotulo: string): HTMLInputElement {
  return screen.getByLabelText(rotulo) as HTMLInputElement
}

function preencherTudo() {
  fireEvent.change(campo('Nome completo'), { target: { value: 'Ana Silva' } })
  fireEvent.change(campo('E-mail'), { target: { value: 'ana@studio.com' } })
  fireEvent.change(campo('Telefone com DDD'), {
    target: { value: '(11) 98888-7777' },
  })
  fireEvent.change(campo('Data de nascimento'), {
    target: { value: '1995-06-15' },
  })
  fireEvent.change(campo('Senha'), { target: { value: 'segredo123' } })
  fireEvent.change(campo('Confirmar senha'), { target: { value: 'segredo123' } })
}

/** Submete o formulário direto, sem passar pela validação nativa do navegador. */
function submeter() {
  const botao = screen.getByRole('button', { name: 'Criar conta' })
  fireEvent.submit(botao.closest('form') as HTMLFormElement)
}

describe('TelaCadastrarPainel', () => {
  it('mostra os cinco dados e a confirmação de senha, tudo obrigatório', () => {
    renderizar()

    const rotulos = [
      'Nome completo',
      'E-mail',
      'Telefone com DDD',
      'Data de nascimento',
      'Senha',
      'Confirmar senha',
    ]
    for (const rotulo of rotulos) {
      expect(campo(rotulo).required).toBe(true)
    }
    // A data é `type="date"`: o navegador entrega `YYYY-MM-DD`, que é o formato
    // que a RPC 018 normaliza.
    expect(campo('Data de nascimento').type).toBe('date')
    expect(campo('E-mail').type).toBe('email')
    expect(campo('Telefone com DDD').type).toBe('tel')
    expect(campo('Senha').type).toBe('password')
  })

  it('cria a conta e leva o nascimento para a prova de vínculo', async () => {
    const { cliente } = renderizar()
    preencherTudo()

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    await waitFor(() => expect(cliente.cadastros).toHaveLength(1))
    expect(cliente.cadastros[0]).toMatchObject({
      nome: 'Ana Silva',
      email: 'ana@studio.com',
      telefone: '(11) 98888-7777',
      nascimento: '1995-06-15',
      senha: 'segredo123',
    })
    // A prova de vínculo recebe a data inteira — é ela que decide quem é quem.
    await waitFor(() => expect(cliente.chamadasVincular).toHaveLength(1))
    expect(cliente.chamadasVincular[0]).toEqual({
      nome: 'Ana Silva',
      telefone: '(11) 98888-7777',
      nascimento: '1995-06-15',
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sem data de nascimento não cria conta nem chama o servidor', async () => {
    const { cliente } = renderizar()
    preencherTudo()
    fireEvent.change(campo('Data de nascimento'), { target: { value: '' } })

    submeter()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Informe uma data de nascimento válida.',
      ),
    )
    expect(cliente.cadastros).toHaveLength(0)
    expect(cliente.chamadasVincular).toHaveLength(0)
  })

  it('sem e-mail não cria conta', async () => {
    const { cliente } = renderizar()
    preencherTudo()
    fireEvent.change(campo('E-mail'), { target: { value: '   ' } })

    submeter()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Informe seu e-mail.'),
    )
    expect(cliente.cadastros).toHaveLength(0)
  })

  it('senha curta é recusada antes de qualquer chamada', async () => {
    const { cliente } = renderizar()
    preencherTudo()
    // As duas ficam curtas e iguais: o que é recusado é o tamanho, não a igualdade.
    fireEvent.change(campo('Senha'), { target: { value: '123' } })
    fireEvent.change(campo('Confirmar senha'), { target: { value: '123' } })

    submeter()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'A senha precisa de pelo menos 6 caracteres.',
      ),
    )
    expect(cliente.cadastros).toHaveLength(0)
  })

  it('confirmação diferente da senha não cria conta nem chama o servidor', async () => {
    const { cliente } = renderizar()
    preencherTudo()
    fireEvent.change(campo('Confirmar senha'), { target: { value: 'outrasenha' } })

    submeter()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'As senhas precisam ser iguais.',
      ),
    )
    expect(cliente.cadastros).toHaveLength(0)
    expect(cliente.chamadasVincular).toHaveLength(0)
    // Corrigir o campo limpa o aviso: ele não vira ruído de fundo.
    fireEvent.change(campo('Confirmar senha'), { target: { value: 'segredo123' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
