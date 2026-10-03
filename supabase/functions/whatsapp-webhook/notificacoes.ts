// Consumo da fila de notificações (migration 024) — item 11/14/15 + 21.
//
// Funções puras (sem Deno, sem rede): o index injeta a chamada da RPC e o envio.
//
// Regras que ficam AQUI:
//   • a Evolution NUNCA é falada por este módulo: o envio sai pelo
//     `whatsapp-enviar`, o mesmo caminho já usado pela conversa (§24 — uma
//     fonte de envio só);
//   • uma notificação por vez, na ordem da fila (`ordem`, depois `criado_em`),
//     para o agradecimento (§14) chegar ANTES do link de avaliação (§15);
//   • cada item é resolvido individualmente: a falha de um envio NÃO cancela
//     o agendamento nem interrompe os itens seguintes — ela é registrada em
//     `ia_notificacoes` com status 'falha' para reprocessamento (§12);
//   • a fila já é deduplicada pelo banco (chave única): reexecutar o
//     processamento não duplica nada (§21).
import { motivoSeguro, type RpcAutorizada } from './acoes.ts'
import type { EnvioMontado } from './envio.ts'

export type NotificacaoPendente = {
  id: string
  chave: string
  tipo: string
  destino: string
  mensagem: string
  tentativas: number
}

export type ResumoEnvio = {
  id: string
  tipo: string
  ok: boolean
  motivo: string | null
}

/** Interpreta `ia_notificacoes_pendentes` sem confiar no formato. */
export function interpretarPendentes(dados: unknown): NotificacaoPendente[] {
  if (!Array.isArray(dados)) return []
  const lista: NotificacaoPendente[] = []
  for (const bruto of dados) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) continue
    const item = bruto as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const destino = typeof item.destino === 'string' ? item.destino.trim() : ''
    const mensagem = typeof item.mensagem === 'string' ? item.mensagem.trim() : ''
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) continue
    if (!mensagem || mensagem.length > 4096) continue
    lista.push({
      id,
      chave: typeof item.chave === 'string' ? item.chave.slice(0, 160) : '',
      tipo: typeof item.tipo === 'string' ? item.tipo.slice(0, 40) : '',
      destino,
      mensagem,
      tentativas: typeof item.tentativas === 'number' ? item.tentativas : 0,
    })
  }
  return lista
}

/** Parâmetros de `ia_notificacao_resolver` — todos texto (contrato da lista). */
export function parametrosResolver(pendente: NotificacaoPendente, ok: boolean, motivo: string | null) {
  return {
    p_id: pendente.id,
    p_ok: ok ? 'true' : 'false',
    p_motivo: (motivo ?? '').slice(0, 300),
  }
}

export type ResolverNotificacao = (
  id: string,
  ok: boolean,
  motivo: string | null,
) => Promise<boolean>

/**
 * Envia UMA notificação já montada pelo chamador (que usa
 * `montarPedidoEnvio`) e resolve o item na fila. Devolve o resumo para o log.
 * Nunca lança: uma notificação problemática é registrada como falha.
 */
export async function enviarNotificacao(
  pendente: NotificacaoPendente,
  montar: () => EnvioMontado,
  enviar: (montado: EnvioMontado) => Promise<{ ok: boolean; motivo?: string }>,
  resolver: ResolverNotificacao,
): Promise<ResumoEnvio> {
  let ok = false
  let motivo: string | null = null
  try {
    const resposta = await enviar(montar())
    ok = resposta.ok
    if (!resposta.ok) motivo = motivoSeguro(resposta.motivo ?? 'falha no envio')
  } catch (erro) {
    motivo = motivoSeguro(erro instanceof Error ? erro.message : 'erro')
  }
  try {
    await resolver(pendente.id, ok, motivo)
  } catch (erro) {
    motivo = motivoSeguro(erro instanceof Error ? erro.message : 'erro')
  }
  return { id: pendente.id, tipo: pendente.tipo, ok, motivo }
}

/**
 * Processa a fila inteira SEM PARAR no primeiro erro: um item sem WhatsApp
 * configurado não impede os demais de saírem (§12 — a falha da notificação
 * não cancela nada).
 */
export async function processarFila(
  pendentes: NotificacaoPendente[],
  enviarUma: (pendente: NotificacaoPendente) => Promise<ResumoEnvio>,
): Promise<ResumoEnvio[]> {
  const resumos: ResumoEnvio[] = []
  for (const pendente of pendentes) {
    try {
      resumos.push(await enviarUma(pendente))
    } catch (erro) {
      resumos.push({
        id: pendente.id,
        tipo: pendente.tipo,
        ok: false,
        motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
      })
    }
  }
  return resumos
}

/** Chamadas da fila, com os nomes exatos da lista branca. */
export const RPC_FILA: {
  ler: RpcAutorizada
  resolver: RpcAutorizada
} = {
  ler: 'ia_notificacoes_pendentes',
  resolver: 'ia_notificacao_resolver',
}
