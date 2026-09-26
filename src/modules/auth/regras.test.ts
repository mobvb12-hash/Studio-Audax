import { describe, expect, it } from 'vitest'
import { mensagemErroEntrada, sessaoExpirada } from './regras'

describe('sessaoExpirada', () => {
  it('sem sessão nunca é expirada', () => {
    expect(sessaoExpirada(null, 1_000_000)).toBe(false)
  })

  it('sessão sem validade declarada nunca expira', () => {
    expect(sessaoExpirada({ email: 'a@a.com', expiraEm: null }, 1_000_000)).toBe(
      false,
    )
  })

  it('validade no passado (ou igual ao agora) expira', () => {
    const agora = 1_000_000
    expect(sessaoExpirada({ email: 'a@a.com', expiraEm: agora - 1 }, agora)).toBe(
      true,
    )
    expect(sessaoExpirada({ email: 'a@a.com', expiraEm: agora }, agora)).toBe(true)
  })

  it('validade futura não expira', () => {
    expect(
      sessaoExpirada({ email: 'a@a.com', expiraEm: 1_000_001 }, 1_000_000),
    ).toBe(false)
  })
})

describe('mensagemErroEntrada', () => {
  it('erro de credencial vira frase genérica (não confirma o e-mail)', () => {
    expect(mensagemErroEntrada(new Error('Invalid login credentials'))).toBe(
      'E-mail ou senha inválidos.',
    )
  })

  it('erro de rede vira aviso de conexão', () => {
    expect(mensagemErroEntrada(new Error('Failed to fetch'))).toBe(
      'Falha de conexão. Tente novamente.',
    )
  })

  it('erro desconhecido vira frase genérica', () => {
    expect(mensagemErroEntrada('algo inesperado')).toBe(
      'E-mail ou senha inválidos.',
    )
  })
})
