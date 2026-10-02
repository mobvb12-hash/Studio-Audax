// FASE 6 — armazenamento FALSO para testes: espelha a semântica da
// migration 016 (RPCs ia_contexto_* / ia_mensagem_registrar) sem rede e sem
// Postgres — o MESMO contrato que ./memoria.ts consome:
//   • contexto: upsert por remetente (10–13 dígitos), TTL de 30 min pelo
//     CORPO (coluna atualizado_em) e leitura nula quando expirado;
//   • dedup: INSERT idempotente varrendo a janela de 15 min — repetição na
//     janela devolve false, fora da janela (>= TTL) devolve true de novo;
//   • JSON é clonado nos dois sentidos (sem referências compartilhadas);
//   • `falhar(nome)` simula indisponibilidade da RPC para exercitar os
//     caminhos de erro (fail-open do index, try/catch de ler/salvar).
import type { ContextoConversa } from './conversa.ts'
import type { Armazenamento } from './memoria.ts'
import { TTL_CONTEXTO_MS, TTL_DEDUP_MS } from './memoria.ts'

export type RpcFalsa = 'ler' | 'salvar' | 'fechar' | 'registrar'

export type ArmazenamentoFalso = Armazenamento & {
  agora: () => number
  definirAgora: (ms: number) => void
  avancar: (ms: number) => void
  falhar: (nome: RpcFalsa) => void
  recuperar: (nome: RpcFalsa) => void
  /** introspecção de teste */
  quantosContextos: () => number
  quantasMensagens: () => number
  existeContexto: (remetente: string) => boolean
}

export function criarArmazenamentoFalso(opcoes: { inicio?: number } = {}): ArmazenamentoFalso {
  const contexto = new Map<string, { json: string; atualizadoEm: number }>()
  const mensagens = new Map<string, number>()
  const falhas = new Set<RpcFalsa>()
  let relogio = opcoes.inicio ?? 0

  const exigir = (nome: RpcFalsa) => {
    if (falhas.has(nome)) throw new Error(`falha simulada em ${nome}`)
  }
  const chave = (valor: string) => {
    if (!/^\d{10,13}$/.test(valor)) throw new Error('Telefone inválido.')
    return valor
  }

  return {
    agora: () => relogio,
    definirAgora: (ms) => {
      relogio = ms
    },
    avancar: (ms) => {
      relogio += ms
    },
    falhar: (nome) => {
      falhas.add(nome)
    },
    recuperar: (nome) => {
      falhas.delete(nome)
    },
    quantosContextos: () => contexto.size,
    quantasMensagens: () => mensagens.size,
    existeContexto: (remetente) => contexto.has(remetente),

    async ler(remetente) {
      exigir('ler')
      const k = chave(remetente)
      const linha = contexto.get(k)
      if (!linha) return null
      if (relogio - linha.atualizadoEm >= TTL_CONTEXTO_MS) {
        // a RPC apaga em cascata o registro expirado
        contexto.delete(k)
        return null
      }
      return JSON.parse(linha.json) as ContextoConversa
    },
    async salvar(remetente, ctx) {
      exigir('salvar')
      const k = chave(remetente)
      contexto.set(k, { json: JSON.stringify(ctx), atualizadoEm: relogio })
    },
    async fechar(remetente) {
      exigir('fechar')
      const k = chave(remetente)
      contexto.delete(k)
    },
    async registrar(idMensagem) {
      exigir('registrar')
      const id = idMensagem.trim()
      if (id.length < 1 || id.length > 200) throw new Error('Identificador inválido.')
      for (const [antigo, em] of mensagens) {
        if (relogio - em >= TTL_DEDUP_MS) mensagens.delete(antigo)
      }
      if (mensagens.has(id)) return false
      mensagens.set(id, relogio)
      return true
    },
  }
}
