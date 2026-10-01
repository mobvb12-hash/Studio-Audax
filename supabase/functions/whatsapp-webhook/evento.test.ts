import { describe, expect, it } from 'vitest'
import {
  ehMensagemDeTeste,
  extrairTexto,
  interpretarEventoWebhook,
  mascararRemetente,
  montarCorpoConfiguracao,
  normalizarNomeEvento,
  variantesConfiguracao,
} from './evento'

const APIKEY_FICTICIA = 'chave-ficticia-nunca-logar'

function payloadRecebido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event: 'messages.upsert',
    instance: 'studio-audax',
    apikey: APIKEY_FICTICIA,
    destination: 'https://ydrfzbffxoklvnschlfy.supabase.co/functions/v1/whatsapp-webhook',
    date_time: '2026-10-01T14:00:00.000Z',
    sender: '5581997373593@s.whatsapp.net',
    server_url: 'https://evolution-exemplo.up.railway.app',
    body: {
      key: {
        remoteJid: '5581997373593@s.whatsapp.net',
        fromMe: false,
        id: '3EB0ABCDEF123456',
      },
      pushName: 'Cliente',
      message: { conversation: 'Teste recebimento Studio Audax' },
    },
    ...overrides,
  }
}

describe('interpretarEventoWebhook', () => {
  it('reconhece a mensagem recebida e extrai texto, remetente mascarado e id', () => {
    const evento = interpretarEventoWebhook(payloadRecebido())
    expect(evento.reconhecido).toBe(true)
    expect(evento.motivo).toBeNull()
    expect(evento.evento).toBe('messages.upsert')
    expect(evento.ehMensagem).toBe(true)
    expect(evento.recebida).toBe(true)
    expect(evento.texto).toBe('Teste recebimento Studio Audax')
    expect(evento.remetente).toBe('***3593 (13 digitos)')
    expect(evento.idMensagem).toBe('3EB0ABCDEF123456')
    expect(evento.apikeyPresente).toBe(true)
  })

  it('nunca devolve a apikey nem o remetente cru em nenhuma saída', () => {
    const evento = interpretarEventoWebhook(payloadRecebido())
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(APIKEY_FICTICIA)
    expect(serializado).not.toContain('5581997373593')
    expect(serializado).not.toContain('5581997373593@s.whatsapp.net')
    expect(Object.keys(evento)).not.toContain('apikey')
    expect(Object.keys(evento)).not.toContain('instance')
    expect(Object.keys(evento)).not.toContain('body')
  })

  it('marca como não recebida quando a mensagem saiu da instância (fromMe)', () => {
    const payload = payloadRecebido()
    const corpo = payload.body as { key: { fromMe: boolean } }
    corpo.key.fromMe = true
    const evento = interpretarEventoWebhook(payload)
    expect(evento.reconhecido).toBe(true)
    expect(evento.ehMensagem).toBe(true)
    expect(evento.recebida).toBe(false)
  })

  it('aceita evento em caixa alta MESSAGES_UPSERT', () => {
    const evento = interpretarEventoWebhook(payloadRecebido({ event: 'MESSAGES_UPSERT' }))
    expect(evento.reconhecido).toBe(true)
    expect(evento.evento).toBe('messages.upsert')
  })

  it('aceita recipientes de payload antigo `data` no lugar de `body`', () => {
    const base = payloadRecebido()
    const { body, ...resto } = base
    const evento = interpretarEventoWebhook({ ...resto, data: body })
    expect(evento.reconhecido).toBe(true)
    expect(evento.recebida).toBe(true)
    expect(evento.texto).toBe('Teste recebimento Studio Audax')
  })

  it('aceita `data` como array de mensagens (formato de certas versões)', () => {
    const base = payloadRecebido()
    const { body, ...resto } = base
    const evento = interpretarEventoWebhook({ ...resto, data: [body] })
    expect(evento.reconhecido).toBe(true)
    expect(evento.recebida).toBe(true)
    expect(evento.texto).toBe('Teste recebimento Studio Audax')
    expect(evento.idMensagem).toBe('3EB0ABCDEF123456')
  })

  it('reconhece evento que não é mensagem (ex.: connection-update) sem extrair nada', () => {
    const evento = interpretarEventoWebhook({ event: 'connection-update', instance: 'x' })
    expect(evento.reconhecido).toBe(true)
    expect(evento.ehMensagem).toBe(false)
    expect(evento.recebida).toBe(false)
    expect(evento.texto).toBeNull()
    expect(evento.evento).toBe('connection-update')
  })

  it('recusa corpo que não é objeto', () => {
    expect(interpretarEventoWebhook('webhook').motivo).toBe('corpo-nao-objeto')
    expect(interpretarEventoWebhook(null).motivo).toBe('corpo-nao-objeto')
    expect(interpretarEventoWebhook([1, 2]).motivo).toBe('corpo-nao-objeto')
  })

  it('recusa payload sem event', () => {
    const evento = interpretarEventoWebhook(payloadRecebido({ event: undefined }))
    expect(evento.reconhecido).toBe(false)
    expect(evento.motivo).toBe('sem-evento')
  })

  it('recusa messages.upsert sem body/data', () => {
    const resto = { ...payloadRecebido() }
    delete resto.body
    const evento = interpretarEventoWebhook(resto)
    expect(evento.reconhecido).toBe(false)
    expect(evento.motivo).toBe('sem-corpo')
    expect(evento.evento).toBe('messages.upsert')
  })

  it('recusa messages.upsert sem key', () => {
    const payload = payloadRecebido()
    delete (payload.body as Record<string, unknown>).key
    const evento = interpretarEventoWebhook(payload)
    expect(evento.reconhecido).toBe(false)
    expect(evento.motivo).toBe('sem-chave')
  })

  it('recusa key sem remoteJid', () => {
    const payload = payloadRecebido()
    const corpo = payload.body as { key: Record<string, unknown> }
    delete corpo.key.remoteJid
    const evento = interpretarEventoWebhook(payload)
    expect(evento.reconhecido).toBe(false)
    expect(evento.motivo).toBe('sem-remetente')
  })

  it('recusa key sem fromMe booleano', () => {
    const payload = payloadRecebido()
    const corpo = payload.body as { key: Record<string, unknown> }
    delete corpo.key.fromMe
    const evento = interpretarEventoWebhook(payload)
    expect(evento.reconhecido).toBe(false)
    expect(evento.motivo).toBe('sem-fromMe')
  })

  it('expõe apenas nomes de campos no diagnóstico, nunca valores', () => {
    const evento = interpretarEventoWebhook(payloadRecebido())
    expect(evento.chaves).toContain('event')
    expect(evento.chaves).toContain('body')
    expect(evento.chaves.every((chave) => typeof chave === 'string')).toBe(true)
    expect(evento.chaves.join(',')).not.toContain(APIKEY_FICTICIA)
  })

  it('mensagem sem texto legível (mídia) continua reconhecida com texto null', () => {
    const payload = payloadRecebido()
    const corpo = payload.body as { message: Record<string, unknown> }
    corpo.message = {}
    const evento = interpretarEventoWebhook(payload)
    expect(evento.reconhecido).toBe(true)
    expect(evento.texto).toBeNull()
  })
})

describe('normalizarNomeEvento', () => {
  it('normaliza caixa alta e sublinhados', () => {
    expect(normalizarNomeEvento('MESSAGES_UPSERT')).toBe('messages.upsert')
    expect(normalizarNomeEvento(' connection_UPDATE ')).toBe('connection.update')
  })
})

describe('extrairTexto', () => {
  it('lê conversation simples', () => {
    expect(extrairTexto({ conversation: 'Olá' })).toBe('Olá')
  })

  it('lê extendedTextMessage.text', () => {
    expect(extrairTexto({ extendedTextMessage: { text: 'Olá' } })).toBe('Olá')
  })

  it('retorna null sem mensagem ou sem texto', () => {
    expect(extrairTexto(undefined)).toBeNull()
    expect(extrairTexto({ imageMessage: {} })).toBeNull()
    expect(extrairTexto({ conversation: '' })).toBeNull()
  })
})

describe('mascararRemetente', () => {
  it('mantém apenas os 4 últimos dígitos e o total', () => {
    expect(mascararRemetente('5581997373593@s.whatsapp.net')).toBe('***3593 (13 digitos)')
  })

  it('trata número curto e ausência', () => {
    expect(mascararRemetente('1234@s.whatsapp.net')).toBe('*** (4 digitos)')
    expect(mascararRemetente(null)).toBeNull()
  })
})

describe('ehMensagemDeTeste', () => {
  it('classifica apenas o texto do teste desta etapa', () => {
    expect(ehMensagemDeTeste('Teste recebimento Studio Audax')).toBe(true)
    expect(ehMensagemDeTeste('  Teste recebimento Studio Audax')).toBe(true)
    expect(ehMensagemDeTeste('Bom dia!')).toBe(false)
    expect(ehMensagemDeTeste(null)).toBe(false)
  })
})

describe('montarCorpoConfiguracao', () => {
  it('monta exatamente o contrato de POST /webhook/set da 2.3.7', () => {
    expect(montarCorpoConfiguracao('https://exemplo.supabase.co/functions/v1/whatsapp-webhook')).toEqual({
      enabled: true,
      url: 'https://exemplo.supabase.co/functions/v1/whatsapp-webhook',
      events: ['MESSAGES_UPSERT'],
      base64: false,
    })
  })

  it('subcreve apenas o evento mínimo da etapa', () => {
    const corpo = montarCorpoConfiguracao('https://exemplo.co/f')
    expect(corpo.events).toHaveLength(1)
    expect(corpo.events[0]).toBe('MESSAGES_UPSERT')
  })
})

describe('variantesConfiguracao', () => {
  const url = 'https://exemplo.supabase.co/functions/v1/whatsapp-webhook'

  it('todas as variantes carregam a URL canônica do webhook', () => {
    for (const variante of variantesConfiguracao(url)) {
      expect(JSON.stringify(variante.corpo)).toContain(url)
    }
  })

  it('a primeira variante é o contrato confirmado (wrapper webhook) e duplicatas são removidas', () => {
    const variantes = variantesConfiguracao(url)
    expect(variantes[0].descricao).toContain('webhook-wrapper')
    expect(variantes[0].corpo).toHaveProperty('webhook')
    const corpos = variantes.map((variante) => JSON.stringify(variante.corpo))
    expect(new Set(corpos).size).toBe(corpos.length)
  })

  it('cobre os dois formatos de evento das versões da Evolution', () => {
    const serializado = JSON.stringify(variantesConfiguracao(url))
    expect(serializado).toContain('MESSAGES_UPSERT')
    expect(serializado).toContain('messages.upsert')
  })
})
