// FASE 5/6 — contexto conversacional e deduplicação com fonte de verdade
// no BANCO (RPCs service_role da migration 016), nunca em Map de processo:
// cada invocação da Edge Function pode rodar em outro V8 isolate e o estado
// em memória não sobrevivia entre mensagens (caso real: "2" caía no fluxo
// informativa porque o rascunho salvo por outra execução não era lido).
//
//   • criarArmazenamentoRpc: adaptador puro das quatro RPCs (corpo só params
//     string; credencial fica em ./acoes.ts — nunca aqui);
//   • criarMemoria: ler/salvar/fechar do contexto por remetente, com TTL de
//     30 minutos (checagem também no cliente além do banco) e corte de
//     histórico — as instâncias são descartáveis e NÃO guardam estado;
//   • criarRecentes: dedup por id de mensagem via RPC atômica — a 2ª entrega
//     é recusada mesmo vindo de outra execução;
//   • comTurnos: acrescenta os turnos de uma resposta ao histórico,
//     preservando o rascunho pendente do fluxo de agendamento.
//
// Privacidade: a chave é o telefone em dígitos (mesmo dado que o projeto já
// guarda em agendamentos); o texto da conversa vive só no JSONB com TTL de
// 30 minutos; nenhum secret/token entra aqui ou no banco.
import type { ContextoConversa } from './conversa.ts'
import type { Turno } from './ia.ts'
import type { ResultadoRpc, RpcAutorizada } from './acoes.ts'

/** Validade do contexto — igual ao TTL da migration 016 (30 minutos). */
export const TTL_CONTEXTO_MS = 30 * 60 * 1000
/** Janela de deduplicação — igual ao TTL da migration 016 (15 minutos). */
export const TTL_DEDUP_MS = 15 * 60 * 1000
const MAX_HISTORICO_PADRAO = 6

/**
 * Armazenamento durável (banco) — contrato puro, sem rede: o chamador
 * injeta a função de chamada RPC. Falha de qualquer operação LANÇA
 * (Error com motivo saneado) — quem chama decide a política (ex.:
 * index falha aberto na dedup com log, e trata ler/salvar em try/catch).
 */
export type Armazenamento = {
  ler: (remetente: string) => Promise<ContextoConversa | null>
  salvar: (remetente: string, contexto: ContextoConversa) => Promise<void>
  fechar: (remetente: string) => Promise<void>
  /** true = primeira vez que vemos este id na janela (gate atômico) */
  registrar: (idMensagem: string) => Promise<boolean>
}

type ChamarRpc = (
  nome: RpcAutorizada,
  params: Record<string, string>,
) => Promise<ResultadoRpc>

/** Resposta da RPC precisa ter o shape esperado — senão é tratada como falha. */
function contextoValido(dados: unknown): dados is ContextoConversa {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return false
  const ctx = dados as Partial<ContextoConversa>
  return (
    typeof ctx.atualizadoEm === 'number' &&
    Array.isArray(ctx.historico) &&
    ctx.rascunho !== undefined &&
    (ctx.rascunho === null || typeof ctx.rascunho === 'object')
  )
}

/** Adaptador das RPCs duráveis da migration 016 (funções puras: sem Deno). */
export function criarArmazenamentoRpc(opcoes: { chamar: ChamarRpc }): Armazenamento {
  const exigir = async (
    nome: RpcAutorizada,
    params: Record<string, string>,
  ): Promise<unknown> => {
    const resultado = await opcoes.chamar(nome, params)
    if (!resultado.ok) throw new Error(resultado.motivo)
    return resultado.dados
  }

  return {
    async ler(remetente) {
      const dados = await exigir('ia_contexto_ler', { p_remetente: remetente })
      if (dados === null || dados === undefined) return null
      if (!contextoValido(dados)) {
        throw new Error('Contexto armazenado em formato inválido.')
      }
      return dados
    },
    async salvar(remetente, contexto) {
      await exigir('ia_contexto_salvar', {
        p_remetente: remetente,
        p_contexto: JSON.stringify(contexto),
      })
    },
    async fechar(remetente) {
      await exigir('ia_contexto_fechar', { p_remetente: remetente })
    },
    async registrar(idMensagem) {
      const dados = await exigir('ia_mensagem_registrar', { p_id: idMensagem })
      if (typeof dados !== 'boolean') {
        throw new Error('Resposta inválida ao registrar a mensagem.')
      }
      return dados
    },
  }
}

export type OpcoesMemoria = {
  agora: () => number
  /** validade do contexto no cliente (padrão: 30 minutos — igual ao banco) */
  ttlMs?: number
  /** turnos de histórico por contexto (padrão: 6) */
  maxHistorico?: number
}

export type Memoria = {
  ler: (remetente: string) => Promise<ContextoConversa | null>
  salvar: (remetente: string, contexto: ContextoConversa) => Promise<void>
  fechar: (remetente: string) => Promise<void>
}

/**
 * Contexto por remetente lido/gravado no BANCO a cada invocação, com TTL
 * defensivo também no cliente (nada aqui é estado entre chamadas) e corte
 * de histórico ao salvar. Remetente inválido (fora de 10–13 dígitos) não
 * consulta: a RPC recusaria de qualquer forma.
 */
export function criarMemoria(armazenamento: Armazenamento, opcoes: OpcoesMemoria): Memoria {
  const agora = opcoes.agora
  const ttlMs = opcoes.ttlMs ?? TTL_CONTEXTO_MS
  const maxHistorico = opcoes.maxHistorico ?? MAX_HISTORICO_PADRAO

  return {
    async ler(remetente) {
      const contexto = await armazenamento.ler(remetente)
      if (!contexto) return null
      if (agora() - contexto.atualizadoEm > ttlMs) {
        // expirou pelo relógio do cliente (defesa extra ao TTL do banco):
        // descarta do armazenamento sem transformar a leitura em falha
        try {
          await armazenamento.fechar(remetente)
        } catch {
          // limpeza é melhor-esforço — o registro já é ignorado daqui
        }
        return null
      }
      return contexto
    },
    async salvar(remetente, contexto) {
      await armazenamento.salvar(remetente, {
        ...contexto,
        atualizadoEm: agora(),
        historico: contexto.historico.slice(-maxHistorico),
      })
    },
    async fechar(remetente) {
      await armazenamento.fechar(remetente)
    },
  }
}

export type Recentes = {
  /** true = primeira vez que vemos este id dentro da janela do banco */
  registrar: (idMensagem: string) => Promise<boolean>
}

/**
 * Deduplicação de reentregas pela RPC atômica (INSERT ... ON CONFLICT): a
 * segunda entrega do mesmo id — mesmo vinda de outro isolate/execução —
 * recebe false e não roda Gemini, ações nem envio.
 */
export function criarRecentes(armazenamento: Armazenamento): Recentes {
  return {
    registrar: (idMensagem) => armazenamento.registrar(idMensagem),
  }
}

/**
 * Acrescenta os turnos de uma rodada ao histórico (cliente + IA), mantendo
 * o rascunho pendente e o teto de turnos — usado pelo fluxo informativo,
 * que não tem máquina de estados própria.
 */
export function comTurnos(
  contexto: ContextoConversa | null,
  cliente: string,
  resposta: string | null,
  agora: number,
  maxHistorico = MAX_HISTORICO_PADRAO,
): ContextoConversa {
  const turnos: Turno[] = [...(contexto?.historico ?? [])]
  const anterior = turnos[turnos.length - 1]
  if (!anterior || anterior.papel !== 'cliente' || anterior.texto !== cliente) {
    turnos.push({ papel: 'cliente', texto: cliente })
  }
  if (resposta && resposta.trim()) {
    turnos.push({ papel: 'ia', texto: resposta })
  }
  return {
    atualizadoEm: agora,
    historico: turnos.slice(-maxHistorico),
    rascunho: contexto?.rascunho ?? null,
  }
}
