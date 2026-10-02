// FASE 5 — núcleo conversacional determinístico do WhatsApp (funções puras:
// sem Deno, sem rede, sem segredos). É a camada que transforma a IA de
// somente-informativa em capaz de agendar, cancelar e remarcar COM
// confirmação, usando exclusivamente:
//   • catálogo/expediente/bloqueios/ocupação das funções públicas da
//     migration 012 (mesma fonte da página pública de agendamento);
//   • criação de agendamento pela EXISTENTE `agendamento_publico_criar`
//     (o servidor revalida tudo — nunca escrita direta);
//   • leituras/escritas de agendamento do cliente via RPCs service_role da
//     migration 015, chamadas pelo index.ts (aqui só os construtores puros).
//
// Regras desta etapa:
//   - NENHUMA chamada de rede acontece neste arquivo — o index injeta as
//     dependências (deps) e este módulo toma as decisões;
//   - NENHUM dado é inventado: horários vêm da grade real de slots, preço e
//     nomes do catálogo oficial, cliente do cadastro oficial;
//   - NENHUMA ação executa sem confirmação explícita ("sim") do cliente e
//     sem `podeExecutar` (gate de destinatário autorizado);
//   - texto do cliente NUNCA vira SQL: parâmetros tipados, listas por índice;
//   - toda resposta é não-vaza, em português, ≤ 4096 caracteres.
import type { FonteServico, FontesOficiais, Turno } from './ia.ts'

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type AcaoConversa = 'criar' | 'cancelar' | 'remarcar'

export type OpcaoSlot = { horario: string; profissional: string }

export type ResumoAgendamento = {
  id: string
  servico: string
  profissional: string
  data: string
  horario: string
  status: string
}

export type Rascunho = {
  acao: AcaoConversa
  etapa: 'coletando' | 'escolhendo' | 'confirmando'
  servico: string | null
  profissional: string | null
  data: string | null
  horario: string | null
  cliente: string | null
  /** agendamento existente alvo (cancelar/remarcar) */
  alvo: ResumoAgendamento | null
  /** candidatos apresentados quando há mais de um alvo */
  candidatos: ResumoAgendamento[]
  /** horários oferecidos no último passo (seleção por número ou hora) */
  opcoes: OpcaoSlot[]
  listaServicos: string[]
  listaProfissionais: string[]
  esperandoNome: boolean
}

export type ContextoConversa = {
  atualizadoEm: number
  historico: Turno[]
  rascunho: Rascunho | null
}

export type ResultadoEscrita =
  | { ok: true; id?: string }
  | { ok: false; motivo: string }

export type DependenciasConversa = {
  agora: () => number
  /** data de hoje no fuso do Studio (America/Recife) — injetada pelo index */
  hoje: () => string
  carregarCatalogo: () => Promise<FontesOficiais>
  carregarSlots: (data: string) => Promise<PacoteSlots>
  listarAgendamentos?: (telefone: string) => Promise<ResumoAgendamento[]>
  clientePorTelefone?: (telefone: string) => Promise<string | null>
  criar: (p: {
    cliente: string
    telefone: string
    servico: string
    profissional: string
    data: string
    horario: string
  }) => Promise<ResultadoEscrita>
  cancelar?: (id: string, telefone: string) => Promise<ResultadoEscrita>
  remarcar?: (
    id: string,
    telefone: string,
    data: string,
    horario: string,
    profissional: string,
  ) => Promise<ResultadoEscrita>
}

export type EntradaConversa = {
  texto: string
  /** dígitos do remetente (fonte única do telefone) */
  telefone: string | null
  contexto: ContextoConversa | null
  deps: DependenciasConversa
  /** MESMO gate do envio: ação somente para o destinatário autorizado */
  podeExecutar: boolean
}

export type SaidaConversa = {
  resposta: string
  contexto: ContextoConversa
  acao: AcaoConversa | null
  executada: boolean
  servico: string | null
  motivo: string | null
}

/* ------------------------------------------------------------------ */
/* Normalização e expressões                                           */
/* ------------------------------------------------------------------ */

export function normalizar(valor: string): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const PADRAO_CANCELAR = /(cancelar|cancela|desmarcar|desmarca)/
const PADRAO_REMARCAR = /(remarcar|remarca|reagendar|reagenda)/
const PADRAO_CRIAR = /(marcar|marca[rs]?|agendar|agende|reservar|reserva)/
const PADRAO_TEMPO =
  /(hoje|amanha|\b(segunda|terca|quarta|quinta|sexta)(-feira)?\b|\bsabado\b|\bdomingo\b|\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}|\d{1,2}h\b|\d{1,2}\s+horas?\b|de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))/
const PADRAO_INTENCAO_AGENDA =
  /(horario|vaga|cort|barb|sobrancelh|platinad|luzes|atendimento|marcar|agendar|reservar|quero|gostaria|preciso|pode|consegue|\btem\b|da para)/
const PADRAO_INFORMATIVA =
  /\b(quanto|quanto[s]?|custa|custo|preco|valores?|endereco|onde|funcionamento|telefone|contato|instagram|site|cardapio|abre|fecha|aberto|horario de)\b/

/**
 * AÇÃO detectada no texto. É SUPERSET de PADRAO_ACAO de ./ia.ts (todo
 * verbo bloqueado pelo classificador cai aqui) e inclui gatilhos de
 * intenção sem verbo de agenda ("quero cortar amanhã", "tem horário amanhã?").
 * A ordem importa: remarcar/cancelar contêm "marca" — os dois vêm primeiro.
 */
export function detectarAcao(texto: string): AcaoConversa | null {
  const t = normalizar(texto)
  if (!t) return null
  if (PADRAO_CANCELAR.test(t)) return 'cancelar'
  if (PADRAO_REMARCAR.test(t)) return 'remarcar'
  if (PADRAO_CRIAR.test(t)) return 'criar'
  if (PADRAO_TEMPO.test(t) && PADRAO_INTENCAO_AGENDA.test(t)) return 'criar'
  return null
}

/** Pergunta claramente informativa — segue o fluxo Gemini com histórico. */
export function ehPerguntaInformativa(texto: string): boolean {
  return PADRAO_INFORMATIVA.test(normalizar(texto))
}

function semPontuacaoFinal(texto: string): string {
  return normalizar(texto).replace(/[!.,;:?\s]+$/g, '')
}

const AFIRMACOES = [
  'sim',
  's',
  'pode',
  'pode sim',
  'pode ir',
  'pode ser',
  'confirmar',
  'confirma',
  'confirmo',
  'quero sim',
  'isso',
  'isso mesmo',
  'certo',
  'fechado',
  'combinado',
  'bora',
  'pode agendar',
  'pode confirmar',
  'ok',
  'beleza',
  'top',
  'efetuar',
  'faz',
  'fica',
  'fica sim',
]

const NEGACOES = [
  'nao',
  'na',
  'n',
  'no',
  'negativo',
  'nao obrigado',
  'agora nao',
  'depois',
  'descarta',
  'esquece',
  'esqueci',
  'pode ser depois',
  'ainda nao',
  'nem',
  'cancela',
  'cancelar',
  'desmarca',
  'desmarcar',
]

export function ehAfirmacao(texto: string, acao?: AcaoConversa | null): boolean {
  const t = semPontuacaoFinal(texto)
  if (!t) return false
  if (t === 'quero') return acao === 'criar' || acao === undefined
  return AFIRMACOES.includes(t)
}

export function ehNegacao(texto: string, acao?: AcaoConversa | null): boolean {
  const t = semPontuacaoFinal(texto)
  if (!t) return false
  if (t === 'cancelar' || t === 'cancela' || t === 'desmarca' || t === 'desmarcar') {
    // "cancela" como resposta de SIM só faz sentido confirmando um cancelamento.
    return acao !== 'cancelar'
  }
  if (NEGACOES.includes(t)) return true
  return t.startsWith('nao ') || t.startsWith('na ')
}

/** "1" / "2." → índice (1-based); texto livre → null. */
export function extrairNumero(texto: string): number | null {
  const m = normalizar(texto).match(/^(\d{1,2})[.)]?$/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 99 ? n : null
}

/* ------------------------------------------------------------------ */
/* Extração de data                                                    */
/* ------------------------------------------------------------------ */

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terca-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
}

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
}

const MESES_EXT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const DIAS_EXT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

function somaDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias))
  return d.toISOString().slice(0, 10)
}

function dowDe(dataIso: string): number {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
}

function isoValida(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return d.toISOString().slice(0, 10)
}

const RE_DATA =
  /\b(depois de amanha|amanha|hoje)\b|(\d{1,2})\s*\/\s*(\d{1,2})\b|\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b(segunda-feira|segunda|terca-feira|terca|quarta-feira|quarta|quinta-feira|quinta|sexta-feira|sexta|sabado|domingo)\b/g

/**
 * Todas as datas mencionadas, em ordem de aparição (textos normalizados).
 * `invalida` = havia data malformada e nenhuma válida foi encontrada.
 */
export function extrairDatas(texto: string, hoje: string): {
  datas: string[]
  invalida: boolean
} {
  const t = normalizar(texto)
  const datas: string[] = []
  let ruins = 0
  let m: RegExpExecArray | null
  RE_DATA.lastIndex = 0
  while ((m = RE_DATA.exec(t)) !== null) {
    if (m[1]) {
      if (m[1].startsWith('depois')) datas.push(somaDias(hoje, 2))
      else if (m[1] === 'amanha') datas.push(somaDias(hoje, 1))
      else datas.push(hoje)
      continue
    }
    if (m[2] && m[3]) {
      const iso = isoValida(Number(hoje.slice(0, 4)), Number(m[3]), Number(m[2]))
      if (iso && iso >= hoje) datas.push(iso)
      else ruins++
      continue
    }
    if (m[4] && m[5]) {
      const iso = isoValida(Number(hoje.slice(0, 4)), MESES[m[5]], Number(m[4]))
      if (iso && iso >= hoje) datas.push(iso)
      else ruins++
      continue
    }
    if (m[6]) {
      const alvo = DIAS_SEMANA[m[6]]
      const dif = (alvo - dowDe(hoje) + 7) % 7
      datas.push(somaDias(hoje, dif))
    }
  }
  const unicas: string[] = []
  for (const data of datas) {
    if (!unicas.includes(data)) unicas.push(data)
  }
  return { datas: unicas, invalida: ruins > 0 && unicas.length === 0 }
}

/**
 * Foco para extrair a data/horário NOVOS: o trecho depois do último
 * "para/pró" ("remarcar de sexta para amanhã" → "amanha").
 */
export function segmentoNovo(texto: string): string {
  const t = normalizar(texto)
  let ultimo = -1
  let fim = -1
  const re = /\b(para|pra|pro)\b\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t)) !== null) {
    ultimo = m.index
    fim = m.index + m[0].length
  }
  if (ultimo >= 0 && t.length - fim >= 2) return t.slice(fim)
  return t
}

/* ------------------------------------------------------------------ */
/* Extração de horário                                                 */
/* ------------------------------------------------------------------ */

function duas(n: number): string {
  return String(n).padStart(2, '0')
}

/** Todos os horários citados ('15h', '15h30', '15:30', 'às 15', '15 horas'). */
export function extrairHorarios(texto: string): {
  horarios: string[]
  invalido: boolean
} {
  const t = normalizar(texto)
  // Padrões mais específicos primeiro; um match não pode invadir o trecho
  // já consumido ('às 15h30' também casaria com 'as 15' → 15:00 errado).
  const aceitos: { pos: number; fim: number; h: number; m: number }[] = []
  const tentar = (re: RegExp, lerMinuto: boolean) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(t)) !== null) {
      const pos = m.index
      const fim = pos + m[0].length
      if (aceitos.some((a) => pos < a.fim && fim > a.pos)) continue
      aceitos.push({
        pos,
        fim,
        h: Number(m[1]),
        m: lerMinuto && m[2] !== undefined ? Number(m[2]) : 0,
      })
    }
  }
  tentar(/(\d{1,2}):(\d{2})\b/g, true)
  tentar(/(\d{1,2})h(\d{2})?\b/g, true)
  tentar(/(\d{1,2})\s+horas?\b/g, false)
  tentar(/\bas\s+(\d{1,2})\b/g, false)

  const validos: string[] = []
  let ruins = 0
  aceitos.sort((a, b) => a.pos - b.pos)
  for (const item of aceitos) {
    const valido = item.h <= 23 && item.m <= 59
    if (!valido) {
      ruins++
      continue
    }
    const horario = `${duas(item.h)}:${duas(item.m)}`
    if (!validos.includes(horario)) validos.push(horario)
  }
  return { horarios: validos, invalido: ruins > 0 && validos.length === 0 }
}

/* ------------------------------------------------------------------ */
/* Extração de serviço e profissional                                  */
/* ------------------------------------------------------------------ */

function nomesAtivos(servicos: FonteServico[]): string[] {
  return servicos
    .filter((s) => s.ativo !== false && s.nome && s.nome.trim())
    .map((s) => s.nome.trim())
}

/**
 * Serviço citado: correspondência exata (substring do nome oficial) e, na
 * ausência dela, agrupamento por palavras-chave (≥4 letras). Empate →
 * `ambiguos` para o cliente escolher — nunca se assume.
 */
export function extrairServico(
  texto: string,
  servicos: FonteServico[],
): { servico: string | null; ambiguos: string[] } {
  const alvo = normalizar(texto)
  if (!alvo) return { servico: null, ambiguos: [] }
  const nomes = nomesAtivos(servicos)

  const exatos = nomes.filter((nome) => alvo.includes(normalizar(nome)))
  if (exatos.length) {
    exatos.sort((a, b) => b.length - a.length)
    return { servico: exatos[0], ambiguos: [] }
  }

  const tokens = alvo.split(/[^a-z0-9]+/).filter(Boolean)
  const pontuados: { nome: string; score: number }[] = []
  for (const nome of nomes) {
    const palavras = normalizar(nome)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
    if (!palavras.length) continue
    const score = palavras.filter(
      (w) => tokens.some((tk) => tk.length >= 4 && tk.slice(0, 4) === w.slice(0, 4)),
    ).length
    if (score > 0) pontuados.push({ nome, score })
  }
  if (!pontuados.length) return { servico: null, ambiguos: [] }

  const max = Math.max(...pontuados.map((p) => p.score))
  const topo = pontuados.filter((p) => p.score === max)
  if (topo.length === 1) return { servico: topo[0].nome, ambiguos: [] }
  return { servico: null, ambiguos: topo.slice(0, 4).map((p) => p.nome) }
}

const NAO_E_PROFISSIONAL = [
  'quem',
  'voce',
  'vc',
  'atendimento',
  'agenda',
  'horario',
  'horarios',
  'alguem',
  'equipe',
  'profissional',
  'favorito',
  'hoje',
  'amanha',
  'todos',
  'comigo',
  'voces',
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'meu',
  'minha',
  'de',
  'do',
  'da',
]

/** Profissional citado; `desconhecido` sinaliza "com <nome> " não cadastrado. */
export function extrairProfissional(
  texto: string,
  nomes: string[],
): { profissional: string | null; desconhecido: string | null } {
  const alvo = normalizar(texto)
  if (!alvo) return { profissional: null, desconhecido: null }
  const tokens = alvo.split(/[^a-z0-9]+/).filter(Boolean)
  const ordenados = [...nomes].sort((a, b) => b.length - a.length)

  for (const nome of ordenados) {
    if (alvo.includes(normalizar(nome))) {
      return { profissional: nome.trim(), desconhecido: null }
    }
  }
  for (const nome of ordenados) {
    const primeira = normalizar(nome).split(/[^a-z0-9]+/)[0]
    if (primeira && primeira.length >= 3 && tokens.includes(primeira)) {
      return { profissional: nome.trim(), desconhecido: null }
    }
  }

  const m = alvo.match(/\bcom\s+(?:o|a|os|as|meu|minha|meus|minhas)?\s*([a-z]{3,})\b/)
  if (m && !NAO_E_PROFISSIONAL.includes(m[1])) {
    return { profissional: null, desconhecido: m[1] }
  }
  return { profissional: null, desconhecido: null }
}

/* ------------------------------------------------------------------ */
/* Grade de horários (espelho de src/modules/agenda + agendaPublica)   */
/* ------------------------------------------------------------------ */

export type PacoteSlots = {
  expediente: {
    inicio: string
    fim: string
    almocoInicio: string | null
    almocoFim: string | null
  }
  bloqueios: {
    profissional: string
    data: string
    dataFim: string | null
    inicio: string
    fim: string
  }[]
  ocupacoes: {
    profissional: string
    horario: string
    servico: string | null
    duracaoMin: number | null
    status: string | null
  }[]
}

export type DisponibilidadeSlot = { horario: string; livres: string[] }

function paraMinutos(hora: string): number {
  const [h, m] = (hora ?? '').split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

function formatarMinutos(total: number): string {
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = total % 60
  return `${hh}:${String(mm).padStart(2, '0')}`
}

function listaBruta(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor)
    ? valor.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : []
}

/** Mapeia o pacote de agendamento_publico_slots com defesa de tipos. */
export function mapearPacoteSlots(bruto: unknown): PacoteSlots {
  const pacote = (bruto ?? {}) as Record<string, unknown>
  const exp = pacote.expediente
  const expediente =
    exp !== null && typeof exp === 'object' && !Array.isArray(exp)
      ? (exp as Record<string, unknown>)
      : {}
  return {
    expediente: {
      inicio: typeof expediente.inicio === 'string' ? expediente.inicio : '08:00',
      fim: typeof expediente.fim === 'string' ? expediente.fim : '20:00',
      almocoInicio:
        typeof expediente.almocoInicio === 'string' ? expediente.almocoInicio : '12:00',
      almocoFim:
        typeof expediente.almocoFim === 'string' ? expediente.almocoFim : '13:00',
    },
    bloqueios: listaBruta(pacote.bloqueios).map((b) => ({
      profissional: typeof b.profissional === 'string' ? b.profissional : '',
      data: typeof b.data === 'string' ? b.data : '',
      dataFim: typeof b.dataFim === 'string' ? b.dataFim : null,
      inicio: typeof b.inicio === 'string' ? b.inicio : '00:00',
      fim: typeof b.fim === 'string' ? b.fim : '00:00',
    })),
    ocupacoes: listaBruta(pacote.ocupacoes).map((o) => ({
      profissional: typeof o.profissional === 'string' ? o.profissional : '',
      horario: typeof o.horario === 'string' ? o.horario : '',
      servico: typeof o.servico === 'string' ? o.servico : null,
      duracaoMin: typeof o.duracaoMin === 'number' ? o.duracaoMin : null,
      status: typeof o.status === 'string' ? o.status : null,
    })),
  }
}

function sobreposicao(aIni: number, aDur: number, bIni: number, bDur: number): boolean {
  return aIni < bIni + bDur && bIni < aIni + aDur
}

/**
 * Horários livres de um dia — MESMO algoritmo de horariosPublicos
 * (grade de 30 min do expediente, fora do almoço, sem ocupação, sem
 * bloqueio, com folga para a duração real). Devolve os profissionais
 * livres por horário (lista branca de nomes do catálogo).
 */
export function horariosLivres(
  pacote: PacoteSlots,
  consulta: {
    data: string
    duracaoMin: number
    profissional: string | null
    profissionais: string[]
  },
  duracaoDo: (servico: string) => number,
): DisponibilidadeSlot[] {
  const duracao = Math.max(5, consulta.duracaoMin || 30)
  const exp = pacote.expediente
  const alvos = consulta.profissional
    ? [consulta.profissional]
    : consulta.profissionais
  if (!alvos.length) return []

  const ini = paraMinutos(exp.inicio)
  const fim = paraMinutos(exp.fim)
  const almIni = paraMinutos(exp.almocoInicio ?? '')
  const almFim = paraMinutos(exp.almocoFim ?? '')
  const grade: DisponibilidadeSlot[] = []

  for (let m = ini; m + 30 <= fim; m += 30) {
    const intervalo = almIni < almFim && m < almFim && m + 30 > almIni
    if (intervalo) continue
    const fimSlot = m + duracao
    if (fimSlot > fim) {
      // nenhum profissional cabe — horário descartado para todos
      continue
    }
    const livres: string[] = []
    for (const profissional of alvos) {
      if (almIni < almFim && sobreposicao(m, duracao, almIni, almFim - almIni)) {
        continue
      }
      const ocupado = pacote.ocupacoes.some((o) => {
        if (o.profissional !== profissional) return false
        if (o.status === 'cancelado' || o.status === 'nao_compareceu') return false
        const oIni = paraMinutos(o.horario)
        const oDur = Math.max(5, o.duracaoMin ?? duracaoDo(o.servico ?? ''))
        return sobreposicao(m, duracao, oIni, oDur)
      })
      if (ocupado) continue
      const bloqueado = pacote.bloqueios.some(
        (b) =>
          b.profissional === profissional &&
          consulta.data >= b.data &&
          consulta.data <= (b.dataFim ?? b.data) &&
          sobreposicao(m, duracao, paraMinutos(b.inicio), paraMinutos(b.fim) - paraMinutos(b.inicio)),
      )
      if (bloqueado) continue
      livres.push(profissional)
    }
    if (livres.length) grade.push({ horario: formatarMinutos(m), livres })
  }
  return grade
}

/** Até `limite` opções para a mensagem (1ª profissional livre por horário). */
export function paraOpcoes(
  grade: DisponibilidadeSlot[],
  opcao: { limite?: number; preferir?: string | null } = {},
): OpcaoSlot[] {
  const limite = opcao.limite ?? 6
  return grade.slice(0, limite).map((slot) => ({
    horario: slot.horario,
    profissional:
      opcao.preferir && slot.livres.includes(opcao.preferir)
        ? opcao.preferir
        : slot.livres[0],
  }))
}

/** Profissionais livres em um horário exato da grade (null se fora dela). */
export function profissionaisLivresNaHora(
  grade: DisponibilidadeSlot[],
  horario: string,
): string[] {
  const slot = grade.find((s) => s.horario === horario)
  return slot ? [...slot.livres] : []
}

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

/** "sexta-feira, 10 de outubro de 2026" — sem depender de Intl. */
export function formatarDataBR(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  if (!ano || !mes || !dia) return dataIso
  const dow = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return `${DIAS_EXT[dow]}, ${dia} de ${MESES_EXT[mes - 1]} de ${ano}`
}

/** '15:00' → '15h'; '15:30' → '15h30'; '09:05' → '9h05'. */
export function horaLegivel(horario: string): string {
  const [h, m] = horario.split(':').map(Number)
  if (!Number.isFinite(h)) return horario
  if (!m) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

function bullets(itens: string[]): string {
  return itens.map((item) => `• ${item}`).join('\n')
}

/* ------------------------------------------------------------------ */
/* Mensagens (todas em português, sem segredos, sem invenção)          */
/* ------------------------------------------------------------------ */

const MSG = {
  semTelefone:
    'Não consegui identificar seu número para continuar. Fale com o atendimento do Studio Audax.',
  semAcesso:
    'Não consegui acessar seus agendamentos agora. Fale com o atendimento do Studio Audax.',
  falhaConsulta:
    'Não consegui consultar a agenda agora. Tente novamente em instantes.',
  dataInvalida:
    'Não entendi essa data. Pode reescrever? Ex.: amanhã, sexta ou 10/10.',
  horaInvalida: 'Não entendi esse horário. Ex.: 15h ou 15:30.',
  descartado: 'Certo, seguimos como estava.',
  perguntaNome: 'Para registrar o agendamento, me diga seu nome completo.',
  perguntaData:
    'Para qual dia? Pode ser hoje, amanhã, um dia da semana ou data como 10/10.',
}

function listaServicosMsg(nomes: string[]): string {
  const mostrados = nomes.slice(0, 8)
  const resto = nomes.length > mostrados.length ? `\n…e mais ${nomes.length - mostrados.length}.` : ''
  return `Qual serviço você quer? Nossos serviços ativos:\n${mostrados
    .map((nome) => `• ${nome}`)
    .join('\n')}${resto}\nMe responda só o nome do serviço.`
}

function ambiguosMsg(ambiguos: string[]): string {
  return `Encontrei mais de um serviço parecido: ${ambiguos.join(', ')}. Qual deles você quer?`
}

function profissionalDesconhecidoMsg(desconhecido: string, nomes: string[]): string {
  return `Não encontrei "${desconhecido}" entre os profissionais ativos. Temos: ${nomes
    .slice(0, 8)
    .join(', ')}. Com qual deles?`
}

function listaProfissionaisMsg(nomes: string[]): string {
  return `Com qual profissional? Temos: ${nomes.slice(0, 8).join(', ')}.\nMe responda o nome.`
}

function listaHorariosMsg(dataIso: string, opcoes: OpcaoSlot[]): string {
  const linhas = opcoes.map(
    (o, i) => `${i + 1}. ${horaLegivel(o.horario)} com ${o.profissional}`,
  )
  return `Tenho estes horários livres em ${formatarDataBR(dataIso)}:\n${linhas.join(
    '\n',
  )}\nQual fica melhor? Pode responder o número ou a hora (ex.: ${horaLegivel(opcoes[0].horario)}).`
}

function semHorariosMsg(dataIso: string, servico: string): string {
  return `Não encontrei horários livres em ${formatarDataBR(dataIso)} para ${servico}. Outro dia?`
}

function ocupadoMsg(dataIso: string, opcoes: OpcaoSlot[]): string {
  const linhas = opcoes.map(
    (o, i) => `${i + 1}. ${horaLegivel(o.horario)} com ${o.profissional}`,
  )
  return `Esse horário não está livre. Em ${formatarDataBR(dataIso)} tenho:\n${linhas.join(
    '\n',
  )}\nQual fica melhor?`
}

function confirmarCriarMsg(r: Rascunho): string {
  return [
    'Confirma o agendamento?',
    bullets([
      `Serviço: ${r.servico}`,
      `Data: ${formatarDataBR(r.data ?? '')}`,
      `Horário: ${horaLegivel(r.horario ?? '')}`,
      `Profissional: ${r.profissional}`,
      `Cliente: ${r.cliente}`,
    ]),
    'Responda sim para confirmar.',
  ].join('\n')
}

function confirmarCancelarMsg(alvo: ResumoAgendamento): string {
  return [
    'Confirmar o cancelamento?',
    bullets([
      `Serviço: ${alvo.servico}`,
      `Data: ${formatarDataBR(alvo.data)}`,
      `Horário: ${horaLegivel(alvo.horario)}`,
      `Profissional: ${alvo.profissional}`,
    ]),
    'Responda sim para cancelar.',
  ].join('\n')
}

function confirmarRemarcarMsg(r: Rascunho): string {
  const alvo = r.alvo as ResumoAgendamento
  return [
    'Remarcar este agendamento?',
    bullets([
      `Serviço: ${alvo.servico}`,
      `De: ${formatarDataBR(alvo.data)} às ${horaLegivel(alvo.horario)} com ${alvo.profissional}`,
      `Para: ${formatarDataBR(r.data ?? '')} às ${horaLegivel(r.horario ?? '')} com ${r.profissional}`,
    ]),
    'Responda sim para remarcar.',
  ].join('\n')
}

function listaAgendamentosMsg(candidatos: ResumoAgendamento[]): string {
  const linhas = candidatos.map(
    (a, i) =>
      `${i + 1}) ${a.servico} — ${formatarDataBR(a.data)} às ${horaLegivel(a.horario)} com ${a.profissional}`,
  )
  return `Encontrei ${candidatos.length} agendamentos:\n${linhas.join(
    '\n',
  )}\nQual deles? Responda o número.`
}

function naoAchouMsg(filtros: string[]): string {
  const detalhe = filtros.length ? ` (${filtros.join(', ')})` : ''
  return `Não encontrei agendamentos futuros${detalhe}. Fale com o atendimento do Studio Audax.`
}

function perguntaNovaDataMsg(alvo: ResumoAgendamento): string {
  return `Para quando quer remarcar ${alvo.servico} (agora em ${formatarDataBR(
    alvo.data,
  )} às ${horaLegivel(alvo.horario)})?`
}

function falhaMsg(motivo: string): string {
  return `Não foi possível concluir: ${motivo.slice(0, 300)}`
}

function recortar(texto: string): string {
  return texto.length > 4096 ? texto.slice(0, 4096) : texto
}

/* ------------------------------------------------------------------ */
/* Rascunho                                                            */
/* ------------------------------------------------------------------ */

export function novoRascunho(acao: AcaoConversa): Rascunho {
  return {
    acao,
    etapa: 'coletando',
    servico: null,
    profissional: null,
    data: null,
    horario: null,
    cliente: null,
    alvo: null,
    candidatos: [],
    opcoes: [],
    listaServicos: [],
    listaProfissionais: [],
    esperandoNome: false,
  }
}

function futuro(ag: ResumoAgendamento, hoje: string): boolean {
  return (
    ag.data >= hoje && (ag.status === 'pendente' || ag.status === 'confirmado')
  )
}

type Passo = {
  resposta: string
  rascunho: Rascunho | null
  executada: boolean
  motivo: string | null
}

/* ------------------------------------------------------------------ */
/* Processamento                                                       */
/* ------------------------------------------------------------------ */

export async function processarConversa(entrada: EntradaConversa): Promise<SaidaConversa> {
  const { texto, telefone, deps, podeExecutar } = entrada
  const agora = deps.agora()
  const hoje = deps.hoje()

  const base: ContextoConversa = entrada.contexto ?? {
    atualizadoEm: agora,
    historico: [],
    rascunho: null,
  }
  const historico: Turno[] = [...base.historico]
  const anterior = historico[historico.length - 1]
  if (!anterior || anterior.papel !== 'cliente' || anterior.texto !== texto) {
    historico.push({ papel: 'cliente', texto })
  }

  let rascunho: Rascunho | null = base.rascunho
    ? { ...base.rascunho, candidatos: [...base.rascunho.candidatos], opcoes: [...base.rascunho.opcoes], listaServicos: [...base.rascunho.listaServicos], listaProfissionais: [...base.rascunho.listaProfissionais] }
    : null

  const fechar = (
    resposta: string,
    opcoes: {
      acao?: AcaoConversa | null
      executada?: boolean
      motivo?: string | null
      rascunhoFinal?: Rascunho | null
      servico?: string | null
    } = {},
  ): SaidaConversa => {
    const textoFinal = recortar(resposta)
    historico.push({ papel: 'ia', texto: textoFinal })
    return {
      resposta: textoFinal,
      // `??` não distingue null de undefined: um descarte explícito
      // (rascunhoFinal/acao null) seria anulado e o rascunho antigo
      // sobreviveria. Usa-se `!== undefined` para respeitar o null.
      contexto: {
        atualizadoEm: agora,
        historico: historico.slice(-6),
        rascunho:
          opcoes.rascunhoFinal !== undefined ? opcoes.rascunhoFinal : rascunho,
      },
      acao: opcoes.acao !== undefined ? opcoes.acao : (rascunho?.acao ?? null),
      executada: opcoes.executada ?? false,
      servico: opcoes.servico ?? rascunho?.servico ?? null,
      motivo: opcoes.motivo ?? null,
    }
  }

  if (!telefone) {
    return fechar(MSG.semTelefone, { acao: null })
  }

  // Fontes oficiais — sempre necessárias (listas, duração, nomes).
  let fontes: FontesOficiais
  try {
    fontes = await deps.carregarCatalogo()
  } catch {
    return fechar(MSG.falhaConsulta, { rascunhoFinal: rascunho })
  }
  const servicosAtivos = nomesAtivos(fontes.servicos)
  const profissionaisAtivos = fontes.profissionais
    .filter((p) => p.ativo !== false && p.nome && p.nome.trim())
    .map((p) => p.nome.trim())
  const duracaoDo = (servico: string): number => {
    const achado = fontes.servicos.find(
      (s) => s.nome === servico && s.ativo !== false,
    )
    return achado?.duracaoMin ?? 30
  }
  const duracaoServico = (nome: string | null): number =>
    nome ? duracaoDo(nome) : 30

  const slotsCache = new Map<string, PacoteSlots>()
  const carregarSlots = async (data: string): Promise<PacoteSlots | null> => {
    const emCache = slotsCache.get(data)
    if (emCache) return emCache
    try {
      const pacote = await deps.carregarSlots(data)
      slotsCache.set(data, pacote)
      return pacote
    } catch {
      return null
    }
  }

  const listarFuturos = async (): Promise<ResumoAgendamento[] | null> => {
    if (!deps.listarAgendamentos) return null
    try {
      const lista = await deps.listarAgendamentos(telefone)
      return lista.filter((ag) => futuro(ag, hoje))
    } catch {
      return null
    }
  }

  /* ------------------ passo A: estado pendente --------------------- */

  if (rascunho && rascunho.etapa === 'escolhendo') {
    const n = extrairNumero(texto)
    if (n !== null && n <= rascunho.candidatos.length) {
      rascunho.alvo = rascunho.candidatos[n - 1]
      rascunho.candidatos = []
    } else if (ehNegacao(texto, rascunho.acao)) {
      return fechar(MSG.descartado, { rascunhoFinal: null, acao: rascunho.acao })
    } else {
      rascunho = null
    }
  }

  if (rascunho && rascunho.etapa === 'confirmando') {
    const acaoAtual = rascunho.acao
    if (ehAfirmacao(texto, acaoAtual)) {
      if (!podeExecutar) {
        const manter = { ...rascunho }
        const resposta =
          acaoAtual === 'criar'
            ? confirmarCriarMsg(rascunho)
            : acaoAtual === 'cancelar'
              ? confirmarCancelarMsg(rascunho.alvo as ResumoAgendamento)
              : confirmarRemarcarMsg(rascunho)
        return fechar(resposta, {
          executada: false,
          motivo: 'destinatario-nao-autorizado',
          rascunhoFinal: manter,
        })
      }
      if (acaoAtual === 'criar') {
        const r = rascunho
        const resultado = await deps.criar({
          cliente: r.cliente ?? '',
          telefone,
          servico: r.servico ?? '',
          profissional: r.profissional ?? '',
          data: r.data ?? '',
          horario: r.horario ?? '',
        })
        if (resultado.ok) {
          const ok = `Agendado! ${r.servico} com ${r.profissional} em ${formatarDataBR(
            r.data ?? '',
          )} às ${horaLegivel(r.horario ?? '')}. O agendamento aguarda a confirmação da nossa equipe.`
          rascunho = null
          return fechar(ok, { acao: 'criar', executada: true, rascunhoFinal: null })
        }
        const conflito =
          /ocupado|expediente|almoço|bloqueado|indisponível|inválid/i.test(resultado.motivo)
        if (conflito) {
          r.horario = null
          const passo = await avancar(r)
          return fechar(`${falhaMsg(resultado.motivo)}\n${passo.resposta}`, {
            acao: 'criar',
            executada: false,
            motivo: resultado.motivo,
            rascunhoFinal: passo.rascunho,
          })
        }
        return fechar(falhaMsg(resultado.motivo), {
          acao: 'criar',
          executada: false,
          motivo: resultado.motivo,
          rascunhoFinal: rascunho,
        })
      }
      if (acaoAtual === 'cancelar') {
        const r = rascunho
        const alvo = r.alvo as ResumoAgendamento
        if (!deps.cancelar) {
          return fechar(MSG.semAcesso, {
            acao: 'cancelar',
            motivo: 'sem-chave',
            rascunhoFinal: r,
          })
        }
        const resultado = await deps.cancelar(alvo.id, telefone)
        if (resultado.ok) {
          rascunho = null
          const ok = `Cancelado! ${alvo.servico} em ${formatarDataBR(alvo.data)} às ${horaLegivel(alvo.horario)} foi cancelado.`
          return fechar(ok, { acao: 'cancelar', executada: true, rascunhoFinal: null })
        }
        return fechar(falhaMsg(resultado.motivo), {
          acao: 'cancelar',
          executada: false,
          motivo: resultado.motivo,
          rascunhoFinal: r,
        })
      }
      // remarcar
      const r = rascunho
      const alvo = r.alvo as ResumoAgendamento
      if (!deps.remarcar) {
        return fechar(MSG.semAcesso, {
          acao: 'remarcar',
          motivo: 'sem-chave',
          rascunhoFinal: r,
        })
      }
      const resultado = await deps.remarcar(
        alvo.id,
        telefone,
        r.data ?? '',
        r.horario ?? '',
        r.profissional ?? '',
      )
      if (resultado.ok) {
        rascunho = null
        const ok = `Remarcado! ${alvo.servico} agora é em ${formatarDataBR(
          r.data ?? '',
        )} às ${horaLegivel(r.horario ?? '')} com ${r.profissional}.`
        return fechar(ok, { acao: 'remarcar', executada: true, rascunhoFinal: null })
      }
      return fechar(falhaMsg(resultado.motivo), {
        acao: 'remarcar',
        executada: false,
        motivo: resultado.motivo,
        rascunhoFinal: r,
      })
    }
    if (ehNegacao(texto, acaoAtual)) {
      return fechar(MSG.descartado, { rascunhoFinal: null, acao: acaoAtual })
    }
    // mensagem nova durante a confirmação → recomeça com a intenção atual
    const novaAcao = detectarAcao(texto)
    rascunho = novaAcao && novaAcao !== acaoAtual ? novoRascunho(novaAcao) : { ...rascunho, etapa: 'coletando' }
  }

  /* ------------------ passo B: extração ---------------------------- */

  let acao: AcaoConversa
  if (rascunho) {
    const detectada = detectarAcao(texto)
    if (detectada && detectada !== rascunho.acao) {
      rascunho = novoRascunho(detectada)
    }
    acao = rascunho.acao
  } else {
    const detectada = detectarAcao(texto)
    if (!detectada) {
      return fechar(
        'Posso ajudar com horários, agendamentos, cancelamentos e remarcações. O que você precisa?',
        { acao: null, rascunhoFinal: null },
      )
    }
    rascunho = novoRascunho(detectada)
    acao = detectada
  }
  const r = rascunho

  const foco = segmentoNovo(texto)
  const datas = extrairDatas(foco, hoje)
  const datasBrutas = datas.datas.length ? datas : extrairDatas(texto, hoje)
  const horariosExtraidos = extrairHorarios(foco)
  const horarios =
    horariosExtraidos.horarios.length
      ? horariosExtraidos
      : extrairHorarios(texto)

  const servicoExtraido = extrairServico(texto, fontes.servicos)
  const profissionalExtraido = extrairProfissional(texto, profissionaisAtivos)

  let achouCampo = false

  if (servicoExtraido.ambiguos.length && !r.servico) {
    r.listaServicos = servicoExtraido.ambiguos
    r.esperandoNome = false
    r.etapa = 'coletando'
    return fechar(ambiguosMsg(servicoExtraido.ambiguos), { rascunhoFinal: r })
  }
  if (servicoExtraido.servico) {
    if (acao !== 'cancelar' || !r.alvo) {
      r.servico = servicoExtraido.servico
      achouCampo = true
    }
  }

  if (profissionalExtraido.desconhecido && !profissionalExtraido.profissional) {
    r.esperandoNome = false
    r.etapa = 'coletando'
    return fechar(
      profissionalDesconhecidoMsg(profissionalExtraido.desconhecido, profissionaisAtivos),
      { rascunhoFinal: r },
    )
  }
  if (profissionalExtraido.profissional && acao !== 'cancelar') {
    r.profissional = profissionalExtraido.profissional
    achouCampo = true
  }

  if (datasBrutas.invalida) {
    r.etapa = 'coletando'
    return fechar(MSG.dataInvalida, { rascunhoFinal: r })
  }
  if (datasBrutas.datas.length) {
    r.data = datasBrutas.datas[0]
    achouCampo = true
  }

  if (horarios.invalido) {
    r.etapa = 'coletando'
    return fechar(MSG.horaInvalida, { rascunhoFinal: r })
  }
  if (horarios.horarios.length) {
    r.horario = horarios.horarios[0]
    const daLista = r.opcoes.find((o) => o.horario === r.horario)
    if (!r.profissional && daLista) r.profissional = daLista.profissional
    achouCampo = true
  }

  if (r.etapa === 'coletando') {
    const n = extrairNumero(texto)
    if (n !== null && !r.horario && r.opcoes.length && n <= r.opcoes.length) {
      const escolhida = r.opcoes[n - 1]
      r.horario = escolhida.horario
      r.profissional = escolhida.profissional
      achouCampo = true
    } else if (n !== null && !r.profissional && r.listaProfissionais.length && n <= r.listaProfissionais.length) {
      r.profissional = r.listaProfissionais[n - 1]
      r.listaProfissionais = []
      achouCampo = true
    } else if (n !== null && !r.servico && r.listaServicos.length && n <= r.listaServicos.length) {
      r.servico = r.listaServicos[n - 1]
      r.listaServicos = []
      achouCampo = true
    }
    if (acao === 'criar' && !achouCampo && r.esperandoNome && texto.trim().length >= 2) {
      r.cliente = texto.trim().slice(0, 80)
      r.esperandoNome = false
    }
  }

  /* ------------------ passo C: avanço da máquina ------------------- */

  async function avancar(rascunhoAtual: Rascunho): Promise<Passo> {
    const acaoAtual = rascunhoAtual.acao

    if (acaoAtual === 'criar') {
      if (!rascunhoAtual.servico) {
        rascunhoAtual.etapa = 'coletando'
        rascunhoAtual.listaServicos = servicosAtivos
        rascunhoAtual.esperandoNome = false
        return { resposta: listaServicosMsg(servicosAtivos), rascunho: rascunhoAtual, executada: false, motivo: null }
      }
      if (!rascunhoAtual.data) {
        rascunhoAtual.etapa = 'coletando'
        rascunhoAtual.esperandoNome = false
        return { resposta: MSG.perguntaData, rascunho: rascunhoAtual, executada: false, motivo: null }
      }
      // horário e/ou profissional pendentes — e também quando os dois já
      // estão preenchidos: a grade real revalida a escolha (servidor
      // continua sendo a autoridade final na criação).
      const pacote = await carregarSlots(rascunhoAtual.data)
      if (!pacote) {
        return { resposta: MSG.falhaConsulta, rascunho: rascunhoAtual, executada: false, motivo: 'falha-slots' }
      }
      const grade = horariosLivres(
        pacote,
        {
          data: rascunhoAtual.data,
          duracaoMin: duracaoServico(rascunhoAtual.servico),
          profissional: rascunhoAtual.profissional,
          profissionais: profissionaisAtivos,
        },
        duracaoDo,
      )
      if (!rascunhoAtual.horario) {
        const opcoes = paraOpcoes(grade, { limite: 6 })
        if (!opcoes.length) {
          const dataAntiga = rascunhoAtual.data
          rascunhoAtual.data = null
          return {
            resposta: semHorariosMsg(dataAntiga, rascunhoAtual.servico ?? ''),
            rascunho: rascunhoAtual,
            executada: false,
            motivo: null,
          }
        }
        rascunhoAtual.opcoes = opcoes
        rascunhoAtual.etapa = 'coletando'
        rascunhoAtual.esperandoNome = false
        return {
          resposta: listaHorariosMsg(rascunhoAtual.data, opcoes),
          rascunho: rascunhoAtual,
          executada: false,
          motivo: null,
        }
      }
      const livres = profissionaisLivresNaHora(grade, rascunhoAtual.horario)
      const atende = rascunhoAtual.profissional
        ? livres.includes(rascunhoAtual.profissional)
        : livres.length > 0
      if (!atende) {
        const dataAntiga = rascunhoAtual.data
        const opcoes = paraOpcoes(grade, { limite: 6 })
        rascunhoAtual.horario = null
        if (!opcoes.length) {
          rascunhoAtual.data = null
          return {
            resposta: semHorariosMsg(dataAntiga, rascunhoAtual.servico ?? ''),
            rascunho: rascunhoAtual,
            executada: false,
            motivo: null,
          }
        }
        rascunhoAtual.opcoes = opcoes
        return {
          resposta: ocupadoMsg(dataAntiga, opcoes),
          rascunho: rascunhoAtual,
          executada: false,
          motivo: null,
        }
      }
      if (!rascunhoAtual.profissional) {
        if (livres.length === 1) {
          rascunhoAtual.profissional = livres[0]
        } else {
          const preferido = rascunhoAtual.opcoes.find(
            (o) => o.horario === rascunhoAtual.horario,
          )?.profissional
          const ordenados = [
            ...(preferido && livres.includes(preferido) ? [preferido] : []),
            ...livres.filter((nome) => nome !== preferido),
          ]
          rascunhoAtual.listaProfissionais = ordenados
          rascunhoAtual.etapa = 'coletando'
          rascunhoAtual.esperandoNome = false
          return {
            resposta: listaProfissionaisMsg(ordenados),
            rascunho: rascunhoAtual,
            executada: false,
            motivo: null,
          }
        }
      }

      if (!rascunhoAtual.cliente) {
        if (deps.clientePorTelefone) {
          try {
            const nome = await deps.clientePorTelefone(telefone)
            if (nome && nome.trim()) rascunhoAtual.cliente = nome.trim().slice(0, 80)
          } catch {
            // sem cadastro → pergunta abaixo
          }
        }
        if (!rascunhoAtual.cliente) {
          rascunhoAtual.etapa = 'coletando'
          rascunhoAtual.esperandoNome = true
          return { resposta: MSG.perguntaNome, rascunho: rascunhoAtual, executada: false, motivo: null }
        }
      }
      rascunhoAtual.esperandoNome = false
      rascunhoAtual.etapa = 'confirmando'
      return { resposta: confirmarCriarMsg(rascunhoAtual), rascunho: rascunhoAtual, executada: false, motivo: null }
    }

    // cancelar / remarcar precisam da lista do cliente (RPC com secret)
    if (!deps.listarAgendamentos || (acaoAtual === 'cancelar' && !deps.cancelar) || (acaoAtual === 'remarcar' && !deps.remarcar)) {
      return { resposta: MSG.semAcesso, rascunho: rascunhoAtual, executada: false, motivo: 'sem-chave' }
    }
    if (!rascunhoAtual.alvo) {
      const lista = await listarFuturos()
      if (!lista) {
        return { resposta: MSG.semAcesso, rascunho: rascunhoAtual, executada: false, motivo: 'sem-chave' }
      }
      let candidatos = lista
      const filtros: string[] = []
      if (rascunhoAtual.servico) {
        const alvo = normalizar(rascunhoAtual.servico)
        candidatos = candidatos.filter((ag) => {
          const norm = normalizar(ag.servico)
          return norm.includes(alvo) || alvo.includes(norm)
        })
        filtros.push(`serviço ${rascunhoAtual.servico}`)
      }
      if (acaoAtual === 'cancelar' && rascunhoAtual.data) {
        candidatos = candidatos.filter((ag) => ag.data === rascunhoAtual.data)
        filtros.push(`data ${formatarDataBR(rascunhoAtual.data)}`)
      }
      if (acaoAtual === 'cancelar' && rascunhoAtual.horario) {
        candidatos = candidatos.filter((ag) => ag.horario === rascunhoAtual.horario)
        filtros.push(`hora ${horaLegivel(rascunhoAtual.horario)}`)
      }
      if (!candidatos.length) {
        return { resposta: naoAchouMsg(filtros), rascunho: rascunhoAtual, executada: false, motivo: 'nao-achou' }
      }
      if (candidatos.length > 1) {
        const mostrar = candidatos.slice(0, 5)
        rascunhoAtual.candidatos = mostrar
        rascunhoAtual.etapa = 'escolhendo'
        return {
          resposta: listaAgendamentosMsg(mostrar),
          rascunho: rascunhoAtual,
          executada: false,
          motivo: null,
        }
      }
      rascunhoAtual.alvo = candidatos[0]
      // remarcar: valores extraídos podem ser os ATUAIS do alvo — descarta
      if (acaoAtual === 'remarcar') {
        const igual =
          rascunhoAtual.data === rascunhoAtual.alvo.data &&
          rascunhoAtual.horario === rascunhoAtual.alvo.horario &&
          rascunhoAtual.profissional === rascunhoAtual.alvo.profissional
        if (igual) {
          rascunhoAtual.data = null
          rascunhoAtual.horario = null
        }
      }
    }
    const alvo = rascunhoAtual.alvo as ResumoAgendamento

    if (acaoAtual === 'cancelar') {
      rascunhoAtual.etapa = 'confirmando'
      return { resposta: confirmarCancelarMsg(alvo), rascunho: rascunhoAtual, executada: false, motivo: null }
    }

    // remarcar — nova data sempre revalidada na grade real
    if (!rascunhoAtual.data) {
      rascunhoAtual.etapa = 'coletando'
      return {
        resposta: perguntaNovaDataMsg(alvo),
        rascunho: rascunhoAtual,
        executada: false,
        motivo: null,
      }
    }
    const pacote = await carregarSlots(rascunhoAtual.data)
    if (!pacote) {
      return { resposta: MSG.falhaConsulta, rascunho: rascunhoAtual, executada: false, motivo: 'falha-slots' }
    }
    const grade = horariosLivres(
      pacote,
      {
        data: rascunhoAtual.data,
        duracaoMin: duracaoServico(alvo.servico),
        profissional: rascunhoAtual.profissional,
        profissionais: profissionaisAtivos,
      },
      duracaoDo,
    )
    if (!rascunhoAtual.horario) {
      const opcoes = paraOpcoes(grade, {
        limite: 6,
        preferir: rascunhoAtual.profissional ?? alvo.profissional,
      })
      if (!opcoes.length) {
        const dataAntiga = rascunhoAtual.data
        rascunhoAtual.data = null
        return {
          resposta: semHorariosMsg(dataAntiga, alvo.servico),
          rascunho: rascunhoAtual,
          executada: false,
          motivo: null,
        }
      }
      rascunhoAtual.opcoes = opcoes
      rascunhoAtual.etapa = 'coletando'
      return {
        resposta: listaHorariosMsg(rascunhoAtual.data, opcoes),
        rascunho: rascunhoAtual,
        executada: false,
        motivo: null,
      }
    }
    const livres = profissionaisLivresNaHora(grade, rascunhoAtual.horario)
    const atende = rascunhoAtual.profissional
      ? livres.includes(rascunhoAtual.profissional)
      : livres.length > 0
    if (!atende) {
      const dataAntiga = rascunhoAtual.data
      const opcoes = paraOpcoes(grade, {
        limite: 6,
        preferir: rascunhoAtual.profissional ?? alvo.profissional,
      })
      rascunhoAtual.horario = null
      if (!opcoes.length) {
        rascunhoAtual.data = null
        return {
          resposta: semHorariosMsg(dataAntiga, alvo.servico),
          rascunho: rascunhoAtual,
          executada: false,
          motivo: null,
        }
      }
      rascunhoAtual.opcoes = opcoes
      return {
        resposta: ocupadoMsg(dataAntiga, opcoes),
        rascunho: rascunhoAtual,
        executada: false,
        motivo: null,
      }
    }
    if (!rascunhoAtual.profissional) {
      const preferido =
        rascunhoAtual.opcoes.find((o) => o.horario === rascunhoAtual.horario)
          ?.profissional ?? alvo.profissional
      if (livres.length === 1) {
        rascunhoAtual.profissional = livres[0]
      } else if (preferido && livres.includes(preferido)) {
        // remarcar mantém o profissional atual quando ele atende nesse horário
        rascunhoAtual.profissional = preferido
      } else {
        const ordenados = [
          ...(preferido && livres.includes(preferido) ? [preferido] : []),
          ...livres.filter((nome) => nome !== preferido),
        ]
        rascunhoAtual.listaProfissionais = ordenados
        rascunhoAtual.etapa = 'coletando'
        return {
          resposta: listaProfissionaisMsg(ordenados),
          rascunho: rascunhoAtual,
          executada: false,
          motivo: null,
        }
      }
    }
    rascunhoAtual.etapa = 'confirmando'
    return { resposta: confirmarRemarcarMsg(rascunhoAtual), rascunho: rascunhoAtual, executada: false, motivo: null }
  }

  // Sempre avança a máquina: estado novo, alvo escolhido por número ou
  // mensagem que atualizou um rascunho em confirmação.
  const passo = await avancar(r)
  rascunho = passo.rascunho
  return fechar(passo.resposta, {
    executada: passo.executada,
    motivo: passo.motivo,
    rascunhoFinal: rascunho,
  })
}
