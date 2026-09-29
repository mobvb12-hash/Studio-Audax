// Edge Function `whatsapp-enviar` — envio de texto via Evolution API.
//
// Segredos SOMENTE no ambiente da função (Supabase secrets / CLI):
//   EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
// O navegador apenas invoca esta função pelo nome (functions.invoke) e
// jamais vê URL, chave ou instância da Evolution.
//
// Autorização: só entra quem tem sessão de usuário válida (modo `user`) ou
// a secret key de servidor (modo `secret`, server-to-server). A anon key
// sozinha não envia nada — inclusive o JWT de papel `anon` que o cliente
// envia quando não há sessão, recusado pelo papel abaixo.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import {
  interpretarResposta,
  montarEnvioTexto,
  validarConfig,
  validarPedido,
} from './evolution.ts'

const TIMEOUT_ENVIO_MS = 15_000

function responder(status: number, corpo: unknown): Response {
  return Response.json(corpo, { status })
}

export default {
  fetch: withSupabase({ auth: ['user', 'secret'] }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return responder(405, { ok: false, motivo: 'Método não permitido.' })
    }

    const chamadaInterna = ctx.authMode === 'secret'
    const usuarioValido = ctx.authMode === 'user' && ctx.userClaims?.role === 'authenticated'
    if (!chamadaInterna && !usuarioValido) {
      return responder(401, {
        ok: false,
        motivo: 'Sessão inválida ou ausente para enviar mensagens.',
      })
    }

    const config = {
      url: Deno.env.get('EVOLUTION_API_URL') ?? '',
      apiKey: Deno.env.get('EVOLUTION_API_KEY') ?? '',
      instancia: Deno.env.get('EVOLUTION_INSTANCE') ?? '',
    }
    const problemaConfig = validarConfig(config)
    if (problemaConfig) {
      return responder(500, { ok: false, motivo: problemaConfig })
    }

    let corpo: unknown
    try {
      corpo = await req.json()
    } catch {
      return responder(400, { ok: false, motivo: 'Corpo da requisição inválido.' })
    }
    const bruto = (corpo ?? {}) as { telefone?: unknown; mensagem?: unknown }
    const pedido = {
      telefone: typeof bruto.telefone === 'string' ? bruto.telefone : '',
      mensagem: typeof bruto.mensagem === 'string' ? bruto.mensagem : '',
    }
    const problemaPedido = validarPedido(pedido)
    if (problemaPedido) {
      return responder(400, { ok: false, motivo: problemaPedido })
    }

    const { url, init } = montarEnvioTexto(config, pedido)
    try {
      const resposta = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
      })
      const texto = await resposta.text()
      const resultado = interpretarResposta(resposta.status, texto)
      return responder(resultado.ok ? 200 : 502, resultado)
    } catch (erro) {
      const estourou = erro instanceof Error && erro.name === 'TimeoutError'
      return responder(502, {
        ok: false,
        motivo: estourou
          ? 'A Evolution não respondeu em 15s.'
          : 'Falha ao contatar a Evolution API.',
      })
    }
  }),
}
