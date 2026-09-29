import { describe, expect, it } from 'vitest'
import type { Lancamento } from '@/modules/caixa/types'
import { linhasDoPeriodo, totaisDoPeriodo } from './resumo'
import type { ConfigComissao } from './types'

const PERIODO = { inicio: '2026-09-01', fim: '2026-09-30' }

function lanc(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 'l-1',
    tipo: 'receita',
    origem: 'atendimento',
    data: '2026-09-15',
    hora: '10:00',
    descricao: 'Corte Degradê — Ana',
    valor: 70,
    desconto: 0,
    valorLiquido: 70,
    formaPagamento: 'pix',
    profissional: 'Cleiton Silva',
    cliente: 'Ana',
    servico: 'Corte Degradê',
    criadoEm: '2026-09-15T10:00:00.000Z',
    ...parcial,
  }
}

function configDe(id: string): ConfigComissao {
  return { profissionalId: id, percentual: 40, ativo: true }
}

// Cadastro duplicado (mesmo nome) — a produção é calculada por nome e os
// dois registros fariam o período contar em dobro nos totais.
const DUPLICADOS = [
  { id: 'prof-inativo', nome: 'Cleiton Silva', ativo: false },
  { id: 'prof-ativo', nome: 'Cleiton Silva', ativo: true },
]

describe('Resumo de comissões — cadastro duplicado não duplica totais', () => {
  it('duplicado sem produção própria não conta o período em dobro', () => {
    const linhas = linhasDoPeriodo([lanc()], DUPLICADOS, configDe, PERIODO)

    // uma linha só para o nome repetido, com o registro ativo representando
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      chave: 'prof-ativo',
      profissionalId: 'prof-ativo',
      nome: 'Cleiton Silva',
      qtd: 1,
      producao: 70,
      comissao: 28,
    })
    // os totais refletem o atendimento uma única vez
    expect(totaisDoPeriodo(linhas)).toEqual({
      qtd: 1,
      producao: 70,
      comissao: 28,
    })
  })

  it('nomes sem produção geram uma linha única e zero nos totais', () => {
    const linhas = linhasDoPeriodo([], DUPLICADOS, configDe, PERIODO)
    expect(linhas).toHaveLength(1)
    expect(totaisDoPeriodo(linhas)).toEqual({
      qtd: 0,
      producao: 0,
      comissao: 0,
    })
  })

  it('profissionais sem duplicidade continuam com uma linha cada', () => {
    const linhas = linhasDoPeriodo(
      [lanc(), lanc({ id: 'l-2', profissional: 'Ítalo Santos', valor: 50, valorLiquido: 50 })],
      [
        { id: 'prof-1', nome: 'Cleiton Silva', ativo: true },
        { id: 'prof-2', nome: 'Ítalo Santos', ativo: true },
      ],
      configDe,
      PERIODO,
    )
    expect(linhas.map((l) => l.nome)).toEqual(['Cleiton Silva', 'Ítalo Santos'])
    expect(totaisDoPeriodo(linhas)).toEqual({
      qtd: 2,
      producao: 120,
      comissao: 48,
    })
  })
})
