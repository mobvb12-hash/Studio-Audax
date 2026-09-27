import { describe, expect, it } from 'vitest'
import { perfilAtivo, verificarPapel } from './perfis'
import type { Perfil } from './perfis'

const perfilAdmin: Perfil = {
  id: 'p1',
  userId: 'u1',
  nome: 'Admin',
  email: 'admin@studio.com',
  papel: 'admin',
  ativo: true,
  criadoEm: '2026-01-01T00:00:00.000Z',
}

const perfilInativo: Perfil = { ...perfilAdmin, ativo: false }

describe('perfilAtivo', () => {
  it('retorna true para perfil ativo', async () => {
    await expect(perfilAtivo(perfilAdmin)).resolves.toBe(true)
  })

  it('retorna false para perfil inativo', async () => {
    await expect(perfilAtivo(perfilInativo)).resolves.toBe(false)
  })

  it('retorna false para null', async () => {
    await expect(perfilAtivo(null)).resolves.toBe(false)
  })
})

describe('verificarPapel', () => {
  it('permite admin acessar admin', async () => {
    await expect(verificarPapel(perfilAdmin, ['admin'])).resolves.toBe(true)
  })

  it('permite recepcao acessar recepcao', async () => {
    const recepcao = { ...perfilAdmin, papel: 'recepcao' as const }
    await expect(verificarPapel(recepcao, ['recepcao'])).resolves.toBe(true)
  })

  it('bloqueia profissional acessar admin', async () => {
    const profissional = { ...perfilAdmin, papel: 'profissional' as const }
    await expect(verificarPapel(profissional, ['admin'])).resolves.toBe(false)
  })

  it('bloqueia perfil inativo mesmo com papel correto', async () => {
    await expect(verificarPapel(perfilInativo, ['admin'])).resolves.toBe(false)
  })

  it('bloqueia null', async () => {
    await expect(verificarPapel(null, ['admin'])).resolves.toBe(false)
  })
})
