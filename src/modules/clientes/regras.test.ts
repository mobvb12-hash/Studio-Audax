import { describe, expect, it } from 'vitest'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import {
  filtrarClientes,
  gastoDoCliente,
  gastosPorCliente,
  normalizarBusca,
  resumoAtendimentos,
  resumoClientes,
} from './regras'
import { preferenciasPadrao, type Cliente } from './types'

function cliente(parcial: Partial<Cliente> = {}): Cliente {
  return {
    id: 'c1',
    nome: 'Lucas Mendes',
    telefone: '(11) 98888-7777',
    email: 'lucas@email.com',
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
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

function agendamento(parcial: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 'ag1',
    cliente: 'Lucas Mendes',
    telefone: '(11) 98888-7777',
    servico: 'Corte',
    profissional: 'Audax',
    data: '2026-09-20',
    horario: '10:00',
    status: 'concluido',
    observacao: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    ...parcial,
  }
}

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 'l1',
    tipo: 'receita',
    origem: 'atendimento',
    data: '2026-09-20',
    hora: '10:00',
    descricao: 'Corte — Lucas Mendes',
    valor: 100,
    desconto: 0,
    valorLiquido: 100,
    formaPagamento: 'pix',
    cliente: 'Lucas Mendes',
    criadoEm: '2026-09-20T10:00:00.000Z',
    ...parcial,
  }
}

describe('Clientes — normalizarBusca', () => {
  it('remove acentos, caixa alta e espaços das pontas', () => {
    expect(normalizarBusca('  JoÃO  ')).toBe('joao')
    expect(normalizarBusca('Çabelo+Barba')).toBe('cabelo+barba')
    expect(normalizarBusca('')).toBe('')
  })
})

describe('Clientes — filtrarClientes (status e busca)', () => {
  const ativo = cliente({ id: 'c1', nome: 'Lucas Mendes' })
  const inativo = cliente({
    id: 'c2',
    nome: 'Ana Souza',
    telefone: '(11) 97777-6666',
    email: 'ana@email.com',
    ativo: false,
  })

  it('filtra por status: todos, ativos e inativos', () => {
    const todos = filtrarClientes([ativo, inativo], '', 'todos')
    expect(todos.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(filtrarClientes([ativo, inativo], '', 'ativos').map((c) => c.id)).toEqual([
      'c1',
    ])
    expect(
      filtrarClientes([ativo, inativo], '', 'inativos').map((c) => c.id),
    ).toEqual(['c2'])
  })

  it('busca por nome sem distinguir acento e caixa', () => {
    expect(filtrarClientes([ativo, inativo], 'LUCAS', 'todos')).toHaveLength(1)
    expect(filtrarClientes([ativo, inativo], 'joão', 'todos')).toHaveLength(0)
    expect(
      filtrarClientes([cliente({ nome: 'João Silva' })], 'JOAO', 'todos'),
    ).toHaveLength(1)
  })

  it('busca por telefone com ou sem formatação', () => {
    expect(filtrarClientes([ativo, inativo], '98888', 'todos')[0]?.id).toBe('c1')
    expect(filtrarClientes([ativo, inativo], '(11) 97777-6666', 'todos')[0]?.id).toBe(
      'c2',
    )
    expect(filtrarClientes([ativo, inativo], '99999', 'todos')).toHaveLength(0)
  })

  it('busca por telefone adicional com ou sem formatação', () => {
    const comAdicional = cliente({
      telefone: '(11) 98888-7777',
      telefones: [
        { tipo: 'residencial', numero: '(11) 3232-1111' },
        { tipo: 'comercial', numero: '(11) 3232-2222' },
      ],
    })
    expect(filtrarClientes([comAdicional], '3232-2222', 'todos')).toHaveLength(1)
    expect(filtrarClientes([comAdicional], '(11)32321111', 'todos')).toHaveLength(
      1,
    )
    expect(filtrarClientes([comAdicional], '4444', 'todos')).toHaveLength(0)
  })

  it('busca por e-mail', () => {
    expect(filtrarClientes([ativo, inativo], 'ana@email.com', 'todos')[0]?.id).toBe(
      'c2',
    )
  })

  it('combina busca com filtro de status', () => {
    expect(filtrarClientes([ativo, inativo], 'ana', 'ativos')).toHaveLength(0)
    expect(filtrarClientes([ativo, inativo], 'ana', 'inativos')).toHaveLength(1)
    expect(filtrarClientes([ativo, inativo], 'ana', 'todos')).toHaveLength(1)
  })
})

describe('Clientes — resumoClientes', () => {
  it('conta total, ativos e inativos', () => {
    const lista = [
      cliente({ id: 'c1' }),
      cliente({ id: 'c2', ativo: false }),
      cliente({ id: 'c3', ativo: false }),
    ]
    expect(resumoClientes(lista)).toEqual({ total: 3, ativos: 1, inativos: 2 })
    expect(resumoClientes([])).toEqual({ total: 0, ativos: 0, inativos: 0 })
  })
})

describe('Clientes — resumoAtendimentos', () => {
  it('conta apenas concluídos e pega a maior data como último', () => {
    const mapa = resumoAtendimentos([
      agendamento({ id: 'a1', data: '2026-09-10' }),
      agendamento({ id: 'a2', data: '2026-09-25' }),
      agendamento({ id: 'a3', data: '2026-09-30', status: 'cancelado' }),
      agendamento({ id: 'a4', data: '2026-09-20', cliente: 'Ana Souza' }),
    ])
    expect(mapa.get('lucas mendes')).toEqual({ total: 2, ultimo: '2026-09-25' })
    expect(mapa.get('ana souza')).toEqual({ total: 1, ultimo: '2026-09-20' })
  })

  it('ignora agendamentos sem cliente e nome vazio', () => {
    const mapa = resumoAtendimentos([
      agendamento({ cliente: '   ' }),
      agendamento({ id: 'a2', cliente: 'Ana Souza' }),
    ])
    expect(mapa.size).toBe(1)
    expect(mapa.get('ana souza')?.total).toBe(1)
  })
})

describe('Clientes — gastosPorCliente', () => {
  const lucas = cliente({ id: 'c1', nome: 'Lucas Mendes' })
  const ana = cliente({ id: 'c2', nome: 'Ana Souza' })

  it('soma receitas por id e resolve legados pelo nome', () => {
    const gastos = gastosPorCliente(
      [
        lancamento({ id: 'l1', clienteId: 'c1', valorLiquido: 100 }),
        lancamento({ id: 'l2', cliente: 'Ana Souza', clienteId: undefined, valorLiquido: 50 }),
        lancamento({
          id: 'l3',
          clienteId: 'removido',
          cliente: 'Lucas Mendes',
          valorLiquido: 30,
        }),
      ],
      [lucas, ana],
    )
    expect(gastoDoCliente(gastos, lucas)).toBe(130)
    expect(gastoDoCliente(gastos, ana)).toBe(50)
  })

  it('ignora despesas e receitas estornadas', () => {
    const gastos = gastosPorCliente(
      [
        lancamento({ id: 'l1', clienteId: 'c1', valorLiquido: 100 }),
        lancamento({ id: 'l2', clienteId: 'c1', valorLiquido: 999, estornado: true }),
        lancamento({
          id: 'l3',
          clienteId: 'c1',
          tipo: 'despesa',
          origem: 'despesa',
          valorLiquido: 500,
        }),
      ],
      [lucas],
    )
    expect(gastoDoCliente(gastos, lucas)).toBe(100)
  })

  it('retorna 0 para cliente sem lançamentos', () => {
    expect(gastoDoCliente(new Map(), lucas)).toBe(0)
  })
})
