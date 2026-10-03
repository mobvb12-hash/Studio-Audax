// Evolution API — lógica pura do envio de mensagem (sem Deno, sem rede).
//
// O entrypoint da Edge Function lê os secrets (EVOLUTION_API_URL,
// EVOLUTION_API_KEY, EVOLUTION_INSTANCE) e delega a montagem da chamada
// para cá. Mantê-lo puro permite testar tudo no vitest e garante que a
// chave exista em um único lugar: o header `apikey` da requisição interna.
// A chave jamais aparece na URL, no corpo ou em qualquer resposta.
//
// Contrato de TEXTO (Evolution API 2.3.7):
//   POST {base}/message/sendText/{instance}
//   header: apikey | body: { number, text }
// O texto vai no nível raiz (SendTextDto/textMessageSchema exigem `text`);
// o formato aninhado `textMessage: { text }` é rejeitado com HTTP 400.
//
// Contrato de BOTÕES (item 10) — OPCIONAL e com FALLBACK:
//   POST {base}/message/sendButtons/{instance}
//   body: { number, text, buttons: [{ id, buttonText }] }
// A Evolution/WhatsApp impõe limites (1–3 botões, rótulo curto) e nem toda
// versão/instance expõe o endpoint. Por isso `montarEnvioBotoes` nunca é
// obrigatório: quando o envio interativo é recusado, o chamador cai no
// `montarEnvioTexto` com a listagem numerada — o fluxo nunca quebra por
// depender de recurso interativo.

export type ConfigEvolution = {
  /** Base pública da Evolution, ex.: https://xxx.up.railway.app */
  url: string
  /** Chave `apikey` — vive só nos secrets da função, nunca no navegador */
  apiKey: string
  /** Instância conectada, ex.: studio-audax */
  instancia: string
}

export type Botao = {
  /** id curto e estável, ex.: '1' */
  id: string
  /** rótulo visível, ex.: '13h30' */
  texto: string
}

export type PedidoEnvioTexto = {
  telefone: string
  mensagem: string
  /**
   * Botões interativos (opcional). Vazio/ausente = envio só de texto, que é
   * exatamente o comportamento anterior desta função.
   */
  botoes?: Botao[]
}

export type ResultadoEnvioTexto = {
  ok: boolean
  motivo?: string
}

export type EnvioMontado = {
  url: string
  init: RequestInit
}

/** Limite do WhatsApp: no máximo 3 botões por mensagem. */
export const MAX_BOTOES = 3
/** Rótulo de botão curto — acima disso o WhatsApp recusa. */
const MAX_TEXTO_BOTAO = 20
const MAX_ID_BOTAO = 12

/** Segredo ausente/malformado → a função não pode chamar a Evolution. */
export function validarConfig(
  config: Partial<ConfigEvolution> | null | undefined,
): string | null {
  if (!config) return 'Configuração da Evolution ausente.'
  if (!config.url || !/^https?:\/\//i.test(config.url)) {
    return 'Segredo EVOLUTION_API_URL ausente ou inválido.'
  }
  if (!config.apiKey) return 'Segredo EVOLUTION_API_KEY ausente.'
  if (!config.instancia) return 'Segredo EVOLUTION_INSTANCE ausente.'
  return null
}

/**
 * Apenas os dígitos (DDI+DDD+número) ou null quando não é utilizável.
 *
 * A Evolution/Baileys recusa celular brasileiro sem DDI (HTTP 400): um
 * número de 11 dígitos (`11988883593`) é completado com o 55 e vira
 * `5511988883593`. O que já vem com 13 dígitos e DDI 55 — ou com outro
 * DDI — passa intacto: o 55 nunca é duplicado.
 */
export function normalizarTelefone(telefone: unknown): string | null {
  if (typeof telefone !== 'string') return null
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) return null
  if (digitos.length === 11) return `55${digitos}`
  return digitos
}

/** Motivo da recusa ou null quando o pedido é válido. */
export function validarPedido(
  pedido: Partial<PedidoEnvioTexto> | null | undefined,
): string | null {
  if (!pedido) return 'Pedido de envio ausente.'
  if (normalizarTelefone(pedido.telefone) === null) return 'Telefone inválido.'
  const mensagem = typeof pedido.mensagem === 'string' ? pedido.mensagem.trim() : ''
  if (!mensagem) return 'Mensagem vazia.'
  if (mensagem.length > 4096) return 'Mensagem acima de 4096 caracteres.'
  return null
}

/**
 * Normaliza e limita os botões. Qualquer botão fora do formato é DESCARTADO
 * (não derruba o envio); uma lista que sobrou vazia devolve null e o chamador
 * envia texto puro.
 */
export function normalizarBotoes(botoes: unknown): Botao[] | null {
  if (!Array.isArray(botoes) || !botoes.length) return null
  const saida: Botao[] = []
  for (const bruto of botoes) {
    if (saida.length >= MAX_BOTOES) break
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) continue
    const item = bruto as Record<string, unknown>
    const texto =
      typeof item.text === 'string'
        ? item.text.trim().slice(0, MAX_TEXTO_BOTAO)
        : typeof item.buttonText === 'string'
          ? item.buttonText.trim().slice(0, MAX_TEXTO_BOTAO)
          : typeof item.texto === 'string'
            ? item.texto.trim().slice(0, MAX_TEXTO_BOTAO)
            : ''
    if (!texto) continue
    const id =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim().slice(0, MAX_ID_BOTAO)
        : String(saida.length + 1)
    saida.push({ id, texto })
  }
  return saida.length ? saida : null
}

/**
 * Monta a chamada à Evolution: URL com a instância da configuração e
 * requisição POST com a chave só no header. Lança se o pedido for inválido
 * (rede de segurança — o entrypoint valida antes de chegar aqui).
 */
export function montarEnvioTexto(
  config: ConfigEvolution,
  pedido: PedidoEnvioTexto,
): EnvioMontado {
  const numero = normalizarTelefone(pedido.telefone)
  const mensagem = typeof pedido.mensagem === 'string' ? pedido.mensagem.trim() : ''
  if (!numero) throw new Error('Telefone inválido.')
  if (!mensagem) throw new Error('Mensagem vazia.')
  const base = config.url.replace(/\/+$/, '')
  return {
    url: `${base}/message/sendText/${encodeURIComponent(config.instancia)}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({ number: numero, text: mensagem }),
    },
  }
}

/**
 * Monta a chamada de BOTÕES. Lança quando não há botão utilizável — o
 * chamador deve então usar `montarEnvioTexto` (fallback textual).
 */
export function montarEnvioBotoes(
  config: ConfigEvolution,
  pedido: PedidoEnvioTexto,
): EnvioMontado {
  const numero = normalizarTelefone(pedido.telefone)
  const mensagem = typeof pedido.mensagem === 'string' ? pedido.mensagem.trim() : ''
  if (!numero) throw new Error('Telefone inválido.')
  if (!mensagem) throw new Error('Mensagem vazia.')
  const botoes = normalizarBotoes(pedido.botoes)
  if (!botoes) throw new Error('Botões inválidos.')
  const base = config.url.replace(/\/+$/, '')
  return {
    url: `${base}/message/sendButtons/${encodeURIComponent(config.instancia)}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number: numero,
        text: mensagem,
        buttons: botoes.map((b) => ({ id: b.id, buttonText: b.texto })),
      }),
    },
  }
}

/**
 * Texto numerado equivalente aos botões — é o que entra no `montarEnvioTexto`
 * quando a Evolution recusa o envio interativo. Assim o cliente continua
 * vendo as opções mesmo sem suporte a botões.
 */
export function textoFallbackBotoes(botoes: Botao[]): string {
  return botoes.map((b, i) => `${i + 1}. ${b.texto}`).join('\n')
}

/** Traduz a resposta da Evolution em { ok } / { ok, motivo }. */
export function interpretarResposta(status: number, corpo: string): ResultadoEnvioTexto {
  if (status >= 200 && status < 300) return { ok: true }
  return { ok: false, motivo: extrairMotivo(status, corpo) }
}

function textoUtil(valor: unknown): string {
  if (typeof valor === 'string' && valor.trim()) return valor.trim()
  if (valor && typeof valor === 'object') {
    const mensagem = (valor as { message?: unknown }).message
    if (typeof mensagem === 'string' && mensagem.trim()) return mensagem.trim()
  }
  return ''
}

function extrairMotivo(status: number, corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { error?: unknown; message?: unknown }
    const encontrado = textoUtil(json.error) || textoUtil(json.message)
    if (encontrado) return encontrado.slice(0, 300)
  } catch {
    // corpo não é JSON: cai no motivo genérico por status
  }
  return `Evolution recusou o envio (HTTP ${status}).`
}
