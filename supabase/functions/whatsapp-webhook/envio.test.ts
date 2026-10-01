import { describe, expect, it } from 'vitest'
import {
  deveEnviarResposta,
  interpretarEnvio,
  lerChaveSecreta,
  montarPedidoEnvio,
  normalizarNumero,
} from './envio'
import { extrairRemetente } from './evento'

// FASE 3 — testes somente do fluxo de integração IA → whatsapp-enviar.
// Nada aqui toca rede: a função envia fetch real somente no teste de campo.

const BASE = 'https://projeto-exemplo.supabase.co'
// Credencial FICTÍCIA construída por concatenação (nunca um valor real no Git).
const CHAVE = 'sb_secret_' + 'faketeste0123456789abcdef0123456789'
const LEGADO_EYJ = 'eyJhbGciOiJIUzI1NiJ9.ficticio.assinatura'
const NUMERO_TESTE = '5581997373593'
const JID_TESTE = '5581997373593@s.whatsapp.net'

const gerada = (resposta: string | null = 'O Corte Degradê custa R$ 70,00.') => ({
  estado: 'gerada',
  resposta,
  remetente: NUMERO_TESTE,
  numeroTeste: NUMERO_TESTE,
})

describe('normalizarNumero', () => {
  it('completa DDI 55 em celular de 11 dígitos e mantém 13 dígitos intactos', () => {
    expect(normalizarNumero('81 99737-3593')).toBe('5581997373593')
    expect(normalizarNumero('5581997373593')).toBe('5581997373593')
    expect(normalizarNumero('+55 (81) 9 9737-3593')).toBe('5581997373593')
  })

  it('recusa valores não utilizáveis', () => {
    expect(normalizarNumero('123')).toBeNull()
    expect(normalizarNumero('')).toBeNull()
    expect(normalizarNumero(null)).toBeNull()
    expect(normalizarNumero(5581997373593)).toBeNull()
  })
})

describe('deveEnviarResposta — lista de teste', () => {
  it('envia somente quando estado é gerada e remetente é o número de teste', () => {
    expect(deveEnviarResposta(gerada())).toBe(true)
    expect(deveEnviarResposta({ ...gerada(), remetente: JID_TESTE })).toBe(true)
    expect(
      deveEnviarResposta({ ...gerada(), remetente: '81997373593', numeroTeste: '81 99737-3593' }),
    ).toBe(true)
  })

  it('NUNCA envia para número fora da lista de teste', () => {
    expect(deveEnviarResposta({ ...gerada(), remetente: '5511988887777' })).toBe(false)
    expect(deveEnviarResposta({ ...gerada(), remetente: null })).toBe(false)
  })

  it('NUNCA envia sem secret de número de teste configurado', () => {
    expect(deveEnviarResposta({ ...gerada(), numeroTeste: '' })).toBe(false)
    expect(deveEnviarResposta({ ...gerada(), numeroTeste: null })).toBe(false)
  })

  it('NUNCA envia fora do estado gerada (bloqueios e falhas ficam sem envio)', () => {
    expect(deveEnviarResposta({ ...gerada(), estado: 'bloqueada' })).toBe(false)
    expect(deveEnviarResposta({ ...gerada(), estado: 'falha-provedor' })).toBe(false)
    expect(deveEnviarResposta({ ...gerada(), estado: 'falha-fontes' })).toBe(false)
    expect(deveEnviarResposta({ ...gerada(), estado: 'sem-provedor' })).toBe(false)
  })

  it('NUNCA envia resposta nula ou vazia', () => {
    expect(deveEnviarResposta(gerada(null))).toBe(false)
    expect(deveEnviarResposta(gerada('   '))).toBe(false)
  })
})

describe('montarPedidoEnvio — contrato { telefone, mensagem } do whatsapp-enviar', () => {
  it('monta POST no caminho da função com a credencial SOMENTE no header apikey', () => {
    const { url, init } = montarPedidoEnvio(BASE, CHAVE, {
      telefone: '81 99737-3593',
      mensagem: 'O Corte Degradê custa R$ 70,00.',
    })
    expect(url).toBe(`${BASE}/functions/v1/whatsapp-enviar`)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.apikey).toBe(CHAVE)
    // O withSupabase lê `apikey` para o modo secret; Authorization com
    // credencial legada era rejeitado como INVALID_JWT (HTTP 401).
    expect(headers.Authorization).toBeUndefined()
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('o corpo tem EXATAMENTE { telefone, mensagem } normalizados', () => {
    const { init } = montarPedidoEnvio(BASE, CHAVE, {
      telefone: '(81) 99737-3593',
      mensagem: '  Resposta da IA.  ',
    })
    const corpo = JSON.parse(String(init.body))
    expect(Object.keys(corpo).sort()).toEqual(['mensagem', 'telefone'])
    expect(corpo.telefone).toBe('5581997373593')
    expect(corpo.mensagem).toBe('Resposta da IA.')
  })

  it('NENHUM segredo viaja no corpo ou na URL (credencial só no header apikey)', () => {
    const { url, init } = montarPedidoEnvio(BASE, CHAVE, {
      telefone: NUMERO_TESTE,
      mensagem: 'Olá!',
    })
    const corpo = String(init.body)
    expect(corpo).not.toContain(CHAVE)
    expect(corpo).not.toMatch(/apikey|service.?role|bearer|sb_secret/i)
    expect(url).not.toContain(CHAVE)
    expect(url).not.toMatch(/apikey|sb_secret/i)
  })

  it('recusa credencial legada (eyJ) e vazia — mensagem própria sem a chave', () => {
    expect(() =>
      montarPedidoEnvio(BASE, LEGADO_EYJ, { telefone: NUMERO_TESTE, mensagem: 'Olá' }),
    ).toThrow(/Credencial/)
    expect(() =>
      montarPedidoEnvio(BASE, '', { telefone: NUMERO_TESTE, mensagem: 'Olá' }),
    ).toThrow(/Credencial/)
    let mensagemErro = ''
    try {
      montarPedidoEnvio(BASE, '', { telefone: NUMERO_TESTE, mensagem: 'Olá' })
    } catch (erro) {
      mensagemErro = erro instanceof Error ? erro.message : ''
    }
    expect(mensagemErro).not.toContain(CHAVE)
    expect(mensagemErro).not.toContain(LEGADO_EYJ)
  })

  it('recusa configuração inválida com mensagem própria (sem dados do pedido)', () => {
    expect(() =>
      montarPedidoEnvio('sem-protocolo', CHAVE, {
        telefone: NUMERO_TESTE,
        mensagem: 'Olá',
      }),
    ).toThrow(/SUPABASE_URL/)
    expect(() =>
      montarPedidoEnvio(BASE, CHAVE, { telefone: '123', mensagem: 'Olá' }),
    ).toThrow(/Telefone/)
    expect(() => montarPedidoEnvio(BASE, CHAVE, { telefone: NUMERO_TESTE, mensagem: '  ' })).toThrow(
      /Mensagem vazia/,
    )
    expect(() =>
      montarPedidoEnvio(BASE, CHAVE, {
        telefone: NUMERO_TESTE,
        mensagem: 'x'.repeat(4097),
      }),
    ).toThrow(/4096/)
  })
})

describe('lerChaveSecreta — credencial exclusivamente de SUPABASE_SECRET_KEYS', () => {
  it('usa SUPABASE_SECRET_KEYS["default"] quando válido (sb_secret_*)', () => {
    const ambiente = { SUPABASE_SECRET_KEYS: JSON.stringify({ default: ` ${CHAVE} ` }) }
    expect(lerChaveSecreta((nome) => ambiente[nome as keyof typeof ambiente])).toBe(CHAVE)
  })

  it('SEM SUPABASE_SECRET_KEYS o envio é impedido (null → sem montagem)', () => {
    expect(lerChaveSecreta(() => undefined)).toBeNull()
    expect(lerChaveSecreta((nome) => (nome === 'SUPABASE_SECRET_KEYS' ? '' : undefined))).toBeNull()
  })

  it('NUNCA usa SUPABASE_SERVICE_ROLE_KEY como fallback', () => {
    const ambiente = { SUPABASE_SERVICE_ROLE_KEY: LEGADO_EYJ }
    const obtido = lerChaveSecreta((nome) => ambiente[nome as keyof typeof ambiente])
    expect(obtido).toBeNull()
    expect(obtido).not.toBe(LEGADO_EYJ)
  })

  it('descarta JSON malformado, array, ausência de default e prefixo errado', () => {
    expect(lerChaveSecreta(() => '{quebrado')).toBeNull()
    expect(lerChaveSecreta(() => '["sb_secret_x"]')).toBeNull()
    expect(lerChaveSecreta(() => JSON.stringify({ outro: CHAVE }))).toBeNull()
    expect(lerChaveSecreta(() => JSON.stringify({ default: LEGADO_EYJ }))).toBeNull()
    expect(lerChaveSecreta(() => JSON.stringify({ default: 123 }))).toBeNull()
    expect(lerChaveSecreta(() => JSON.stringify({ default: '   ' }))).toBeNull()
  })

  it('o valor lido nunca aparece nas mensagens de erro do fluxo', () => {
    let capturado = ''
    try {
      montarPedidoEnvio(BASE, CHAVE, { telefone: '123', mensagem: 'Olá' })
    } catch (erro) {
      capturado = erro instanceof Error ? erro.message : ''
    }
    expect(capturado).not.toContain(CHAVE)
    expect(capturado).not.toContain('sb_secret_faketeste')
  })
})

describe('interpretarEnvio — resposta do whatsapp-enviar', () => {
  it('confirma envio em 2xx com ok true', () => {
    expect(interpretarEnvio(200, '{"ok":true}')).toEqual({ ok: true })
  })

  it('propaga motivo de recusa (máx. 300)', () => {
    const resultado = interpretarEnvio(401, '{"ok":false,"motivo":"Sessão inválida."}')
    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toBe('Sessão inválida.')
  })

  it('corpo não-JSON vira motivo genérico de status', () => {
    expect(interpretarEnvio(502, '<html>erro</html>')).toEqual({
      ok: false,
      motivo: 'O envio não foi confirmado (HTTP 502).',
    })
  })
})

describe('extrairRemetente — origem única do destinatário', () => {
  const payload = (extra: Record<string, unknown> = {}) => ({
    event: 'MESSAGES_UPSERT',
    instance: 'studio-audax',
    body: {
      key: { remoteJid: JID_TESTE, fromMe: false, id: 'MSGTESTE' },
      message: { conversation: 'Quanto custa o Corte Degradê?' },
      ...extra,
    },
  })

  it('extrai os dígitos do remetente do evento', () => {
    expect(extrairRemetente(payload())).toBe(NUMERO_TESTE)
  })

  it('aceita body em lista (formato alternativo da Evolution)', () => {
    const corpo = { ...payload(), body: [payload().body] }
    expect(extrairRemetente(corpo)).toBe(NUMERO_TESTE)
  })

  it('devolve null quando não há remetente utilizável', () => {
    expect(extrairRemetente({ event: 'MESSAGES_UPSERT' })).toBeNull()
    expect(extrairRemetente('não-objeto')).toBeNull()
    expect(
      extrairRemetente({
        event: 'MESSAGES_UPSERT',
        body: { key: { remoteJid: 'grupo@g.us', fromMe: false, id: 'x' }, message: {} },
      }),
    ).toBeNull()
  })
})
