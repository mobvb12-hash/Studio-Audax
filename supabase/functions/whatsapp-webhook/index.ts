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
  variantesConfiguracao,
} from './evento.ts'
import {
  interpretarRespostaIa,
  lerConfigIa,
  mapearFontes,
  processarMensagem,
} from './ia.ts'

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
    // ValidationPipe do NestJS devolve `message: string[]` — é ali que está
    // o motivo real (ex.: valores aceitos de enum), não em `error`.
    if (Array.isArray(json.message)) {
      const partes = json.message.filter((item): item is string => typeof item === 'string')
      if (partes.length) return partes.join('; ').slice(0, 300)
    }
    if (typeof json.message === 'string' && json.message.trim()) {
      return json.message.trim().slice(0, 300)
    }
    if (typeof json.error === 'string' && json.error.trim()) {
      return json.error.trim().slice(0, 300)
    }
    if (json.error !== null && typeof json.error === 'object') {
      const erro = json.error as { message?: unknown }
      if (typeof erro.message === 'string' && erro.message.trim()) {
        return erro.message.trim().slice(0, 300)
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
          // A instância real recusa a forma da doc 2.3.7 com 400 sem detalhes
          // e não expõe OpenAPI: testa as variantes conhecidas em sequência
          // até a primeira aceitação (POST idempotente de configuração).
          const destinoSet = `${base}/webhook/set/${encodeURIComponent(segredos.instancia)}`
          const tentativas: { variante: string; status: number; corpo: string }[] = []
          for (const variante of variantesConfiguracao(destino)) {
            let status = 0
            let texto = ''
            try {
              const resposta = await fetch(destinoSet, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: segredos.apiKey },
                body: JSON.stringify(variante.corpo),
                signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
              })
              status = resposta.status
              texto = await resposta.text()
            } catch (erro) {
              const estourou = erro instanceof Error && erro.name === 'TimeoutError'
              return responder(502, {
                ok: false,
                motivo: estourou
                  ? 'A Evolution não respondeu em 15s.'
                  : 'Falha ao contatar a Evolution API.',
              })
            }
            if (status >= 200 && status < 300) {
              console.log(
                '[whatsapp-webhook]',
                JSON.stringify({ acao, configurado: true, variante: variante.descricao, webhook: destino }),
              )
              return responder(200, {
                ok: true,
                configurado: true,
                variante: variante.descricao,
                webhook: destino,
                eventos: ['MESSAGES_UPSERT'],
              })
            }
            tentativas.push({ variante: variante.descricao, status, corpo: texto.slice(0, 250) })
          }
          console.log(
            '[whatsapp-webhook]',
            JSON.stringify({
              acao,
              configurado: false,
              tentativas: tentativas.map((item) => ({ variante: item.variante, status: item.status })),
            }),
          )
          return responder(502, {
            ok: false,
            motivo: 'Nenhuma variante de corpo foi aceita pela Evolution.',
            tentativas,
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

        // Diagnóstico: lê a especificação OpenAPI da instância Evolution REAL
        // (a doc pública 2.3.7 divergiu do servidor) e devolve somente os
        // fragmentos dos caminhos de webhook — nunca a URL base da Evolution.
        if (acao === 'evolution-spec') {
          const candidatos = ['openapi.json', 'docs-json', 'api-json', 'swagger-json']
          const tentativas: { ponto: string; status: number }[] = []
          let espec: Record<string, unknown> | null = null
          for (const ponto of candidatos) {
            let status = 0
            try {
              const resposta = await fetch(`${base}/${ponto}`, {
                headers: { apikey: segredos.apiKey },
                signal: AbortSignal.timeout(8_000),
              })
              status = resposta.status
              const texto = await resposta.text()
              if (resposta.ok && texto.trim().startsWith('{')) {
                const json = JSON.parse(texto) as Record<string, unknown>
                if (json && typeof json === 'object' && json.paths) {
                  espec = json
                }
              }
            } catch {
              status = 0
            }
            tentativas.push({ ponto, status })
            if (espec) break
          }
          if (!espec) {
            return responder(200, { ok: true, espec: null, tentativas })
          }
          const caminhos = (espec.paths ?? {}) as Record<string, Record<string, unknown>>
          const webhook: Record<string, unknown> = {}
          for (const [caminho, metodos] of Object.entries(caminhos)) {
            if (!/webhook/i.test(caminho)) continue
            for (const [metodo, operacao] of Object.entries(metodos)) {
              const op = operacao as {
                requestBody?: { content?: Record<string, { schema?: unknown }> }
              }
              const schema = op?.requestBody?.content?.['application/json']?.schema
              if (schema) webhook[`${metodo.toUpperCase()} ${caminho}`] = schema
            }
          }
          const info = espec.info as { version?: unknown } | undefined
          return responder(200, {
            ok: true,
            tentativas,
            versao: typeof info?.version === 'string' ? info.version : null,
            webhook,
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

    // A Evolution inclui uma apikey no corpo do evento. O valor pode ser a
    // chave global ou o token da instância (não sabemos qual esta versão
    // usa), então a comparação é SINAL DE LOG — nunca barreira: rejeitar
    // custaria o teste real de recebimento. O evento não tem efeito colateral
    // algum além do log abaixo.
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

    // ---------------------------------------------------------------------
    // Camada inicial de IA — somente perguntas informativas com dados
    // oficiais (etapa 1). Esta etapa NÃO envia resposta: o resultado é apenas
    // medido em log (envio automático pendente; sem IA_URL/IA_API_KEY/
    // IA_MODELO a camada fica inerte). Fontes: exclusivamente as funções
    // públicas SECURITY DEFINER já existentes (catálogo + expediente) lidas
    // com o cliente anônimo — nunca service_role, nunca escrita no banco.
    // ---------------------------------------------------------------------
    if (evento.recebida && evento.texto) {
      const resultadoIa = await processarMensagem({
        texto: evento.texto,
        config: lerConfigIa((nome) => Deno.env.get(nome)),
        carregarFontes: async () => {
          const [catalogo, slots] = await Promise.all([
            ctx.supabase.rpc('agendamento_publico_catalogo'),
            ctx.supabase.rpc('agendamento_publico_slots', {
              p_data: new Date().toISOString().slice(0, 10),
            }),
          ])
          if (catalogo.error || slots.error) {
            throw new Error('fontes oficiais indisponíveis')
          }
          return mapearFontes(catalogo.data, slots.data)
        },
        gerar: async (requisicao) => {
          const resposta = await fetch(requisicao.url, {
            ...requisicao.init,
            signal: AbortSignal.timeout(20_000),
          })
          return interpretarRespostaIa(resposta.status, await resposta.text())
        },
      })
      // Somente metadados: nenhum texto de mensagem é registrado aqui.
      console.log(
        '[whatsapp-ia]',
        JSON.stringify({
          intencao: resultadoIa.intencao.tipo,
          motivo:
            resultadoIa.intencao.tipo === 'bloqueada' ? resultadoIa.intencao.motivo : null,
          estado: resultadoIa.estado,
          respostaTamanho: (resultadoIa.resposta ?? '').length,
        }),
      )
      // Sem envio nesta etapa: resposta gerada fica aqui (pendência documentada).
    }

    // Sempre 200: não há auto-resposta ao cliente nem rejeição em cascata —
    // a Evolution não precisa reenviar o que já foi entregue.
    return responder(200, { ok: true, recebido: evento.reconhecido })
  }),
}
