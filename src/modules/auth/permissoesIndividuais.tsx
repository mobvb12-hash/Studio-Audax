// Permissões INDIVIDUAIS do usuário autenticado (terceiro nível de segurança).
//
// O papel (dono/admin/gerente/recepcao/profissional) continua sendo o padrão
// em `permissoes.ts`; aqui só entram as exceções gravadas em
// `perfis_permissoes`. Sem provedor montado (render isolado, testes legados,
// Área do Cliente) o contexto é `null` e tudo segue pelo papel — igual a hoje.
//
// A leitura falha abrindo: se o banco não responder, a UI cai no padrão do
// papel em vez de travar o painel. Quem decide o acesso de verdade é a RLS
// da migration 042, que não depende desta tela.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { carregarPermissoesDoPerfil } from '@/services/supabase/permissoes'
import { ContextoAuth } from './contexto'
import type { PermissoesIndividuais } from './permissoes'

export type PermissoesDoUsuario = {
  /**
   * Exceções do usuário autenticado:
   * - `null`  → ainda carregando (a UI segue pelo papel);
   * - `{}`    → carregado, sem exceção (manda o papel);
   * - com chaves → exceções que sobrescrevem o papel.
   */
  overrides: PermissoesIndividuais | null
  /** Relê as exceções (usado após gravar uma mudança na própria sessão). */
  recarregar: () => Promise<void>
}

export const ContextoPermissoesIndividuais =
  createContext<PermissoesDoUsuario | null>(null)

export function PermissoesIndividuaisProvider({ children }: { children: ReactNode }) {
  const auth = useContext(ContextoAuth)
  const perfilId = auth?.perfil?.id ?? null
  const [overrides, setOverrides] = useState<PermissoesIndividuais | null>(null)

  /**
   * Recarga manual (após gravar na própria sessão). Dentro do efeito a
   * leitura roda direto, para que o setState fique só no callback
   * assíncrono — padrão do projeto, sem setState síncrono no efeito.
   */
  const recarregar = useCallback(async () => {
    if (!perfilId) {
      setOverrides(null)
      return
    }
    try {
      setOverrides(await carregarPermissoesDoPerfil(perfilId))
    } catch {
      // sem leitura não há exceção a aplicar: a UI volta ao papel padrão
      setOverrides({})
    }
  }, [perfilId])

  useEffect(() => {
    let vivo = true
    if (perfilId) {
      void carregarPermissoesDoPerfil(perfilId)
        .then((resultado) => {
          if (vivo) setOverrides(resultado)
        })
        .catch(() => {
          if (vivo) setOverrides({})
        })
    }
    return () => {
      vivo = false
    }
  }, [perfilId])

  const valor = useMemo(
    () => ({ overrides, recarregar }),
    [overrides, recarregar],
  )

  return (
    <ContextoPermissoesIndividuais.Provider value={valor}>
      {children}
    </ContextoPermissoesIndividuais.Provider>
  )
}
