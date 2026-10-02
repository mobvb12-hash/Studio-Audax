import { useContext } from 'react'
import { ContextoPainel } from './contexto'

/** Acesso ao estado/ações do painel do cliente (dentro de PainelAuthProvider). */
export function usePainelAuth(): ContextoPainel {
  const contexto = useContext(ContextoPainel)
  if (!contexto) {
    throw new Error('usePainelAuth precisa estar dentro de PainelAuthProvider.')
  }
  return contexto
}
