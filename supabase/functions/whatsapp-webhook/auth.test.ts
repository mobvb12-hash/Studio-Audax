import { describe, expect, it } from 'vitest'
import { tokensIguais } from './auth.ts'

describe('tokensIguais — credencial server-to-server do pg_cron (timing-safe)', () => {
  it('aceita tokens idênticos', () => {
    const token = 'sb_secret_' + 'abcdef1234567890'
    expect(tokensIguais(token, token)).toBe(true)
  })

  it('recusa tokens diferentes no mesmo tamanho', () => {
    expect(tokensIguais('sb_secret_aaaaaaaaaaaaaaaa', 'sb_secret_bbbbbbbbbbbbbbbb')).toBe(false)
  })

  it('recusa prefixo de um token válido (não é comparação por startsWith)', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.comprimento.total.diferente.aqui'
    expect(tokensIguais(token, token + '.extra')).toBe(false)
    expect(tokensIguais(token + '.extra', token)).toBe(false)
  })

  it('recusa tamanhos diferentes', () => {
    expect(tokensIguais('curto', 'token_bem_mais_longo_que_o_outro')).toBe(false)
    expect(tokensIguais('token_bem_mais_longo_que_o_outro', 'curto')).toBe(false)
  })

  it('recusa token vazio contra credencial real', () => {
    expect(tokensIguais('', 'sb_secret_abc123')).toBe(false)
    expect(tokensIguais('sb_secret_abc123', '')).toBe(false)
  })

  it('aceita dois tokens vazios (mesmo valor)', () => {
    expect(tokensIguais('', '')).toBe(true)
  })

  it('compara bytes além do ASCII (UTF-8)', () => {
    expect(tokensIguais('ação-ção-ãé', 'ação-ção-ãé')).toBe(true)
    expect(tokensIguais('ação-ção-ãé', 'ação-ção-ãê')).toBe(false)
  })

  it('não aceita o token de outro formato legado (eyJ) no lugar do atual', () => {
    const legado = 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.assinatura_legada'
    const atual = 'sb_secret_' + 'chave_nova_diferente_do_legado'
    expect(tokensIguais(legado, atual)).toBe(false)
  })
})
