// Edge Function `whatsapp-webhook` — caminho inverso WhatsApp → Evolution → Studio Audax.
//
// O que esta função FAZ:
//   1. Recebe os eventos que a Evolution API entrega em
//      POST {SUPABASE_URL}/functions/v1/whatsapp-webhook (sem JWT — a
//      Evolution não conhece o Supabase; por isso `auth: 'none'` e o
//      verificado `verify_jwt = false` em config.toml).
//   2. Interpreta o payload (módulo puro ./evento.ts), valida APENAS a forma
//      esperada e registra metadados mascarados em console.log — a prova do
//      teste de recebimento vem daí, via Management API de logs.
//   3. Expõe as ações `configurar-webhook` / `consultar-webhook` que falam com
//      a Evolution (webhook/set e webhook/find). Exige sessão de usuário
//      válida (mesmo portão do whatsapp-enviar) — a anon key não configura nada.
//
// O que esta função NÃO faz (regra da etapa):
//   - não responde a mensagem de WhatsApp (nenhum fetch de envio);
//   - não persiste nada (nenhuma escrita em banco, nenhuma tabela nova);
//   - não guarda dados pessoais: o log carrega só texto mascarado e tamanho.
// Segredos (EVOLUTION_*, SUPABASE_URL) vivem somente no ambiente da função;
// a apikey que a Evolution coloca NO CORPO do evento nunca é logada nem devolvida.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import {
  ehMensagemDeTeste,
  interpretarEventoWebhook,
  montarCorpoConfiguracao,
} from './evento.ts'

const TIMEOUT_EVOLUTION_MS = 15_000

function responder(status: number, corpo: unknown): Response {
  return Response.json(corpo, { status })
}

function lerSegredos(): {
  evolution: string
  apiKey: string
  instancia: string
  base: string
} {
  return {
    evolution: Deno.env.get('EVOLUTION_API_URL') ?? '',
    apiKey: Deno.env.get('EVOLUTION_API_KEY') ?? '',
    instancia: Deno.env.get('EVOLUTION_INSTANCE') ?? '',
    base: Deno.env.get('SUPABASE_URL') ?? '',
  }
}

function validarSegredos(segredos: {
  evolution: string
  apiKey: string
  instancia: string
  base: string
}): string | null {
  if (!segredos.evolution || !/^https?:\/\//i.test(segredos.evolution)) {
    return 'Segredo EVOLUTION_API_URL ausente ou inválido.'
  }
  if (!segredos.apiKey) return 'Segredo EVOLUTION_API_KEY ausente.'
  if (!segredos.instancia) return 'Segredo EVOLUTION_INSTANCE ausente.'
  if (!segredos.base || !/^https?:\/\//i.test(segredos.base)) {
    return 'Segredo SUPABASE_URL ausente.'
  }
  return null
}

/** URL canônica do webhook derivada do SUPABASE_URL — nunca inventada. */
function urlWebhook(base: string): string {
  return `${base.replace(/\/+$/, '')}/functions/v1/whatsapp-webhook`
}

/** Motivo legível da Evolution sem vazar corpo arbitrário (máx. 300 chars). */
function motivoEvolution(status: number, corpo: string): string {
  try {
    const json = JSON.parse(corpo) as { message?: unknown; error?: unknown }
    for (const valor of [json.message, json.error]) {
      if (typeof valor === 'string' && valor.trim()) return valor.trim().slice(0, 300)
    }
    if (json.error !== null && typeof json.error === 'object') {
      const mensagem = (json.error as { message?: unknown }).message
      if (typeof mensagem === 'string' && mensagem.trim()) {
        return mensagem.trim().slice(0, 300)
      }
    }
  } catch {
    // corpo não-JSON → cai no genérico abaixo
  }
  return `Evolution recusou a operação (HTTP ${status}).`
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return responder(405, { ok: false, motivo: 'Método não permitido.' })
    }

    let corpo: unknown
    try {
      corpo = await req.json()
    } catch {
      return responder(400, { ok: false, motivo: 'Corpo da requisição inválido.' })
    }

    const segredos = lerSegredos()
    const acao = (corpo as { acao?: unknown } | null)?.acao

    // ---------------------------------------------------------------------
    // Ações de configuração do webhook na Evolution (somente sessão válida)
    // ---------------------------------------------------------------------
    if (typeof acao === 'string') {
      const token = (req.headers.get('authorization') ?? '')
        .replace(/^Bearer\s+/i, '')
        .trim()
      if (!token) {
        return responder(401, { ok: false, motivo: 'Sessão inválida ou ausente.' })
      }
      const { data, error } = await ctx.supabase.auth.getUser(token)
      if (error || !data.user || data.user.role !== 'authenticated') {
        return responder(401, { ok: false, motivo: 'Sessão inválida ou ausente.' })
      }

      const problema = validarSegredos(segredos)
      if (problema) return responder(500, { ok: false, motivo: problema })

      const base = segredos.evolution.replace(/\/+$/, '')
      const destino = urlWebhook(segredos.base)
      try {
        if (acao === 'configurar-webhook') {
          const resposta = await fetch(
            `${base}/webhook/set/${encodeURIComponent(segredos.instancia)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: segredos.apiKey },
              body: JSON.stringify(montarCorpoConfiguracao(destino)),
              signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
            },
          )
          const texto = await resposta.text()
          if (!resposta.ok) {
            return responder(502, { ok: false, motivo: motivoEvolution(resposta.status, texto) })
          }
          console.log(
            '[whatsapp-webhook]',
            JSON.stringify({ acao, configurado: true, webhook: destino }),
          )
          return responder(200, {
            ok: true,
            configurado: true,
            webhook: destino,
            eventos: ['MESSAGES_UPSERT'],
          })
        }

        if (acao === 'consultar-webhook') {
          const resposta = await fetch(
            `${base}/webhook/find/${encodeURIComponent(segredos.instancia)}`,
            {
              headers: { apikey: segredos.apiKey },
              signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
            },
          )
          const texto = await resposta.text()
          if (!resposta.ok) {
            return responder(502, { ok: false, motivo: motivoEvolution(resposta.status, texto) })
          }
          let bruto: unknown
          try {
            bruto = JSON.parse(texto)
          } catch {
            return responder(502, { ok: false, motivo: 'Resposta inválida da Evolution.' })
          }
          const registro = (bruto ?? {}) as { enabled?: unknown; url?: unknown; events?: unknown }
          return responder(200, {
            ok: true,
            configuracao: {
              enabled: registro.enabled === true,
              url: typeof registro.url === 'string' ? registro.url : '',
              events: Array.isArray(registro.events)
                ? registro.events.filter((evento): evento is string => typeof evento === 'string')
                : [],
            },
          })
        }

        return responder(400, { ok: false, motivo: 'Ação desconhecida.' })
      } catch (erro) {
        const estourou = erro instanceof Error && erro.name === 'TimeoutError'
        return responder(502, {
          ok: false,
          motivo: estourou
            ? 'A Evolution não respondeu em 15s.'
            : 'Falha ao contatar a Evolution API.',
        })
      }
    }

    // ---------------------------------------------------------------------
    // Evento entregue pela Evolution (sem credenciais Supabase)
    // ---------------------------------------------------------------------
    const evento = interpretarEventoWebhook(corpo)

    // A Evolution inclui a apikey da instância no corpo do evento. Se vier,
    // precisa bater com o segredo (barreira contra payload forjado); se não
    // vier, aceitamos pela forma — nada é feito com o evento de qualquer
    // maneira além do log abaixo.
    const apikeyBruta = (corpo as { apikey?: unknown } | null)?.apikey
    const apikeyCorresponde =
      typeof apikeyBruta === 'string' && segredos.apiKey
        ? apikeyBruta === segredos.apiKey
        : null

    console.log(
      '[whatsapp-webhook]',
      JSON.stringify({
        evento: evento.evento,
        reconhecido: evento.reconhecido,
        motivo: evento.motivo,
        ehMensagem: evento.ehMensagem,
        recebida: evento.recebida,
        textoTamanho: (evento.texto ?? '').length,
        ehTeste: ehMensagemDeTeste(evento.texto),
        remetente: evento.remetente,
        idMensagem: evento.idMensagem,
        apikeyPresente: evento.apikeyPresente,
        apikeyCorresponde,
        chaves: evento.chaves,
      }),
    )

    if (apikeyCorresponde === false) {
      return responder(401, { ok: false, motivo: 'Chave de instância inválida no payload.' })
    }

    // Sempre 200: não há auto-resposta ao cliente nem rejeição em cascata —
    // a Evolution não precisa reenviar o que já foi entregue.
    return responder(200, { ok: true, recebido: evento.reconhecido })
  }),
}
