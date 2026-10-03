// Trilha de auditoria e APRENDIZADO da IA (itens 17 e 20). Funções puras.
//
// O que é registrado: intenção detectada, resultado, ambiguidade, termos
// desconhecidos, correções, contexto (os SLOTS, não a transcrição) e ações
// realizadas. É insumo para a IA evoluir — e nada mais.
//
// O que este módulo garante (§17/§20):
//   • NENHUM dado sensível: telefone só como máscara ('***3593 (13 digitos)'),
//     CPF nunca (nem mascarado — o log guarda que o sinal foi usado, não o
//     valor), e um filtro final recusa qualquer sequência de 6+ dígitos;
//   • NENHUM texto de conversa: entra o slot ('corte'), nunca a frase;
//   • NENHUMA THESE sobre regra comercial: o registro é só leitura. Não existe
//     caminho de `ia_eventos` para `servicos`, `agenda_expediente` ou regras —
//     uma mensagem de cliente NUNCA muda regra nem código, porque este módulo
//     não escreve em nada além do log.
import { motivoSeguro } from './acoes.ts'

/** Máscara já usada no log do webhook: '***3593 (13 digitos)'. */
export function mascararTelefone(digitos: string): string {
  const limpo = (digitos ?? '').replace(/\D/g, '')
  if (!limpo) return ''
  const ultimos = limpo.slice(-4)
  return `***${ultimos} (${limpo.length} digitos)`
}

/** Telefone com metade mascarada — para logs de correlação de conversa. */
export function mascaraConversa(digitos: string): string {
  const limpo = (digitos ?? '').replace(/\D/g, '')
  if (limpo.length < 8) return ''
  return `***${limpo.slice(-4)}`
}

/** Nenhum campo de texto pode carregar 6+ dígitos seguidos. */
export function semDigitosLongos(valor: unknown): boolean {
  return typeof valor === 'string' ? !/\d{6,}/.test(valor) : valor === undefined
}

export type EventoAprendizado = {
  fluxo: string
  intencao: string
  acao: string
  executada: boolean
  motivo: string | null
  remetente: string
  digitos: number
  ambiguidade: string
  termosDesconhecidos: string[]
  correcoes: string[]
  contexto: Record<string, string>
  duracaoMs: number
}

export type EventoVazio = EventoAprendizado

/**
 * Evento sem informação — usado quando o fluxo nem chegou a produzir resultado
 * (por exemplo: mensagem duplicada). Registrar assim é melhor do que não
 * registrar, e o guard do banco garante que mesmo vazio não há dado sensível.
 */
export function eventoVazio(duracaoMs = 0): EventoVazio {
  return {
    fluxo: '',
    intencao: '',
    acao: '',
    executada: false,
    motivo: null,
    remetente: '',
    digitos: 0,
    ambiguidade: '',
    termosDesconhecidos: [],
    correcoes: [],
    contexto: {},
    duracaoMs:
      typeof duracaoMs === 'number' && duracaoMs >= 0 ? Math.min(duracaoMs, 600000) : 0,
  }
}

/** Um slot só entra no log se for texto curto e sem dígitos longos. */
function slot(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim().slice(0, 60)
  if (!limpo) return null
  return semDigitosLongos(limpo) ? limpo : null
}

function contextoLimpo(entrada: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {}
  let total = 0
  for (const [chave, valor] of Object.entries(entrada)) {
    if (total > 12) break
    const limpo = slot(valor)
    if (limpo) {
      saida[chave.slice(0, 24)] = limpo
      total += 1
    }
  }
  return saida
}

function listaLimpa(valores: string[] | undefined, max = 10): string[] {
  if (!Array.isArray(valores)) return []
  return valores
    .map((v) => (typeof v === 'string' ? v.trim().slice(0, 60) : ''))
    .filter((v) => v && semDigitosLongos(v))
    .slice(0, max)
}

/**
 * Monta o evento a partir da saída da conversa, com saneamento final. O que
 * for recusado pelo filtro simplesmente não entra — o registro é incompleto,
 * nunca perigoso.
 */
export function montarEvento(entrada: {
  fluxo: string
  intencao: string
  acao: string
  executada?: boolean
  motivo?: string | null
  telefone?: string | null
  ambiguidade?: string | null
  termosDesconhecidos?: string[]
  correcoes?: string[]
  contexto?: Record<string, unknown>
  duracaoMs?: number
}): EventoAprendizado {
  const telefone = (entrada.telefone ?? '').replace(/\D/g, '')
  return {
    fluxo: (entrada.fluxo ?? '').slice(0, 40),
    intencao: (entrada.intencao ?? '').slice(0, 40),
    acao: (entrada.acao ?? '').slice(0, 40),
    executada: entrada.executada === true,
    motivo: entrada.motivo ? motivoSeguro(entrada.motivo).slice(0, 300) : null,
    remetente: telefone ? mascararTelefone(telefone) : '',
    digitos: telefone.length,
    ambiguidade: (entrada.ambiguidade ?? '').slice(0, 120),
    termosDesconhecidos: listaLimpa(entrada.termosDesconhecidos),
    correcoes: listaLimpa(entrada.correcoes),
    contexto: contextoLimpo(entrada.contexto ?? {}),
    duracaoMs:
      typeof entrada.duracaoMs === 'number' && entrada.duracaoMs >= 0
        ? Math.min(entrada.duracaoMs, 600000)
        : 0,
  }
}

/**
 * Parâmetros de `ia_evento_registrar` — TODOS texto (contrato da lista branca
 * de ./acoes.ts). O JSON das listas/objetos é serializado aqui, e o servidor
 * ainda recusa qualquer coisa com 6+ dígitos.
 */
export function parametrosEvento(evento: EventoAprendizado): Record<string, string> {
  return {
    p_fluxo: evento.fluxo,
    p_intencao: evento.intencao,
    p_acao: evento.acao,
    p_executada: evento.executada ? 'true' : 'false',
    p_motivo: evento.motivo ?? '',
    p_remetente: evento.remetente,
    p_digitos: String(evento.digitos),
    p_ambiguidade: evento.ambiguidade,
    p_termos: JSON.stringify(evento.termosDesconhecidos).slice(0, 4000),
    p_correcoes: JSON.stringify(evento.correcoes).slice(0, 4000),
    p_contexto: JSON.stringify(evento.contexto).slice(0, 8000),
    p_acoes: '[]',
    p_duracao_ms: String(Math.trunc(evento.duracaoMs)),
  }
}
