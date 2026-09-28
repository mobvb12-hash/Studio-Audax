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
  /**
   * Confirma a sessão COM O SERVIDOR (Supabase Auth). `false` = não há
   * sessão utilizável, e o painel não pode abrir.
   *
   * Existe porque `sessao()`/`getSession()` é validação LOCAL: o
   * auth-js só checa se o objeto tem `access_token`, `refresh_token` e
   * `expires_at`, e se o relógio local ainda não passou do prazo. Não assina
   * o JWT, não olha a `role` e não pergunta ao servidor. Uma sessão revogada
   * ou recusada continua "válida" do ponto de vista do navegador — o painel
   * abre e as consultas saem com a anon key, que a RLS trata como visitante.
   */
  confirmar(): Promise<boolean>
  /** Assina mudanças de sessão; devolve o cancelador da assinatura. */
  observar(
    mudou: (sessao: SessaoInfo | null, motivo: MotivoSessao) => void,
  ): () => void
  /** Lança Error com mensagem pronta quando as credenciais falham. */
  entrar(email: string, senha: string): Promise<SessaoInfo>
  sair(): Promise<void>
}

export type PapelPerfil = 'admin' | 'recepcao' | 'profissional'

export type PerfilInfo = {
  id: string
  userId: string
  nome: string
  email: string
  papel: PapelPerfil
  ativo: boolean
  criadoEm: string
}
