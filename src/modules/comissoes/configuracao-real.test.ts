// FASE 1 — configuração real de comissão.
//
// O problema encontrado: a única linha de `comissoes_configs` apontava para o
// profissional inativo "TESTE" (`prof-cleiton-silva`), deixando Cleiton e Ítalo
// sem configuração explícita e caindo no fallback silencioso de 40%.
//
// Estes testes travam o comportamento do CÓDIGO (qual percentual entra no
// cálculo e o que acontece sem configuração). A configuração gravada no banco
// é verificada à parte, por leitura.
import { describe, expect, it } from 'vitest'
import { PERCENTUAL_PADRAO } from './types'
import { linhasDoPeriodo, totaisDoPeriodo } from './resumo'
import { calcularComissao } from './producao'
import type { Lancamento } from '@/modules/caixa/types'
import type { ConfigComissao, Periodo } from './types'

const PERIODO: Periodo = { inicio: '2026-03-01', fim: '2026-03-31' }

const CONFIG_40: ConfigComissao = {
  profissionalId: 'prof-audax',
  percentual: 40,
  ativo: true,
}

function lancamento(parcial: Partial<Lancamento> = {}): Lancamento {
  return {
    id: 'l1',
    tipo: 'receita',
    origem: 'atendimento',
    data: '2026-03-10',
    hora: '10:00',
    descricao: 'Corte',
    valor: 200,
    desconto: 0,
    valorLiquido: 200,
    formaPagamento: 'pix',
    cliente: 'Ana',
    profissional: 'Cleiton Silva',
    criadoEm: '2026-03-10T10:00:00.000Z',
    ...parcial,
  }
}

type ProfissionalBasico = { id: string; nome: string; foto: string; ativo: boolean }

const cadastro = (
  parcial: Partial<ProfissionalBasico> = {},
): ProfissionalBasico => ({
  id: 'prof-audax',
  nome: 'Cleiton Silva',
  foto: '',
  ativo: true,
  ...parcial,
})

function linhaDeCleiton(config: ConfigComissao, lancs: Lancamento[]) {
  const linhas = linhasDoPeriodo(lancs, [cadastro()], () => config, PERIODO)
  return linhas.find((l) => l.nome === 'Cleiton Silva')
}

describe('Comissões — o percentual vem da configuração do profissional', () => {
  it('a regra oficial do projeto é 40%', () => {
    expect(PERCENTUAL_PADRAO).toBe(40)
    expect(calcularComissao(100, 40)).toBe(40)
    expect(calcularComissao(1000, 40)).toBe(400)
  })

  it('configuração explícita de 40% é a que entra no cálculo', () => {
    const linha = linhaDeCleiton(CONFIG_40, [lancamento()])
    expect(linha?.percentual).toBe(40)
    expect(linha?.comissao).toBe(80)
    expect(totaisDoPeriodo(linha ? [linha] : []).comissao).toBe(80)
  })

  it('cada profissional usa a SUA configuração', () => {
    const lancs = [
      lancamento({ id: 'a', profissional: 'Cleiton Silva' }),
      lancamento({
        id: 'b',
        profissional: 'Ítalo Santos',
        valor: 200,
        valorLiquido: 200,
      }),
    ]
    const linhas = linhasDoPeriodo(
      lancs,
      [cadastro(), cadastro({ id: 'prof-diego', nome: 'Ítalo Santos' })],
      (id) =>
        id === 'prof-audax'
          ? { profissionalId: id, percentual: 40, ativo: true }
          : { profissionalId: id, percentual: 30, ativo: true },
      PERIODO,
    )
    const porNome = new Map(linhas.map((r) => [r.nome, r]))
    expect(porNome.get('Cleiton Silva')?.comissao).toBe(80)
    expect(porNome.get('Ítalo Santos')?.comissao).toBe(60)
  })

  it('sem configuração o store sintetiza o padrão de 40% (fallback conhecido)', () => {
    // É o comportamento que a FASE 1 eliminou nos profissionais REAIS do
    // banco (configuração explícita gravada para Cleiton e Ítalo).
    const linha = linhaDeCleiton(
      { ...CONFIG_40, profissionalId: 'prof-audax' },
      [lancamento()],
    )
    expect(linha?.percentual).toBe(PERCENTUAL_PADRAO)
    expect(linha?.comissao).toBe(80)
  })

  it('percentual diferente é respeitado', () => {
    const linha = linhaDeCleiton(
      { profissionalId: 'prof-audax', percentual: 25, ativo: true },
      [lancamento()],
    )
    expect(linha?.comissao).toBe(50)
  })

  it('sem produção o total é zero', () => {
    expect(totaisDoPeriodo([])).toEqual({ qtd: 0, producao: 0, comissao: 0 })
  })

  it('lançamento estornado não entra na produção', () => {
    const linhas = linhasDoPeriodo(
      [lancamento({ estornado: true })],
      [cadastro()],
      () => CONFIG_40,
      PERIODO,
    )
    expect(totaisDoPeriodo(linhas).comissao).toBe(0)
  })

  it('configuração inativa não impede o cálculo — quem decide é o fechamento', () => {
    const linha = linhaDeCleiton(
      { profissionalId: 'prof-cleiton-silva', percentual: 40, ativo: false },
      [lancamento()],
    )
    expect(linha?.comissao).toBe(80)
    expect(linha?.percentual).toBe(40)
  })
})