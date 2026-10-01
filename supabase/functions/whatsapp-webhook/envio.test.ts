import { describe, expect, it } from 'vitest'
import {
  deveEnviarResposta,
  interpretarEnvio,
  montarPedidoEnvio,
  normalizarNumero,
} from './envio'
import { extrairRemetente } from './evento'

// FASE 3 — testes somente do novo fluxo de integração IA → whatsapp-enviar.
// Nada aqui toca rede: a função envia fetch real somente no teste de campo.

const BASE = 'https://projeto-exemplo.supabase.co'
const SERVICE_ROLE = 'service-role-fake-do-teste'
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
  it('monta POST no caminho da função com Bearer só no header', () => {
    const { url, init } = montarPedidoEnvio(BASE, SERVICE_ROLE, {
      telefone: '81 99737-3593',
      mensagem: 'O Corte Degradê custa R$ 70,00.',
    })
    expect(url).toBe(`${BASE}/functions/v1/whatsapp-enviar`)
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${SERVICE_ROLE}`)
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('o corpo tem EXATAMENTE { telefone, mensagem } normalizados', () => {
    const { init } = montarPedidoEnvio(BASE, SERVICE_ROLE, {
      telefone: '(81) 99737-3593',
      mensagem: '  Resposta da IA.  ',
    })
    const corpo = JSON.parse(String(init.body))
    expect(Object.keys(corpo).sort()).toEqual(['mensagem', 'telefone'])
    expect(corpo.telefone).toBe('5581997373593')
    expect(corpo.mensagem).toBe('Resposta da IA.')
  })

  it('NENHUM segredo viaja no corpo ou na URL (service_role só no header)', () => {
    const { url, init } = montarPedidoEnvio(BASE, SERVICE_ROLE, {
      telefone: NUMERO_TESTE,
      mensagem: 'Olá!',
    })
    const corpo = String(init.body)
    expect(corpo).not.toContain(SERVICE_ROLE)
    expect(corpo).not.toMatch(/apikey|service.?role|bearer/i)
    expect(url).not.toContain(SERVICE_ROLE)
    expect(url).not.toMatch(/apikey/i)
  })

  it('recusa configuração inválida com mensagem própria (sem dados do pedido)', () => {
    expect(() =>
      montarPedidoEnvio('sem-protocolo', SERVICE_ROLE, {
        telefone: NUMERO_TESTE,
        mensagem: 'Olá',
      }),
    ).toThrow(/SUPABASE_URL/)
    expect(() =>
      montarPedidoEnvio(BASE, '', { telefone: NUMERO_TESTE, mensagem: 'Olá' }),
    ).toThrow(/service_role/)
    expect(() =>
      montarPedidoEnvio(BASE, SERVICE_ROLE, { telefone: '123', mensagem: 'Olá' }),
    ).toThrow(/Telefone/)
    expect(() => montarPedidoEnvio(BASE, SERVICE_ROLE, { telefone: NUMERO_TESTE, mensagem: '  ' })).toThrow(
      /Mensagem vazia/,
    )
    expect(() =>
      montarPedidoEnvio(BASE, SERVICE_ROLE, {
        telefone: NUMERO_TESTE,
        mensagem: 'x'.repeat(4097),
      }),
    ).toThrow(/4096/)
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
