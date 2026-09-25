import { describe, expect, it } from 'vitest'
import { filtrarProfissionaisAtivos, validarProfissional } from './regras'
import type { Profissional } from './types'

function profissional(override: Partial<Profissional> = {}): Profissional {
  return {
    id: 'prof-1',
    nome: 'Audax',
    telefone: '',
    email: '',
    foto: '',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...override,
  }
}

describe('validarProfissional', () => {
  it('aceita profissional completo e cadastro mínimo sem telefone/e-mail', () => {
    expect(
      validarProfissional({
        nome: 'Diego Santos',
        telefone: '(11) 98888-7777',
        email: 'diego@email.com',
      }),
    ).toBeNull()
    expect(validarProfissional({ nome: 'Diego', telefone: '', email: '' })).toBe(
      null,
    )
  })

  it('rejeita nome curto', () => {
    expect(validarProfissional({ nome: '' })).toBe(
      'Informe o nome completo do profissional.',
    )
    expect(validarProfissional({ nome: ' D ' })).toBe(
      'Informe o nome completo do profissional.',
    )
  })

  it('rejeita telefone com menos de 8 dígitos quando preenchido', () => {
    expect(
      validarProfissional({ nome: 'Diego', telefone: '12345' }),
    ).toMatch(/telefone válido/)
    expect(validarProfissional({ nome: 'Diego', telefone: 'abc' })).toMatch(
      /telefone válido/,
    )
    expect(
      validarProfissional({ nome: 'Diego', telefone: '(11) 9888-7777' }),
    ).toBeNull()
  })

  it('rejeita e-mail malformado apenas quando preenchido', () => {
    expect(
      validarProfissional({ nome: 'Diego', email: 'nao-e-email' }),
    ).toMatch(/e-mail válido/)
    expect(validarProfissional({ nome: 'Diego', email: '' })).toBeNull()
    expect(
      validarProfissional({ nome: 'Diego', email: 'diego@email.com' }),
    ).toBeNull()
  })
})

describe('filtrarProfissionaisAtivos', () => {
  it('remove inativos das listas de novos agendamentos sem apagar nada', () => {
    const lista = [
      profissional({ id: 'a', nome: 'Audax', ativo: true }),
      profissional({ id: 'b', nome: 'Diego', ativo: false }),
    ]
    expect(filtrarProfissionaisAtivos(lista).map((p) => p.nome)).toEqual([
      'Audax',
    ])
    expect(lista).toHaveLength(2)
  })
})
