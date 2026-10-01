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
//   sem token, sem service_role, sem Evolution API key (o segredo do
//   whatsapp-enviar vive só no ambiente daquela função);
// - Somente respostas em estado `gerada` são elegíveis; bloqueios e falhas
//   não geram envio nesta etapa;
// - Mensagem limitada a 4096 caracteres (mesmo teto do whatsapp-enviar).

export type PedidoEnvio = {
  telefone: string
  mensagem: string
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

/**
 * Monta a chamada à função `whatsapp-enviar`: serviço server-to-server
 * (Bearer = service_role, modo `secret` daquela função). O service_role vai
 * SOMENTE no header desta chamada interna — nunca no corpo, nunca na URL e
 * nunca em log. Lança com mensagem própria (sem dados do pedido) quando a
 * configuração é inválida.
 */
export function montarPedidoEnvio(
  base: string,
  serviceRole: string,
  pedido: PedidoEnvio,
): EnvioMontado {
  const urlBase = typeof base === 'string' ? base.trim().replace(/\/+$/, '') : ''
  if (!/^https?:\/\//i.test(urlBase)) {
    throw new Error('SUPABASE_URL ausente ou inválida.')
  }
  if (!serviceRole || !serviceRole.trim()) {
    throw new Error('service_role ausente no ambiente da função.')
  }
  const telefone = normalizarNumero(pedido.telefone)
  if (!telefone) throw new Error('Telefone do destinatário inválido.')
  const mensagem = typeof pedido.mensagem === 'string' ? pedido.mensagem.trim() : ''
  if (!mensagem) throw new Error('Mensagem vazia.')
  if (mensagem.length > 4096) throw new Error('Mensagem acima de 4096 caracteres.')
  return {
    url: `${urlBase}/functions/v1/whatsapp-enviar`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRole}`,
      },
      body: JSON.stringify({ telefone, mensagem }),
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
