import { describe, expect, it } from 'vitest'
import { comTurnos, criarMemoria, criarRecentes } from './memoria'
import type { ContextoConversa } from './conversa'
import type { Turno } from './ia'

function contextoDe(historico: Turno[], rascunho: ContextoConversa['rascunho'] = null): ContextoConversa {
  return { atualizadoEm: 0, historico, rascunho }
}

describe('criarMemoria — contexto por remetente', () => {
  it('salva e lê o mesmo contexto', () => {
    const relogio = 1000
    const memoria = criarMemoria({ agora: () => relogio })
    const ctx = contextoDe([{ papel: 'cliente', texto: 'olá' }])
    memoria.salvar('5581999999999', ctx)
    expect(memoria.ler('5581999999999')).not.toBeNull()
    expect(memoria.ler('5581999999999')?.historico).toHaveLength(1)
    expect(memoria.tamanho()).toBe(1)
  })

  it('salvar renova o atualizadoEm (janela deslizante)', () => {
    let relogio = 0
    const memoria = criarMemoria({ agora: () => relogio, ttlMs: 1000 })
    memoria.salvar('a', contextoDe([]))
    relogio = 900
    memoria.salvar('a', contextoDe([]))
    relogio = 1500 // 600ms desde a última gravação, 1500 do início
    expect(memoria.ler('a')).not.toBeNull()
    relogio = 2000 // 1100ms desde a última gravação → expira
    expect(memoria.ler('a')).toBeNull()
    expect(memoria.tamanho()).toBe(0)
  })

  it('TTL descarta sozinho sem deixar lixo', () => {
    let relogio = 0
    const memoria = criarMemoria({ agora: () => relogio, ttlMs: 500 })
    memoria.salvar('a', contextoDe([]))
    memoria.salvar('b', contextoDe([]))
    relogio = 600
    expect(memoria.ler('a')).toBeNull()
    expect(memoria.ler('b')).toBeNull()
    expect(memoria.tamanho()).toBe(0)
  })

  it('teto de contextos descarta o mais antigo', () => {
    const relogio = 0
    const memoria = criarMemoria({ agora: () => relogio, maxContextos: 2 })
    memoria.salvar('a', contextoDe([]))
    memoria.salvar('b', contextoDe([]))
    memoria.salvar('c', contextoDe([]))
    expect(memoria.tamanho()).toBe(2)
    expect(memoria.ler('a')).toBeNull()
    expect(memoria.ler('b')).not.toBeNull()
    expect(memoria.ler('c')).not.toBeNull()
  })

  it('regravar o mesmo remetente refresca a ordem de descarte', () => {
    const relogio = 0
    const memoria = criarMemoria({ agora: () => relogio, maxContextos: 2 })
    memoria.salvar('a', contextoDe([]))
    memoria.salvar('b', contextoDe([]))
    memoria.salvar('a', contextoDe([])) // agora 'a' é o mais recente
    memoria.salvar('c', contextoDe([]))
    expect(memoria.ler('a')).not.toBeNull()
    expect(memoria.ler('b')).toBeNull()
    expect(memoria.ler('c')).not.toBeNull()
  })

  it('histórico é cortado no teto ao salvar', () => {
    const memoria = criarMemoria({ agora: () => 0, maxHistorico: 3 })
    const turnos: Turno[] = Array.from({ length: 6 }, (_, i) => ({
      papel: i % 2 === 0 ? 'cliente' : 'ia',
      texto: `t${i}`,
    }))
    memoria.salvar('a', contextoDe(turnos))
    const lido = memoria.ler('a')
    expect(lido?.historico).toHaveLength(3)
    expect(lido?.historico.map((t) => t.texto)).toEqual(['t3', 't4', 't5'])
  })

  it('remetentes diferentes não se misturam', () => {
    const memoria = criarMemoria({ agora: () => 0 })
    memoria.salvar('a', contextoDe([{ papel: 'cliente', texto: 'de a' }]))
    memoria.salvar('b', contextoDe([{ papel: 'cliente', texto: 'de b' }]))
    expect(memoria.ler('a')?.historico[0].texto).toBe('de a')
    expect(memoria.ler('b')?.historico[0].texto).toBe('de b')
  })

  it('o texto do cliente não vaza para quem não tem o remetente', () => {
    const memoria = criarMemoria({ agora: () => 0 })
    memoria.salvar('a', contextoDe([{ papel: 'cliente', texto: 'minha senha é 1234' }]))
    expect(memoria.ler('desconhecido')).toBeNull()
  })
})

describe('criarRecentes — deduplicação de eventos', () => {
  it('primeiro id é novo, repetição na janela é recusada', () => {
    const relogio = 0
    const recentes = criarRecentes({ agora: () => relogio, ttlMs: 1000 })
    expect(recentes.registrar('msg-1')).toBe(true)
    expect(recentes.registrar('msg-1')).toBe(false)
    expect(recentes.registrar('msg-2')).toBe(true)
    expect(recentes.tamanho()).toBe(2)
  })

  it('após o TTL o mesmo id volta a ser aceito', () => {
    let relogio = 0
    const recentes = criarRecentes({ agora: () => relogio, ttlMs: 1000 })
    expect(recentes.registrar('msg-1')).toBe(true)
    relogio = 1001
    expect(recentes.registrar('msg-1')).toBe(true)
  })

  it('janela usa <= no TTL (reentrega no limite da janela ainda conta)', () => {
    let relogio = 0
    const recentes = criarRecentes({ agora: () => relogio, ttlMs: 1000 })
    recentes.registrar('msg-1')
    relogio = 1000
    expect(recentes.registrar('msg-1')).toBe(false)
  })

  it('teto descarta o mais antigo, que pode ser registrado de novo', () => {
    const relogio = 0
    const recentes = criarRecentes({ agora: () => relogio, max: 3 })
    recentes.registrar('a')
    recentes.registrar('b')
    recentes.registrar('c')
    recentes.registrar('d') // estoura o teto → 'a' sai
    expect(recentes.tamanho()).toBe(3)
    expect(recentes.registrar('a')).toBe(true) // foi descartado → novo
    expect(recentes.registrar('c')).toBe(false) // ainda na janela
    expect(recentes.registrar('b')).toBe(true) // 'a' de novo empurrou 'b' para fora
  })
})

describe('comTurnos — histórico do fluxo informativo', () => {
  it('sem contexto anterior cria cliente + ia', () => {
    const ctx = comTurnos(null, 'quanto custa?', 'Custa R$ 55.', 42)
    expect(ctx.historico).toEqual([
      { papel: 'cliente', texto: 'quanto custa?' },
      { papel: 'ia', texto: 'Custa R$ 55.' },
    ])
    expect(ctx.atualizadoEm).toBe(42)
    expect(ctx.rascunho).toBeNull()
  })

  it('preserva o rascunho pendente do fluxo de agendamento', () => {
    const rascunho = { acao: 'criar' } as ContextoConversa['rascunho']
    const anterior = contextoDe([], rascunho)
    const ctx = comTurnos(anterior, 'oi', 'Olá!', 1)
    expect(ctx.rascunho).toBe(rascunho)
  })

  it('não duplica o turno do cliente quando já é o último', () => {
    const anterior = contextoDe([{ papel: 'cliente', texto: 'oi' }])
    const ctx = comTurnos(anterior, 'oi', 'Olá!', 1)
    expect(ctx.historico).toEqual([
      { papel: 'cliente', texto: 'oi' },
      { papel: 'ia', texto: 'Olá!' },
    ])
  })

  it('resposta vazia ou nula só acrescenta o cliente', () => {
    const ctx = comTurnos(null, 'oi', '   ', 1)
    expect(ctx.historico).toHaveLength(1)
    const ctx2 = comTurnos(null, 'oi', null, 1)
    expect(ctx2.historico).toHaveLength(1)
  })

  it('respeita o teto de turnos (corta os mais antigos)', () => {
    const anterior = contextoDe([
      { papel: 'cliente', texto: 'c1' },
      { papel: 'ia', texto: 'r1' },
      { papel: 'cliente', texto: 'c2' },
    ])
    const ctx = comTurnos(anterior, 'c3', 'r3', 1, 4)
    expect(ctx.historico.map((t) => t.texto)).toEqual(['r1', 'c2', 'c3', 'r3'])
  })
})
