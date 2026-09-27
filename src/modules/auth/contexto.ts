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
  sair: () => Promise<void>
  /** Perfil do usuário autenticado (null = sem perfil ou não autenticado). */
  perfil: PerfilInfo | null
}

export const ContextoAuth = createContext<ContextoAuth | null>(null)
