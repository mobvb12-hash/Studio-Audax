import { createContext } from 'react'
import type { EstadoAuth } from './AuthProvider'
import type { PerfilInfo } from './tipos'

export type ContextoAuth = {
  estado: EstadoAuth
  /** Erro da última tentativa de login ('' = sem erro). */
  erroEntrada: string
  /** true enquanto a tentativa de login está em andamento. */
  entrando: boolean
  entrar: (email: string, senha: string) => Promise<boolean>
  /**
   * Encerra a sessão. Devolve `true` quando saiu de verdade e `false` quando
   * o provedor recusou — nesse caso o estado continua `autenticado`, para
   * não divergir da sessão que segue viva no provedor.
   */
  sair: () => Promise<boolean>
  /** true enquanto a tentativa de saída está em andamento. */
  saindo: boolean
  /** Erro da última tentativa de saída ('' = sem erro). */
  erroSaida: string
  /** Perfil do usuário autenticado (null = sem perfil ou não autenticado). */
  perfil: PerfilInfo | null
}

export const ContextoAuth = createContext<ContextoAuth | null>(null)
