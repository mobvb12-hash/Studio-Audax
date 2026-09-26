import { describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { preferenciasPadrao, type Cliente } from '@/modules/clientes/types'
import type { MensagemWhats } from '@/modules/whatsapp/types'
import {
  aniversariantesDoMes,
  classificarSegmento,
  DIAS_ATIVO,
  DIAS_INATIVO,
  diasEntre,
  diasParaAniversario,
  filtrarPerfis,
  montarHistorico,
  montarPerfis,
  proximaDataSugerida,
  proximoAgendamento,
  resumoGrupos,
  resumoSegmentos,
  segmentosDoGrupo,
} from './regras'
import type { Interacao } from './types'

const HOJE = hojeISO()

function cliente(id: string, nome: string, extras: Partial<Cliente> = {}): Cliente {
  return {
    id,
    nome,
    telefone: '',
    email: '',
    observacao: '',
    ativo: true,
    genero: 'nao_informado',
    cpf: '',
    cnpj: '',
    nascimento: '',
    etiquetas: [],
    instagram: '',
    comoNosConheceu: '',
    telefones: [],
    endereco: null,
    preferencias: preferenciasPadrao(),
    criadoEm: `${somarDias(HOJE, -10)}T00:00:00.000Z`,
    atualizadoEm: `${somarDias(HOJE, -10)}T00:00:00.000Z`,
    ...extras,
  }
}

function ag(
  clienteNome: string,
  dataRel: number,
  extras: Partial<Agendamento> = {},
): Agendamento {
  return {
    id: `ag-${clienteNome}-${dataRel}-${Math.random()}`,
    cliente: clienteNome,
    telefone: '',
    servico: 'Corte Degradê',
    profissional: 'Audax',
    data: somarDias(HOJE, dataRel),
    horario: '10:00',
    status: 'concluido',
    observacao: '',
    criadoEm: '2026-01-01T00:00:00.000Z',
    duracaoMin: 40,
    ...extras,
  }
}

function lancamento(id: string, clienteId: string, valor: number): Lancamento {
  return {
    id,
    tipo: 'receita',
    origem: 'atendimento',
    data: HOJE,
    hora: '10:00',
    descricao: 'Atendimento',
    valor,
    desconto: 0,
    valorLiquido: valor,
    formaPagamento: 'pix',
    clienteId,
    criadoEm: '2026-01-01T00:00:00.000Z',
  }
}

describe('classificarSegmento — comportamento real', () => {
  it('cliente sem atendimento e cadastro recente é novo', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 0,
        diasDesdeUltimo: null,
        diasDesdeCadastro: 10,
      }),
    ).toBe('novo')
  })

  it('cliente sem atendimento e cadastro antigo é inativo', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 0,
        diasDesdeUltimo: null,
        diasDesdeCadastro: DIAS_INATIVO + 10,
      }),
    ).toBe('inativo')
  })

  it('cliente com 1–2 visitas recentes é ativo', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 1,
        diasDesdeUltimo: 10,
        diasDesdeCadastro: 100,
      }),
    ).toBe('ativo')
    expect(
      classificarSegmento({
        totalAtendimentos: 2,
        diasDesdeUltimo: 5,
        diasDesdeCadastro: 100,
      }),
    ).toBe('ativo')
  })

  it('cliente com 3+ visitas nos últimos 30 dias é recorrente', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 3,
        diasDesdeUltimo: 5,
        diasDesdeCadastro: 200,
      }),
    ).toBe('recorrente')
  })

  it('cliente com 31–90 dias sem visita é sem retorno', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 5,
        diasDesdeUltimo: 60,
        diasDesdeCadastro: 400,
      }),
    ).toBe('sem_retorno')
  })

  it('cliente com mais de 90 dias sem visita é inativo', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 5,
        diasDesdeUltimo: DIAS_INATIVO + 1,
        diasDesdeCadastro: 400,
      }),
    ).toBe('inativo')
  })

  it('respeita os limites exatos de 30 e 91 dias', () => {
    expect(
      classificarSegmento({
        totalAtendimentos: 1,
        diasDesdeUltimo: DIAS_ATIVO,
        diasDesdeCadastro: 100,
      }),
    ).toBe('ativo')
    expect(
      classificarSegmento({
        totalAtendimentos: 1,
        diasDesdeUltimo: DIAS_ATIVO + 1,
        diasDesdeCadastro: 100,
      }),
    ).toBe('sem_retorno')
    expect(
      classificarSegmento({
        totalAtendimentos: 1,
        diasDesdeUltimo: DIAS_INATIVO,
        diasDesdeCadastro: 100,
      }),
    ).toBe('sem_retorno')
  })
})

describe('diasEntre', () => {
  it('calcula a diferença em dias entre datas', () => {
    expect(diasEntre('2026-01-01', '2026-01-31')).toBe(30)
    expect(diasEntre('2026-01-31', '2026-01-01')).toBe(-30)
    expect(diasEntre('2026-02-10', '2026-02-10')).toBe(0)
  })

  it('aceita timestamp ISO completo (criadoEm)', () => {
    expect(diasEntre('2026-01-01T12:00:00.000Z', '2026-01-11')).toBe(10)
  })
})

describe('montarPerfis — dados reais de agenda e caixa', () => {
  it('agrega atendimentos, frequência, serviços, profissional e gasto', () => {
    const ana = cliente('c-ana', 'Ana Souza')
    const agendamentos = [
      ag('Ana Souza', -45),
      ag('Ana Souza', -25, { servico: 'Barba', profissional: 'Diego' }),
      ag('Ana Souza', -5, { servico: 'Barba', profissional: 'Diego' }),
      ag('Ana Souza', -10, { status: 'cancelado' }),
    ]
    const lancamentos = [lancamento('l-1', 'c-ana', 100)]

    const perfil = montarPerfis([ana], agendamentos, lancamentos, HOJE)[0]

    expect(perfil.segmento).toBe('recorrente')
    expect(perfil.totalAtendimentos).toBe(3) // cancelado não conta
    expect(perfil.ultimoAtendimento).toBe(somarDias(HOJE, -5))
    expect(perfil.primeiroAtendimento).toBe(somarDias(HOJE, -45))
    expect(perfil.frequenciaDias).toBe(20) // gaps 20 e 20
    expect(perfil.totalGasto).toBe(100)
    expect(perfil.servicos[0]).toEqual({ nome: 'Barba', qtd: 2 })
    expect(perfil.servicos[1]).toEqual({ nome: 'Corte Degradê', qtd: 1 })
    expect(perfil.profissionalPreferido).toBe('Diego')
  })

  it('cliente sem atendimentos ganha perfil zerado e classificação por cadastro', () => {
    const bruno = cliente('c-bruno', 'Bruno Lima', {
      criadoEm: `${somarDias(HOJE, -20)}T00:00:00.000Z`,
    })
    const perfil = montarPerfis([bruno], [], [], HOJE)[0]
    expect(perfil.segmento).toBe('novo')
    expect(perfil.totalAtendimentos).toBe(0)
    expect(perfil.ultimoAtendimento).toBe('')
    expect(perfil.frequenciaDias).toBeNull()
    expect(perfil.totalGasto).toBe(0)
    expect(perfil.servicos).toEqual([])
    expect(perfil.profissionalPreferido).toBeNull()
  })

  it('não altera os arrays de entrada', () => {
    const ana = cliente('c-ana', 'Ana Souza')
    const agendamentos = [ag('Ana Souza', -5), ag('Ana Souza', -25)]
    const antesAg = JSON.stringify(agendamentos)
    const antesClientes = JSON.stringify([ana])

    montarPerfis([ana], agendamentos, [], HOJE)

    expect(JSON.stringify(agendamentos)).toBe(antesAg)
    expect(JSON.stringify([ana])).toBe(antesClientes)
  })
})

describe('filtrarPerfis e resumoSegmentos', () => {
  const perfis = () =>
    montarPerfis(
      [
        cliente('c-ana', 'Ana Souza', { telefone: '(11) 91111-2222' }),
        cliente('c-bruno', 'Bruno Lima'),
        cliente('c-carla', 'Carla Dias', { ativo: false }),
      ],
      [
        ag('Ana Souza', -5),
        ag('Ana Souza', -25),
        ag('Ana Souza', -45),
        ag('Bruno Lima', -70),
      ],
      [],
      HOJE,
    )

  it('filtra por nome, telefone e segmento', () => {
    const lista = perfis()
    expect(filtrarPerfis(lista, 'bruno', 'todos').map((p) => p.cliente.id)).toEqual([
      'c-bruno',
    ])
    expect(filtrarPerfis(lista, '91111', 'todos').map((p) => p.cliente.id)).toEqual([
      'c-ana',
    ])
    expect(filtrarPerfis(lista, '', 'sem_retorno').map((p) => p.cliente.id)).toEqual([
      'c-bruno',
    ])
    expect(filtrarPerfis(lista, '', 'recorrente').map((p) => p.cliente.id)).toEqual([
      'c-ana',
    ])
  })

  it('resume a contagem por segmento', () => {
    // Carla não tem atendimentos e o cadastro é recente → nova
    expect(resumoSegmentos(perfis())).toEqual({
      novo: 1,
      ativo: 0,
      recorrente: 1,
      sem_retorno: 1,
      inativo: 0,
    })
  })
})

describe('proximoAgendamento e proximaDataSugerida', () => {
  it('encontra o próximo futuro pendente/confirmado em ordem', () => {
    const futuro = [
      ag('Ana Souza', 5, { status: 'confirmado', horario: '14:00' }),
      ag('Ana Souza', 2, { status: 'pendente', horario: '10:00' }),
      ag('Ana Souza', -3, { status: 'confirmado' }),
      ag('Ana Souza', 3, { status: 'cancelado' }),
    ]
    const proximo = proximoAgendamento(futuro, 'Ana Souza', HOJE)
    expect(proximo?.data).toBe(somarDias(HOJE, 2))
  })

  it('retorna null sem futuro e calcula próxima data pela frequência', () => {
    expect(proximoAgendamento([], 'Ana Souza', HOJE)).toBeNull()
    expect(proximaDataSugerida(somarDias(HOJE, -20), 20)).toBe(HOJE)
    expect(proximaDataSugerida('', 20)).toBeNull()
    expect(proximaDataSugerida(somarDias(HOJE, -20), null)).toBeNull()
  })
})

describe('aniversariantes', () => {
  it('diasParaAniversario: 0 no próprio dia, cruza o ano e valida entrada', () => {
    expect(diasParaAniversario('1990-03-10', '2026-03-10')).toBe(0)
    expect(diasParaAniversario('1990-03-11', '2026-03-10')).toBe(1)
    expect(diasParaAniversario('1990-01-05', '2026-03-10')).toBe(301)
    expect(diasParaAniversario('1990-12-25', '2026-03-10')).toBe(290)
    expect(diasParaAniversario('', '2026-03-10')).toBeNull()
    expect(diasParaAniversario('data-invalida', '2026-03-10')).toBeNull()
  })

  it('aniversariantesDoMes: só o mês corrente, sem nascimento fora, ordenados', () => {
    const hoje = '2026-03-10'
    const lista = [
      cliente('c1', 'Ana Souza', { nascimento: '1990-03-25' }),
      cliente('c2', 'Bruno Lima', { nascimento: '1985-03-05' }),
      cliente('c3', 'Carla Dias', { nascimento: '1992-04-03' }),
      cliente('c4', 'Davi Ramos'),
    ]
    expect(aniversariantesDoMes(lista, hoje).map((c) => c.nome)).toEqual([
      'Bruno Lima',
      'Ana Souza',
    ])
    expect(aniversariantesDoMes([], hoje)).toEqual([])
  })
})

describe('produtos comprados no perfil', () => {
  function venda(
    id: string,
    extras: Partial<Lancamento>,
  ): Lancamento {
    return {
      id,
      tipo: 'receita',
      origem: 'produto',
      data: HOJE,
      hora: '11:00',
      descricao: 'Venda',
      valor: 60,
      desconto: 0,
      valorLiquido: 60,
      formaPagamento: 'pix',
      criadoEm: '2026-01-01T00:00:00.000Z',
      ...extras,
    }
  }

  it('agrega itens do PDV e produto legado; estorno e outros clientes ficam de fora', () => {
    const ana = cliente('c1', 'Ana Souza')
    const lancamentos = [
      venda('l1', {
        clienteId: 'c1',
        itens: [
          { produto: 'Pomada modeladora', quantidade: 2, preco: 30 },
          { produto: 'Gel fixador', quantidade: 1, preco: 25 },
        ],
      }),
      venda('l2', { clienteId: 'c1', produto: 'Pomada modeladora', quantidade: 1 }),
      venda('l3', {
        clienteId: 'c1',
        estornado: true,
        itens: [{ produto: 'Pomada modeladora', quantidade: 5, preco: 30 }],
      }),
      venda('l4', {
        clienteId: 'outro',
        itens: [{ produto: 'Pomada modeladora', quantidade: 9, preco: 30 }],
      }),
      venda('l5', { origem: 'atendimento', clienteId: 'c1' }),
    ]
    const perfil = montarPerfis([ana], [], lancamentos, HOJE)[0]
    expect(perfil.produtos).toEqual([
      { nome: 'Pomada modeladora', qtd: 3 },
      { nome: 'Gel fixador', qtd: 1 },
    ])
  })

  it('resolve por nome quando não há clienteId e devolve vazio sem compras', () => {
    const ana = cliente('c1', 'Ana Souza')
    const lancamentos = [
      venda('l1', { cliente: 'Ana Souza', produto: 'Pomada', quantidade: 2 }),
      venda('l2', { cliente: 'Outro Cliente', produto: 'Pomada', quantidade: 4 }),
    ]
    const perfil = montarPerfis([ana], [], lancamentos, HOJE)[0]
    expect(perfil.produtos).toEqual([{ nome: 'Pomada', qtd: 2 }])
    expect(
      montarPerfis([cliente('c2', 'Sem Compras')], [], [], HOJE)[0].produtos,
    ).toEqual([])
  })
})

describe('montarHistorico — histórico completo do cliente', () => {
  function interacao(texto: string, extras: Partial<Interacao> = {}): Interacao {
    return {
      id: `i-${texto}`,
      clienteId: 'c-ana',
      tipo: 'nota',
      texto,
      criadoEm: `${somarDias(HOJE, -1)}T10:00:00.000Z`,
      ...extras,
    }
  }

  function mensagem(
    texto: string,
    extras: Partial<MensagemWhats> = {},
  ): MensagemWhats {
    return {
      id: `m-${texto}`,
      clienteId: 'c-ana',
      cliente: 'Ana Souza',
      template: 'reativacao',
      texto,
      status: 'pendente',
      origem: 'crm',
      criadoEm: `${somarDias(HOJE, -2)}T09:00:00.000Z`,
      ...extras,
    }
  }

  it('agrega as quatro fontes em ordem decrescente com títulos prefixados', () => {
    const ana = cliente('c-ana', 'Ana Souza')
    const eventos = montarHistorico(ana, {
      agendamentos: [
        ag('Ana Souza', -5),
        ag('Ana Souza', 3, { status: 'pendente' }),
      ],
      lancamentos: [lancamento('l-1', 'c-ana', 100)],
      interacoes: [interacao('Cliente pediu contato.')],
      mensagens: [mensagem('Mensagem de reativação.')],
    })

    expect(eventos.map((e) => e.tipo)).toEqual([
      'agendamento',
      'pagamento',
      'interacao',
      'mensagem',
      'agendamento',
    ])
    expect(eventos[0]).toMatchObject({
      titulo: 'Agendamento · Corte Degradê · Audax',
      data: somarDias(HOJE, 3),
      hora: '10:00',
      statusAgendamento: 'pendente',
    })
    const pagamentos = eventos.filter((e) => e.tipo === 'pagamento')
    expect(pagamentos[0]).toMatchObject({ valor: 100, estornado: false })
    expect(
      eventos.find((e) => e.tipo === 'interacao')?.titulo,
    ).toBe('Nota · Cliente pediu contato.')
    expect(
      eventos.find((e) => e.tipo === 'mensagem')?.titulo,
    ).toBe('WhatsApp · Reativação · Mensagem de reativação.')
  })

  it('não vaza dados de outro cliente e marca estorno e despesa', () => {
    const ana = cliente('c-ana', 'Ana Souza')
    const eventos = montarHistorico(ana, {
      agendamentos: [ag('Ana Souza', -1), ag('Bruno Lima', -1)],
      lancamentos: [
        lancamento('l-outro', 'c-bruno', 50),
        {
          ...lancamento('l-nome', '', 60),
          clienteId: '',
          cliente: 'ANA SOUZA',
          estornado: true,
        },
        { ...lancamento('l-despesa', 'c-ana', 10), tipo: 'despesa' },
      ],
      interacoes: [
        interacao('minha nota'),
        interacao('nota do outro', { clienteId: 'c-bruno' }),
      ],
      mensagens: [
        mensagem('para ana'),
        mensagem('para bruno', { clienteId: 'c-bruno' }),
      ],
    })

    expect(eventos.filter((e) => e.tipo === 'agendamento')).toHaveLength(1)
    expect(
      eventos.every((e) => !e.titulo.includes('Bruno Lima')),
    ).toBe(true)
    const pagamentos = eventos.filter((e) => e.tipo === 'pagamento')
    expect(pagamentos).toHaveLength(1)
    expect(pagamentos[0]).toMatchObject({ valor: 60, estornado: true })
    expect(eventos.filter((e) => e.tipo === 'interacao')).toHaveLength(1)
    expect(eventos.filter((e) => e.tipo === 'mensagem')).toHaveLength(1)
  })

  it('devolve lista vazia quando o cliente não tem eventos', () => {
    const eventos = montarHistorico(cliente('c-9', 'Sem Eventos'), {
      agendamentos: [],
      lancamentos: [],
      interacoes: [],
      mensagens: [],
    })
    expect(eventos).toEqual([])
  })
})

describe('grupos de retorno — ativos, risco e inativos', () => {
  it('segmentosDoGrupo define quem compõe cada grupo', () => {
    expect(segmentosDoGrupo('ativos')).toEqual(['ativo', 'recorrente'])
    expect(segmentosDoGrupo('risco')).toEqual(['sem_retorno'])
    expect(segmentosDoGrupo('inativos')).toEqual(['inativo'])
  })

  it('filtrarPerfis aceita grupos e resumoGrupos soma os segmentos', () => {
    const ana = cliente('c1', 'Ana Souza')
    const bruno = cliente('c2', 'Bruno Lima')
    const clara = cliente('c3', 'Clara Dias')
    const diego = cliente('c4', 'Diego Alves')
    const ags = [
      ag('Ana Souza', -10),
      ag('Ana Souza', -20),
      ag('Ana Souza', -25),
      ag('Bruno Lima', -50),
      ag('Clara Dias', -120),
    ]
    const perfis = montarPerfis([ana, bruno, clara, diego], ags, [], HOJE)

    expect(filtrarPerfis(perfis, '', 'ativos').map((p) => p.cliente.nome)).toEqual(
      ['Ana Souza'],
    )
    expect(filtrarPerfis(perfis, '', 'risco').map((p) => p.cliente.nome)).toEqual(
      ['Bruno Lima'],
    )
    expect(
      filtrarPerfis(perfis, '', 'inativos').map((p) => p.cliente.nome),
    ).toEqual(['Clara Dias'])
    // novo (sem visita) não entra em nenhum grupo
    expect(filtrarPerfis(perfis, '', 'ativos')).toHaveLength(1)
    expect(resumoGrupos(resumoSegmentos(perfis))).toEqual({
      ativos: 1,
      risco: 1,
      inativos: 1,
    })
  })
})
