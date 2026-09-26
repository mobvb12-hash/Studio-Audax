// CRM — tipos (sem backend: estado local + localStorage)
// O CRM NÃO duplica dados do módulo Clientes: cadastro, agenda e caixa
// continuam sendo a fonte única. Aqui só vivem as interações/notas ligadas
// ao cliente e a classificação derivada (segmento) é calculada em regras.

export type SegmentoCliente =
  | 'novo'
  | 'ativo'
  | 'recorrente'
  | 'sem_retorno'
  | 'inativo'

export const SEGMENTOS_ORDEM: SegmentoCliente[] = [
  'novo',
  'ativo',
  'recorrente',
  'sem_retorno',
  'inativo',
]

export const SEGMENTOS_ROTULO: Record<SegmentoCliente, string> = {
  novo: 'Novo',
  ativo: 'Ativo',
  recorrente: 'Recorrente',
  sem_retorno: 'Sem retorno',
  inativo: 'Inativo',
}

export type TipoInteracao = 'nota' | 'ligacao' | 'presencial' | 'reativacao'

export const TIPOS_INTERACAO: TipoInteracao[] = [
  'nota',
  'ligacao',
  'presencial',
  'reativacao',
]

export const TIPOS_INTERACAO_ROTULO: Record<TipoInteracao, string> = {
  nota: 'Nota',
  ligacao: 'Ligação',
  presencial: 'Presencial',
  reativacao: 'Reativação',
}

/**
 * Grupos de retorno: visões rápidas sobre os segmentos para ações de
 * relacionamento (ativos = ativo + recorrente, risco = sem retorno,
 * inativos = inativo). Novos (sem visita) não entram em nenhum grupo.
 */
export type GrupoRetorno = 'ativos' | 'risco' | 'inativos'

export const GRUPOS_ORDEM: GrupoRetorno[] = ['ativos', 'risco', 'inativos']

export const GRUPOS_ROTULO: Record<GrupoRetorno, string> = {
  ativos: 'Ativos',
  risco: 'Em risco de retorno',
  inativos: 'Inativos',
}

export function ehGrupoRetorno(valor: unknown): valor is GrupoRetorno {
  return typeof valor === 'string' && GRUPOS_ORDEM.includes(valor as GrupoRetorno)
}

/** Interação/nota vinculada ao cliente — histórico nunca é apagado pelo sistema */
export type Interacao = {
  id: string
  clienteId: string
  tipo: TipoInteracao
  texto: string
  /** ISO completo */
  criadoEm: string
}

export type NovaInteracaoInput = {
  clienteId: string
  /** Omitido = 'nota' */
  tipo?: TipoInteracao
  texto: string
}
