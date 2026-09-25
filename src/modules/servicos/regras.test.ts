import { describe, expect, it } from 'vitest'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import {
  filtrarServicosAtivos,
  servicoEmUso,
  validarServico,
} from './regras'
import type { Servico } from './types'

function servico(override: Partial<Servico> = {}): Servico {
  return {
    id: 'srv-1',
    nome: 'Corte Degradê',
    preco: 70,
    duracaoMin: 40,
    categoria: '',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...override,
  }
}

function agendamento(nome: string): Pick<Agendamento, 'servico'> {
  return { servico: nome }
}

function lancamento(nome: string | undefined): Pick<Lancamento, 'servico'> {
  return { servico: nome }
}

describe('validarServico', () => {
  it('aceita serviço válido com categoria', () => {
    expect(
      validarServico({
        nome: 'Platinado',
        preco: 150.5,
        duracaoMin: 90,
        categoria: 'Tratamento',
      }),
    ).toBeNull()
  })

  it('rejeita nome curto ou vazio', () => {
    expect(
      validarServico({ nome: '', preco: 50, duracaoMin: 30 }),
    ).toBe('Informe o nome do serviço.')
    expect(
      validarServico({ nome: ' a ', preco: 50, duracaoMin: 30 }),
    ).toBe('Informe o nome do serviço.')
  })

  it('rejeita preço inválido: negativo, NaN e infinito', () => {
    const base = { nome: 'Corte', duracaoMin: 30 }
    expect(validarServico({ ...base, preco: -1 })).toMatch(/preço válido/)
    expect(validarServico({ ...base, preco: Number.NaN })).toMatch(
      /preço válido/,
    )
    expect(validarServico({ ...base, preco: Number.POSITIVE_INFINITY })).toMatch(
      /preço válido/,
    )
    expect(validarServico({ ...base, preco: 0 })).toBeNull()
  })

  it('rejeita duração inválida: fracionária, zero e menor que 5 min', () => {
    const base = { nome: 'Corte', preco: 50 }
    expect(validarServico({ ...base, duracaoMin: 0 })).toMatch(/mínimo 5/)
    expect(validarServico({ ...base, duracaoMin: 4 })).toMatch(/mínimo 5/)
    expect(validarServico({ ...base, duracaoMin: 30.5 })).toMatch(/mínimo 5/)
    expect(validarServico({ ...base, duracaoMin: 5 })).toBeNull()
  })

  it('rejeita categoria longa demais', () => {
    expect(
      validarServico({
        nome: 'Corte',
        preco: 50,
        duracaoMin: 30,
        categoria: 'x'.repeat(41),
      }),
    ).toMatch(/Categoria muito longa/)
    expect(
      validarServico({
        nome: 'Corte',
        preco: 50,
        duracaoMin: 30,
        categoria: 'x'.repeat(40),
      }),
    ).toBeNull()
  })
})

describe('servicoEmUso', () => {
  it('serviço nunca usado pode ser excluído', () => {
    const uso = servicoEmUso('Barba', [], [])
    expect(uso).toEqual({ emUso: false, agendamentos: 0, lancamentos: 0 })
  })

  it('conta agendamentos em qualquer status (histórico preservado)', () => {
    const ags = [
      agendamento('Corte Degradê'),
      agendamento('Barba'),
      agendamento('Corte Degradê'),
    ]
    const uso = servicoEmUso('Corte Degradê', ags, [])
    expect(uso).toEqual({ emUso: true, agendamentos: 2, lancamentos: 0 })
    expect(servicoEmUso('Platinado', ags, []).emUso).toBe(false)
  })

  it('conta lançamentos do caixa e considera referências sem serviço', () => {
    const lances = [
      lancamento('Corte Degradê'),
      lancamento(undefined),
      lancamento('Corte Degradê'),
    ]
    const uso = servicoEmUso('Corte Degradê', [], lances)
    expect(uso).toEqual({ emUso: true, agendamentos: 0, lancamentos: 2 })
    expect(servicoEmUso('Outro', [], lances).emUso).toBe(false)
  })

  it('soma agendamentos e caixa quando existem nos dois', () => {
    const uso = servicoEmUso('Barba', [agendamento('Barba')], [
      lancamento('Barba'),
    ])
    expect(uso).toEqual({ emUso: true, agendamentos: 1, lancamentos: 1 })
  })
})

describe('filtrarServicosAtivos', () => {
  it('mantém apenas serviços ativos sem apagar os inativos da lista original', () => {
    const lista = [
      servico({ id: 'a', nome: 'Corte', ativo: true }),
      servico({ id: 'b', nome: 'Barba', ativo: false }),
      servico({ id: 'c', nome: 'Platinado', ativo: true }),
    ]
    const ativos = filtrarServicosAtivos(lista)
    expect(ativos.map((s) => s.nome)).toEqual(['Corte', 'Platinado'])
    expect(lista).toHaveLength(3)
  })
})
