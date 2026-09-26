import { useSyncExternalStore } from 'react'

/**
 * Leitura e gravação seguras do localStorage do Studio Audax.
 *
 * - JSON inválido ou com forma inesperada: o conteúdo original é preservado em
 *   `<chave>:corrompido` antes de o store carregar o fallback, e um aviso
 *   visível é emitido (nada é apagado silenciosamente).
 * - Falha de gravação (cota, armazenamento indisponível etc.): o erro não é
 *   engolido — um aviso visível é emitido e a aplicação segue em memória.
 */

const SUFIXO_CORROMPIDO = ':corrompido'

export type TipoAvisoPersistencia = 'dado_corrompido' | 'falha_gravacao'

export type AvisoPersistencia = {
  id: string
  tipo: TipoAvisoPersistencia
  chave: string
  mensagem: string
}

const MENSAGENS: Record<TipoAvisoPersistencia, string> = {
  dado_corrompido:
    'Foi detectado um dado local corrompido; uma cópia foi preservada.',
  falha_gravacao: 'Os dados locais do Studio Audax não puderam ser salvos.',
}

let avisos: AvisoPersistencia[] = []
const ouvintes = new Set<() => void>()

function notificar() {
  ouvintes.forEach((ouvintria) => ouvintria())
}

function emitir(tipo: TipoAvisoPersistencia, chave: string) {
  const id = `${tipo}:${chave}`
  if (avisos.some((a) => a.id === id)) return
  avisos = [...avisos, { id, tipo, chave, mensagem: MENSAGENS[tipo] }]
  // notificação fora do render do componente que detectou o problema
  queueMicrotask(notificar)
}

/** Snapshot síncrono dos avisos ativos (leitura direta e testes). */
export function avisosPersistencia(): AvisoPersistencia[] {
  return avisos
}

/** Descarta todos os avisos (botão de fechamento do banner). */
export function limparAvisosPersistencia(): void {
  if (avisos.length === 0) return
  avisos = []
  notificar()
}

function assinarAvisos(ouvintria: () => void): () => void {
  ouvintes.add(ouvintria)
  return () => {
    ouvintes.delete(ouvintria)
  }
}

/** Hook centralizado para a aplicação exibir os avisos de persistência. */
export function useAvisosPersistencia(): AvisoPersistencia[] {
  return useSyncExternalStore(
    assinarAvisos,
    avisosPersistencia,
    avisosPersistencia,
  )
}

function preservarCorrompido(chave: string, bruto: string): void {
  const backup = `${chave}${SUFIXO_CORROMPIDO}`
  try {
    // preserva a primeira cópia: nunca sobrescrever um backup já existente
    if (localStorage.getItem(backup) === null) {
      localStorage.setItem(backup, bruto)
    }
    emitir('dado_corrompido', chave)
  } catch {
    emitir('dado_corrompido', chave)
    emitir('falha_gravacao', backup)
  }
}

/**
 * Lê uma chave com fallback seguro. Quando o dado está ausente devolve o
 * padrão em silêncio (primeira execução); quando existe porém é inválido,
 * preserva a cópia original em `<chave>:corrompido`, avisa e devolve o padrão.
 */
export function carregarJSON<T>(
  chave: string,
  padrao: T,
  ehValido: (valor: unknown) => boolean,
): T {
  let bruto: string | null
  try {
    bruto = localStorage.getItem(chave)
  } catch {
    emitir('falha_gravacao', chave)
    return padrao
  }
  if (!bruto) return padrao

  let valor: unknown
  try {
    valor = JSON.parse(bruto)
  } catch {
    preservarCorrompido(chave, bruto)
    return padrao
  }
  if (ehValido(valor)) return valor as T

  preservarCorrompido(chave, bruto)
  return padrao
}

/** Grava uma chave; falhas (cota, indisponibilidade) geram aviso visível. */
export function salvarJSON(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    emitir('falha_gravacao', chave)
  }
}
