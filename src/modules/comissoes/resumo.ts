// Fonte única de "produção e comissão por profissional no período".
// Usada pela tela de Comissões e pelo KPI do Dashboard — mesma regra,
// mesmos números (evita divergência entre painéis).
import type { Lancamento } from '@/modules/caixa/types'
import { calcularComissao, calcularProducao } from './producao'
import type { ConfigComissao, Periodo } from './types'

export type LinhaProducao = {
  chave: string
  profissionalId: string
  nome: string
  foto?: string
  inativo: boolean
  percentual: number
  qtd: number
  producao: number
  comissao: number
}

type ProfissionalBasico = {
  id: string
  nome: string
  foto?: string
  /** Status no cadastro de profissionais (false = inativo, histórico mantido) */
  ativo?: boolean
}

export function linhasDoPeriodo(
  lancamentos: Lancamento[],
  profissionais: ProfissionalBasico[],
  configDe: (profissionalId: string) => ConfigComissao,
  periodo: Periodo,
): LinhaProducao[] {
  const nomesComProducao = new Set(
    lancamentos
      .filter(
        (l) =>
          l.origem === 'atendimento' &&
          !l.estornado &&
          l.profissional &&
          l.data >= periodo.inicio &&
          l.data <= periodo.fim,
      )
      .map((l) => l.profissional as string),
  )

  const base: ProfissionalBasico[] = profissionais.map((p) => ({
    id: p.id,
    nome: p.nome,
    foto: p.foto,
    ativo: p.ativo,
  }))
  for (const nome of nomesComProducao) {
    if (!profissionais.some((p) => p.nome === nome)) {
      base.push({ id: `nome:${nome}`, nome })
    }
  }

  return base
    .map(({ id, nome, foto, ativo }) => {
      const config = configDe(id)
      const producao = calcularProducao(lancamentos, nome, periodo)
      return {
        chave: id,
        profissionalId: id,
        nome,
        foto,
        // Inativo por comissão OU por cadastro: o histórico continua visível
        inativo: !config.ativo || ativo === false,
        percentual: config.percentual,
        qtd: producao.qtdAtendimentos,
        producao: producao.liquido,
        comissao: calcularComissao(producao.liquido, config.percentual),
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function totaisDoPeriodo(linhas: LinhaProducao[]): {
  qtd: number
  producao: number
  comissao: number
} {
  return linhas.reduce(
    (totais, linha) => ({
      qtd: totais.qtd + linha.qtd,
      producao: totais.producao + linha.producao,
      comissao: totais.comissao + linha.comissao,
    }),
    { qtd: 0, producao: 0, comissao: 0 },
  )
}

/** Mesma linha de produção, enriquecida com detalhes do período (Relatórios). */
export type LinhaDetalhada = LinhaProducao & {
  descontos: number
  estornos: number
  qtdEstornos: number
  producaoProdutos: number
  qtdProdutos: number
}

/**
 * Mesmíssima base de linhasDoPeriodo — apenas repassa os detalhes já
 * calculados por calcularProducao. Nenhuma regra paralela de comissão.
 */
export function linhasDetalhadasDoPeriodo(
  lancamentos: Lancamento[],
  profissionais: ProfissionalBasico[],
  configDe: (profissionalId: string) => ConfigComissao,
  periodo: Periodo,
): LinhaDetalhada[] {
  return linhasDoPeriodo(lancamentos, profissionais, configDe, periodo).map(
    (linha) => {
      const detalhe = calcularProducao(lancamentos, linha.nome, periodo)
      return {
        ...linha,
        descontos: detalhe.descontos,
        estornos: detalhe.valorEstornos,
        qtdEstornos: detalhe.qtdEstornos,
        producaoProdutos: detalhe.producaoProdutos,
        qtdProdutos: detalhe.qtdProdutos,
      }
    },
  )
}
