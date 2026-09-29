import { describe, expect, it } from 'vitest'
import {
  interpretarResposta,
  montarEnvioTexto,
  normalizarTelefone,
  validarConfig,
  validarPedido,
} from './evolution'
import type { ConfigEvolution } from './evolution'

const config: ConfigEvolution = {
  url: 'https://evolution-exemplo.up.railway.app',
  apiKey: 'chave-de-teste-123',
  instancia: 'studio-audax',
}

describe('validarConfig', () => {
  it('aceita configuração completa', () => {
    expect(validarConfig(config)).toBeNull()
  })

  it('recusa configuração nula', () => {
    expect(validarConfig(null)).toBeTruthy()
  })

  it('recusa URL ausente citando o segredo EVOLUTION_API_URL', () => {
    expect(validarConfig({ ...config, url: '' })).toContain('EVOLUTION_API_URL')
  })

  it('recusa URL sem http citando EVOLUTION_API_URL', () => {
    expect(validarConfig({ ...config, url: 'railway.app' })).toContain('EVOLUTION_API_URL')
  })

  it('recusa chave ausente citando EVOLUTION_API_KEY', () => {
    expect(validarConfig({ ...config, apiKey: '' })).toContain('EVOLUTION_API_KEY')
  })

  it('recusa instância ausente citando EVOLUTION_INSTANCE', () => {
    expect(validarConfig({ ...config, instancia: '' })).toContain('EVOLUTION_INSTANCE')
  })
})

describe('normalizarTelefone', () => {
  it('descarta formatação e mantém só os dígitos', () => {
    expect(normalizarTelefone('(11) 99999-8888')).toBe('11999998888')
  })

  it('mantém DDI quando presente', () => {
    expect(normalizarTelefone('+55 (11) 99999-8888')).toBe('5511999998888')
  })

  it('aceita número já em dígitos', () => {
    expect(normalizarTelefone('5511999998888')).toBe('5511999998888')
  })

  it('recusa vazio', () => {
    expect(normalizarTelefone('')).toBeNull()
  })

  it('recusa letras', () => {
    expect(normalizarTelefone('abc')).toBeNull()
  })

  it('recusa número curto demais', () => {
    expect(normalizarTelefone('1234567')).toBeNull()
  })

  it('recusa número longo demais (mais que 15 dígitos)', () => {
    expect(normalizarTelefone('1234567890123456')).toBeNull()
  })

  it('recusa valores que não são string', () => {
    expect(normalizarTelefone(11999998888)).toBeNull()
  })
})

describe('validarPedido', () => {
  const valido = { telefone: '5511999998888', mensagem: 'Olá!' }

  it('aceita pedido válido', () => {
    expect(validarPedido(valido)).toBeNull()
  })

  it('recusa pedido nulo', () => {
    expect(validarPedido(null)).toBeTruthy()
  })

  it('recusa telefone inválido', () => {
    expect(validarPedido({ ...valido, telefone: 'abc' })).toBe('Telefone inválido.')
  })

  it('recusa mensagem vazia', () => {
    expect(validarPedido({ ...valido, mensagem: '   ' })).toBe('Mensagem vazia.')
  })

  it('recusa mensagem ausente', () => {
    expect(validarPedido({ telefone: valido.telefone })).toBe('Mensagem vazia.')
  })

  it('aceita mensagem com exatamente 4096 caracteres', () => {
    expect(validarPedido({ ...valido, mensagem: 'x'.repeat(4096) })).toBeNull()
  })

  it('recusa mensagem acima de 4096 caracteres', () => {
    expect(validarPedido({ ...valido, mensagem: 'x'.repeat(4097) })).toContain('4096')
  })
})

describe('montarEnvioTexto', () => {
  it('monta a URL de sendText com a instância vinda da configuração', () => {
    const { url } = montarEnvioTexto(config, {
      telefone: '5511999998888',
      mensagem: 'Olá',
    })
    expect(url).toBe(
      'https://evolution-exemplo.up.railway.app/message/sendText/studio-audax',
    )
  })

  it('não duplica a barra final da base', () => {
    const { url } = montarEnvioTexto({ ...config, url: 'https://exemplo.com/' }, {
      telefone: '5511999998888',
      mensagem: 'Olá',
    })
    expect(url).toBe('https://exemplo.com/message/sendText/studio-audax')
  })

  it('faz POST com a chave apenas no header apikey', () => {
    const { init } = montarEnvioTexto(config, {
      telefone: '5511999998888',
      mensagem: 'Olá',
    })
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      apikey: 'chave-de-teste-123',
    })
  })

  it('envia o corpo no formato da 2.3.7: number + text no nível raiz', () => {
    const { init } = montarEnvioTexto(config, {
      telefone: '+55 (11) 99999-8888',
      mensagem: 'Olá mundo',
    })
    expect(JSON.parse(String(init.body))).toEqual({
      number: '5511999998888',
      text: 'Olá mundo',
    })
  })

  it('não usa o formato antigo textMessage.text, que a 2.3.7 recusa com 400', () => {
    const { init } = montarEnvioTexto(config, {
      telefone: '5511999998888',
      mensagem: 'Olá mundo',
    })
    const corpo = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(corpo).not.toHaveProperty('textMessage')
    expect(typeof corpo.text).toBe('string')
  })

  it('preserva emoji e quebras de linha na mensagem', () => {
    const { init } = montarEnvioTexto(config, {
      telefone: '5511999998888',
      mensagem: 'Olá 👋\nAté logo',
    })
    const corpo = JSON.parse(String(init.body)) as { text: string }
    expect(corpo.text).toBe('Olá 👋\nAté logo')
  })

  it('a chave nunca aparece na URL nem no corpo', () => {
    const { url, init } = montarEnvioTexto(config, {
      telefone: '5511999998888',
      mensagem: 'Olá',
    })
    expect(url).not.toContain(config.apiKey)
    expect(String(init.body)).not.toContain(config.apiKey)
    const cabecalhos = JSON.stringify(init.headers)
    expect(cabecalhos).toContain(config.apiKey)
  })

  it('lança quando o telefone é inválido', () => {
    expect(() =>
      montarEnvioTexto(config, { telefone: 'abc', mensagem: 'Olá' }),
    ).toThrow('Telefone inválido.')
  })

  it('lança quando a mensagem é vazia', () => {
    expect(() =>
      montarEnvioTexto(config, { telefone: '5511999998888', mensagem: '   ' }),
    ).toThrow('Mensagem vazia.')
  })
})

describe('interpretarResposta', () => {
  it('200 é sucesso sem motivo', () => {
    expect(interpretarResposta(200, '{}')).toEqual({ ok: true })
  })

  it('201 também é sucesso', () => {
    expect(interpretarResposta(201, '')).toEqual({ ok: true })
  })

  it('extrai message de error aninhado (formato da 2.3.7)', () => {
    const corpo = JSON.stringify({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Número inválido' },
    })
    expect(interpretarResposta(400, corpo)).toEqual({
      ok: false,
      motivo: 'Número inválido',
    })
  })

  it('aceita error como string simples', () => {
    expect(interpretarResposta(401, JSON.stringify({ error: 'unauthorized' }))).toEqual({
      ok: false,
      motivo: 'unauthorized',
    })
  })

  it('aceita message direto no corpo', () => {
    expect(interpretarResposta(404, JSON.stringify({ message: 'Instância inexistente' }))).toEqual({
      ok: false,
      motivo: 'Instância inexistente',
    })
  })

  it('corpo não-JSON vira motivo genérico com o status', () => {
    expect(interpretarResposta(500, '<html>erro</html>')).toEqual({
      ok: false,
      motivo: 'Evolution recusou o envio (HTTP 500).',
    })
  })

  it('corpo vazio também vira motivo genérico com o status', () => {
    expect(interpretarResposta(502, '').motivo).toContain('HTTP 502')
  })
})
