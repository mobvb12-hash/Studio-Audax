// Edge Function `whatsapp-enviar` — envio de mensagem via Evolution API.
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
//
// Corpo do pedido: EXATAMENTE { telefone, mensagem } e, OPCIONALMENTE,
// `botoes` (item 10). Nenhuma credencial, chave ou token trafega no corpo.
//
// Botões SEMPRE com fallback (regra do item 10): se houver botões válidos, a
// função tenta `message/sendButtons`; se a Evolution recusar (endpoint
// inexistente na versão, rótulo inválido, limite da conta), a função reenvia
// o MESMO conteúdo como texto numerado por `message/sendText`. O cliente vê
// as opções nos dois casos — o fluxo nunca quebra por recurso interativo.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import {
  interpretarResposta,
  montarEnvioBotoes,
  montarEnvioTexto,
  normalizarBotoes,
  textoFallbackBotoes,
  validarConfig,
  validarPedido,
  type EnvioMontado,
} from './evolution.ts'

const TIMEOUT_ENVIO_MS = 15_000

function responder(status: number, corpo: unknown): Response {
  return Response.json(corpo, { status })
}

/** Executa a chamada já montada (chave só no header) e devolve status+corpo. */
async function enviar(montado: EnvioMontado) {
  const resposta = await fetch(montado.url, {
    ...montado.init,
    signal: AbortSignal.timeout(TIMEOUT_ENVIO_MS),
  })
  return { status: resposta.status, corpo: await resposta.text() }
}

/** Normaliza telefone para comparação (apenas dígitos, com DDI 55 se 11 dígitos). */
function normalizarTelefoneDestino(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length === 11) return `55${digitos}`
  return digitos
}

/**
 * Valida se o destino é permitido para envio.
 * Permite:
 * - Números de profissionais ativos com whatsapp_notificacao preenchido
 * - Números de clientes com agendamento futuro/hoje (via agendamentos)
 * - O número de teste IA_NUMERO_TESTE (para respostas da IA)
 */
async function validarDestino(
  supabase: unknown,
  telefone: string,
  numeroTeste: string,
): Promise<{ valido: boolean; motivo?: string }> {
  const telefoneNorm = normalizarTelefoneDestino(telefone)
  const testeNorm = normalizarTelefoneDestino(numeroTeste)

  // Sempre permite o número de teste configurado
  if (testeNorm && telefoneNorm === testeNorm) {
    return { valido: true }
  }

  // Cast para tipo com método from()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as { from: (table: string) => { select: (columns?: string) => { eq: (col: string, val: any) => any; not: (col: string, op: string, val: any) => any; neq: (col: string, val: any) => any; gte: (col: string, val: any) => any; in: (col: string, val: any[]) => any; then: (onfulfilled?: any) => any } } }

  // Verifica se é WhatsApp de profissional ativo
  const { data: profissionais, error: errProf } = await db
    .from('profissionais')
    .select('whatsapp_notificacao')
    .eq('ativo', true)
    .not('whatsapp_notificacao', 'is', null)
    .neq('whatsapp_notificacao', '')

  if (errProf) {
    console.error('[whatsapp-enviar] Erro ao buscar profissionais:', errProf.message)
  } else if (profissionais) {
    for (const prof of profissionais) {
      if (normalizarTelefoneDestino(prof.whatsapp_notificacao) === telefoneNorm) {
        return { valido: true }
      }
    }
  }

  // Verifica se é telefone de cliente com agendamento futuro/hoje
  const hoje = new Date().toISOString().split('T')[0]
  const { data: agendamentos, error: errAg } = await db
    .from('agendamentos')
    .select('telefone')
    .gte('data', hoje)
    .in('status', ['pendente', 'confirmado'])
    .eq('telefone', telefone)

  if (errAg) {
    console.error('[whatsapp-enviar] Erro ao buscar agendamentos:', errAg.message)
  } else if (agendamentos && agendamentos.length > 0) {
    return { valido: true }
  }

  return { valido: false, motivo: 'Destino não autorizado para envio.' }
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
    const bruto = (corpo ?? {}) as {
      telefone?: unknown
      mensagem?: unknown
      botoes?: unknown
    }
    const pedido = {
      telefone: typeof bruto.telefone === 'string' ? bruto.telefone : '',
      mensagem: typeof bruto.mensagem === 'string' ? bruto.mensagem : '',
    }
    const problemaPedido = validarPedido(pedido)
    if (problemaPedido) {
      return responder(400, { ok: false, motivo: problemaPedido })
    }

    // Validação de destino: só permite envio para números autorizados
    const numeroTeste = (Deno.env.get('IA_NUMERO_TESTE') ?? '').trim()
    const validacaoDestino = await validarDestino(ctx.supabase, pedido.telefone, numeroTeste)
    if (!validacaoDestino.valido) {
      return responder(403, { ok: false, motivo: validacaoDestino.motivo })
    }

    const botoes = normalizarBotoes(bruto.botoes)

    // Caminho interativo — opcional; a recusa vira fallback textual.
    if (botoes) {
      const mensagemComFallback = `${pedido.mensagem.trim()}\n${textoFallbackBotoes(botoes)}`.slice(
        0,
        4096,
      )
      try {
        const primeira = await enviar(montarEnvioBotoes(config, { ...pedido, botoes }))
        const resultado = interpretarResposta(primeira.status, primeira.corpo)
        if (resultado.ok) return responder(200, { ok: true, formato: 'botoes' })
        // Recusado → mesmo conteúdo, agora numerado em texto.
        const alternativa = await enviar(
          montarEnvioTexto(config, { ...pedido, mensagem: mensagemComFallback }),
        )
        const fallback = interpretarResposta(alternativa.status, alternativa.corpo)
        return responder(
          fallback.ok ? 200 : 502,
          fallback.ok
            ? { ok: true, formato: 'texto', motivoInterativo: resultado.motivo ?? null }
            : fallback,
        )
      } catch {
        // Falha de rede/montagem no interativo: tenta o texto e, se também
        // falhar, devolve o motivo já saneado.
        try {
          const alternativa = await enviar(
            montarEnvioTexto(config, { ...pedido, mensagem: mensagemComFallback }),
          )
          const fallback = interpretarResposta(alternativa.status, alternativa.corpo)
          return responder(fallback.ok ? 200 : 502, fallback)
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
    }

    // Caminho de texto — comportamento original, inalterado.
    try {
      const resposta = await enviar(montarEnvioTexto(config, pedido))
      const resultado = interpretarResposta(resposta.status, resposta.corpo)
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
