// FASE 3 — integração segura entre a resposta GERADA pela IA e a função
// existente `whatsapp-enviar` (funções puras, sem Deno e sem rede).
//
// Regras desta etapa (imutáveis aqui):
// - NÃO existe um segundo envio: o pedido sai SEMPRE por
//   POST {SUPABASE_URL}/functions/v1/whatsapp-enviar — a Evolution só é
//   falada pelaquele módulo, nunca por este;
// - O destinatário NUNCA vem da IA: é o remetente do evento RECEBIDO e,
//   ainda assim, precisa estar na lista de teste (IA_NUMERO_TESTE) — sem
//   secret de número configurado, NADA é enviado;
// - O corpo do pedido tem EXATAMENTE { telefone, mensagem } — sem chave,
//   sem token, sem credencial alguma no corpo (a credencial server-to-server
//   viaja só no header `apikey`, lida do ambiente);
// - A credencial é EXCLUSIVAMENTE SUPABASE_SECRET_KEYS["default"]
//   (formato sb_secret_*), exigida pelo modo `secret` do whatsapp-enviar.
//   Sem ela o envio NÃO acontece (falha segura) e NUNCA se usa
//   SUPABASE_SERVICE_ROLE_KEY como fallback (era a causa do HTTP 401:
//   legacy eyJ rejeitado pelo withSupabase como INVALID_JWT);
// - Somente respostas em estado `gerada` são elegíveis; bloqueios e falhas
//   não geram envio nesta etapa;
// - Mensagem limitada a 4096 caracteres (mesmo teto do whatsapp-enviar).

export type BotaoEnvio = { id: string; texto: string }

export type PedidoEnvio = {
  telefone: string
  mensagem: string
  /**
   * Botões interativos (item 10) — OPCIONAL. Quando presentes, o
   * `whatsapp-enviar` tenta o envio interativo e cai para texto numerado
   * se a Evolution recusar. Ausentes = comportamento idêntico ao anterior.
   */
  botoes?: BotaoEnvio[]
}

export type EnvioMontado = {
  url: string
  init: RequestInit
}

export type ResultadoEnvio = {
  ok: boolean
  motivo?: string
}

/**
 * Normaliza para comparação/envio: só dígitos (8 a 15) e DDI 55 quando o
 * número brasileiro chega com 11 dígitos. Idempotente para `55…` (13).
 */
export function normalizarNumero(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length < 8 || digitos.length > 15) return null
  if (digitos.length === 11) return `55${digitos}`
  return digitos
}

export type DecisaoEnvio = {
  estado: string
  resposta: string | null
  /** dígitos do remetente do evento (fonte única do destinatário) */
  remetente: string | null
  /** valor do secret IA_NUMERO_TESTE (lista de teste) */
  numeroTeste: string | null
}

/**
 * Enviar somente quando: resposta GERADA + remetente conhecido + número de
 * teste configurado + normalização de ambos idêntica. Qualquer dúvida → false.
 */
export function deveEnviarResposta(decisao: DecisaoEnvio): boolean {
  if (decisao.estado !== 'gerada') return false
  const resposta = typeof decisao.resposta === 'string' ? decisao.resposta.trim() : ''
  if (!resposta) return false
  const destino = normalizarNumero(decisao.remetente)
  const teste = normalizarNumero(decisao.numeroTeste)
  if (!destino || !teste) return false
  return destino === teste
}

/** Diagnóstico de FORMATO do bloqueio — só contagens/booleans, NUNCA números. */
export type DiagnosticoDestino = {
  digitosDestino: number | null
  digitosTeste: number | null
  destinoComeca55: boolean
  testeComeca55: boolean
  mesmoFormato: boolean
  mesmoNumero: boolean
}

/**
 * Reproduz a MESMA comparação de `deveEnviarResposta` (normalizar os dois
 * lados com `normalizarNumero`) e devolve apenas metadados de formato para
 * o log do bloqueio `destinatario-nao-autorizado`: quantidades de dígitos,
 * prefixo 55 e os resultados de igualdade. Os números nunca saem daqui.
 */
export function montarDiagnosticoDestino(
  remetente: unknown,
  numeroTeste: unknown,
): DiagnosticoDestino {
  const destino = normalizarNumero(remetente)
  const teste = normalizarNumero(numeroTeste)
  const ambos = destino !== null && teste !== null
  return {
    digitosDestino: destino === null ? null : destino.length,
    digitosTeste: teste === null ? null : teste.length,
    destinoComeca55: destino !== null && destino.startsWith('55'),
    testeComeca55: teste !== null && teste.startsWith('55'),
    mesmoFormato: ambos && destino.length === teste.length,
    mesmoNumero: ambos && destino === teste,
  }
}

/**
 * Lê a credencial server-to-server SOMENTE do ambiente: JSON
 * `SUPABASE_SECRET_KEYS` com a chave `default` (formato `sb_secret_*`).
 * Ausente/malformado/sém `default`/prefixo errado → null (falha segura:
 * quem chama NÃO envia). NUNCA cai para SUPABASE_SERVICE_ROLE_KEY.
 */
export function lerChaveSecreta(ler: (nome: string) => string | undefined): string | null {
  const bruto = (ler('SUPABASE_SECRET_KEYS') ?? '').trim()
  if (!bruto) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(bruto)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const valor = (parsed as Record<string, unknown>).default
  if (typeof valor !== 'string') return null
  const chave = valor.trim()
  if (!chave.startsWith('sb_secret_')) return null
  return chave
}

/** Até 3 botões, id curto, rótulo curto — mesmos limites do WhatsApp. */
const MAX_BOTOES = 3
const MAX_TEXTO_BOTAO = 20

/**
 * Botões utilizáveis de um pedido, ou null. Descarta o que estiver fora do
 * formato em vez de recusar o envio: um botão ruim não pode impedir a
 * mensagem de sair.
 */
export function botoesUtilizaveis(botoes: unknown): BotaoEnvio[] | null {
  if (!Array.isArray(botoes) || !botoes.length) return null
  const saida: BotaoEnvio[] = []
  for (const bruto of botoes) {
    if (saida.length >= MAX_BOTOES) break
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) continue
    const item = bruto as Record<string, unknown>
    const texto = typeof item.texto === 'string' ? item.texto.trim().slice(0, MAX_TEXTO_BOTAO) : ''
    if (!texto) continue
    saida.push({
      id: String(saida.length + 1),
      texto,
    })
  }
  return saida.length ? saida : null
}

/**
 * Monta a chamada à função `whatsapp-enviar`: modo `secret` do withSupabase,
 * que lê o header `apikey` (o `Authorization: Bearer` com credencial legada
 * era rejeitado como INVALID_JWT). A chave vai SOMENTE neste header — nunca
 * no corpo, nunca na URL, nunca em log. Lança com mensagem própria (sem
 * conter a chave) quando a configuração é inválida.
 *
 * O corpo leva `botoes` apenas quando o pedido os traz: sem eles, o corpo é
 * byte a byte o que já era antes (`{ telefone, mensagem }`).
 */
export function montarPedidoEnvio(
  base: string,
  chaveSecreta: string,
  pedido: PedidoEnvio,
): EnvioMontado {
  const urlBase = typeof base === 'string' ? base.trim().replace(/\/+$/, '') : ''
  if (!/^https?:\/\//i.test(urlBase)) {
    throw new Error('SUPABASE_URL ausente ou inválida.')
  }
  const chave = typeof chaveSecreta === 'string' ? chaveSecreta.trim() : ''
  if (!chave.startsWith('sb_secret_')) {
    throw new Error('Credencial de envio ausente ou inválida.')
  }
  const telefone = normalizarNumero(pedido.telefone)
  if (!telefone) throw new Error('Telefone do destinatário inválido.')
  const mensagem = typeof pedido.mensagem === 'string' ? pedido.mensagem.trim() : ''
  if (!mensagem) throw new Error('Mensagem vazia.')
  if (mensagem.length > 4096) throw new Error('Mensagem acima de 4096 caracteres.')
  const botoes = botoesUtilizaveis(pedido.botoes)
  return {
    url: `${urlBase}/functions/v1/whatsapp-enviar`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: chave,
      },
      body: JSON.stringify(botoes ? { telefone, mensagem, botoes } : { telefone, mensagem }),
    },
  }
}

/** Interpreta a resposta do whatsapp-enviar sem vazar corpo arbitrário. */
export function interpretarEnvio(status: number, corpo: string): ResultadoEnvio {
  const generico = `O envio não foi confirmado (HTTP ${status}).`
  try {
    const json = JSON.parse(corpo) as { ok?: unknown; motivo?: unknown }
    if (status >= 200 && status < 300 && json.ok === true) return { ok: true }
    const motivo =
      typeof json.motivo === 'string' && json.motivo.trim()
        ? json.motivo.trim().slice(0, 300)
        : generico
    return { ok: false, motivo }
  } catch {
    return { ok: false, motivo: generico }
  }
}
