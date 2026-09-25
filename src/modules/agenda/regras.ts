// Regras puras da Agenda — conflito de horários por sobreposição de duração
import type { Agendamento } from './types'

export function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export function formatarMinutos(total: number): string {
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = total % 60
  return `${hh}:${String(mm).padStart(2, '0')}`
}

export type Proposta = {
  data: string
  horario: string
  profissional: string
  duracaoMin: number
  /** Para edições futuras: ignora o próprio agendamento */
  ignorarId?: string
}

export type ResultadoConflito =
  | { conflito: false }
  | { conflito: true; agendamento: Agendamento; fimExistente: string }

/**
 * Detecta sobreposição de horário para o MESMO profissional no mesmo dia.
 * Cancelados e não comparecidos não bloqueiam (o horário não foi usado).
 */
export function verificarConflito(
  agendamentos: Agendamento[],
  proposta: Proposta,
  duracaoDo: (servico: string) => number,
): ResultadoConflito {
  const inicioNovo = paraMinutos(proposta.horario)
  const fimNovo = inicioNovo + Math.max(5, proposta.duracaoMin)

  for (const ag of agendamentos) {
    if (ag.data !== proposta.data) continue
    if (ag.profissional !== proposta.profissional) continue
    if (proposta.ignorarId && ag.id === proposta.ignorarId) continue
    if (ag.status === 'cancelado' || ag.status === 'nao_compareceu') continue

    const inicioExistente = paraMinutos(ag.horario)
    const fimExistente = inicioExistente + Math.max(5, duracaoDo(ag.servico))

    if (inicioNovo < fimExistente && inicioExistente < fimNovo) {
      return { conflito: true, agendamento: ag, fimExistente: formatarMinutos(fimExistente) }
    }
  }
  return { conflito: false }
}
