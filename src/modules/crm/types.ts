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

export type TipoInteracao = 'nota' | 'ligacao' | 'presencial'

export const TIPOS_INTERACAO: TipoInteracao[] = ['nota', 'ligacao', 'presencial']

export const TIPOS_INTERACAO_ROTULO: Record<TipoInteracao, string> = {
  nota: 'Nota',
  ligacao: 'Ligação',
  presencial: 'Presencial',
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
