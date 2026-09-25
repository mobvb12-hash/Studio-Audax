// Comissões — tipos (sem backend: estado local + localStorage)
export type Periodo = {
  /** YYYY-MM-DD (inclusivo) */
  inicio: string
  /** YYYY-MM-DD (inclusivo) */
  fim: string
}

export type ConfigComissao = {
  profissionalId: string
  /** 0 a 100 (%) */
  percentual: number
  ativo: boolean
}

export type FechamentoComissao = {
  id: string
  profissionalId: string
  profissionalNome: string
  periodo: Periodo
  qtdAtendimentos: number
  /** produção líquida de serviços no momento do fechamento */
  producao: number
  percentual: number
  comissao: number
  fechadoEm: string
  reaberto?: { em: string; motivo: string }
}

export type EventoAuditoriaComissao = {
  id: string
  acao: 'fechamento' | 'reabertura'
  profissionalId: string
  profissionalNome: string
  periodo: Periodo
  descricao: string
  motivo?: string
  criadoEm: string
}

export type NovaConfigInput = {
  percentual: number
  ativo: boolean
}

export type FecharComissaoInput = {
  profissionalId: string
  profissionalNome: string
  periodo: Periodo
  qtdAtendimentos: number
  producao: number
  percentual: number
  comissao: number
}

export const PERCENTUAL_PADRAO = 40
