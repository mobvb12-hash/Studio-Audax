// Regras puras do módulo Profissionais — validação de cadastro, filtro
// de status ativo/inativo (inativar preserva histórico) e verificação de
// uso no histórico (nada é apagado quando o profissional já aparece em
// agendamentos, caixa ou fechamentos de comissão).
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import type { FechamentoComissao } from '@/modules/comissoes/types'
import type { Profissional } from './types'

/** Mensagem de erro amigável ou null quando o profissional é válido. */
export function validarProfissional(entrada: {
  nome: string
  telefone?: string
  email?: string
}): string | null {
  if (entrada.nome.trim().length < 2) {
    return 'Informe o nome completo do profissional.'
  }
  const telefone = (entrada.telefone ?? '').trim()
  if (telefone && telefone.replace(/\D/g, '').length < 8) {
    return 'Informe um telefone válido ou deixe em branco.'
  }
  const email = (entrada.email ?? '').trim()
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return 'Informe um e-mail válido ou deixe em branco.'
  }
  return null
}

/** Profissionais que podem receber novos agendamentos. */
export function filtrarProfissionaisAtivos(
  profissionais: Profissional[],
): Profissional[] {
  return profissionais.filter((p) => p.ativo)
}

export type UsoProfissional = {
  emUso: boolean
  agendamentos: number
  lancamentos: number
  comissoes: number
}

/**
 * Um profissional só pode ser excluído se nunca foi utilizado: a Agenda
 * monta as colunas a partir do cadastro (agendamentos futuros de um
 * profissional excluído sumiriam da tela), o caixa e os fechamentos de
 * comissão referenciam o profissional — apagá-lo apagaria o rastro do
 * que já aconteceu. Use "Inativar" para retirar de novos agendamentos.
 */
export function profissionalEmUso(
  prof: Pick<Profissional, 'id' | 'nome'>,
  entrada: {
    agendamentos: Pick<Agendamento, 'profissional'>[]
    lancamentos: Pick<Lancamento, 'profissional'>[]
    fechamentos: Pick<FechamentoComissao, 'profissionalId'>[]
  },
): UsoProfissional {
  const qtdAgendamentos = entrada.agendamentos.filter(
    (ag) => ag.profissional === prof.nome,
  ).length
  const qtdLancamentos = entrada.lancamentos.filter(
    (l) => l.profissional === prof.nome,
  ).length
  const qtdComissoes = entrada.fechamentos.filter(
    (f) => f.profissionalId === prof.id,
  ).length
  return {
    emUso: qtdAgendamentos > 0 || qtdLancamentos > 0 || qtdComissoes > 0,
    agendamentos: qtdAgendamentos,
    lancamentos: qtdLancamentos,
    comissoes: qtdComissoes,
  }
}
