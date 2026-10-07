// Regras puras da Agenda — conflito de horários por sobreposição de duração,
// expediente configurável e bloqueios (almoço, folga, férias, ausência).
import { SERVICOS } from './catalogo'
import type {
  Agendamento,
  Bloqueio,
  Expediente,
  NovoBloqueioInput,
  TipoBloqueio,
} from './types'

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

/* ------------------------------------------------------------------ */
/* Disponibilidade — horários livres de um dia                         */
/* ------------------------------------------------------------------ */

export type Disponibilidade = {
  /** Slots do expediente (fora do almoço) com ao menos 1 profissional livre */
  horarios: string[]
  /** Total de vagas somando profissionais livres por slot */
  vagas: number
}

export type SlotLivre = {
  /** Horário de início, HH:MM */
  horario: string
  /** Profissionais LIVRES nesse horário, na ordem em que foram informados */
  profissionais: string[]
}

/**
 * Corte de "agora" para o dia de hoje: em `data`, só vale horário com início
 * DEPOIS de `minutos`. As datas futuras não são tocadas.
 *
 * O fuso é do quem monta o corte (`agoraStudio`) — a regra só compara.
 */
export type CorteHorario = {
  /** Data (YYYY-MM-DD) em que o corte vale */
  data: string
  /** Minutos desde 00:00 dessa data: slots com início <= isto saem */
  minutos: number
}

const FORMATADOR_AGORA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * "Agora" no horário do Studio (America/Sao_Paulo), nunca no fuso do
 * navegador: em UTC-3, à noite, o dia local do navegador já é o de amanhã
 * e o corte do dia de hoje sairia errado. `agora` é parâmetro para teste.
 */
export function agoraStudio(agora: Date = new Date()): CorteHorario {
  const partes = Object.fromEntries(
    FORMATADOR_AGORA.formatToParts(agora).map((p) => [p.type, p.value]),
  )
  // hour12:false devolve '24' à meia-noite em alguns runtimes.
  const hora = Number(partes.hour === '24' ? '00' : partes.hour)
  const minuto = Number(partes.minute)
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: hora * 60 + minuto,
  }
}

/**
 * O que a regra de disponibilidade precisa saber de um agendamento.
 *
 * Deliberadamente estrutural: a Agenda interna passa `Agendamento`, e a
 * página pública passa o pacote enxuto da RPC `agendamento_publico_slots`
 * (que não traz nome nem telefone, por privacidade). Os dois são a MESMA
 * informação de ocupação, então a regra é escrita uma única vez.
 */
export type OcupacaoAgenda = {
  profissional: string
  horario: string
  servico?: string
  duracaoMin?: number
  status?: string
}

/**
 * Disponibilidade por horário E por profissional — a regra oficial, em um
 * único lugar.
 *
 * É esta função que "consulta todos os profissionais de uma vez": para cada
 * slot do expediente (fora do almoço) devolve QUAIS profissionais estão
 * livres. A Agenda interna usa para pintar a grade, a página pública usa para
 * listar "08:00 • Cleiton" e "08:00 • Ítalo", e o WhatsApp usa para montar os
 * botões. Nenhum consumidor reimplementa a checagem — todos leem daqui.
 *
 * A folga testada é a `duracaoMin` REAL do serviço (base + complementos), e
 * não a grade de 30 minutos: o horário só entra na lista se o atendimento
 * inteiro couber no expediente e não cair sobre um bloqueio.
 *
 * Cancelados e não comparecidos não ocupam — o horário não foi usado.
 *
 * `corte` é opcional e só vale no dia igual ao dele: no dia de hoje a pessoa
 * não escolhe horário que já passou (`inicio <= agora` sai da lista). Quem
 * não passa corte (Agenda interna, Painel, WhatsApp) continua exatamente
 * como antes — editar/remarcar não é agendar um horário novo.
 */
export function horariosLivresPorProfissional(
  data: string,
  expediente: Expediente,
  bloqueios: Bloqueio[],
  ocupacoes: OcupacaoAgenda[],
  profissionais: string[],
  duracaoDo: (servico: string) => number,
  duracaoMin = 30,
  corte?: CorteHorario,
): SlotLivre[] {
  const duracao = Math.max(5, duracaoMin || 30)
  if (profissionais.length === 0) return []

  const slots: SlotLivre[] = []
  for (const slot of slotsDoExpediente(expediente)) {
    if (slot.intervalo) continue
    const inicio = paraMinutos(slot.hora)
    const fim = inicio + duracao

    // No dia do corte, horário que já passou (ou é o de agora) não é opção.
    if (corte && data === corte.data && inicio <= corte.minutos) continue
    // O atendimento inteiro precisa caber no expediente.
    if (fim > paraMinutos(expediente.fim)) continue
    // ...e não pode invadir o almoço.
    if (emAlmoco(slot.hora, duracao, expediente)) continue

    const livres = profissionais.filter((profissional) => {
      const ocupado = ocupacoes.some((ag) => {
        if (ag.profissional !== profissional) return false
        if (ag.status === 'cancelado' || ag.status === 'nao_compareceu')
          return false
        const inicioExistente = paraMinutos(ag.horario)
        const fimExistente =
          inicioExistente + Math.max(5, ag.duracaoMin ?? duracaoDo(ag.servico ?? ''))
        return inicioExistente < fim && inicio < fimExistente
      })
      if (ocupado) return false
      return !bloqueioCobre(bloqueios, {
        data,
        horario: slot.hora,
        duracaoMin: duracao,
        profissional,
      })
    })

    if (livres.length > 0) slots.push({ horario: slot.hora, profissionais: livres })
  }
  return slots
}

/**
 * Horários disponíveis de um dia: slots do expediente sem almoço onde
 * pelo menos um profissional está livre (sem agendamento que ocupe o slot
 * e sem bloqueio cobrindo). Cancelados e não comparecidos não ocupam.
 * Só usa dados reais — sem metas ou estimativas.
 *
 * Casca em `horariosLivresPorProfissional` (a regra única) e achata para a
 * forma antiga: lista de horários + total de vagas.
 */
export function horariosDisponiveis(
  data: string,
  expediente: Expediente,
  bloqueios: Bloqueio[],
  agendamentosDoDia: Agendamento[],
  profissionais: string[],
  duracaoDo: (servico: string) => number,
): Disponibilidade {
  const slots = horariosLivresPorProfissional(
    data,
    expediente,
    bloqueios,
    agendamentosDoDia,
    profissionais,
    duracaoDo,
    30,
  )
  return {
    horarios: slots.map((slot) => slot.horario),
    vagas: slots.reduce((total, slot) => total + slot.profissionais.length, 0),
  }
}

/** HH:MM + minutos → HH:MM (vira no dia seguinte). */
export function somaMinutos(hora: string, min: number): string {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + min
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Primeira mensagem de invalidade do expediente ('' = válido). */
export function validarExpediente(entrada: Expediente): string {
  const inicio = paraMinutos(entrada.inicio)
  const fim = paraMinutos(entrada.fim)
  const almocoIni = paraMinutos(entrada.almocoInicio)
  const almocoFim = paraMinutos(entrada.almocoFim)
  if (
    !entrada.inicio ||
    !entrada.fim ||
    !entrada.almocoInicio ||
    !entrada.almocoFim
  ) {
    return 'Informe início, fim e horário do almoço.'
  }
  if (inicio >= fim) {
    return 'O fim do expediente deve ser depois do início.'
  }
  if (almocoIni > almocoFim) {
    return 'O fim do almoço deve ser depois do início.'
  }
  if (almocoIni < inicio || almocoFim > fim) {
    return 'O almoço deve ficar dentro do expediente.'
  }
  return ''
}

/**
 * Primeira mensagem de invalidade de um novo bloqueio ('' = válido).
 * Inclui a trava de duplicidade (Audax F18: mesmo período/motivo não entra
 * duas vezes — proteção no dado, pois o formulário permanece aberto).
 */
export function validarBloqueio(
  entrada: NovoBloqueioInput,
  existentes: Bloqueio[],
): string {
  const profissional = entrada.profissional.trim()
  const motivo = entrada.motivo.trim()
  if (!profissional) return 'Informe o profissional.'
  if (!entrada.data) return 'Informe a data do bloqueio.'
  if (entrada.dataFim && entrada.dataFim < entrada.data) {
    return 'A data final deve ser depois da inicial.'
  }
  if (paraMinutos(entrada.inicio) >= paraMinutos(entrada.fim)) {
    return 'O fim do bloqueio deve ser depois do início.'
  }
  if (entrada.tipo === 'outro' && !motivo) {
    return 'Descreva o motivo do bloqueio.'
  }
  const chave = [
    profissional,
    entrada.data,
    entrada.dataFim || '',
    entrada.inicio,
    entrada.fim,
    entrada.tipo,
    motivo,
  ].join('|')
  if (
    existentes.some(
      (b) =>
        [
          b.profissional,
          b.data,
          b.dataFim ?? '',
          b.inicio,
          b.fim,
          b.tipo,
          b.motivo,
        ].join('|') === chave,
    )
  ) {
    return 'Este bloqueio já foi cadastrado.'
  }
  return ''
}
