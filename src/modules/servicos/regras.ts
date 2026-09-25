// Regras puras do módulo Serviços — validação de cadastro, status
// ativo/inativo e verificação de uso no histórico (nada é apagado quando
// o serviço já aparece em agendamentos ou no caixa).
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import type { Servico } from './types'

/** Sugestões exibidas no campo de categoria do formulário */
export const CATEGORIAS_SUGERIDAS = [
  'Cabelo',
  'Barba',
  'Cabelo e barba',
  'Tratamento',
  'Outro',
]

const CATEGORIA_MAX = 40

type EntradaServico = {
  nome: string
  preco: number
  duracaoMin: number
  categoria?: string
}

/** Mensagem de erro amigável ou null quando o serviço é válido. */
export function validarServico(entrada: EntradaServico): string | null {
  if (entrada.nome.trim().length < 2) return 'Informe o nome do serviço.'
  if (!Number.isFinite(entrada.preco) || entrada.preco < 0) {
    return 'Informe um preço válido (ex.: 70 ou 70,00).'
  }
  if (!Number.isInteger(entrada.duracaoMin) || entrada.duracaoMin < 5) {
    return 'Informe a duração em minutos (mínimo 5).'
  }
  if ((entrada.categoria ?? '').trim().length > CATEGORIA_MAX) {
    return `Categoria muito longa (máximo ${CATEGORIA_MAX} caracteres).`
  }
  return null
}

export type UsoServico = {
  emUso: boolean
  agendamentos: number
  lancamentos: number
}

/**
 * Um serviço só pode ser excluído se nunca foi utilizado: histórico de
 * agendamentos (qualquer status) e lançamentos do caixa referenciam o
 * serviço pelo nome — apagá-lo apagaria o rastro do que já aconteceu.
 */
export function servicoEmUso(
  nome: string,
  agendamentos: Pick<Agendamento, 'servico'>[],
  lancamentos: Pick<Lancamento, 'servico'>[],
): UsoServico {
  const qtdAgendamentos = agendamentos.filter((ag) => ag.servico === nome).length
  const qtdLancamentos = lancamentos.filter((l) => l.servico === nome).length
  return {
    emUso: qtdAgendamentos > 0 || qtdLancamentos > 0,
    agendamentos: qtdAgendamentos,
    lancamentos: qtdLancamentos,
  }
}

/** Serviços que podem aparecer em novos agendamentos/PDV. */
export function filtrarServicosAtivos(servicos: Servico[]): Servico[] {
  return servicos.filter((s) => s.ativo)
}
