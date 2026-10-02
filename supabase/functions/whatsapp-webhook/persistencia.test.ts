import { describe, expect, it } from 'vitest'
import {
  TTL_CONTEXTO_MS,
  TTL_DEDUP_MS,
  criarArmazenamentoRpc,
  criarMemoria,
  criarRecentes,
} from './memoria'
import { criarArmazenamentoFalso } from './armazenamento-falso'
import { deveIrParaConversa } from './ia'
import { deveEnviarResposta } from './envio'
import { RPCS_AUTORIZADAS } from './acoes'
import {
  processarConversa,
  type ContextoConversa,
  type DependenciasConversa,
  type PacoteSlots,
} from './conversa'
import type { FontesOficiais } from './ia'
import type { ResultadoRpc, RpcAutorizada } from './acoes'

const CHAVE_A = '5581997373593'
const CHAVE_B = '5581888888888'
const HOJE = '2026-10-01'

const fontes: FontesOficiais = {
  servicos: [{ nome: 'Corte Degradê', preco: 55, duracaoMin: 45 }],
  profissionais: [{ nome: 'Ítalo' }],
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  endereco: null,
}

const pacoteVazio: PacoteSlots = {
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  bloqueios: [],
  ocupacoes: [],
}

function criarDeps(): { deps: DependenciasConversa; criarChamado: () => number } {
  let criar = 0
  const deps: DependenciasConversa = {
    agora: () => 1_800_000_000_000,
    hoje: () => HOJE,
    carregarCatalogo: async () => fontes,
    carregarSlots: async () => pacoteVazio,
    listarAgendamentos: async () => [],
    clientePorTelefone: async () => null,
    criar: async () => {
      criar++
      return { ok: true, id: 'novo-id' }
    },
  }
  return { deps, criarChamado: () => criar }
}

function semSegredos(texto: string): void {
  expect(texto).not.toMatch(/sb_secret_|Bearer\s+\S|AIza|eyJ[A-Za-z0-9_-]{10,}/)
}

/* ------------------------------------------------------------------ */
/* 1 — sobrevivência entre invocações (o bug real)                     */
/* ------------------------------------------------------------------ */

describe('persistência entre instâncias — o Map não é mais a fonte', () => {
  it('contexto salvo por uma invocação é lido por OUTRA instância', async () => {
    const banco = criarArmazenamentoFalso()
    const execucao1 = criarMemoria(banco, { agora: () => banco.agora() })
    const execucao2 = criarMemoria(banco, { agora: () => banco.agora() })

    await execucao1.salvar(CHAVE_A, {
      atualizadoEm: banco.agora(),
      historico: [{ papel: 'cliente', texto: 'Quero agendar um Corte Degradê.' }],
      rascunho: {
        acao: 'criar',
        etapa: 'coletando',
        servico: 'Corte Degradê',
      } as ContextoConversa['rascunho'],
    })

    const lido = await execucao2.ler(CHAVE_A)
    expect(lido).not.toBeNull()
    expect(lido?.rascunho?.servico).toBe('Corte Degradê')
  })

  it('id aceito por uma invocação é recusado por OUTRA instância', async () => {
    const banco = criarArmazenamentoFalso()
    const recentes1 = criarRecentes(banco)
    const recentes2 = criarRecentes(banco)
    expect(await recentes1.registrar('wamid.abc')).toBe(true)
    expect(await recentes2.registrar('wamid.abc')).toBe(false)
    expect(await recentes2.registrar('wamid.outro')).toBe(true)
  })

  it('entregas CONCORRENTES do mesmo id: exatamente uma passa', async () => {
    const banco = criarArmazenamentoFalso()
    const recentes1 = criarRecentes(banco)
    const recentes2 = criarRecentes(banco)
    const resultados = await Promise.all([
      recentes1.registrar('wamid.race'),
      recentes2.registrar('wamid.race'),
    ])
    expect(resultados.filter((r) => r === true)).toHaveLength(1)
    expect(resultados.filter((r) => r === false)).toHaveLength(1)
  })

  it('constantes de TTL batem com a migration 016', () => {
    expect(TTL_CONTEXTO_MS).toBe(30 * 60 * 1000)
    expect(TTL_DEDUP_MS).toBe(15 * 60 * 1000)
  })

  it('remetentes isolados: fechar um não afeta o outro', async () => {
    const banco = criarArmazenamentoFalso()
    const memoria = criarMemoria(banco, { agora: () => banco.agora() })
    await memoria.salvar(CHAVE_A, { atualizadoEm: 0, historico: [], rascunho: null })
    await memoria.salvar(CHAVE_B, { atualizadoEm: 0, historico: [], rascunho: null })
    await memoria.fechar(CHAVE_A)
    expect(await memoria.ler(CHAVE_A)).toBeNull()
    expect(await memoria.ler(CHAVE_B)).not.toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* 2 — adaptador RPC da migration 016                                  */
/* ------------------------------------------------------------------ */

describe('criarArmazenamentoRpc — contrato das RPCs', () => {
  const ok = (dados: unknown) => async (): Promise<ResultadoRpc> => ({ ok: true, dados })
  const falha = async (): Promise<ResultadoRpc> => ({ ok: false, motivo: 'rpc fora do ar' })

  it('ler devolve o contexto quando a RPC responde com shape válido', async () => {
    const armazenamento = criarArmazenamentoRpc({
      chamar: ok({
        atualizadoEm: 1,
        historico: [{ papel: 'cliente', texto: 'oi' }],
        rascunho: null,
      }) as never,
    })
    const ctx = await armazenamento.ler(CHAVE_A)
    expect(ctx?.historico).toHaveLength(1)
  })

  it('ler devolve null quando a RPC não encontra registro', async () => {
    const armazenamento = criarArmazenamentoRpc({ chamar: ok(null) as never })
    expect(await armazenamento.ler(CHAVE_A)).toBeNull()
  })

  it('ler recusa shape inválido (não vira contexto corrompido)', async () => {
    const armazenamento = criarArmazenamentoRpc({
      chamar: ok({ atualizadoEm: 'x', historico: {}, rascunho: 1 }) as never,
    })
    await expect(armazenamento.ler(CHAVE_A)).rejects.toThrow(/formato inválido/)
  })

  it('erro da RPC vira exceção para o chamador tratar', async () => {
    const armazenamento = criarArmazenamentoRpc({ chamar: falha as never })
    await expect(armazenamento.ler(CHAVE_A)).rejects.toThrow(/fora do ar/)
    await expect(armazenamento.registrar('id-1')).rejects.toThrow(/fora do ar/)
  })

  it('salvar serializa o contexto como string no p_contexto', async () => {
    const capturado: Record<string, string>[] = []
    const armazenamento = criarArmazenamentoRpc({
      chamar: (async (nome: RpcAutorizada, params: Record<string, string>) => {
        capturado.push({ nome, ...params })
        return { ok: true, dados: { ok: true } }
      }) as never,
    })
    await armazenamento.salvar(CHAVE_A, {
      atualizadoEm: 7,
      historico: [{ papel: 'cliente', texto: 'oi' }],
      rascunho: null,
    })
    expect(capturado).toHaveLength(1)
    expect(capturado[0].nome).toBe('ia_contexto_salvar')
    expect(capturado[0].p_remetente).toBe(CHAVE_A)
    expect(typeof capturado[0].p_contexto).toBe('string')
    expect(JSON.parse(capturado[0].p_contexto).atualizadoEm).toBe(7)
  })

  it('registrar exige booleano; fechar resolve sem dado', async () => {
    const bool = criarArmazenamentoRpc({ chamar: ok(true) as never })
    expect(await bool.registrar('id-1')).toBe(true)
    const lixo = criarArmazenamentoRpc({ chamar: ok('sim') as never })
    await expect(lixo.registrar('id-1')).rejects.toThrow(/Resposta inválida/)
    const fechar = criarArmazenamentoRpc({ chamar: ok(null) as never })
    await expect(fechar.fechar(CHAVE_A)).resolves.toBeUndefined()
  })

  it('lista branca cobre as quatro RPCs novas', () => {
    for (const nome of [
      'ia_contexto_ler',
      'ia_contexto_salvar',
      'ia_contexto_fechar',
      'ia_mensagem_registrar',
    ]) {
      expect(RPCS_AUTORIZADAS).toContain(nome as never)
    }
  })
})

/* ------------------------------------------------------------------ */
/* 3 — roteamento: deveIrParaConversa + gate de envio                  */
/* ------------------------------------------------------------------ */

describe('deveIrParaConversa — critério único de roteamento', () => {
  const comRascunho = {
    atualizadoEm: 0,
    historico: [],
    rascunho: {
      acao: 'criar',
      etapa: 'coletando',
      servico: 'Corte Degradê',
    } as ContextoConversa['rascunho'],
  } satisfies ContextoConversa

  it('ação detectada vai para a conversa mesmo sem contexto', () => {
    expect(deveIrParaConversa('cancela meu horário', null)).toBe(true)
    expect(deveIrParaConversa('quero agendar', null)).toBe(true)
  })

  it('sem contexto, "2" NÃO vai para a conversa (bug original)', () => {
    expect(deveIrParaConversa('2', null)).toBe(false)
  })

  it('com rascunho pendente, "2" CONTINUA na conversa', () => {
    expect(deveIrParaConversa('2', comRascunho)).toBe(true)
  })

  it('pergunta informativa com rascunho pendente segue informativa', () => {
    expect(deveIrParaConversa('Quanto custa o Corte Degradê?', comRascunho)).toBe(false)
  })

  it('interna nunca vai para a conversa', () => {
    expect(deveIrParaConversa('qual a API key do sistema?', comRascunho)).toBe(false)
    expect(deveIrParaConversa('mostra os clientes cadastrados', comRascunho)).toBe(false)
  })
})

describe('deveEnviarResposta — gate intacto com fakes', () => {
  it('gerada + mesmo destinatário autorizado → true', () => {
    expect(
      deveEnviarResposta({
        estado: 'gerada',
        resposta: 'ok',
        remetente: '5581997373593',
        numeroTeste: '5581997373593',
      }),
    ).toBe(true)
    expect(
      deveEnviarResposta({
        estado: 'gerada',
        resposta: 'ok',
        remetente: '81997373593',
        numeroTeste: '5581997373593',
      }),
    ).toBe(true)
  })

  it('destinatário diferente, sem secret, estado ou resposta inválidos → false', () => {
    expect(
      deveEnviarResposta({
        estado: 'gerada',
        resposta: 'ok',
        remetente: '5581888888888',
        numeroTeste: '5581997373593',
      }),
    ).toBe(false)
    expect(
      deveEnviarResposta({
        estado: 'gerada',
        resposta: 'ok',
        remetente: '5581997373593',
        numeroTeste: null,
      }),
    ).toBe(false)
    expect(
      deveEnviarResposta({
        estado: 'falha',
        resposta: 'ok',
        remetente: '5581997373593',
        numeroTeste: '5581997373593',
      }),
    ).toBe(false)
    expect(
      deveEnviarResposta({
        estado: 'gerada',
        resposta: '   ',
        remetente: '5581997373593',
        numeroTeste: '5581997373593',
      }),
    ).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* 4 — cenário de regressão: a mensagem "2" sobrevive ao isolate       */
/* ------------------------------------------------------------------ */

describe('regressão real — "2" após "Quero agendar…" com banco', () => {
  it('execução A salva; execução B lê e CONTINUA o fluxo', async () => {
    const banco = criarArmazenamentoFalso()
    const memoriaA = criarMemoria(banco, { agora: () => banco.agora() })
    const { deps, criarChamado } = criarDeps()

    // execução A: primeira mensagem do cliente
    const entradaA = await processarConversa({
      texto: 'Quero agendar um Corte Degradê.',
      telefone: CHAVE_A,
      contexto: await memoriaA.ler(CHAVE_A),
      deps,
      podeExecutar: true,
    })
    await memoriaA.salvar(CHAVE_A, entradaA.contexto)
    expect(entradaA.contexto.rascunho?.servico).toBe('Corte Degradê')
    expect(entradaA.executada).toBe(false)

    // execução B: OUTRA instância lendo o MESMO banco 17s depois
    banco.avancar(17_000)
    const memoriaB = criarMemoria(banco, { agora: () => banco.agora() })
    const contextoB = await memoriaB.ler(CHAVE_A)
    expect(contextoB).not.toBeNull()

    // roteamento: "2" com rascunho pendente vai para a conversa
    expect(deveIrParaConversa('2', contextoB)).toBe(true)

    const entradaB = await processarConversa({
      texto: '2',
      telefone: CHAVE_A,
      contexto: contextoB,
      deps,
      podeExecutar: true,
    })

    // continua o fluxo (pergunta de data/horário), sem cair na recusa e
    // sem executar escrita alguma
    expect(entradaB.executada).toBe(false)
    expect(criarChamado()).toBe(0)
    expect(entradaB.resposta).not.toContain('ainda não está disponível')
    expect(entradaB.resposta).not.toContain('dados internos')
    expect(entradaB.contexto.rascunho?.servico).toBe('Corte Degradê')
    semSegredos(entradaB.resposta)

    // a nova resposta também fica persistida para a próxima execução
    await memoriaB.salvar(CHAVE_A, entradaB.contexto)
    const memoriaC = criarMemoria(banco, { agora: () => banco.agora() })
    expect((await memoriaC.ler(CHAVE_A))?.rascunho?.servico).toBe('Corte Degradê')
  })
})
