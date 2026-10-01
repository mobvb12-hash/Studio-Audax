// Lógica pura do recebimento de webhooks da Evolution API (sem Deno, sem rede).
//
// O entrypoint recebe o POST da Evolution e delega a interpretação para cá.
// Mantê-lo puro permite testar tudo no vitest e garante que NENHUM campo
// sensível saia daqui: a saída é uma lista branca de metadados — nunca a
// apikey presente no payload, nunca o texto completo, nunca o remetente cru.
//
// Contrato observado (Evolution API 2.3.7, docs: set-webhook / webhooks):
//   POST { event, instance, apikey?, destination?, date_time?, sender?,
//          server_url?, body: { key: { remoteJid, fromMe, id },
//                               message: { conversation } } }
//   event: "messages.upsert" (aceito também como "MESSAGES_UPSERT")
// Versões diferentes da Evolution usam `data` no lugar de `body` — os dois
// recipientes são aceitos; qualquer outra forma é recusada como não-reconhecida.

export type EventoInterpretado = {
  reconhecido: boolean
  motivo: string | null
  evento: string | null
  ehMensagem: boolean
  /** true somente quando a mensagem veio DE FORA (fromMe = false) */
  recebida: boolean
  texto: string | null
  /** remetente mascarado: somente os 4 últimos dígitos + total */
  remetente: string | null
  idMensagem: string | null
  apikeyPresente: boolean
  /** nomes de campos (apenas chaves, nunca valores) — diagnóstico */
  chaves: string[]
}

function vazio(motivo: string, chaves: string[] = []): EventoInterpretado {
  return {
    reconhecido: false,
    motivo,
    evento: null,
    ehMensagem: false,
    recebida: false,
    texto: null,
    remetente: null,
    idMensagem: null,
    apikeyPresente: false,
    chaves,
  }
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

/** "MESSAGES_UPSERT" / "messages_upsert" → "messages.upsert" */
export function normalizarNomeEvento(evento: string): string {
  return evento.trim().toLowerCase().replace(/_/g, '.')
}

/** Texto simples quando existe; mídia sem legenda vira null. */
export function extrairTexto(mensagem: unknown): string | null {
  const caixa = objeto(mensagem)
  if (!caixa) return null
  const direto = caixa.conversation
  if (typeof direto === 'string' && direto) return direto
  const estendida = objeto(caixa.extendedTextMessage)
  const texto = estendida?.text
  if (typeof texto === 'string' && texto) return texto
  return null
}

/** Remetente sempre mascarado: `***3593 (13 digitos)`. */
export function mascararRemetente(remoteJid: string | null): string | null {
  if (!remoteJid) return null
  const digitos = remoteJid.split('@')[0].replace(/\D/g, '')
  if (digitos.length <= 4) return `*** (${digitos.length} digitos)`
  return `***${digitos.slice(-4)} (${digitos.length} digitos)`
}

/** Texto do teste de recebimento desta etapa (nada além é classificado). */
export function ehMensagemDeTeste(texto: string | null): boolean {
  return (texto ?? '').trim().startsWith('Teste recebimento')
}

/** Corpo do POST para `POST /webhook/set/{instance}` (docs oficiais 2.3.7). */
export function montarCorpoConfiguracao(urlWebhook: string): {
  enabled: boolean
  url: string
  events: string[]
  base64: boolean
} {
  return {
    enabled: true,
    url: urlWebhook,
    events: ['MESSAGES_UPSERT'],
    base64: false,
  }
}

export function interpretarEventoWebhook(bruto: unknown): EventoInterpretado {
  const registro = objeto(bruto)
  if (!registro) return vazio('corpo-nao-objeto')
  const chaves = Object.keys(registro)
  const apikeyPresente =
    typeof registro.apikey === 'string' && registro.apikey.length > 0

  if (typeof registro.event !== 'string' || !registro.event.trim()) {
    return vazio('sem-evento', chaves)
  }
  const evento = normalizarNomeEvento(registro.event)

  if (evento !== 'messages.upsert') {
    // Evento de webhook válido, mas não é mensagem recebida (ex.:
    // connection-update). Nada a extrair — só o nome é registrado.
    return {
      reconhecido: true,
      motivo: null,
      evento,
      ehMensagem: false,
      recebida: false,
      texto: null,
      remetente: null,
      idMensagem: null,
      apikeyPresente,
      chaves,
    }
  }

  const caixa = objeto(registro.body) ?? objeto(registro.data)
  if (!caixa) {
    return { ...vazio('sem-corpo', chaves), evento }
  }
  const chavesComCorpo = [...chaves, ...Object.keys(caixa)]

  const chave = objeto(caixa.key)
  if (!chave) return { ...vazio('sem-chave', chavesComCorpo), evento }

  const remoteJid = typeof chave.remoteJid === 'string' ? chave.remoteJid : null
  if (!remoteJid) return { ...vazio('sem-remetente', chavesComCorpo), evento }
  if (typeof chave.fromMe !== 'boolean') {
    return { ...vazio('sem-fromMe', chavesComCorpo), evento }
  }

  return {
    reconhecido: true,
    motivo: null,
    evento,
    ehMensagem: true,
    recebida: chave.fromMe === false,
    texto: extrairTexto(caixa.message),
    remetente: mascararRemetente(remoteJid),
    idMensagem: typeof chave.id === 'string' ? chave.id : null,
    apikeyPresente,
    chaves: chavesComCorpo,
  }
}
