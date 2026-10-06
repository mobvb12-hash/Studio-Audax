// ============================================================================
// Agendamento público — a máquina de estados do fluxo.
//
// O QUE ESTE ARQUIVO É (e o que ele NÃO é)
//
// É a REGRA DE NAVEGAÇÃO do agendamento: o que foi escolhido, o que ainda
// vale depois de uma troca e qual etapa pode ser mostrada. Só isso.
//
// NÃO é a regra de disponibilidade. Horário livre continua sendo
// `horariosLivresPorProfissional`, com expediente, almoço, bloqueio e ocupação
// da Agenda. Este arquivo nunca decide que um horário existe — ele só lembra
// que a pessoa escolheu um.
//
// POR QUE EXISTE SEPARADO DA TELA
//
// Porque "voltar não pode perder o que já foi escolhido" e "trocar o serviço
// tem que limpar o que ficou inválido" são decisões que precisam ser
// testáveis sem navegador. A tela orquestra; este arquivo decide.
// ============================================================================

/** As etapas, na ordem em que o cliente anda. */
export type Etapa =
  | 'servico'
  | 'profissional'
  | 'data'
  | 'horario'
  | 'complementos'
  | 'dados'
  | 'resumo'
  | 'confirmacao'

/** Ordem fixa: é o que o indicador de progresso desenha. */
export const ETAPAS: Etapa[] = [
  'servico',
  'profissional',
  'data',
  'horario',
  'complementos',
  'dados',
  'resumo',
  'confirmacao',
]

/**
 * Rótulo curto para o indicador "1 Serviço → 2 Profissional → …".
 *
 * Curto de propósito: sete palavras numa linha de celular viram um garrancho
 * ilegível. O número diz onde a pessoa está e o título da tela diz o que fazer.
 */
export const ETAPA_ROTULO: Record<Etapa, string> = {
  servico: 'Serviço',
  profissional: 'Profissional',
  data: 'Data',
  horario: 'Horário',
  complementos: 'Extras',
  dados: 'Dados',
  resumo: 'Confirmar',
  confirmacao: 'Pronto',
}

/** Etapas mostradas no indicador de progresso (a confirmação não conta). */
export const ETAPAS_PROGRESSO: Etapa[] = ETAPAS.filter((e) => e !== 'confirmacao')

export type EstadoAgendamento = {
  servicoNome: string
  profissional: string
  data: string
  horario: string
  complementoIds: string[]
  nome: string
  telefone: string
  /**
   * E-mail e data de nascimento digitados na etapa de dados.
   *
   * São obrigatórios para confirmar (o portão de identificação já exigiu a
   * conta, e a conta TEM e-mail). Viajam aqui até a confirmação e são gravados
   * no agendamento pela RPC da migration 044.
   */
  email: string
  nascimento: string
  observacao: string
}

export const ESTADO_VAZIO: EstadoAgendamento = {
  servicoNome: '',
  profissional: '',
  data: '',
  horario: '',
  complementoIds: [],
  nome: '',
  telefone: '',
  email: '',
  nascimento: '',
  observacao: '',
}

/** A etapa que falta para sair desta etapa. */
export function etapaBloqueia(estado: EstadoAgendamento, etapa: Etapa): boolean {
  switch (etapa) {
    case 'servico':
      return !estado.servicoNome
    case 'profissional':
      return !estado.profissional
    case 'data':
      return !estado.data
    case 'horario':
      return !estado.horario
    // Complementos e dados são sempre opcionais de avançar: complemento é
    // sugestão e o cliente pode não querer dizer o nome agora (ele volta).
    case 'complementos':
    case 'dados':
      return false
    case 'resumo':
      return !estado.servicoNome || !estado.profissional || !estado.data || !estado.horario
    case 'confirmacao':
      return true
  }
}

/**
 * A primeira etapa que ainda NÃO pode ser mostrada.
 *
 * Serve para o link profundo e para o botão de voltar: nunca abrimos uma tela
 * cujas escolhas anteriores não existem. Uma etapa vazia abre a anterior.
 */
export function etapaAnterior(etapa: Etapa): Etapa {
  const i = ETAPAS.indexOf(etapa)
  return ETAPAS[Math.max(0, i - 1)]
}

export function etapaSeguinte(etapa: Etapa): Etapa {
  const i = ETAPAS.indexOf(etapa)
  return ETAPAS[Math.min(ETAPAS.length - 1, i + 1)]
}

/* ------------------------------------------------------------------ */
/* Escolhas e invalidação                                               */
/* ------------------------------------------------------------------ */

/**
 * Escolhe o serviço e APAGA o que dependia dele.
 *
 * Depende do serviço: profissional (pode não atender), data, horário,
 * complementos e a duração/valor recalculados. NÃO depende: nome e telefone
 * do cliente — trocar de serviço não faz a pessoa se apresentar de novo.
 */
export function escolherServico(
  estado: EstadoAgendamento,
  servicoNome: string,
  servicosComplementos: string[],
): EstadoAgendamento {
  if (!servicoNome || servicoNome === estado.servicoNome) return estado
  const novo = {
    ...estado,
    servicoNome,
    // O profissional continua escolhido só se ainda atende ESTE serviço; a
    // tela refaz a lista de profissionais e decide o que fazer com isso.
    profissional: estado.profissional,
    data: '',
    horario: '',
    complementoIds: [],
  }
  // Complementos que não valem mais para o novo serviço saem na hora: são os
  // ids que `servicos.complementos` do novo serviço não lista.
  const permitidos = new Set(servicosComplementos)
  return {
    ...novo,
    complementoIds: novo.complementoIds.filter((id) => permitidos.has(id)),
  }
}

/**
 * Escolhe o profissional e apaga data e horário.
 *
 * A data e o horário eram daquele profissional com aquele serviço. Voltar um
 * passo e trocar o barbeiro tem que zerar o que já não vale.
 */
export function escolherProfissional(
  estado: EstadoAgendamento,
  profissional: string,
): EstadoAgendamento {
  if (!profissional || profissional === estado.profissional) return estado
  return { ...estado, profissional, data: '', horario: '' }
}

/** Escolhe o dia e apaga o horário (que era daquele dia). */
export function escolherData(
  estado: EstadoAgendamento,
  data: string,
): EstadoAgendamento {
  if (!data || data === estado.data) return estado
  return { ...estado, data, horario: '' }
}

/** Escolhe o horário. Só grava — a lista de livres é da Agenda. */
export function escolherHorario(
  estado: EstadoAgendamento,
  horario: string,
): EstadoAgendamento {
  if (!horario) return estado
  return { ...estado, horario }
}

/** Liga/desliga um complemento. O horário é revalidado pela tela. */
export function alternarComplemento(
  estado: EstadoAgendamento,
  id: string,
): EstadoAgendamento {
  const jaTem = estado.complementoIds.includes(id)
  return {
    ...estado,
    complementoIds: jaTem
      ? estado.complementoIds.filter((item) => item !== id)
      : [...estado.complementoIds, id],
  }
}

/**
 * O complemento mudou e o horário escolhido NÃO cabe mais.
 *
 * A tela chama isto depois de recalcular a duração: se o atendimento com
 * complemento passa do fim do expediente, do almoço, de um bloqueio ou cai
 * em cima de outro agendamento, o horário é devolvido. Preferimos pedir outro
 * horário a prometer um que o servidor vai recusar.
 */
export function invalidateHorarioSeNaoCabe(
  estado: EstadoAgendamento,
  horariosLivres: string[],
): EstadoAgendamento {
  if (!estado.horario) return estado
  if (horariosLivres.includes(estado.horario)) return estado
  return { ...estado, horario: '' }
}

/* ------------------------------------------------------------------ */
/* Totais                                                               */
/* ------------------------------------------------------------------ */

export type ItemCatalogo = {
  id?: string
  nome: string
  preco: number
  duracaoMin: number
  categoria?: string
  complementos?: string[]
}

/** Serviço base + complementos escolhidos, na ordem do catálogo. */
export function selecao(
  estado: EstadoAgendamento,
  servicos: ItemCatalogo[],
): { base: ItemCatalogo | null; complementos: ItemCatalogo[]; duracaoMin: number; valor: number } {
  const base = servicos.find((s) => s.nome === estado.servicoNome) ?? null
  const ids = new Set(estado.complementoIds)
  const complementos = servicos.filter(
    (s) => s.id && ids.has(s.id) && s.nome !== estado.servicoNome,
  )
  const duracaoMin =
    (base?.duracaoMin ?? 0) + complementos.reduce((soma, c) => soma + c.duracaoMin, 0)
  const valor =
    (base?.preco ?? 0) + complementos.reduce((soma, c) => soma + c.preco, 0)
  return { base, complementos, duracaoMin, valor }
}

/** Complementos que a CASA marcou para este serviço — nunca uma lista fixa. */
export function complementosDisponiveis(
  servicos: ItemCatalogo[],
  servicoNome: string,
): ItemCatalogo[] {
  const base = servicos.find((s) => s.nome === servicoNome)
  if (!base) return []
  const permitidos = new Set(base.complementos ?? [])
  return servicos.filter(
    (s) => s.id && permitidos.has(s.id) && s.nome !== base.nome,
  )
}

/**
 * O que a pessoa pode ADICIONAR ao serviço que já escolheu.
 *
 * A pergunta real é "quero fazer mais alguma coisa hoje?", e a resposta honesta
 * é: qualquer serviço do catálogo. A configuração `servicos.complementos` deixa
 * de ser uma whitelist que pode estar vazia e vira uma ORDENAÇÃO — o que a
 * casa sugeriu aparece primeiro, e o resto do catálogo vem logo abaixo.
 *
 * Por que não só as sugestões da casa: com a configuração vazia (que é como
 * estava) a etapa de extras não oferecia nada, e a pessoa que queria corte +
 * barba + sobrancelha não tinha como pedir os três. O catálogo é a fonte; a
 * configuração só decide a ordem de leitura.
 *
 * Três decisões:
 *
 *   • O serviço já escolhido NUNCA aparece — não se oferece a si mesmo.
 *   • serviço sem id fica de fora: sem id não há como marcar e desmarcar com
 *     segurança, e é melhor não mostrar do que mostrar algo que não grava.
 *   • A ordem é a do catálogo (que a RPC devolve por nome), e dentro de cada
 *     grupo as sugestões mantêm a ordem do catálogo também — mudar o texto do
 *     serviço não embaralha a lista de extras.
 */
export function servicosAdicionais(
  servicos: ItemCatalogo[],
  servicoNome: string,
): { sugeridos: ItemCatalogo[]; outros: ItemCatalogo[] } {
  const base = servicos.find((s) => s.nome === servicoNome)
  if (!base) return { sugeridos: [], outros: [] }
  const sugeridos = new Set(base.complementos ?? [])
  const restantes = servicos.filter(
    (s) => s.id && s.nome !== servicoNome && s.nome !== base.nome,
  )
  return {
    sugeridos: restantes.filter((s) => sugeridos.has(s.id as string)),
    outros: restantes.filter((s) => !sugeridos.has(s.id as string)),
  }
}

/** E-mail com forma de e-mail — sem DNS, só o que dá para julgar na tela. */
function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim())
}

/**
 * Data de nascimento em `YYYY-MM-DD` e que não é amanhã.
 *
 * Mesma regra de `nascimentoValido` do painel do cliente, replicada de
 * propósito: este módulo não importa nada (é testável sem navegador) e
 * `painel/regras` é quem importa ESTADO_VAZIO — importar de lá aqui tornaria
 * os dois circularmente dependentes.
 */
function nascimentoValido(valor: string): boolean {
  const data = valor.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const [ano, mes, dia] = data.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const validada = new Date(ano, mes - 1, dia)
  if (
    validada.getFullYear() !== ano ||
    validada.getMonth() !== mes - 1 ||
    validada.getDate() !== dia
  ) {
    return false
  }
  const hoje = new Date()
  return (
    validada.getTime() <=
    new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()
  )
}

/**
 * Dados válidos para confirmar: nome, telefone com DDD, e-mail e nascimento.
 *
 * Nome e telefone são as duas regras de sempre. E-mail e nascimento entraram
 * quando a etapa de dados ficou completa: a conta é pré-condição (o portão
 * aconteceu antes), então não há o que a pessoa possa errar — é o mesmo
 * e-mail com que ela entrou.
 */
export function dadosValidos(estado: EstadoAgendamento): boolean {
  const digitos = estado.telefone.replace(/\D/g, '')
  return (
    estado.nome.trim().length >= 2 &&
    digitos.length >= 10 &&
    digitos.length <= 13 &&
    emailValido(estado.email) &&
    nascimentoValido(estado.nascimento)
  )
}
