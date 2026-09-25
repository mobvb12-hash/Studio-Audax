import { describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { preferenciasPadrao, type Cliente } from '@/modules/clientes/types'
import type { Servico } from '@/modules/servicos/types'
import { gerarSugestoes, semTratadas } from './regras'

const HOJE = hojeISO()

function cliente(
  id: string,
  nome: string,
  extras: Partial<Cliente> = {},
): Cliente {
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
    criadoEm: `${somarDias(HOJE, -200)}T00:00:00.000Z`,
    atualizadoEm: `${somarDias(HOJE, -200)}T00:00:00.000Z`,
    ...extras,
  }
}

function ag(
  clienteNome: string,
  dataRel: number,
  servico: string,
): Agendamento {
  return {
    id: `ag-${clienteNome}-${dataRel}`,
    cliente: clienteNome,
    telefone: '',
    servico,
    profissional: 'Audax',
    data: somarDias(HOJE, dataRel),
    horario: '10:00',
    status: 'concluido',
    observacao: '',
    criadoEm: '2026-01-01T00:00:00.000Z',
    duracaoMin: 40,
  }
}

function servico(id: string, nome: string, ativo = true): Servico {
  return {
    id,
    nome,
    preco: 70,
    duracaoMin: 40,
    categoria: '',
    ativo,
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
  }
}

/**
 * Cenário:
 * - Ana: 6 cortes, último há 60 dias (sem retorno), nunca fez Barba;
 * - Bruno: 3 barbas, último há 20 dias, frequência 20, sem futuro;
 * - Carla: cadastro inativo com histórico → nenhuma sugestão;
 * - Diego: recém-cadastrado sem atendimentos → nenhuma sugestão.
 */
function entrada() {
  const clientes = [
    cliente('c-ana', 'Ana Souza'),
    cliente('c-bruno', 'Bruno Lima'),
    cliente('c-carla', 'Carla Dias', { ativo: false }),
    cliente('c-diego', 'Diego Rocha', {
      criadoEm: `${somarDias(HOJE, -5)}T00:00:00.000Z`,
    }),
  ]
  const agendamentos = [
    ag('Ana Souza', -150, 'Corte Degradê'),
    ag('Ana Souza', -130, 'Corte Degradê'),
    ag('Ana Souza', -110, 'Corte Degradê'),
    ag('Ana Souza', -90, 'Corte Degradê'),
    ag('Ana Souza', -75, 'Corte Degradê'),
    ag('Ana Souza', -60, 'Corte Degradê'),
    ag('Bruno Lima', -60, 'Barba'),
    ag('Bruno Lima', -40, 'Barba'),
    ag('Bruno Lima', -20, 'Barba'),
    ag('Carla Dias', -70, 'Corte Degradê'),
    ag('Carla Dias', -55, 'Corte Degradê'),
  ]
  const lancamentos: Lancamento[] = []
  const servicos = [
    servico('s1', 'Corte Degradê'),
    servico('s2', 'Barba'),
    servico('s3', 'Platinado / Luzes'),
  ]
  return { clientes, agendamentos, lancamentos, servicos, hoje: HOJE }
}

describe('Central de IA — sugestões a partir de dados reais', () => {
  it('gera reativação, complementares e oportunidade com ids determinísticos', () => {
    const sugestoes = gerarSugestoes(entrada())
    expect(sugestoes.map((s) => s.id)).toEqual([
      'reativacao:c-ana',
      'complementar:c-ana:s2',
      'complementar:c-bruno:s1',
      'oportunidade:c-bruno',
    ])
  })

  it('reativação usa o histórico real e monta mensagem de reativação', () => {
    const sugestoes = gerarSugestoes(entrada())
    const reativar = sugestoes.find((s) => s.id === 'reativacao:c-ana')!
    expect(reativar.cliente).toBe('Ana Souza')
    expect(reativar.acao.tipo).toBe('mensagem')
    if (reativar.acao.tipo === 'mensagem') {
      expect(reativar.acao.template).toBe('reativacao')
      expect(reativar.acao.texto).toContain('Ana Souza')
      expect(reativar.acao.texto).toContain('60 dia(s)')
    }
    expect(reativar.descricao).toContain('6 atendimento(s)')
  })

  it('complementar só sugere serviço ativo, não usado e com demanda real', () => {
    const sugestoes = gerarSugestoes(entrada())
    const ana = sugestoes.find((s) => s.id === 'complementar:c-ana:s2')!
    expect(ana.acao.tipo).toBe('nota')
    expect(ana.titulo).toContain('Barba')
    // Platinado nunca foi feito no salão → nunca aparece
    expect(sugestoes.some((s) => s.id.includes('s3'))).toBe(false)
    // Carla tem cadastro inativo → nenhuma sugestão
    expect(sugestoes.some((s) => s.clienteId === 'c-carla')).toBe(false)
    // Diego é novo, sem histórico → nenhuma sugestão
    expect(sugestoes.some((s) => s.clienteId === 'c-diego')).toBe(false)
  })

  it('oportunidade exige recorrência e ausência de horário futuro', () => {
    const base = entrada()
    const comFuturo = gerarSugestoes({
      ...base,
      agendamentos: [
        ...base.agendamentos,
        {
          id: 'ag-futuro',
          cliente: 'Bruno Lima',
          telefone: '',
          servico: 'Corte Degradê',
          profissional: 'Audax',
          data: somarDias(HOJE, 3),
          horario: '10:00',
          status: 'confirmado',
          observacao: '',
          criadoEm: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(comFuturo.some((s) => s.id === 'oportunidade:c-bruno')).toBe(false)
    // Ana (sem retorno) continua com a reativação
    expect(comFuturo.some((s) => s.id === 'reativacao:c-ana')).toBe(true)
  })

  it('serviço inativo no cadastro não é sugerido como complementar', () => {
    const base = entrada()
    const semBarba = gerarSugestoes({
      ...base,
      servicos: [
        servico('s1', 'Corte Degradê'),
        servico('s2', 'Barba', false),
        servico('s3', 'Platinado / Luzes'),
      ],
    })
    expect(semBarba.some((s) => s.id.startsWith('complementar:c-ana:'))).toBe(
      false,
    )
    // Bruno continua com Corte Degradê como complementar
    expect(semBarba.some((s) => s.id === 'complementar:c-bruno:s1')).toBe(true)
  })

  it('não altera nenhum dado de entrada (função pura)', () => {
    const dados = entrada()
    const antesClientes = JSON.stringify(dados.clientes)
    const antesAg = JSON.stringify(dados.agendamentos)
    const antesServicos = JSON.stringify(dados.servicos)
    const antesLancamentos = JSON.stringify(dados.lancamentos)

    gerarSugestoes(dados)

    expect(JSON.stringify(dados.clientes)).toBe(antesClientes)
    expect(JSON.stringify(dados.agendamentos)).toBe(antesAg)
    expect(JSON.stringify(dados.servicos)).toBe(antesServicos)
    expect(JSON.stringify(dados.lancamentos)).toBe(antesLancamentos)
  })

  it('sem clientes não há sugestões', () => {
    expect(
      gerarSugestoes({
        clientes: [],
        agendamentos: [],
        lancamentos: [],
        servicos: [],
        hoje: HOJE,
      }),
    ).toEqual([])
  })

  it('semTratadas remove as já confirmadas/descartadas', () => {
    const sugestoes = gerarSugestoes(entrada())
    const restantes = semTratadas(sugestoes, ['reativacao:c-ana'])
    expect(restantes.some((s) => s.id === 'reativacao:c-ana')).toBe(false)
    expect(restantes).toHaveLength(sugestoes.length - 1)
    const comoSet = semTratadas(sugestoes, new Set(['oportunidade:c-bruno']))
    expect(comoSet.some((s) => s.id === 'oportunidade:c-bruno')).toBe(false)
  })
})
