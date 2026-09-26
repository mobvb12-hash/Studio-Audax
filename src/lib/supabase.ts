import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase único do Studio Audax.
 *
 * - Sem VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY retorna null e o app
 *   segue exatamente como hoje: 100% local (localStorage), sem tela de login.
 * - A anon key é pública por design e fica protegida pelas políticas RLS
 *   do banco. Chaves de serviço (service_role) NUNCA passam por aqui.
 * - As variáveis são relidas a cada chamada (constantes em produção); o
 *   cliente é recriado só quando a combinação muda.
 */
let cache: { chave: string; cliente: SupabaseClient } | null = null

export function supabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) {
    cache = null
    return null
  }
  const chave = `${url}|${anonKey}`
  if (!cache || cache.chave !== chave) {
    cache = { chave, cliente: createClient(url, anonKey) }
  }
  return cache.cliente
}
