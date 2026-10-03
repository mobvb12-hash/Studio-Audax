// ============================================================================
// ia-infra.test.ts — módulos puros da infraestrutura da IA
// ----------------------------------------------------------------------------
// Cobre os itens que sustentam o comportamento, sem rede e sem banco:
//   • §22 configuração centralizada (normalização, padrão e fallback);
//   • §11/§14/§15/§21 fila de notificações (dedup, ordem, falha isolada);
//   • §17/§20 trilha de auditoria e aprendizado (sem CPF, sem telefone cru);
//   • §10 botões interativos com fallback textual no `whatsapp-enviar`.
// ============================================================================
import { describe, expect, it, vi } from 'vitest'
import {
  CONFIG_PADRAO,
  beneficiosDoPlano,
  lerConfiguracoes,
  normalizarConfiguracoes,
} from './configuracoes'
import {
  interpretarPendentes,
  parametrosResolver,
  processarFila,
  RPC_FILA,
  type NotificacaoPendente,
} from './notificacoes'
import {
  eventoVazio,
  montarEvento,
  parametrosEvento,
  semDigitosLongos,
} from './auditoria'
import {
  botoesUtilizaveis,
  montarPedidoEnvio,
} from './envio'
import {
  MAX_BOTOES,
  montarEnvioBotoes,
  montarEnvioTexto,
  normalizarBotoes,
  textoFallbackBotoes,
  type ConfigEvolution,
} from '../whatsapp-enviar/evolution'

const CHAVE = 'sb_secret_teste_1234567890'
const BASE = 'https://projeto.supabase.co'

/* ========================================================================== */
/* §22 — configuração centralizada                                            */
/* ========================================================================== */

describe('§22 · configuração centralizada', () => {
  it('normaliza o que vem do banco', () => {
    const config = normalizarConfiguracoes({
      links: { painel: 'https://studioaudax.com.br/painel', avaliacao: '' },
      avaliacao: { ativa: true, link: 'https://forms.exemplo/avaliacao', mensagem: 'Deixa sua opinião' },
      notificacoes: { posAtendimento: false },
      clube: { beneficios: { cabelo: ['Corte mensal'] } },
      ia: { maxSugestoes: 3, botoesInterativos: true, nomeAtendente: 'Ana' },
    })
    expect(config.links.painel).toBe('https://studioaudax.com.br/painel')
    expect(config.avaliacao.ativa).toBe(true)
    expect(config.notificacoes.posAtendimento).toBe(false)
    // campos ausentes herdam o padrão
    expect(config.notificacoes.profissionalAgendamento).toBe(true)
    expect(config.ia.maxSugestoes).toBe(3)
    expect(config.ia.botoesInterativos).toBe(true)
    expect(config.clube.beneficios.cabelo).toEqual(['Corte mensal'])
  })

  it('padrão é seguro: sem link de avaliação e sem benefício', () => {
    expect(CONFIG_PADRAO.avaliacao.link).toBe('')
    expect(CONFIG_PADRAO.avaliacao.ativa).toBe(false)
    expect(CONFIG_PADRAO.clube.beneficios).toEqual({})
    expect(beneficiosDoPlano(CONFIG_PADRAO, 'cabelo')).toEqual([])
  })

  it('recusa esquema perigoso e valor fora de faixa', () => {
    const config = normalizarConfiguracoes({
      links: { painel: 'javascript:alert(1)' },
      ia: { maxSugestoes: 99 },
    })
    expect(config.links.painel).toBe('')
    expect(config.ia.maxSugestoes).toBe(CONFIG_PADRAO.ia.maxSugestoes)
  })

  it('entrada bizarra devolve o padrão, sem lançar', () => {
    for (const entrada of [null, undefined, 42, 'texto', [1, 2]]) {
      expect(normalizarConfiguracoes(entrada)).toEqual(CONFIG_PADRAO)
    }
  })

  it('falha da RPC degrada para o padrão e informa o motivo', async () => {
    const resultado = await lerConfiguracoes(async () => {
      throw new Error('indisponível')
    })
    expect(resultado.doBanco).toBe(false)
    expect(resultado.motivo).toBeTruthy()
    expect(resultado.config).toEqual(CONFIG_PADRAO)
  })

  it('resposta vazia também cai no padrão', async () => {
    const resultado = await lerConfiguracoes(async () => null)
    expect(resultado.doBanco).toBe(false)
    expect(resultado.config).toEqual(CONFIG_PADRAO)
  })

  it('sucesso marca que veio do banco', async () => {
    const resultado = await lerConfiguracoes(async () => ({ ia: { maxSugestoes: 1 } }))
    expect(resultado.doBanco).toBe(true)
    expect(resultado.config.ia.maxSugestoes).toBe(1)
  })
})

/* ========================================================================== */
/* §11/§14/§15/§21 — fila de notificações                                     */
/* ========================================================================== */

describe('§21 · fila de notificações com deduplicação', () => {
  const item: NotificacaoPendente = {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    chave: 'profissional_agendamento:ag-1',
    tipo: 'notificacao_profissional',
    destino: '5581997373593',
    mensagem: '🔔 NOVO AGENDAMENTO',
    tentativas: 1,
  }

  it('interpreta a fila descartando item fora de formato', () => {
    const pendentes = interpretarPendentes([
      item,
      null,
      'texto',
      { id: 'curto', destino: '5581997373593', mensagem: 'x' },
      { id: 'a1b2c3d4-0000-4000-8000-000000000002', destino: '', mensagem: 'sem destino' },
    ])
    expect(pendentes).toHaveLength(2)
    expect(pendentes[0].chave).toBe('profissional_agendamento:ag-1')
  })

  it('resposta fora de array vira lista vazia', () => {
    expect(interpretarPendentes(null)).toEqual([])
    expect(interpretarPendentes({})).toEqual([])
    expect(interpretarPendentes('lixo')).toEqual([])
  })

  it('parâmetros de resolução são texto (contrato da lista branca)', () => {
    expect(parametrosResolver(item, true, null)).toEqual({
      p_id: item.id,
      p_ok: 'true',
      p_motivo: '',
    })
    expect(parametrosResolver(item, false, 'x'.repeat(500)).p_motivo).toHaveLength(300)
  })

  it('uma falha não interrompe os itens seguintes', async () => {
    const enviados: string[] = []
    const resumos = await processarFila(
      [
        { ...item, id: 'a1b2c3d4-0000-4000-8000-000000000001' },
        { ...item, id: 'a1b2c3d4-0000-4000-8000-000000000002' },
        { ...item, id: 'a1b2c3d4-0000-4000-8000-000000000003' },
      ],
      async (pendente) => {
        if (pendente.id.endsWith('0002')) throw new Error('explodiu')
        enviados.push(pendente.id)
        return { id: pendente.id, tipo: pendente.tipo, ok: true, motivo: null }
      },
    )
    expect(resumos).toHaveLength(3)
    expect(enviados).toHaveLength(2)
    expect(resumos[1].ok).toBe(false)
    expect(resumos[1].motivo).toContain('explodiu')
  })

  it('nomes das RPCs estão na lista branca', () => {
    expect(RPC_FILA.ler).toBe('ia_notificacoes_pendentes')
    expect(RPC_FILA.resolver).toBe('ia_notificacao_resolver')
  })

  it('vazio é fila vazia (nada a fazer)', async () => {
    const resumos = await processarFila([], async () => ({
      id: 'x',
      tipo: 'y',
      ok: true,
      motivo: null,
    }))
    expect(resumos).toEqual([])
  })
})

/* ========================================================================== */
/* §17/§20 — auditoria e aprendizado                                          */
/* ========================================================================== */

describe('§17/§20 · trilha de auditoria sem dado sensível', () => {
  it('telefone entra só mascarado', () => {
    const evento = montarEvento({
      fluxo: 'conversa',
      intencao: 'informativa',
      acao: 'criar',
      telefone: '5581997373593',
    })
    expect(evento.remetente).toBe('***3593 (13 digitos)')
    expect(evento.digitos).toBe(13)
    expect(JSON.stringify(parametrosEvento(evento))).not.toContain('5581997373593')
  })

  it('CPF completo é recusado no registro (barreira do item 9/20)', () => {
    const evento = montarEvento({
      fluxo: 'conversa',
      intencao: 'informativa',
      acao: '',
      contexto: { cpf: '12345678909' },
    })
    expect(evento.contexto.cpf).toBeUndefined()
    expect(semDigitosLongos('12345678909')).toBe(false)
    expect(semDigitosLongos('Cleiton Pedro')).toBe(true)
  })

  it('motivo longo é truncado e saneado', () => {
    const evento = montarEvento({
      fluxo: 'conversa',
      intencao: 'informativa',
      acao: 'criar',
      motivo: 'x'.repeat(1000),
    })
    expect(evento.motivo).toHaveLength(300)
  })

  it('secret é removido do motivo', () => {
    const evento = montarEvento({
      fluxo: 'conversa',
      intencao: 'informativa',
      acao: '',
      motivo: 'falhou com Bearer sb_secret_abcdefghijklmnop',
    })
    expect(evento.motivo).not.toContain('sb_secret_abcdefghijklmnop')
    expect(evento.motivo).toContain('[oculto]')
  })

  it('todos os parâmetros da RPC são texto', () => {
    const params = parametrosEvento(
      montarEvento({
        fluxo: 'conversa',
        intencao: 'informativa',
        acao: 'criar',
        executada: true,
        telefone: '5581997373593',
        contexto: { servico: 'Corte' },
        duracaoMs: 12,
      }),
    )
    for (const valor of Object.values(params)) expect(typeof valor).toBe('string')
    expect(params.p_executada).toBe('true')
    expect(params.p_digitos).toBe('13')
    expect(params.p_contexto).toContain('Corte')
  })

  it('evento vazio não carrega nada', () => {
    const evento = eventoVazio(5)
    expect(evento.remetente).toBe('')
    expect(evento.contexto).toEqual({})
    expect(parametrosEvento(evento).p_executada).toBe('false')
  })
})

/* ========================================================================== */
/* §10 — botões interativos com fallback                                     */
/* ========================================================================== */

describe('§10 · botões interativos com fallback textual', () => {
  const config: ConfigEvolution = {
    url: 'https://evolution.exemplo',
    apiKey: 'chave-secreta',
    instancia: 'studio-audax',
  }

  it('normaliza botões, limitando a 3 (limite do WhatsApp)', () => {
    const botoes = normalizarBotoes([
      { id: '1', texto: '13h' },
      { id: '2', texto: '13h30' },
      { id: '3', texto: '14h' },
      { id: '4', texto: '14h30' },
    ])
    expect(botoes).toHaveLength(MAX_BOTOES)
  })

  it('descarta botão inválido em vez de recusar o envio', () => {
    expect(normalizarBotoes([{ id: '1' }, null, 'x', { texto: '  ' }])).toBeNull()
    expect(normalizarBotoes([{ id: '1' }, { texto: '14h' }])).toEqual([
      { id: '1', texto: '14h' },
    ])
  })

  it('aceita as grafias text/buttonText', () => {
    expect(normalizarBotoes([{ buttonText: '13h' }])).toEqual([{ id: '1', texto: '13h' }])
    expect(normalizarBotoes([{ text: '13h' }])).toEqual([{ id: '1', texto: '13h' }])
  })

  it('monta sendButtons com a chave só no header', () => {
    const { url, init } = montarEnvioBotoes(config, {
      telefone: '11999999999',
      mensagem: 'Escolha seu horário',
      botoes: [{ id: '1', texto: '13h' }],
    })
    expect(url).toBe('https://evolution.exemplo/message/sendButtons/studio-audax')
    const headers = init.headers as Record<string, string>
    expect(headers.apikey).toBe('chave-secreta')
    expect(String(init.body)).not.toContain('chave-secreta')
    expect(JSON.parse(String(init.body))).toEqual({
      number: '5511999999999',
      text: 'Escolha seu horário',
      buttons: [{ id: '1', buttonText: '13h' }],
    })
  })

  it('sendText continua exatamente como antes (fallback)', () => {
    const { url, init } = montarEnvioTexto(config, { telefone: '11999999999', mensagem: 'oi' })
    expect(url).toBe('https://evolution.exemplo/message/sendText/studio-audax')
    expect(JSON.parse(String(init.body))).toEqual({ number: '5511999999999', text: 'oi' })
  })

  it('texto de fallback reproduz a lista numerada', () => {
    expect(textoFallbackBotoes([{ id: '1', texto: '13h' }, { id: '2', texto: '14h' }])).toBe(
      '1. 13h\n2. 14h',
    )
  })

  it('sem botão utilizável, o envio de texto não muda', () => {
    const semBotoes = normalizarBotoes(undefined)
    expect(semBotoes).toBeNull()
    expect(() => montarEnvioBotoes(config, { telefone: '11999999999', mensagem: 'oi' })).toThrow(
      /Botões inválidos/,
    )
  })

  it('pedido do webhook só leva botões quando existem', () => {
    const comBotoes = montarPedidoEnvio(BASE, CHAVE, {
      telefone: '5581997373593',
      mensagem: 'Escolha',
      botoes: [{ id: '1', texto: '13h' }],
    })
    expect(JSON.parse(String(comBotoes.init.body)).botoes).toEqual([{ id: '1', texto: '13h' }])

    const semBotoes = montarPedidoEnvio(BASE, CHAVE, {
      telefone: '5581997373593',
      mensagem: 'Escolha',
    })
    expect(JSON.parse(String(semBotoes.init.body))).toEqual({
      telefone: '5581997373593',
      mensagem: 'Escolha',
    })
  })

  it('botoesUtilizaveis descarta lixo e limita', () => {
    const todos = Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), texto: `${i}h` }))
    expect(botoesUtilizaveis(todos)).toHaveLength(3)
    expect(botoesUtilizaveis([{ texto: '' }])).toBeNull()
    expect(botoesUtilizaveis('x')).toBeNull()
  })

  it('a chave de servidor nunca vai para o corpo', () => {
    const spy = vi.fn()
    const { init } = montarPedidoEnvio(BASE, CHAVE, { telefone: '5581997373593', mensagem: 'oi' })
    spy(String(init.body))
    expect(spy.mock.calls[0][0]).not.toContain(CHAVE)
    expect(String(init.url)).not.toContain(CHAVE)
  })
})
