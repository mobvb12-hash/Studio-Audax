import { createContext } from 'react'
import type { EstadoAuth } from './AuthProvider'

export type ContextoAuth = {
  estado: EstadoAuth
  /** Erro da última tentativa de login ('' = sem erro). */
  erroEntrada: string
  /** true enquanto a tentativa de login está em andamento. */
  entrando: boolean
  entrar: (email: string, senha: string) => Promise<boolean>
  sair: () => Promise<void>
}

export const ContextoAuth = createContext<ContextoAuth | null>(null)
