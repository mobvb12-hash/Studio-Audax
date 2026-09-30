// ============================================================================
// Hook para verificação de permissões no nível de ação/componente.
// Usa a camada central de autorização (permissoes.ts).
// ============================================================================

import { useContext } from 'react'
import { ContextoAuth } from './contexto'
import type { AcaoPermissao } from './permissoes'
import {
  usuarioTemPermissao,
  profissionalPodeAcessarDadosDe,
} from './permissoes'

/**
 * Hook para verificar permissões do usuário autenticado.
 *
 * Uso:
 *   const { pode, podeVerDadosDe, podeVerFinanceiroDeOutro } = useAuthPermissao()
 *
 *   if (pode('caixa:fechar')) { ... }
 *   if (podeVerDadosDe(profissionalId)) { ... }
 */
export function useAuthPermissao() {
  const contexto = useContext(ContextoAuth)
  const papel = contexto?.perfil?.papel ?? null

  const pode = (acao: AcaoPermissao): boolean => {
    return usuarioTemPermissao(papel, acao)
  }

  const podeVerDadosDe = (profissionalId: string): boolean => {
    if (!papel) return false
    return profissionalPodeAcessarDadosDe(papel, contexto?.perfil?.id, profissionalId)
  }

  const podeVerFinanceiroDeOutro = (): boolean => {
    return papel === 'dono' || papel === 'admin' || papel === 'gerente'
  }

  const ehAdministrativo = (): boolean => {
    return papel === 'dono' || papel === 'admin' || papel === 'gerente'
  }

  const ehDono = (): boolean => {
    return papel === 'dono'
  }

  const ehProfissional = (): boolean => {
    return papel === 'profissional'
  }

  const papelAtual = papel

  return {
    pode,
    podeVerDadosDe,
    podeVerFinanceiroDeOutro,
    ehAdministrativo,
    ehDono,
    ehProfissional,
    papel: papelAtual,
  }
}

/**
 * Hook para verificar se o usuário tem UMA DAS permissões listadas (OR).
 */
export function useAuthPermissaoOu(acoes: AcaoPermissao[]): boolean {
  const { pode } = useAuthPermissao()
  return acoes.some((acao) => pode(acao))
}

/**
 * Hook para verificar se o usuário tem TODAS as permissões listadas (AND).
 */
export function useAuthPermissaoETodas(acoes: AcaoPermissao[]): boolean {
  const { pode } = useAuthPermissao()
  return acoes.every((acao) => pode(acao))
}