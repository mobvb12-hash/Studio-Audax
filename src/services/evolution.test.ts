import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enviarTextoWhatsApp, FUNCAO_WHATSAPP } from './evolution'

// Cliente Supabase simulado: apenas `functions.invoke`. `ativo` simula o
// modo local (sem VITE_SUPABASE_URL → supabase() devolve null).
const estado = vi.hoisted(() => ({
  ativo: true,
  invoke: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: () => (estado.ativo ? { functions: { invoke: estado.invoke } } : null),
}))

beforeEach(() => {
  estado.ativo = true
  estado.invoke.mockReset()
  estado.invoke.mockResolvedValue({ data: { ok: true }, error: null })
})

describe('enviarTextoWhatsApp', () => {
  it('invoca a Edge Function whatsapp-enviar com telefone e mensagem', async () => {
    const resultado = await enviarTextoWhatsApp('5511999998888', 'Olá, tudo bem?')
    expect(resultado).toEqual({ ok: true })
    expect(estado.invoke).toHaveBeenCalledTimes(1)
    expect(estado.invoke).toHaveBeenCalledWith(FUNCAO_WHATSAPP, {
      body: { telefone: '5511999998888', mensagem: 'Olá, tudo bem?' },
    })
  })

  it('usa o nome fixo da função', () => {
    expect(FUNCAO_WHATSAPP).toBe('whatsapp-enviar')
  })

  it('envia só { body } — sem headers, sem URL e sem nada da Evolution', async () => {
    await enviarTextoWhatsApp('5511999998888', 'Olá')
    const chamada = estado.invoke.mock.calls[0]
    expect(chamada).toHaveLength(2)
    const [, opcoes] = chamada as [string, Record<string, unknown>]
    expect(Object.keys(opcoes)).toEqual(['body'])
    const serializado = JSON.stringify(opcoes).toLowerCase()
    expect(serializado).not.toContain('evolution')
    expect(serializado).not.toContain('apikey')
    expect(serializado).not.toContain('http')
  })

  it('reproduz { ok: false, motivo } devolvido pela função', async () => {
    estado.invoke.mockResolvedValue({
      data: { ok: false, motivo: 'Número inválido.' },
      error: null,
    })
    await expect(enviarTextoWhatsApp('11999998888', 'Olá')).resolves.toEqual({
      ok: false,
      motivo: 'Número inválido.',
    })
  })

  it('transforma erro de transporte em { ok: false, motivo }', async () => {
    estado.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch' },
    })
    await expect(enviarTextoWhatsApp('11999998888', 'Olá')).resolves.toEqual({
      ok: false,
      motivo: 'Failed to fetch',
    })
  })

  it('nunca lança: exceção vira { ok: false, motivo }', async () => {
    estado.invoke.mockRejectedValue(new Error('rede fora'))
    await expect(enviarTextoWhatsApp('11999998888', 'Olá')).resolves.toEqual({
      ok: false,
      motivo: 'rede fora',
    })
  })

  it('sem Supabase (modo local) não chama a função e explica o motivo', async () => {
    estado.ativo = false
    const resultado = await enviarTextoWhatsApp('11999998888', 'Olá')
    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toContain('Supabase não configurado')
    expect(estado.invoke).not.toHaveBeenCalled()
  })

  it('resposta sem ok e sem motivo vira recusa genérica', async () => {
    estado.invoke.mockResolvedValue({ data: null, error: null })
    await expect(enviarTextoWhatsApp('11999998888', 'Olá')).resolves.toEqual({
      ok: false,
      motivo: 'Envio recusado pela função.',
    })
  })
})
