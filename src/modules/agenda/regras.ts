// Regras puras da Agenda — conflito de horários por sobreposição de duração,
// expediente configurável e bloqueios (almoço, folga, férias, ausência).
import { SERVICOS } from './catalogo'
import type { Agendamento, Bloqueio, Expediente, TipoBloqueio } from './types'

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
    const duracaoExistente = ag.duracaoMin ?? duracaoDo(ag.servico)
    const fimExistente = inicioExistente + Math.max(5, duracaoExistente)

    if (inicioNovo < fimExistente && inicioExistente < fimNovo) {
      return { conflito: true, agendamento: ag, fimExistente: formatarMinutos(fimExistente) }
    }
  }
  return { conflito: false }
}

/* ------------------------------------------------------------------ */
/* Expediente configurável                                             */
/* ------------------------------------------------------------------ */

export const EXPEDIENTE_PADRAO: Expediente = {
  inicio: '08:00',
  fim: '20:00',
  almocoInicio: '12:00',
  almocoFim: '13:00',
}

export type SlotGrade = { hora: string; intervalo: boolean }

/**
 * Gera os slots de 30 minutos dentro do expediente.
 * Marca como intervalo os slots que se sobrepõem ao almoço.
 */
export function slotsDoExpediente(expediente: Expediente): SlotGrade[] {
  const inicio = paraMinutos(expediente.inicio)
  const fim = paraMinutos(expediente.fim)
  const almocoIni = paraMinutos(expediente.almocoInicio)
  const almocoFim = paraMinutos(expediente.almocoFim)
  const slots: SlotGrade[] = []
  for (let m = inicio; m + 30 <= fim; m += 30) {
    const intervalo =
      almocoIni < almocoFim && m < almocoFim && m + 30 > almocoIni
    slots.push({ hora: formatarMinutos(m), intervalo })
  }
  return slots
}

/** true se a proposta começa ou termina fora do expediente */
export function foraDoExpediente(
  horario: string,
  duracaoMin: number,
  expediente: Expediente,
): boolean {
  const inicio = paraMinutos(horario)
  const fim = inicio + Math.max(5, duracaoMin)
  return (
    inicio < paraMinutos(expediente.inicio) || fim > paraMinutos(expediente.fim)
  )
}

/** true se a proposta se sobrepõe à janela de almoço */
export function emAlmoco(
  horario: string,
  duracaoMin: number,
  expediente: Expediente,
): boolean {
  const almocoIni = paraMinutos(expediente.almocoInicio)
  const almocoFim = paraMinutos(expediente.almocoFim)
  if (almocoIni >= almocoFim) return false
  return sobreposicao(
    paraMinutos(horario),
    Math.max(5, duracaoMin),
    almocoIni,
    almocoFim - almocoIni,
  )
}

function sobreposicao(
  inicioA: number,
  duracaoA: number,
  inicioB: number,
  duracaoB: number,
): boolean {
  return inicioA < inicioB + duracaoB && inicioB < inicioA + duracaoA
}

/* ------------------------------------------------------------------ */
/* Bloqueios de agenda                                                 */
/* ------------------------------------------------------------------ */

export const TIPOS_BLOQUEIO_ROTULO: Record<TipoBloqueio, string> = {
  almoco: 'Almoço',
  folga: 'Folga',
  ferias: 'Férias',
  ausencia: 'Ausência',
  outro: 'Outro',
}

/** Rótulo de exibição do bloqueio (inclui o motivo quando houver) */
export function rotuloBloqueio(bloqueio: Bloqueio): string {
  const base = TIPOS_BLOQUEIO_ROTULO[bloqueio.tipo]
  if (bloqueio.motivo) return `${base} — ${bloqueio.motivo}`
  return base
}

export type ConsultaBloqueio = {
  data: string
  horario: string
  duracaoMin: number
  profissional: string
}

/** Retorna o bloqueio que cobre o horário informado, ou null */
export function bloqueioCobre(
  bloqueios: Bloqueio[],
  consulta: ConsultaBloqueio,
): Bloqueio | null {
  const inicio = paraMinutos(consulta.horario)
  const fim = inicio + Math.max(5, consulta.duracaoMin)
  for (const b of bloqueios) {
    if (b.profissional !== consulta.profissional) continue
    if (consulta.data < b.data) continue
    if (consulta.data > (b.dataFim ?? b.data)) continue
    const blocoIni = paraMinutos(b.inicio)
    const blocoFim = paraMinutos(b.fim)
    if (sobreposicao(inicio, fim - inicio, blocoIni, blocoFim - blocoIni)) {
      return b
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Validação completa de uma proposta de agendamento                   */
/* ------------------------------------------------------------------ */

export type PropostaValidacao = {
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  expediente: Expediente
  data: string
  horario: string
  profissional: string
  duracaoMin: number
  ignorarId?: string
}

export type ResultadoValidacao =
  | { ok: true }
  | { ok: false; erro: string }

/**
 * Valida um horário antes de criar ou remarcar:
 * expediente → almoço → bloqueios → conflito com outro agendamento.
 */
export function validarProposta(
  proposta: PropostaValidacao,
): ResultadoValidacao {
  const { horario, duracaoMin, expediente, data, profissional } = proposta
  if (foraDoExpediente(horario, duracaoMin, expediente)) {
    return {
      ok: false,
      erro: `Horário fora do expediente (${expediente.inicio} às ${expediente.fim}).`,
    }
  }
  if (emAlmoco(horario, duracaoMin, expediente)) {
    return {
      ok: false,
      erro: `Horário bloqueado pelo almoço (${expediente.almocoInicio} às ${expediente.almocoFim}).`,
    }
  }
  const bloqueio = bloqueioCobre(proposta.bloqueios, {
    data,
    horario,
    duracaoMin,
    profissional,
  })
  if (bloqueio) {
    return {
      ok: false,
      erro: `Horário bloqueado: ${rotuloBloqueio(bloqueio)} (${bloqueio.inicio} às ${bloqueio.fim}).`,
    }
  }
  const conflito = verificarConflito(
    proposta.agendamentos,
    {
      data,
      horario,
      profissional,
      duracaoMin,
      ignorarId: proposta.ignorarId,
    },
    duracaoBase,
  )
  if (conflito.conflito) {
    return {
      ok: false,
      erro: `Conflito: ${conflito.agendamento.cliente} ocupa ${conflito.agendamento.horario}–${conflito.fimExistente} com ${profissional}.`,
    }
  }
  return { ok: true }
}

/** Duração de referência do serviço (catálogo) quando não há registro */
export function duracaoBase(servico: string): number {
  return SERVICOS.find((s) => s.nome === servico)?.duracaoMin ?? 30
}
