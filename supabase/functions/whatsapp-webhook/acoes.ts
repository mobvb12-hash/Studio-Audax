// FASE 5 — construtores/interpretadores das chamadas RPC com credencial
// server-to-server (funções puras: sem Deno, sem rede, sem segredos aqui).
//
// Padrão idêntico ao envio do whatsapp-enviar: a credencial
// SUPABASE_SECRET_KEYS["default"] viaja SOMENTE nos headers (`apikey` +
// `Authorization`), nunca no corpo, nunca na URL, nunca em log. O corpo é
// apenas o mapa de parâmetros tipados (JSON) — texto do usuário vira
// VALOR de parâmetro, nunca SQL.
//
// Lista branca de funções: qualquer nome fora de RPCS_AUTORIZADAS é
// recusado mesmo que um dia alguém troque o chamador por engano.
export type ChaveSecreta = string

export const RPCS_AUTORIZADAS = [
  'ia_cliente_por_telefone',
  'ia_agendamentos_do_telefone',
  'ia_agendamento_cancelar',
  'ia_agendamento_remarcar',
] as const

export type RpcAutorizada = (typeof RPCS_AUTORIZADAS)[number]

export type RpcMontada = { url: string; init: RequestInit }

const RE_TELEFONE = /^\d{10,13}$/
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORARIO = /^\d{1,2}:\d{2}$/

function validarParametros(
  nome: RpcAutorizada,
  params: Record<string, unknown>,
): string | null {
  for (const [chave, valor] of Object.entries(params)) {
    if (typeof valor !== 'string') {
      return `Parâmetro ${chave} inválido.`
    }
  }
  const telefone = params.p_telefone
  if (typeof telefone === 'string' && !RE_TELEFONE.test(telefone)) {
    return 'Telefone inválido.'
  }
  if (nome === 'ia_agendamento_remarcar') {
    if (typeof params.p_data === 'string' && !RE_DATA.test(params.p_data)) {
      return 'Data inválida.'
    }
    if (typeof params.p_horario === 'string' && !RE_HORARIO.test(params.p_horario)) {
      return 'Horário inválido.'
    }
    if (typeof params.p_profissional === 'string' && !params.p_profissional.trim()) {
      return 'Profissional inválido.'
    }
  }
  if (nome === 'ia_agendamento_cancelar' && typeof params.p_id === 'string') {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(params.p_id)) return 'Identificador inválido.'
  }
  return null
}

/**
 * Monta a chamada POST {SUPABASE_URL}/rest/v1/rpc/{nome} com a credencial
 * SOMENTE nos headers. Lança (sem conter a chave) quando a configuração é
 * inválida ou o nome está fora da lista branca.
 */
export function montarRpcSecreto(
  base: string,
  chaveSecreta: ChaveSecreta,
  nome: RpcAutorizada,
  params: Record<string, string>,
): RpcMontada {
  const urlBase = typeof base === 'string' ? base.trim().replace(/\/+$/, '') : ''
  if (!/^https?:\/\//i.test(urlBase)) {
    throw new Error('SUPABASE_URL ausente ou inválida.')
  }
  const chave = typeof chaveSecreta === 'string' ? chaveSecreta.trim() : ''
  if (!chave.startsWith('sb_secret_')) {
    throw new Error('Credencial de acesso ausente ou inválida.')
  }
  if (!RPCS_AUTORIZADAS.includes(nome)) {
    throw new Error('Função não autorizada.')
  }
  const problema = validarParametros(nome, params)
  if (problema) throw new Error(problema)
  return {
    url: `${urlBase}/rest/v1/rpc/${nome}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: chave,
        Authorization: `Bearer ${chave}`,
      },
      body: JSON.stringify(params),
    },
  }
}

/**
 * Remove credenciais de uma mensagem de erro antes de qualquer uso em
 * log/resposta (mesmas regras de sanitizarMensagemErro de ./ia.ts) e corta
 * em 300 caracteres.
 */
export function motivoSeguro(mensagem: unknown): string {
  if (typeof mensagem !== 'string' || !mensagem.trim()) {
    return 'Não foi possível concluir a operação.'
  }
  return mensagem
    .replace(/Bearer\s+[0-9A-Za-z._~+/=-]+/gi, 'Bearer [oculto]')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[oculto]')
    .replace(/\bsb_secret_[0-9A-Za-z_-]+/g, '[oculto]')
    .replace(/\bsbp_[0-9A-Za-z_-]+/g, '[oculto]')
    .replace(/\bsk-[0-9A-Za-z_-]{8,}/g, '[oculto]')
    .trim()
    .slice(0, 300)
}

export type ResultadoRpc =
  | { ok: true; dados: unknown }
  | { ok: false; motivo: string }

/**
 * Interpreta a resposta do PostgREST sem vazar corpo arbitrário: 2xx →
 * `dados`; erro → somente a mensagem sanitizada (as mensagens de erro
 * desta aplicação são as nossas, geradas nas funções).
 */
export function interpretarRpc(status: number, corpo: string): ResultadoRpc {
  let json: unknown
  try {
    json = JSON.parse(corpo)
  } catch {
    json = null
  }
  if (status >= 200 && status < 300) {
    return { ok: true, dados: json }
  }
  const caixa = (json ?? {}) as { message?: unknown; error?: unknown; hint?: unknown }
  if (typeof caixa.message === 'string' && caixa.message.trim()) {
    return { ok: false, motivo: motivoSeguro(caixa.message) }
  }
  if (typeof caixa.error === 'string' && caixa.error.trim()) {
    return { ok: false, motivo: motivoSeguro(caixa.error) }
  }
  if (typeof caixa.hint === 'string' && caixa.hint.trim()) {
    return { ok: false, motivo: motivoSeguro(caixa.hint) }
  }
  return { ok: false, motivo: motivoSeguro(`A operação não foi confirmada (HTTP ${status}).`) }
}

/** Converte a resposta de ia_agendamentos_do_telefone em resumos tipados. */
export function interpretarAgendamentos(dados: unknown): {
  id: string
  servico: string
  profissional: string
  data: string
  horario: string
  status: string
}[] {
  if (!Array.isArray(dados)) return []
  return dados
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object' && !Array.isArray(item),
    )
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      servico: typeof item.servico === 'string' ? item.servico : '',
      profissional: typeof item.profissional === 'string' ? item.profissional : '',
      data: typeof item.data === 'string' ? item.data : '',
      horario: typeof item.horario === 'string' ? item.horario : '',
      status: typeof item.status === 'string' ? item.status : '',
    }))
    .filter((item) => item.id)
}
