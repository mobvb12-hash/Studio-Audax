import type { SessaoInfo } from './tipos'

/**
 * Sessão expirada quando o carimbo de validade já passou (inclusive no
 * próprio instante). Sessão sem validade declarada nunca expira.
 */
export function sessaoExpirada(
  sessao: SessaoInfo | null,
  agoraSegundos: number,
): boolean {
  if (!sessao) return false
  if (sessao.expiraEm === null) return false
  return sessao.expiraEm <= agoraSegundos
}

/**
 * Mensagem amigável para falhas de login. Nunca repassa detalhes internos
 * do provedor: erro de credencial vira frase genérica (não confirma se o
 * e-mail existe); falha de rede vira aviso de conexão.
 */
export function mensagemErroEntrada(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (/fetch|network|conex|failed to/i.test(texto)) {
    return 'Falha de conexão. Tente novamente.'
  }
  return 'E-mail ou senha inválidos.'
}

export const AVISO_SESSAO_EXPIRADA = 'Sessão expirada. Entre novamente.'
