// Marketing — tipos (sem backend: estado local + localStorage)
// Base simples de segmentação/listas de público: tudo é DERIVADO dos
// dados de Clientes/Agenda/Caixa — nada é copiado. Automação de envio
// não existe aqui (é Fase 8).
export type PublicoId =
  | 'inativos'
  | 'aniversariantes'
  | 'recorrentes'
  | 'sem_retorno'
  | 'novos'

export const PUBLICOS_ORDEM: PublicoId[] = [
  'inativos',
  'aniversariantes',
  'recorrentes',
  'sem_retorno',
  'novos',
]

export const PUBLICOS_ROTULO: Record<PublicoId, string> = {
  inativos: 'Inativos',
  aniversariantes: 'Aniversariantes do mês',
  recorrentes: 'Recorrentes',
  sem_retorno: 'Sem retorno',
  novos: 'Novos clientes',
}

export const PUBLICOS_DESCRICAO: Record<PublicoId, string> = {
  inativos: 'Mais de 90 dias sem visita — foco de reativação',
  aniversariantes: 'Aniversariantes no mês corrente',
  recorrentes: '3+ visitas nos últimos 30 dias',
  sem_retorno: 'Entre 31 e 90 dias sem visita',
  novos: 'Cadastrados recentemente, sem atendimento',
}

/** Lista de público salva — membros sempre calculados ao vivo */
export type ListaPublico = {
  id: string
  nome: string
  publico: PublicoId
  /** ISO completo */
  criadoEm: string
}

export type NovaListaInput = {
  nome: string
  publico: PublicoId
}
