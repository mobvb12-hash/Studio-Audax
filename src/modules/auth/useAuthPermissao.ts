// ============================================================================
// Hook para verificação de permissões no nível de ação/componente.
// Usa a camada central de autorização (permissoes.ts).
// ============================================================================

import { useCallback, useContext } from 'react'
import { ContextoAuth } from './contexto'
import { ContextoPermissoesIndividuais } from './permissoesIndividuais'
import type { AcaoPermissao, PermissoesIndividuais } from './permissoes'
import {
  usuarioTemPermissaoEfetiva,
  podeAcessarPaginaEfetiva,
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
 *
 * `pode` devolve a permissão EFETIVA (papel + exceção individual), que é a
 * mesma regra da RLS — o botão escondido e o dado negado andam juntos.
 */
export function useAuthPermissao() {
  const contexto = useContext(ContextoAuth)
  const papel = contexto?.perfil?.papel ?? null
  const sobrescreve = useContext(ContextoPermissoesIndividuais)?.overrides ?? null

  const pode = (acao: AcaoPermissao): boolean => {
    return usuarioTemPermissaoEfetiva(papel, acao, sobrescreve)
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

/**
 * Acesso a uma PÁGINA (menu e rota) com as permissões individuais aplicadas.
 *
 * Separado de `useAuthPermissao` para que quem só navega não precise montar
 * nada além do contexto de auth — e para o menu e o portão de rota lerem a
 * mesma regra em um único lugar.
 */
export function usePodeAcessarPagina(): (pagina: string) => boolean {
  const contexto = useContext(ContextoAuth)
  const papel = contexto?.perfil?.papel ?? null
  const sobrescreve: PermissoesIndividuais | null =
    useContext(ContextoPermissoesIndividuais)?.overrides ?? null

  return useCallback(
    (pagina: string) => podeAcessarPaginaEfetiva(papel, pagina, sobrescreve),
    [papel, sobrescreve],
  )
}