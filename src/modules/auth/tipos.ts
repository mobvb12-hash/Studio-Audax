// Autenticação (Supabase Auth) — tipos do contrato do Studio Audax.
// O app consome ESTA interface; o adaptador do Supabase (supabaseAdapter)
// a implementa — nos testes entra um cliente falso sem rede.

/** Sessão reduzida do usuário logado. */
export type SessaoInfo = {
  email: string
  /** Validade em segundos desde a epoch (expires_at do Supabase). */
  expiraEm: number | null
}

/** Por que a sessão mudou (para exibir ou não o aviso de expirada). */
export type MotivoSessao = 'entrado' | 'saiu' | 'expirada'

/** Contrato mínimo de autenticação usado pelo AuthProvider. */
export type ClienteAuth = {
  sessao(): Promise<SessaoInfo | null>
  /** Assina mudanças de sessão; devolve o cancelador da assinatura. */
  observar(
    mudou: (sessao: SessaoInfo | null, motivo: MotivoSessao) => void,
  ): () => void
  /** Lança Error com mensagem pronta quando as credenciais falham. */
  entrar(email: string, senha: string): Promise<SessaoInfo>
  sair(): Promise<void>
}
