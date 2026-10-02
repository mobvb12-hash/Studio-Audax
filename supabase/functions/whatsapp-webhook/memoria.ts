// FASE 5 — memória de conversa em MEMÓRIA do processo da função (nada é
// persistido em banco, nenhum dado pessoal novo sai daqui).
//
//   • criarMemoria: contexto por remetente (rascunho + histórico recente),
//     com TTL e tetos — esquece sozinho, nunca cresce sem limite;
//   • criarRecentes: registro de ids de mensagem já processados (evita o
//     reenvio da Evolution virar ação duplicada), também com TTL/teto;
//   • comTurnos: acrescenta os turnos de uma resposta ao histórico,
//     preservando o rascunho pendente do fluxo de agendamento.
//
// O texto do cliente fica SOMENTE neste mapa volátil (não vai para log nem
// para banco); ao estourar o TTL o contexto é descartado.
import type { ContextoConversa } from './conversa.ts'
import type { Turno } from './ia.ts'

export type OpcoesMemoria = {
  agora: () => number
  /** validade do contexto (padrão: 30 minutos) */
  ttlMs?: number
  /** quantos remetentes distintos guardar (padrão: 200) */
  maxContextos?: number
  /** turnos de histórico por contexto (padrão: 6) */
  maxHistorico?: number
}

export type Memoria = {
  ler: (remetente: string) => ContextoConversa | null
  salvar: (remetente: string, contexto: ContextoConversa) => void
  tamanho: () => number
}

const TTL_PADRAO_MS = 30 * 60 * 1000
const MAX_CONTEXTO_PADRAO = 200
const MAX_HISTORICO_PADRAO = 6

/** Contexto por remetente com TTL, teto de entradas e corte de histórico. */
export function criarMemoria(opcoes: OpcoesMemoria): Memoria {
  const agora = opcoes.agora
  const ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS
  const maxContextos = opcoes.maxContextos ?? MAX_CONTEXTO_PADRAO
  const maxHistorico = opcoes.maxHistorico ?? MAX_HISTORICO_PADRAO
  const contextos = new Map<string, ContextoConversa>()

  return {
    ler(remetente) {
      const ctx = contextos.get(remetente)
      if (!ctx) return null
      if (agora() - ctx.atualizadoEm > ttlMs) {
        contextos.delete(remetente)
        return null
      }
      return ctx
    },
    salvar(remetente, contexto) {
      if (contextos.has(remetente)) {
        contextos.delete(remetente)
      } else if (contextos.size >= maxContextos) {
        // fora de ordem: descarta o mais antigo (primeira chave do Map)
        const primeira = contextos.keys().next()
        if (!primeira.done) contextos.delete(primeira.value)
      }
      contextos.set(remetente, {
        ...contexto,
        atualizadoEm: agora(),
        historico: contexto.historico.slice(-maxHistorico),
      })
    },
    tamanho: () => contextos.size,
  }
}

export type OpcoesRecentes = {
  agora: () => number
  /** janela de deduplicação (padrão: 15 minutos) */
  ttlMs?: number
  /** quantos ids guardar (padrão: 500) */
  max?: number
}

export type Recentes = {
  /** true = primeira vez que vemos este id dentro da janela */
  registrar: (id: string) => boolean
  tamanho: () => number
}

const TTL_RECENTES_PADRAO_MS = 15 * 60 * 1000
const MAX_RECENTES_PADRAO = 500

/** Deduplica eventos reentregues (mesmo id de mensagem) na janela de TTL. */
export function criarRecentes(opcoes: OpcoesRecentes): Recentes {
  const agora = opcoes.agora
  const ttlMs = opcoes.ttlMs ?? TTL_RECENTES_PADRAO_MS
  const max = opcoes.max ?? MAX_RECENTES_PADRAO
  const vistos = new Map<string, number>()

  return {
    registrar(id) {
      const momento = agora()
      const visto = vistos.get(id)
      if (visto !== undefined && momento - visto <= ttlMs) {
        return false
      }
      vistos.delete(id)
      if (vistos.size >= max) {
        const primeira = vistos.keys().next()
        if (!primeira.done) vistos.delete(primeira.value)
      }
      vistos.set(id, momento)
      // varredura barata de expirados (ocasional, nunca cresce sem fim)
      if (vistos.size % 50 === 0) {
        for (const [chave, instante] of vistos) {
          if (momento - instante > ttlMs) vistos.delete(chave)
        }
      }
      return true
    },
    tamanho: () => vistos.size,
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
