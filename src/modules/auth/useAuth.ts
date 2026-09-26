import { useContext } from 'react'
import { ContextoAuth } from './contexto'

/** Acesso ao estado/ações de autenticação (dentro de AuthProvider). */
export function useAuth(): ContextoAuth {
  const contexto = useContext(ContextoAuth)
  if (!contexto) {
    throw new Error('useAuth precisa estar dentro de AuthProvider.')
  }
  return contexto
}
