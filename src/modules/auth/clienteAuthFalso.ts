import type { ClienteAuth, MotivoSessao, SessaoInfo } from './tipos'

/**
 * Cliente de autenticação falso para testes — sem rede, sem Supabase.
 * Permite simular carga de sessão, sucesso/falha de login e eventos
 * de expiração/logout durante o uso.
 */
export type ClienteAuthFalso = ClienteAuth & {
  /** Sessão atual (mutável pelo teste). */
  sessoes: SessaoInfo | null
  /** Histórico de tentativas de entrar. */
  entradas: { email: string; senha: string }[]
  /** Quando definido, entrar() lança este erro. */
  erroEntrada: Error | null
  /** Dispara o evento de mudança de sessão nos observadores. */
  disparar(sessao: SessaoInfo | null, motivo: MotivoSessao): void
}

export function criarClienteAuthFalso(
  sessaoInicial: SessaoInfo | null = null,
): ClienteAuthFalso {
  const ouvintes = new Set<(sessao: SessaoInfo | null, motivo: MotivoSessao) => void>()
  const falso: ClienteAuthFalso = {
    sessoes: sessaoInicial,
    entradas: [],
    erroEntrada: null,
    async sessao() {
      return falso.sessoes
    },
    observar(mudou) {
      ouvintes.add(mudou)
      return () => {
        ouvintes.delete(mudou)
      }
    },
    async entrar(email, senha) {
      falso.entradas.push({ email, senha })
      if (falso.erroEntrada) throw falso.erroEntrada
      falso.sessoes = { email, expiraEm: Math.floor(Date.now() / 1000) + 3600 }
      return falso.sessoes
    },
    async sair() {
      falso.sessoes = null
    },
    disparar(sessao, motivo) {
      falso.sessoes = sessao
      ouvintes.forEach((ouvintria) => ouvintria(sessao, motivo))
    },
  }
  return falso
}
