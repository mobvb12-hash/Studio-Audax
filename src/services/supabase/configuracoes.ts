// Acesso às configurações do sistema (migration 022).
//
// A tabela `configuracoes_sistema` NÃO tem policy: ninguém lê nem escreve
// direto pelo PostgREST. Tudo passa pelas RPCs — `admin_configuracoes_ler` e
// `admin_configuracao_salvar` exigem sessão autenticada E papel gerente ou
// acima, e são o MESMO caminho usado pela Edge Function no servidor
// (`ia_configuracao_salvar`), para que a validação seja única.
//
// Sem Supabase (modo local) tudo devolve o PADRÃO e salvar é um no-op com
// aviso: a tela nunca finge que gravou no servidor.
import { supabase } from '@/lib/supabase'
import {
  CONFIG_PADRAO,
  normalizarConfiguracoes,
  type ChaveConfig,
  type Configuracoes,
} from '@/modules/configuracoes/types'

export const SEM_INTEGRACAO = 'Configurações exigem Supabase conectado.'

/** Lê todas as chaves. Falha de leitura → PADRÃO (a tela avisa, não quebra). */
export async function carregarConfiguracoes(): Promise<{
  dados: Configuracoes
  doBanco: boolean
  erro: string | null
}> {
  const cliente = supabase()
  if (!cliente) {
    return { dados: CONFIG_PADRAO, doBanco: false, erro: SEM_INTEGRACAO }
  }
  const { data, error } = await cliente.rpc('admin_configuracoes_ler')
  if (error) {
    return {
      dados: CONFIG_PADRAO,
      doBanco: false,
      erro: error.message || 'Não foi possível ler as configurações.',
    }
  }
  return { dados: normalizarConfiguracoes(data), doBanco: true, erro: null }
}

/**
 * Grava UMA chave. `valor` viaja como JSON em texto porque a RPC recebe
 * `p_valor text` — o servidor valida de novo antes de gravar.
 */
export async function salvarConfiguracao(
  chave: ChaveConfig,
  valor: unknown,
): Promise<string | null> {
  const cliente = supabase()
  if (!cliente) return SEM_INTEGRACAO
  const { error } = await cliente.rpc('admin_configuracao_salvar', {
    p_chave: chave,
    p_valor: JSON.stringify(valor ?? {}),
  })
  if (error) return error.message || 'Não foi possível salvar a configuração.'
  return null
}
