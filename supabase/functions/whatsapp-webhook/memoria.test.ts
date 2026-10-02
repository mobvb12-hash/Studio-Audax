import { describe, expect, it } from 'vitest'
import { TTL_CONTEXTO_MS, comTurnos, criarMemoria, criarRecentes } from './memoria'
import { criarArmazenamentoFalso } from './armazenamento-falso'
import type { ContextoConversa } from './conversa'
import type { Turno } from './ia'

const CHAVE_A = '5581999999999'
const CHAVE_B = '5581888888888'

function contextoDe(historico: Turno[], rascunho: ContextoConversa['rascunho'] = null): ContextoConversa {
  return { atualizadoEm: 0, historico, rascunho }
}

function memoriaSobre(armazenamento = criarArmazenamentoFalso(), opcoes: { ttlMs?: number; maxHistorico?: number } = {}) {
  const memoria = criarMemoria(armazenamento, {
    agora: () => armazenamento.agora(),
    ...opcoes,
  })
  return { armazenamento, memoria }
}

describe('criarMemoria — contexto por remetente (persistente)', () => {
  it('salva e lê o mesmo contexto', async () => {
    const { memoria } = memoriaSobre()
    const ctx = contextoDe([{ papel: 'cliente', texto: 'olá' }])
    await memoria.salvar(CHAVE_A, ctx)
    const lido = await memoria.ler(CHAVE_A)
    expect(lido).not.toBeNull()
    expect(lido?.historico).toHaveLength(1)
  })

  it('salvar renova o atualizadoEm (janela deslizante)', async () => {
    const { armazenamento, memoria } = memoriaSobre(criarArmazenamentoFalso(), { ttlMs: 1000 })
    await memoria.salvar(CHAVE_A, contextoDe([]))
    armazenamento.avancar(900)
    await memoria.salvar(CHAVE_A, contextoDe([]))
    armazenamento.avancar(600) // 600ms desde a última gravação
    expect(await memoria.ler(CHAVE_A)).not.toBeNull()
    armazenamento.avancar(500) // 1100ms desde a última gravação → expira
    expect(await memoria.ler(CHAVE_A)).toBeNull()
  })

  it('contexto expirado não é recuperado e sai do armazenamento', async () => {
    const { armazenamento, memoria } = memoriaSobre()
    await memoria.salvar(CHAVE_A, contextoDe([]))
    armazenamento.avancar(TTL_CONTEXTO_MS)
    expect(await memoria.ler(CHAVE_A)).toBeNull()
    expect(armazenamento.existeContexto(CHAVE_A)).toBe(false)
    expect(armazenamento.quantosContextos()).toBe(0)
  })

  it('TTL também é checado no cliente além do armazenamento', async () => {
    // registro gravado DIRETO no armazenamento (coluna fresca) com
    // atualizadoEm antigo no corpo: sem a checagem do cliente a leitura
    // voltaria; com ela, expira e o registro é removido.
    const armazenamento = criarArmazenamentoFalso()
    armazenamento.definirAgora(0)
    await armazenamento.salvar(CHAVE_A, { ...contextoDe([]), atualizadoEm: 0 })
    armazenamento.avancar(5 * 60 * 1000 + 1) // 5min+: coluna ainda no TTL de 30
    const memoria = criarMemoria(armazenamento, {
      agora: () => armazenamento.agora(),
      ttlMs: 5 * 60 * 1000,
    })
    expect(await memoria.ler(CHAVE_A)).toBeNull()
    expect(armazenamento.existeContexto(CHAVE_A)).toBe(false)
  })

  it('histórico é cortado no teto ao salvar', async () => {
    const { memoria } = memoriaSobre(criarArmazenamentoFalso(), { maxHistorico: 3 })
    const turnos: Turno[] = Array.from({ length: 6 }, (_, i) => ({
      papel: i % 2 === 0 ? 'cliente' : 'ia',
      texto: `t${i}`,
    }))
    await memoria.salvar(CHAVE_A, contextoDe(turnos))
    const lido = await memoria.ler(CHAVE_A)
    expect(lido?.historico).toHaveLength(3)
    expect(lido?.historico.map((t) => t.texto)).toEqual(['t3', 't4', 't5'])
  })

  it('remetentes diferentes não se misturam', async () => {
    const { memoria } = memoriaSobre()
    await memoria.salvar(CHAVE_A, contextoDe([{ papel: 'cliente', texto: 'de a' }]))
    await memoria.salvar(CHAVE_B, contextoDe([{ papel: 'cliente', texto: 'de b' }]))
    expect((await memoria.ler(CHAVE_A))?.historico[0].texto).toBe('de a')
    expect((await memoria.ler(CHAVE_B))?.historico[0].texto).toBe('de b')
  })

  it('o texto do cliente não vaza para quem não tem o remetente', async () => {
    const { memoria } = memoriaSobre()
    await memoria.salvar(CHAVE_A, contextoDe([{ papel: 'cliente', texto: 'minha senha é 1234' }]))
    expect(await memoria.ler(CHAVE_B)).toBeNull()
  })

  it('remetente fora do formato é recusado (audax_digitos)', async () => {
    const { memoria } = memoriaSobre()
    await expect(memoria.ler('abc')).rejects.toThrow(/Telefone/)
    await expect(memoria.salvar('123', contextoDe([]))).rejects.toThrow(/Telefone/)
  })

  it('fechar remove o contexto', async () => {
    const { armazenamento, memoria } = memoriaSobre()
    await memoria.salvar(CHAVE_A, contextoDe([]))
    await memoria.fechar(CHAVE_A)
    expect(armazenamento.quantosContextos()).toBe(0)
    expect(await memoria.ler(CHAVE_A)).toBeNull()
  })

  it('falha do armazenamento propaga (quem chama decide a política)', async () => {
    const { armazenamento, memoria } = memoriaSobre()
    armazenamento.falhar('ler')
    await expect(memoria.ler(CHAVE_A)).rejects.toThrow(/falha simulada/)
    armazenamento.recuperar('ler')
    armazenamento.falhar('salvar')
    await expect(memoria.salvar(CHAVE_A, contextoDe([]))).rejects.toThrow(/falha simulada/)
  })
})

describe('criarRecentes — deduplicação persistente', () => {
  it('primeiro id é novo, repetição na janela é recusada', async () => {
    const armazenamento = criarArmazenamentoFalso()
    const recentes = criarRecentes(armazenamento)
    expect(await recentes.registrar('msg-1')).toBe(true)
    expect(await recentes.registrar('msg-1')).toBe(false)
    expect(await recentes.registrar('msg-2')).toBe(true)
    expect(armazenamento.quantasMensagens()).toBe(2)
  })

  it('após o TTL do banco (15 min) o mesmo id volta a ser aceito', async () => {
    const armazenamento = criarArmazenamentoFalso()
    const recentes = criarRecentes(armazenamento)
    expect(await recentes.registrar('msg-1')).toBe(true)
    armazenamento.avancar(15 * 60 * 1000) // >= TTL: a RPC varre e reaceita
    expect(await recentes.registrar('msg-1')).toBe(true)
  })

  it('logo antes do TTL a reentrega continua recusada', async () => {
    const armazenamento = criarArmazenamentoFalso()
    const recentes = criarRecentes(armazenamento)
    expect(await recentes.registrar('msg-1')).toBe(true)
    armazenamento.avancar(15 * 60 * 1000 - 1)
    expect(await recentes.registrar('msg-1')).toBe(false)
  })

  it('falha do armazenamento propaga para o chamador', async () => {
    const armazenamento = criarArmazenamentoFalso()
    const recentes = criarRecentes(armazenamento)
    armazenamento.falhar('registrar')
    await expect(recentes.registrar('msg-1')).rejects.toThrow(/falha simulada/)
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
