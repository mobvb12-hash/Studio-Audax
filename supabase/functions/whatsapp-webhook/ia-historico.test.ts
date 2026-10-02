import { describe, expect, it } from 'vitest'
import { montarRequisicaoIa, processarMensagem } from './ia'
import type { ConfigIa, FontesOficiais, RequisicaoIa, Turno } from './ia'

const config: ConfigIa = {
  url: 'https://provedor.example/v1/',
  apiKey: 'sk-test-1234567890',
  modelo: 'gemini-3.1-flash-lite',
}

const fontes: FontesOficiais = {
  servicos: [{ nome: 'Corte Degradê', preco: 55, duracaoMin: 45 }],
  profissionais: [{ nome: 'Ítalo' }],
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  endereco: null,
}

function corpoDe(requisicao: RequisicaoIa): {
  model: string
  messages: { role: string; content: string }[]
} {
  return JSON.parse(requisicao.init.body as string)
}

describe('montarRequisicaoIa — parâmetro historico (FASE 5)', () => {
  it('sem histórico o corpo continua exatamente [system, user]', () => {
    const req = montarRequisicaoIa(config, 'contexto oficial', 'quanto custa?')
    const corpo = corpoDe(req)
    expect(corpo.messages).toHaveLength(2)
    expect(corpo.messages[0].role).toBe('system')
    expect(corpo.messages[1]).toEqual({ role: 'user', content: 'quanto custa?' })
    expect(corpo.model).toBe(config.modelo)
  })

  it('histórico entra entre o system e a pergunta atual, com papéis corretos', () => {
    const historico: Turno[] = [
      { papel: 'cliente', texto: 'olá' },
      { papel: 'ia', texto: 'Olá! Como ajudo?' },
    ]
    const req = montarRequisicaoIa(config, 'ctx', 'quero remarcar', historico)
    const corpo = corpoDe(req)
    expect(corpo.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(corpo.messages[3].content).toBe('quero remarcar')
  })

  it('limita aos 6 turnos mais recentes', () => {
    const historico: Turno[] = Array.from({ length: 10 }, (_, i) => ({
      papel: i % 2 === 0 ? ('cliente' as const) : ('ia' as const),
      texto: `t${i}`,
    }))
    const req = montarRequisicaoIa(config, 'ctx', 'atual', historico)
    const corpo = corpoDe(req)
    // system + 6 turnos + pergunta atual
    expect(corpo.messages).toHaveLength(8)
    expect(corpo.messages[1].content).toBe('t4')
    expect(corpo.messages[6].content).toBe('t9')
    expect(corpo.messages[7].content).toBe('atual')
  })

  it('a chave vai só no header; URL e corpo ficam limpos', () => {
    const req = montarRequisicaoIa(config, 'ctx', 'oi', [])
    expect(req.url).toBe('https://provedor.example/v1/chat/completions')
    expect(req.url).not.toContain('sk-test')
    const headers = req.init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${config.apiKey}`)
    expect(req.init.body as string).not.toContain('sk-test')
    // barra final do base nunca duplica
    expect(req.url).not.toContain('v1//')
  })
})

describe('processarMensagem — repassa o histórico ao provedor', () => {
  async function gerarCapturando(requisicoes: RequisicaoIa[]) {
    return async (requisicao: RequisicaoIa) => {
      requisicoes.push(requisicao)
      return { ok: true as const, texto: 'resposta do provedor', status: 200 }
    }
  }

  it('fluxo informativo usa historico quando presente', async () => {
    const requisicoes: RequisicaoIa[] = []
    const resultado = await processarMensagem({
      texto: 'Quanto custa o corte?',
      config,
      carregarFontes: async () => fontes,
      gerar: await gerarCapturando(requisicoes),
      historico: [
        { papel: 'cliente', texto: 'oi' },
        { papel: 'ia', texto: 'Olá!' },
      ],
    })
    expect(resultado.estado).toBe('gerada')
    expect(resultado.resposta).toBe('resposta do provedor')
    expect(requisicoes).toHaveLength(1)
    const corpo = corpoDe(requisicoes[0])
    expect(corpo.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(corpo.messages[3].content).toBe('Quanto custa o corte?')
  })

  it('sem historico mantém o comportamento antigo (compatibilidade)', async () => {
    const requisicoes: RequisicaoIa[] = []
    const resultado = await processarMensagem({
      texto: 'Quanto custa o corte?',
      config,
      carregarFontes: async () => fontes,
      gerar: await gerarCapturando(requisicoes),
    })
    expect(resultado.estado).toBe('gerada')
    const corpo = corpoDe(requisicoes[0])
    expect(corpo.messages).toHaveLength(2)
  })

  it('intenção bloqueada não consulta fontes nem o provedor', async () => {
    const requisicoes: RequisicaoIa[] = []
    const resultado = await processarMensagem({
      texto: 'cancela meu agendamento',
      config,
      carregarFontes: async () => fontes,
      gerar: await gerarCapturando(requisicoes),
      historico: [{ papel: 'cliente', texto: 'oi' }],
    })
    expect(resultado.estado).toBe('bloqueada')
    expect(requisicoes).toHaveLength(0)
  })
})
