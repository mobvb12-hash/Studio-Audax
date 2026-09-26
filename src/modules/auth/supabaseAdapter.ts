import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { ClienteAuth, MotivoSessao, SessaoInfo } from './tipos'

/**
 * Adapta o cliente Supabase ao contrato `ClienteAuth` do Studio Audax.
 * Toda a lógica de estado fica no AuthProvider — aqui só a tradução.
 */
function paraSessao(sessao: Session | null): SessaoInfo | null {
  if (!sessao) return null
  const bruto = sessao.expires_at
  let expiraEm: number | null = null
  if (typeof bruto === 'number') {
    expiraEm = bruto
  } else if (typeof bruto === 'string') {
    const parsed = Date.parse(bruto) / 1000
    expiraEm = Number.isFinite(parsed) ? parsed : null
  }
  return { email: sessao.user?.email ?? '', expiraEm }
}

export function adaptarSupabase(cliente: SupabaseClient): ClienteAuth {
  return {
    async sessao() {
      const { data } = await cliente.auth.getSession()
      return paraSessao(data.session)
    },
    observar(mudou) {
      const { data } = cliente.auth.onAuthStateChange((evento, sessao) => {
        const info = paraSessao(sessao)
        const ev = String(evento)
        const motivo: MotivoSessao = info
          ? 'entrado'
          : ev === 'TOKEN_REFRESH_EXPIRED' || ev === '401'
            ? 'expirada'
            : 'saiu'
        mudou(info, motivo)
      })
      return () => data.subscription.unsubscribe()
    },
    async entrar(email, senha) {
      const { data, error } = await cliente.auth.signInWithPassword({
        email,
        password: senha,
      })
      if (error) throw new Error(error.message)
      const info = paraSessao(data.session)
      if (!info) throw new Error('Não foi possível iniciar a sessão.')
      return info
    },
    async sair() {
      const { error } = await cliente.auth.signOut()
      if (error) throw new Error(error.message)
    },
  }
}
