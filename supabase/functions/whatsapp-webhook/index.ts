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
//   - não responde qualquer cliente: a FASE 3 envia a resposta GERADA da IA
//     SOMENTE ao número de teste autorizado (secret IA_NUMERO_TESTE) — sem
//     secret de número configurado, nada sai;
//   - não guarda credenciais: nenhum secret/token vai para banco ou log;
//   - não guarda dados pessoais além do padrão do projeto: o contexto da
//     conversa (telefone em dígitos como chave + JSONB com rascunho e
//     histórico) é PERSISTENTE via RPCs service_role da migration 016 com
//     TTL de 30 minutos — antes vivia em Map na memória do isolate, que NÃO
//     sobrevive entre invocações e perdia o contexto entre mensagens;
//   - logs continuam mascarados: telefone/ids só em forma mascarada, o
//     texto recebido do cliente nunca é logado.
// Segredos (EVOLUTION_*, SUPABASE_URL, IA_*) vivem somente no ambiente da
// função; a apikey que a Evolution coloca NO CORPO do evento nunca é logada
// nem devolvida. O envio sai exclusivamente pela função existente
// `whatsapp-enviar` (header `apikey` com SUPABASE_SECRET_KEYS) — esta
// função nunca fala com a
// Evolution para enviar.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { withSupabase } from '@supabase/server'
import {
  extrairRemetente,
  ehMensagemDeTeste,
  interpretarEventoWebhook,
  mascararRemetente,
  variantesConfiguracao,
} from './evento.ts'
import {
  deveEnviarResposta,
  interpretarEnvio,
  lerChaveSecreta,
  montarDiagnosticoDestino,
  montarPedidoEnvio,
  normalizarNumero,
} from './envio.ts'
import {
  type FontesOficiais,
  classificarIntencao,
  deveIrParaConversa,
  identificarServico,
  interpretarRespostaIa,
  lerConfigIa,
  mapearFontes,
  processarMensagem,
  type ResultadoProcessamento,
} from './ia.ts'
import {
  mapearPacoteSlots,
  processarConversa,
  type ContextoConversa,
  type SaidaConversa,
} from './conversa.ts'
import { comTurnos, criarArmazenamentoRpc, criarMemoria, criarRecentes } from './memoria.ts'
import {
  interpretarAgendamentos,
  interpretarRpc,
  montarRpcSecreto,
  motivoSeguro,
  type ResultadoRpc,
  type RpcAutorizada,
} from './acoes.ts'

const TIMEOUT_EVOLUTION_MS = 15_000

// FASE 5/6 — contexto conversacional e deduplicação são PERSISTENTES nas
// tabelas/RPCs da migration 016 (banco é a fonte de verdade). Nenhum Map em
// memória no nível do módulo: cada invocação pode rodar em outro isolate, e
// as instâncias abaixo são construídas por requisição sem estado entre
// chamadas.

/** Data de hoje no fuso do Studio (America/Recife) — YYYY-MM-DD. */
function dataLocalRecife(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

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
    // FASE 3/5 — roteamento da mensagem recebida:
    //   1. interna → recusa fixa (fluxo intacto, sem envio);
    //   2. ação detectada (ou rascunho pendente) → conversa DETERMINÍSTICA
    //      de ./conversa.ts (criar/cancelar/remarcar com confirmação);
    //   3. demais → informativa com Gemini + histórico recente (intacta).
    // O envio continua SOMENTE pelo gate de destinatário + ./whatsapp-enviar.
    // ---------------------------------------------------------------------
    if (evento.recebida && evento.texto) {
      const inicioIa = Date.now()
      const texto = evento.texto
      const remetenteBruto = extrairRemetente(corpo)
      const chaveSecreta = lerChaveSecreta((nome) => Deno.env.get(nome))

      // RPC com credencial server-to-server (padrão de ./envio.ts):
      // segredo SOMENTE nos headers; corpo só parâmetros tipados. Usado pela
      // dedup, pelo contexto e pelas dependências da conversa.
      const chamarRpc = async (
        nome: RpcAutorizada,
        params: Record<string, string>,
      ): Promise<ResultadoRpc> => {
        try {
          if (!chaveSecreta) {
            return { ok: false, motivo: 'Credencial de acesso ausente.' }
          }
          const { url, init } = montarRpcSecreto(
            segredos.base,
            chaveSecreta,
            nome,
            params,
          )
          const resposta = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(15_000),
          })
          return interpretarRpc(resposta.status, await resposta.text())
        } catch (erro) {
          const estourou = erro instanceof Error && erro.name === 'TimeoutError'
          return {
            ok: false,
            motivo: estourou
              ? 'A consulta não respondeu em 15s.'
              : motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
          }
        }
      }

      const armazenamento = criarArmazenamentoRpc({ chamar: chamarRpc })
      const memoriaConversa = criarMemoria(armazenamento, { agora: () => Date.now() })
      const eventosRecentes = criarRecentes(armazenamento)

      // Dedup PERSISTENTE (RPC atômica): a Evolution reentrega eventos e a
      // 2ª cópia não roda Gemini, não muda estado e não executa ação —
      // mesmo que ela chegue em OUTRA execução/isolate. Id ausente →
      // processa. Falha do armazenamento → fail-open com log: mensagem
      // legítima nunca é bloqueada por indisponibilidade pontual.
      let mensagemNova = true
      if (evento.idMensagem) {
        try {
          mensagemNova = await eventosRecentes.registrar(evento.idMensagem)
        } catch (erro) {
          mensagemNova = true
          console.log(
            '[whatsapp-ia]',
            JSON.stringify({
              evento: 'dedup-indisponivel',
              idMensagem: evento.idMensagem,
              motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
            }),
          )
        }
      }
      if (!mensagemNova) {
        console.log(
          '[whatsapp-ia]',
          JSON.stringify({ evento: 'duplicado', idMensagem: evento.idMensagem }),
        )
        return responder(200, { ok: true, recebido: evento.reconhecido })
      }

      const configIa = lerConfigIa((nome) => Deno.env.get(nome))
      const numeroTeste = (Deno.env.get('IA_NUMERO_TESTE') ?? '').trim()
      const remetente = normalizarNumero(remetenteBruto)

      // Contexto PERSISTENTE: lido do banco a cada invocação — é o que
      // permite a segunda mensagem ("2") continuar o fluxo aberto pela
      // primeira, independentemente do isolate que processar cada uma.
      let contexto: ContextoConversa | null = null
      if (remetente) {
        try {
          contexto = await memoriaConversa.ler(remetente)
        } catch (erro) {
          console.log(
            '[whatsapp-ia]',
            JSON.stringify({
              evento: 'contexto-ler-falhou',
              motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
            }),
          )
        }
      }

      const intencaoBase = classificarIntencao(texto)
      const interna =
        intencaoBase.tipo === 'bloqueada' && intencaoBase.motivo === 'interna'
      const irParaConversa = deveIrParaConversa(texto, contexto)

      let fontesCarregadas: FontesOficiais | null = null
      let saidaConversa: SaidaConversa | null = null
      let resultadoIa: ResultadoProcessamento

      if (irParaConversa) {
        // Escrita 100% determinística (sem Gemini). O MESMO gate do envio
        // decide se a ação pode executar: fora da lista de teste, apenas a
        // pergunta/confirmação é montada — nenhum RPC de escrita roda.
        const podeExecutar = deveEnviarResposta({
          estado: 'gerada',
          resposta: 'conversa',
          remetente: remetenteBruto,
          numeroTeste,
        })

        saidaConversa = await processarConversa({
          texto,
          telefone: remetente,
          contexto,
          podeExecutar,
          deps: {
            agora: () => Date.now(),
            hoje: () => dataLocalRecife(),
            carregarCatalogo: async () => {
              const { data, error } = await ctx.supabase.rpc(
                'agendamento_publico_catalogo',
              )
              if (error) throw new Error('catálogo indisponível')
              return mapearFontes(data, null)
            },
            carregarSlots: async (data) => {
              const { data: pacote, error } = await ctx.supabase.rpc(
                'agendamento_publico_slots',
                { p_data: data },
              )
              if (error) throw new Error('agenda indisponível')
              return mapearPacoteSlots(pacote)
            },
            listarAgendamentos: chaveSecreta
              ? async (telefone) => {
                  const resultado = await chamarRpc(
                    'ia_agendamentos_do_telefone',
                    { p_telefone: telefone },
                  )
                  if (!resultado.ok) throw new Error(resultado.motivo)
                  return interpretarAgendamentos(resultado.dados)
                }
              : undefined,
            clientePorTelefone: chaveSecreta
              ? async (telefone) => {
                  const resultado = await chamarRpc(
                    'ia_cliente_por_telefone',
                    { p_telefone: telefone },
                  )
                  if (!resultado.ok) return null
                  const nome = (resultado.dados as { nome?: unknown } | null)?.nome
                  return typeof nome === 'string' && nome.trim() ? nome.trim() : null
                }
              : undefined,
            // Criação pela função PÚBLICA existente (anon): o servidor
            // revalida expediente/almoço/bloqueio/conflito — nunca escrita
            // direta nossa.
            criar: async (p) => {
              try {
                const { data, error } = await ctx.supabase.rpc(
                  'agendamento_publico_criar',
                  {
                    p_cliente: p.cliente,
                    p_telefone: p.telefone,
                    p_servico: p.servico,
                    p_profissional: p.profissional,
                    p_data: p.data,
                    p_horario: p.horario,
                    p_observacao: '',
                  },
                )
                if (error) return { ok: false, motivo: motivoSeguro(error.message) }
                return { ok: true, id: String((data as { id?: unknown } | null)?.id ?? '') }
              } catch (erro) {
                return {
                  ok: false,
                  motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
                }
              }
            },
            cancelar: chaveSecreta
              ? async (id, telefone) => {
                  const resultado = await chamarRpc('ia_agendamento_cancelar', {
                    p_id: id,
                    p_telefone: telefone,
                  })
                  return resultado.ok
                    ? { ok: true }
                    : { ok: false, motivo: resultado.motivo }
                }
              : undefined,
            remarcar: chaveSecreta
              ? async (id, telefone, data, horario, profissional) => {
                  const resultado = await chamarRpc('ia_agendamento_remarcar', {
                    p_id: id,
                    p_telefone: telefone,
                    p_data: data,
                    p_horario: horario,
                    p_profissional: profissional,
                  })
                  return resultado.ok
                    ? { ok: true }
                    : { ok: false, motivo: resultado.motivo }
                }
              : undefined,
          },
        })
        if (remetente) {
          try {
            await memoriaConversa.salvar(remetente, saidaConversa.contexto)
          } catch (erro) {
            // a resposta já está pronta: a falha de gravação é só registrada
            console.log(
              '[whatsapp-ia]',
              JSON.stringify({
                evento: 'contexto-salvar-falhou',
                motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
              }),
            )
          }
        }
        resultadoIa = {
          intencao: intencaoBase,
          estado: 'gerada',
          resposta: saidaConversa.resposta,
          diagnostico: null,
        }
      } else {
        // Interna/informativa — mesmo fluxo da FASE 3, agora com o
        // histórico recente (turnos) do contexto persistido no banco.
        resultadoIa = await processarMensagem({
          texto,
          config: configIa,
          historico: contexto?.historico ?? [],
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
            const fontes = mapearFontes(catalogo.data, slots.data)
            fontesCarregadas = fontes
            return fontes
          },
          gerar: async (requisicao) => {
            const resposta = await fetch(requisicao.url, {
              ...requisicao.init,
              signal: AbortSignal.timeout(20_000),
            })
            return interpretarRespostaIa(resposta.status, await resposta.text())
          },
        })
        if (remetente) {
          try {
            await memoriaConversa.salvar(
              remetente,
              comTurnos(contexto, texto, resultadoIa.resposta, Date.now()),
            )
          } catch (erro) {
            console.log(
              '[whatsapp-ia]',
              JSON.stringify({
                evento: 'contexto-salvar-falhou',
                motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
              }),
            )
          }
        }
      }

      const servicoIdentificado = saidaConversa
        ? saidaConversa.servico
        : fontesCarregadas
          ? identificarServico(texto, fontesCarregadas)
          : null
      // Log técnico: fluxo + metadados + serviço + diagnóstico seguro +
      // resposta gerada. O texto recebido do cliente NUNCA é logado, nenhum
      // secret entra aqui, e telefone/identificador de ação vão apenas como
      // resultado já saneado (motivoSeguro) — nunca o número completo.
      console.log(
        '[whatsapp-ia]',
        JSON.stringify({
          intencao: resultadoIa.intencao.tipo,
          motivo:
            resultadoIa.intencao.tipo === 'bloqueada' ? resultadoIa.intencao.motivo : null,
          fluxo: irParaConversa
            ? 'conversa'
            : interna
              ? 'interna'
              : 'informativa',
          acao: saidaConversa?.acao ?? null,
          executada: saidaConversa?.executada ?? false,
          acaoMotivo: saidaConversa?.motivo ?? null,
          estado: resultadoIa.estado,
          servico: servicoIdentificado,
          modelo: configIa?.modelo ?? null,
          duracaoMs: Date.now() - inicioIa,
          diagnostico: resultadoIa.diagnostico,
          respostaTamanho: (resultadoIa.resposta ?? '').length,
          resposta: resultadoIa.resposta,
        }),
      )

      // Envio: somente resposta GERADA + destinatário autorizado. O texto
      // da IA vira SOMENTE o campo `mensagem` do whatsapp-enviar.
      const autorizado = deveEnviarResposta({
        estado: resultadoIa.estado,
        resposta: resultadoIa.resposta,
        remetente: remetenteBruto,
        numeroTeste,
      })
      const destinoMascarado = remetenteBruto
        ? mascararRemetente(`${remetenteBruto}@s.whatsapp.net`)
        : evento.remetente

      if (autorizado && remetenteBruto && resultadoIa.resposta) {
        const inicioEnvio = Date.now()
        // Credencial server-to-server: SOMENTE SUPABASE_SECRET_KEYS["default"]
        // (header `apikey`). Sem ela → falha segura, sem envio — e NUNCA se
        // usa SUPABASE_SERVICE_ROLE_KEY como fallback (legacy eyJ → 401).
        const baseSupabase = segredos.base
        if (!chaveSecreta) {
          console.log(
            '[whatsapp-envio]',
            JSON.stringify({
              envioIniciado: false,
              ok: false,
              motivo: 'segredo SUPABASE_SECRET_KEYS ausente ou inválido — envio não realizado',
              destinatario: destinoMascarado,
              servico: servicoIdentificado,
              estadoIa: resultadoIa.estado,
            }),
          )
          return responder(200, { ok: true, recebido: evento.reconhecido })
        }
        try {
          const { url, init } = montarPedidoEnvio(baseSupabase, chaveSecreta, {
            telefone: normalizarNumero(remetenteBruto) ?? '',
            mensagem: resultadoIa.resposta,
          })
          const respostaEnvio = await fetch(url, {
            ...init,
            signal: AbortSignal.timeout(15_000),
          })
          const corpoEnvio = await respostaEnvio.text()
          const resultadoEnvio = interpretarEnvio(respostaEnvio.status, corpoEnvio)
          console.log(
            '[whatsapp-envio]',
            JSON.stringify({
              envioIniciado: true,
              ok: resultadoEnvio.ok,
              status: respostaEnvio.status,
              duracaoMs: Date.now() - inicioEnvio,
              motivo: resultadoEnvio.ok ? null : (resultadoEnvio.motivo ?? null),
              destinatario: destinoMascarado,
              servico: servicoIdentificado,
              estadoIa: resultadoIa.estado,
            }),
          )
        } catch (erro) {
          const estourou = erro instanceof Error && erro.name === 'TimeoutError'
          const nosso = erro instanceof Error && /INVÁLID|ausente|vazia|acima de/i.test(erro.message)
          console.log(
            '[whatsapp-envio]',
            JSON.stringify({
              envioIniciado: true,
              ok: false,
              status: null,
              duracaoMs: Date.now() - inicioEnvio,
              motivo: estourou
                ? 'whatsapp-enviar não respondeu em 15s.'
                : nosso
                  ? (erro as Error).message
                  : 'Falha ao contatar o whatsapp-enviar.',
              destinatario: destinoMascarado,
              servico: servicoIdentificado,
              estadoIa: resultadoIa.estado,
            }),
          )
        }
      } else if (resultadoIa.estado === 'gerada') {
        // Sinal de segurança: resposta pronta mas destinatário fora da lista.
        // Diagnóstico de FORMATO (contagens/booleans — nunca os números)
        // para explicar por que destino !== teste após a MESMA normalização
        // usada na regra de autorização (montarDiagnosticoDestino).
        console.log(
          '[whatsapp-envio]',
          JSON.stringify({
            envioIniciado: false,
            ok: false,
            motivo: 'destinatario-nao-autorizado',
            destinatario: destinoMascarado,
            servico: servicoIdentificado,
            estadoIa: resultadoIa.estado,
            diagnostico: montarDiagnosticoDestino(remetenteBruto, numeroTeste),
          }),
        )
      }
    }

    // Sempre 200: não há auto-resposta ao cliente nem rejeição em cascata —
    // a Evolution não precisa reenviar o que já foi entregue.
    return responder(200, { ok: true, recebido: evento.reconhecido })
  }),
}
