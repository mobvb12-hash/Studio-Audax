import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelarAgendamentoPainel,
  carregarMeuClube,
  criarAgendamentoPainel,
  listarMeusAgendamentos,
  listarServicosComComplementos,
  obterMeuCadastro,
  remarcarAgendamentoPainel,
} from './painel'

// Banco em memória com a mesma cadeia de consulta usada pelo serviço.
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>
  const estado = {
    linhas: [] as Linha[],
    falha: null as string | null,
    semSupabase: false,
    ordernacoes: [] as string[][],
    filtros: [] as string[][],
    rpcResposta: { data: null as unknown, error: null as unknown },
    rpcChamadas: [] as [string, Record<string, unknown>][],
    reiniciar(linhas: Linha[] = []) {
      estado.linhas = linhas.map((linha) => ({ ...linha }))
      estado.falha = null
      estado.semSupabase = false
      estado.ordernacoes = []
      estado.filtros = []
      estado.rpcResposta = { data: null, error: null }
      estado.rpcChamadas = []
    },
  }

  function criarBuilder() {
    const executar = () => {
      if (estado.falha) return { data: null, error: { message: estado.falha } }
      return { data: estado.linhas.map((linha) => ({ ...linha })), error: null }
    }
    const builder = {
      select: () => builder,
      eq: (coluna: string, valor: unknown) => {
        estado.filtros.push([coluna, String(valor)])
        return builder
      },
      order: (coluna: string, opcoes?: { ascending?: boolean }) => {
        estado.ordernacoes.push([coluna, String(opcoes?.ascending ?? true)])
        return builder
      },
      maybeSingle: async () => {
        const resposta = executar()
        const linhas = Array.isArray(resposta.data) ? resposta.data : []
        return { data: linhas[0] ?? null, error: resposta.error }
      },
      then: (
        aoResolver?: (valor: unknown) => unknown,
        aoRejeitar?: (erro: unknown) => unknown,
      ) => Promise.resolve(executar()).then(aoResolver, aoRejeitar),
    }
    return builder
  }

  const cliente = {
    from: () => criarBuilder(),
    rpc: async (
      nome: string,
      parametros: Record<string, unknown> = {},
    ) => {
      estado.rpcChamadas.push([nome, parametros])
      return estado.rpcResposta
    },
  }

  return { estado, cliente }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente),
}))

beforeEach(() => {
  banco.estado.reiniciar()
})

describe('listarMeusAgendamentos', () => {
  it('mapeia as colunas do banco para o formato do painel', async () => {
    banco.estado.reiniciar([
      {
        id: 'ag-1',
        servico: 'Corte',
        profissional: 'Rafael',
        data: '2026-01-10',
        horario: '14:00',
        status: 'confirmado',
        duracao_min: 45,
        observacao: 'barba inclusa',
        criado_em: '2026-01-01T10:00:00.000Z',
        cliente: 'Ana',
        telefone: '11999990000',
      },
    ])

    const lista = await listarMeusAgendamentos()

    expect(lista).toEqual([
      {
        id: 'ag-1',
        servico: 'Corte',
        profissional: 'Rafael',
        data: '2026-01-10',
        horario: '14:00',
        status: 'confirmado',
        duracaoMin: 45,
        observacao: 'barba inclusa',
        criadoEm: '2026-01-01T10:00:00.000Z',
      },
    ])
    expect(banco.estado.ordernacoes).toEqual([
      ['data', 'true'],
      ['horario', 'true'],
    ])
  })

  it('duracao_min ausente vira null (não vira 0)', async () => {
    banco.estado.reiniciar([
      {
        id: 'ag-2',
        servico: 'Sobrancelha',
        profissional: 'Bia',
        data: '2026-01-11',
        horario: '09:00',
        status: 'pendente',
        duracao_min: null,
        observacao: '',
        criado_em: '',
      },
    ])

    const lista = await listarMeusAgendamentos()
    expect(lista[0].duracaoMin).toBeNull()
  })

  it('falha do Supabase lança com a mensagem (não vira lista vazia)', async () => {
    banco.estado.falha = 'permission denied for table agendamentos'
    await expect(listarMeusAgendamentos()).rejects.toThrow(
      /permission denied/,
    )
  })

  it('sem Supabase devolve lista vazia (não é erro)', async () => {
    banco.estado.semSupabase = true
    await expect(listarMeusAgendamentos()).resolves.toEqual([])
  })
})

describe('obterMeuCadastro', () => {
  it('mapeia a linha própria do cadastro', async () => {
    banco.estado.reiniciar([
      {
        id: 'cli-1',
        nome: 'Ana Silva',
        telefone: '(11) 98888-7777',
        email: 'ana@studio.com',
        nascimento: '1990-05-20',
        genero: 'feminino',
      },
    ])

    const cadastro = await obterMeuCadastro()
    expect(cadastro).toEqual({
      id: 'cli-1',
      nome: 'Ana Silva',
      telefone: '(11) 98888-7777',
      email: 'ana@studio.com',
      nascimento: '1990-05-20',
      genero: 'feminino',
    })
  })

  it('sem linha própria devolve null (sessão não vinculada)', async () => {
    banco.estado.reiniciar([])
    await expect(obterMeuCadastro()).resolves.toBeNull()
  })

  it('falha do Supabase lança com a mensagem', async () => {
    banco.estado.falha = 'new row violates policy'
    await expect(obterMeuCadastro()).rejects.toThrow(/violates policy/)
  })

  it('sem Supabase devolve null (não é erro)', async () => {
    banco.estado.semSupabase = true
    await expect(obterMeuCadastro()).resolves.toBeNull()
  })
})

describe('listarServicosComComplementos', () => {
  it('resolve os ids de complemento e filtra inativos/autoreferência', async () => {
    banco.estado.reiniciar([
      {
        id: 'srv-corte',
        nome: 'Corte',
        preco: 70,
        duracao_min: 40,
        complementos: ['srv-barba', 'srv-fantasma', 'srv-corte', 999],
        ativo: true,
      },
      { id: 'srv-barba', nome: 'Barba', preco: 35, duracao_min: 15, complementos: [], ativo: true },
      { id: 'srv-ocioso', nome: 'Ocioso', preco: 10, duracao_min: 10, complementos: [], ativo: true },
    ])

    const lista = await listarServicosComComplementos()

    expect(banco.estado.filtros).toEqual([['ativo', 'true']])
    expect(lista).toEqual([
      {
        id: 'srv-corte',
        nome: 'Corte',
        preco: 70,
        duracaoMin: 40,
        complementos: [
          { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15 },
        ],
      },
      { id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15, complementos: [] },
      { id: 'srv-ocioso', nome: 'Ocioso', preco: 10, duracaoMin: 10, complementos: [] },
    ])
  })

  it('falha do Supabase lança com a mensagem (não vira lista vazia)', async () => {
    banco.estado.falha = 'permission denied for table servicos'
    await expect(listarServicosComComplementos()).rejects.toThrow(
      /permission denied/,
    )
  })

  it('sem Supabase devolve lista vazia (não é erro)', async () => {
    banco.estado.semSupabase = true
    await expect(listarServicosComComplementos()).resolves.toEqual([])
  })
})

describe('criarAgendamentoPainel', () => {
  function dadosValidos() {
    return {
      servico: 'Corte',
      profissional: 'Rafael',
      data: '2030-01-15',
      horario: '14:00',
      observacao: ' máquina 2',
      complementos: ['srv-barba'],
    }
  }

  it('valida os campos obrigatórios antes de chamar o servidor', async () => {
    await expect(
      criarAgendamentoPainel({ ...dadosValidos(), servico: '' }),
    ).resolves.toEqual({ ok: false, erro: 'Escolha o serviço.' })
    await expect(
      criarAgendamentoPainel({ ...dadosValidos(), profissional: '' }),
    ).resolves.toEqual({ ok: false, erro: 'Escolha o profissional.' })
    await expect(
      criarAgendamentoPainel({ ...dadosValidos(), data: '2020-01-01' }),
    ).resolves.toEqual({ ok: false, erro: 'Escolha uma data a partir de hoje.' })
    await expect(
      criarAgendamentoPainel({ ...dadosValidos(), horario: '14h' }),
    ).resolves.toEqual({ ok: false, erro: 'Horário inválido.' })
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })

  it('chama a RPC 019 com a sessão e devolve o id criado', async () => {
    banco.estado.rpcResposta = { data: { id: 'ag-9', status: 'pendente' }, error: null }

    const resultado = await criarAgendamentoPainel(dadosValidos())

    expect(resultado).toEqual({ ok: true, id: 'ag-9' })
    expect(banco.estado.rpcChamadas).toEqual([
      [
        'painel_agendamento_criar',
        {
          p_servico: 'Corte',
          p_profissional: 'Rafael',
          p_data: '2030-01-15',
          p_horario: '14:00',
          p_observacao: 'máquina 2',
          p_complementos: ['srv-barba'],
        },
      ],
    ])
  })

  it('erro do servidor vira mensagem (prefixo técnico removido)', async () => {
    banco.estado.rpcResposta = {
      data: null,
      error: { message: '3P001:Já existe um agendamento neste horário.' },
    }

    const resultado = await criarAgendamentoPainel(dadosValidos())

    expect(resultado).toEqual({
      ok: false,
      erro: 'Já existe um agendamento neste horário.',
    })
  })

  it('sem Supabase não inventa sucesso', async () => {
    banco.estado.semSupabase = true
    const resultado = await criarAgendamentoPainel(dadosValidos())
    expect(resultado.ok).toBe(false)
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })
})

describe('cancelarAgendamentoPainel', () => {
  it('chama a RPC de cancelamento com o id da linha própria', async () => {
    banco.estado.rpcResposta = {
      data: { id: 'ag-1', status: 'cancelado' },
      error: null,
    }

    const resultado = await cancelarAgendamentoPainel('ag-1')

    expect(resultado).toEqual({ ok: true, id: 'ag-1' })
    expect(banco.estado.rpcChamadas).toEqual([
      ['painel_agendamento_cancelar', { p_id: 'ag-1' }],
    ])
  })

  it('id vazio não vai ao servidor', async () => {
    const resultado = await cancelarAgendamentoPainel('')
    expect(resultado).toEqual({ ok: false, erro: 'Agendamento não encontrado.' })
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })

  it('recusa do servidor vira mensagem honesta (pago/estornado etc.)', async () => {
    banco.estado.rpcResposta = {
      data: null,
      error: { message: '3P001:Este agendamento já foi pago. Estorne o pagamento no Caixa antes de cancelar.' },
    }

    const resultado = await cancelarAgendamentoPainel('ag-1')

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.erro).toMatch(/já foi pago/)
    }
  })

  it('sem Supabase não inventa sucesso', async () => {
    banco.estado.semSupabase = true
    const resultado = await cancelarAgendamentoPainel('ag-1')
    expect(resultado.ok).toBe(false)
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })
})

describe('remarcarAgendamentoPainel', () => {
  it('valida data/horário antes de chamar o servidor', async () => {
    await expect(
      remarcarAgendamentoPainel('ag-1', '2020-01-01', '14:00'),
    ).resolves.toEqual({ ok: false, erro: 'Escolha uma data a partir de hoje.' })
    await expect(
      remarcarAgendamentoPainel('ag-1', '2030-01-15', '14h'),
    ).resolves.toEqual({ ok: false, erro: 'Horário inválido.' })
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })

  it('chama a RPC de remarcação com id, data e horário novos', async () => {
    banco.estado.rpcResposta = {
      data: { id: 'ag-1', data: '2030-01-15', horario: '16:00' },
      error: null,
    }

    const resultado = await remarcarAgendamentoPainel(
      'ag-1',
      '2030-01-15',
      '16:00',
    )

    expect(resultado).toEqual({ ok: true, id: 'ag-1' })
    expect(banco.estado.rpcChamadas).toEqual([
      [
        'painel_agendamento_remarsar',
        { p_id: 'ag-1', p_data: '2030-01-15', p_horario: '16:00' },
      ],
    ])
  })

  it('conflito do servidor vira mensagem (sem sucesso silencioso)', async () => {
    banco.estado.rpcResposta = {
      data: null,
      error: { message: 'Este horário acabou de ser ocupado. Escolha outro.' },
    }

    const resultado = await remarcarAgendamentoPainel(
      'ag-1',
      '2030-01-15',
      '16:00',
    )

    expect(resultado).toEqual({
      ok: false,
      erro: 'Este horário acabou de ser ocupado. Escolha outro.',
    })
  })

  it('sem Supabase não inventa sucesso', async () => {
    banco.estado.semSupabase = true
    const resultado = await remarcarAgendamentoPainel(
      'ag-1',
      '2030-01-15',
      '16:00',
    )
    expect(resultado.ok).toBe(false)
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })
})

describe('carregarMeuClube', () => {
  it('sem Supabase devolve null (sem erro, sem chamada)', async () => {
    banco.estado.semSupabase = true
    expect(await carregarMeuClube()).toBeNull()
    expect(banco.estado.rpcChamadas).toHaveLength(0)
  })

  it('sem assinatura devolve null e chama a RPC da 020', async () => {
    banco.estado.rpcResposta = { data: null, error: null }

    expect(await carregarMeuClube()).toBeNull()
    expect(banco.estado.rpcChamadas[0][0]).toBe('painel_clube_minha')
  })

  it('mapeia assinatura e pagamentos para o formato do painel', async () => {
    banco.estado.rpcResposta = {
      data: {
        assinatura: {
          id: 'ass-1',
          cliente_id: 'cli-1',
          cliente: 'Ana Silva',
          plano: 'cabelo_barba',
          valor_mensal: 149.9,
          data_assinatura: '2026-01-05',
          proximo_vencimento: '2026-11-05',
          cancelada: false,
          criado_em: '2026-01-05T10:00:00.000Z',
        },
        pagamentos: [
          { data: '2026-10-01', valor: 149.9, forma_pagamento: 'pix' },
          { data: '2026-09-01', valor: 149.9, forma_pagamento: 'dinheiro' },
        ],
      },
      error: null,
    }

    const meu = await carregarMeuClube()

    expect(meu?.planoRotulo).toBe('Cabelo + Barba')
    expect(meu?.assinatura).toEqual({
      id: 'ass-1',
      clienteId: 'cli-1',
      cliente: 'Ana Silva',
      plano: 'cabelo_barba',
      valorMensal: 149.9,
      dataAssinatura: '2026-01-05',
      proximoVencimento: '2026-11-05',
      cancelada: false,
      criadoEm: '2026-01-05T10:00:00.000Z',
    })
    expect(meu?.pagamentos).toEqual([
      { data: '2026-10-01', valor: 149.9, formaPagamento: 'pix' },
      { data: '2026-09-01', valor: 149.9, formaPagamento: 'dinheiro' },
    ])
  })

  it('cancelamento e plano fora do enum preservam o dado gravado', async () => {
    banco.estado.rpcResposta = {
      data: {
        assinatura: {
          id: 'ass-2',
          cliente_id: 'cli-2',
          cliente: 'Bia',
          plano: 'xpto',
          valor_mensal: 99,
          data_assinatura: '2025-01-05',
          proximo_vencimento: '2025-06-05',
          cancelada: true,
          cancelada_em: '2025-05-01',
          motivo_cancelamento: 'mudou de cidade',
          criado_em: '2025-01-05T10:00:00.000Z',
        },
        pagamentos: [],
      },
      error: null,
    }

    const meu = await carregarMeuClube()

    expect(meu?.assinatura.cancelada).toBe(true)
    expect(meu?.assinatura.canceladaEm).toBe('2025-05-01')
    expect(meu?.assinatura.motivoCancelamento).toBe('mudou de cidade')
    expect(meu?.planoRotulo).toBe('xpto')
    expect(meu?.pagamentos).toEqual([])
  })

  it('erro da RPC vira exceção honesta', async () => {
    banco.estado.rpcResposta = {
      data: null,
      error: { message: 'permission denied for function painel_clube_minha' },
    }

    await expect(carregarMeuClube()).rejects.toThrow(
      'permission denied for function painel_clube_minha',
    )
  })
})
