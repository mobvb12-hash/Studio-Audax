// Contrato do repositório do Caixa (I4).
// Integridade financeira: toda escrita confirma o resultado e toda falha real
// do Supabase é propagada — nada de "parece que gravou" e nada de duplicar
// lançamento/fechamento/auditoria, porque o upsert é pelo mesmo id do app.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  atualizarFechamento,
  atualizarLancamento,
  criarEventoAuditoria,
  criarFechamento,
  criarLancamento,
  importarAuditoria,
  importarFechamentos,
  importarLancamentos,
  listarAuditoria,
  listarFechamentos,
  listarLancamentos,
  removerLancamento,
} from './caixa'
import type {
  EventoAuditoria,
  Fechamento,
  Lancamento,
  ResumoFechamento,
} from '@/modules/caixa/types'

// Banco em memória com a mesma forma de consulta usada pelos repositórios.
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  type Resposta = { data: unknown; error: { message: string } | null }

  const estado = {
    linhas: [] as Linha[],
    falha: null as string | null,
    semSupabase: false,
    chamadas: [] as { op: string; tabela: string }[],
    porTabela(tabela: string): Linha[] {
      return estado.linhas.filter((linha) => linha.__tabela === tabela)
    },
    gravadas(tabela: string): Linha[] {
      return estado
        .porTabela(tabela)
        .map((linha) => {
          const copia: Linha = { ...linha }
          delete copia.__tabela
          return copia
        })
    },
    reiniciar(linhas: Array<[string, Linha]> = []) {
      estado.linhas = linhas.map(([tabela, linha]) => ({
        __tabela: tabela,
        ...linha,
      }))
      estado.falha = null
      estado.semSupabase = false
      estado.chamadas = []
    },
  }

  function criarBuilder(tabela: string) {
    const local = {
      op: '',
      payload: undefined as unknown,
      condicoes: [] as [string, unknown][],
    }
    const alvo = (linha: Linha) => ({ __tabela: tabela, ...linha })
    const filtrar = (): Linha[] =>
      estado.linhas.filter(
        (linha) =>
          linha.__tabela === tabela &&
          local.condicoes.every(([coluna, valor]) => linha[coluna] === valor),
      )
    const executar = (): Resposta => {
      estado.chamadas.push({ op: local.op, tabela })
      if (estado.falha) return { data: null, error: { message: estado.falha } }

      if (local.op === 'insert' || local.op === 'upsert') {
        const lote = (Array.isArray(local.payload)
          ? local.payload
          : [local.payload]) as Linha[]
        for (const nova of lote) {
          const existente = estado.linhas.find(
            (linha) => linha.__tabela === tabela && linha.id === nova.id,
          )
          if (existente) Object.assign(existente, nova)
          else estado.linhas.push(alvo(nova))
        }
        const devolvidas = lote.map((linha) => alvo(linha))
        return { data: devolvidas, error: null }
      }
      if (local.op === 'update') {
        const alvos = filtrar()
        alvos.forEach((linha) => Object.assign(linha, local.payload))
        return { data: alvos.map((linha) => ({ ...linha })), error: null }
      }
      if (local.op === 'delete') {
        const alvos = new Set(filtrar())
        estado.linhas = estado.linhas.filter((linha) => !alvos.has(linha))
        return { data: null, error: null }
      }
      return {
        data: filtrar().map((linha) => ({ ...linha })),
        error: null,
      }
    }

    const builder = {
      select: () => {
        if (!local.op) local.op = 'select'
        return builder
      },
      insert: (payload: unknown) => {
        local.op = 'insert'
        local.payload = payload
        return builder
      },
      upsert: (payload: unknown) => {
        local.op = 'upsert'
        local.payload = payload
        return builder
      },
      update: (payload: unknown) => {
        local.op = 'update'
        local.payload = payload
        return builder
      },
      delete: () => {
        local.op = 'delete'
        return builder
      },
      eq: (coluna: string, valor: unknown) => {
        local.condicoes.push([coluna, valor])
        return builder
      },
      order: () => builder,
      maybeSingle: async () => {
        const resposta = executar()
        const linhas = Array.isArray(resposta.data) ? resposta.data : []
        return { data: linhas[0] ?? null, error: resposta.error }
      },
      then: (
        aoResolver?: (valor: Resposta) => unknown,
        aoRejeitar?: (erro: unknown) => unknown,
      ) => Promise.resolve(executar()).then(aoResolver, aoRejeitar),
    }
    return builder
  }

  return {
    estado,
    cliente: { from: (tabela: string) => criarBuilder(tabela) },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente),
}))

const DIA = '2026-03-10'

function lancamento(extra: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 'lan-1',
    tipo: 'receita',
    origem: 'atendimento',
    data: DIA,
    hora: '10:00',
    descricao: 'Corte — Ana',
    valor: 70,
    desconto: 0,
    valorLiquido: 70,
    formaPagamento: 'pix',
    cliente: 'Ana',
    profissional: 'Cleiton',
    servico: 'Corte',
    criadoEm: '2026-03-10T13:00:00.000Z',
    ...extra,
  }
}

const resumo: ResumoFechamento = {
  receitasAtendimentos: 70,
  receitasProdutos: 0,
  receitasClube: 0,
  totalRecebido: 70,
  descontos: 0,
  despesas: 0,
  liquido: 70,
  porForma: {
    dinheiro: 0,
    pix: 70,
    pix_integrado: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    transferencia: 0,
    pre_pago: 0,
    outro: 0,
  },
  porProfissional: [{ nome: 'Cleiton', valor: 70, qtd: 1 }],
  qtdAtendimentos: 1,
  qtdProdutos: 0,
}

function fechamento(extra: Partial<Fechamento> = {}): Fechamento {
  return {
    id: 'fec-1',
    data: DIA,
    fechadoEm: '2026-03-11T00:00:00.000Z',
    resumo,
    ...extra,
  }
}

function evento(extra: Partial<EventoAuditoria> = {}): EventoAuditoria {
  return {
    id: 'aud-1',
    acao: 'estorno',
    data: DIA,
    descricao: 'Receita: Corte — Ana — R$ 70.00',
    criadoEm: '2026-03-11T01:00:00.000Z',
    ...extra,
  }
}

beforeEach(() => {
  banco.estado.reiniciar()
})

/** Linha como o banco devolve (snake_case) — espelha a migration 005. */
function linhaLancamentoDb(extra: Record<string, unknown> = {}) {
  return {
    id: 'lan-1',
    tipo: 'receita',
    origem: 'atendimento',
    data: DIA,
    hora: '10:00',
    descricao: 'Corte — Ana',
    valor: 70,
    desconto: 0,
    valor_liquido: 70,
    forma_pagamento: 'pix',
    cliente: 'Ana',
    cliente_id: null,
    profissional: 'Cleiton',
    servico: 'Corte',
    agendamento_id: 'ag-1',
    assinatura_id: null,
    produto: null,
    quantidade: null,
    itens: [],
    categoria: '',
    observacao: '',
    estornado: false,
    estornado_em: null,
    criado_em: '2026-03-10T13:00:00.000Z',
    ...extra,
  }
}

function linhaFechamentoDb(extra: Record<string, unknown> = {}) {
  return {
    id: 'fec-1',
    data: DIA,
    fechado_em: '2026-03-11T00:00:00.000Z',
    resumo,
    reaberto: null,
    ...extra,
  }
}

function linhaAuditoriaDb(extra: Record<string, unknown> = {}) {
  return {
    id: 'aud-1',
    acao: 'estorno',
    data: DIA,
    descricao: 'Receita: Corte — Ana — R$ 70.00',
    motivo: null,
    criado_em: '2026-03-11T01:00:00.000Z',
    ...extra,
  }
}

describe('Caixa — leituras', () => {
  it('lê lançamentos, fechamentos e auditoria', async () => {
    banco.estado.reiniciar([
      ['caixa_lancamentos', linhaLancamentoDb()],
      ['caixa_fechamentos', linhaFechamentoDb()],
      ['caixa_auditoria', linhaAuditoriaDb()],
    ])

    const lancamentos = await listarLancamentos()
    const fechamentos = await listarFechamentos()
    const auditoria = await listarAuditoria()

    expect(lancamentos).toHaveLength(1)
    expect(lancamentos[0]).toMatchObject({
      id: 'lan-1',
      descricao: 'Corte — Ana',
      valor: 70,
      valorLiquido: 70,
      formaPagamento: 'pix',
    })
    expect(fechamentos[0].resumo.totalRecebido).toBe(70)
    expect(auditoria[0]).toMatchObject({ id: 'aud-1', acao: 'estorno' })
  })

  it('preserva itens da venda, categoria, observação e estorno', async () => {
    banco.estado.reiniciar([
      [
        'caixa_lancamentos',
        linhaLancamentoDb({
          itens: [{ produtoId: 'p1', produto: 'Pomada', quantidade: 2, preco: 15 }],
          categoria: 'Marketing',
          observacao: 'promoção',
          estornado: true,
          estornado_em: '2026-03-11T02:00:00.000Z',
          assinatura_id: 'as-1',
        }),
      ],
    ])

    const [lido] = await listarLancamentos()

    expect(lido.itens).toEqual([
      { produtoId: 'p1', produto: 'Pomada', quantidade: 2, preco: 15 },
    ])
    expect(lido.categoria).toBe('Marketing')
    expect(lido.observacao).toBe('promoção')
    expect(lido.estornado).toBe(true)
    expect(lido.estornadoEm).toBe('2026-03-11T02:00:00.000Z')
    expect(lido.assinaturaId).toBe('as-1')
  })

  it('consulta válida sem registros devolve [] nas três listas', async () => {
    await expect(listarLancamentos()).resolves.toEqual([])
    await expect(listarFechamentos()).resolves.toEqual([])
    await expect(listarAuditoria()).resolves.toEqual([])
  })

  it('erro do banco lança com a mensagem original (não vira lista vazia)', async () => {
    banco.estado.falha = 'permission denied for table caixa_lancamentos'

    await expect(listarLancamentos()).rejects.toThrow(/permission denied/)
    await expect(listarFechamentos()).rejects.toThrow(/permission denied/)
    await expect(listarAuditoria()).rejects.toThrow(/permission denied/)
  })

  it('sem Supabase mantém o modo local ([] e nenhuma consulta)', async () => {
    banco.estado.semSupabase = true

    await expect(listarLancamentos()).resolves.toEqual([])
    await expect(listarFechamentos()).resolves.toEqual([])
    await expect(listarAuditoria()).resolves.toEqual([])
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})

describe('Caixa — escritas confirmadas', () => {
  it('cria lançamento e devolve a linha confirmada', async () => {
    const criado = await criarLancamento(lancamento())

    expect(criado).toMatchObject({ id: 'lan-1', valorLiquido: 70 })
    expect(banco.estado.gravadas('caixa_lancamentos')).toHaveLength(1)
  })

  it('criar o mesmo id de novo ATUALIZA (idempotente: não duplica lançamento)', async () => {
    await criarLancamento(lancamento())
    await criarLancamento(lancamento({ descricao: 'Corte — Ana (ajuste)' }))

    const gravadas = banco.estado.gravadas('caixa_lancamentos')
    expect(gravadas).toHaveLength(1)
    expect(gravadas[0].descricao).toBe('Corte — Ana (ajuste)')
  })

  it('cria fechamento e evento de auditoria sem duplicar', async () => {
    await criarFechamento(fechamento())
    await criarFechamento(fechamento())
    await criarEventoAuditoria(evento())
    await criarEventoAuditoria(evento())

    expect(banco.estado.gravadas('caixa_fechamentos')).toHaveLength(1)
    expect(banco.estado.gravadas('caixa_auditoria')).toHaveLength(1)
  })

  it('estorno/reabertura confirmam a linha gravada', async () => {
    banco.estado.reiniciar([
      ['caixa_lancamentos', linhaLancamentoDb()],
      ['caixa_fechamentos', linhaFechamentoDb()],
    ])

    const estornado = await atualizarLancamento(
      'lan-1',
      lancamento({ estornado: true, estornadoEm: '2026-03-11T03:00:00.000Z' }),
    )
    const reaberto = await atualizarFechamento(
      'fec-1',
      fechamento({ reaberto: { em: '2026-03-11T03:00:00.000Z', motivo: 'erro' } }),
    )

    expect(estornado?.estornado).toBe(true)
    expect(reaberto?.reaberto).toEqual({
      em: '2026-03-11T03:00:00.000Z',
      motivo: 'erro',
    })
  })

  it('remover lançamento apaga a linha e confirma', async () => {
    banco.estado.reiniciar([
      ['caixa_lancamentos', linhaLancamentoDb()],
    ])

    await expect(removerLancamento('lan-1')).resolves.toBe(true)
    expect(banco.estado.gravadas('caixa_lancamentos')).toHaveLength(0)
  })

  it('recusa do Supabase propaga a mensagem em toda escrita', async () => {
    banco.estado.falha = 'violates row-level security policy'

    await expect(criarLancamento(lancamento())).rejects.toThrow(
      /row-level security/,
    )
    await expect(atualizarLancamento('lan-1', lancamento())).rejects.toThrow(
      /row-level security/,
    )
    await expect(removerLancamento('lan-1')).rejects.toThrow(/row-level security/)
    await expect(criarFechamento(fechamento())).rejects.toThrow(
      /row-level security/,
    )
    await expect(atualizarFechamento('fec-1', fechamento())).rejects.toThrow(
      /row-level security/,
    )
    await expect(criarEventoAuditoria(evento())).rejects.toThrow(
      /row-level security/,
    )
  })

  it('registro inexistente é falha, não sucesso silencioso', async () => {
    await expect(
      atualizarLancamento('inexistente', lancamento({ id: 'inexistente' })),
    ).rejects.toThrow(/não existe mais no Supabase/)
    await expect(
      atualizarFechamento('inexistente', fechamento({ id: 'inexistente' })),
    ).rejects.toThrow(/não existe mais no Supabase/)
  })

  it('importar reenvia sem duplicar e devolve a contagem', async () => {
    banco.estado.reiniciar([
      ['caixa_lancamentos', linhaLancamentoDb()],
    ])

    await expect(importarLancamentos([lancamento()])).resolves.toBe(1)
    await expect(importarLancamentos([lancamento()])).resolves.toBe(1)
    expect(banco.estado.gravadas('caixa_lancamentos')).toHaveLength(1)

    await expect(importarFechamentos([fechamento()])).resolves.toBe(1)
    await expect(importarAuditoria([evento()])).resolves.toBe(1)
    expect(banco.estado.gravadas('caixa_fechamentos')).toHaveLength(1)
    expect(banco.estado.gravadas('caixa_auditoria')).toHaveLength(1)
  })

  it('importar que falha devolve 0 (pendência continua pendente)', async () => {
    banco.estado.falha = 'timeout'

    await expect(importarLancamentos([lancamento()])).resolves.toBe(0)
    await expect(importarFechamentos([fechamento()])).resolves.toBe(0)
    await expect(importarAuditoria([evento()])).resolves.toBe(0)
  })

  it('sem Supabase nada lança (modo local)', async () => {
    banco.estado.semSupabase = true

    await expect(criarLancamento(lancamento())).resolves.toBeNull()
    await expect(atualizarLancamento('lan-1', lancamento())).resolves.toBeNull()
    await expect(removerLancamento('lan-1')).resolves.toBe(false)
    await expect(criarFechamento(fechamento())).resolves.toBeNull()
    await expect(criarEventoAuditoria(evento())).resolves.toBeNull()
    await expect(importarLancamentos([lancamento()])).resolves.toBe(0)
    expect(banco.estado.chamadas).toHaveLength(0)
  })
})
