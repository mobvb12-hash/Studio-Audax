// Acesso ao Supabase — perfis (usuário do painel).
//
// Ausência de Supabase (VITE_SUPABASE_URL / ANON_KEY vazias) mantém o app
// 100% local: a leitura devolve null e nada é gravado — não é erro.
// Falha de escrita NÃO é silenciosa: `criarPerfil` lança com a mensagem do
// Supabase, para que a tela possa avisar em vez de tratar a criação do perfil
// como concluída — mesmo padrão de clientes, profissionais e serviços.
import { supabase } from '@/lib/supabase'

export type PapelPerfil = 'admin' | 'recepcao' | 'profissional'

export type Perfil = {
  id: string
  userId: string
  nome: string
  email: string
  papel: PapelPerfil
  ativo: boolean
  criadoEm: string
}

function paraPerfil(linha: {
  id: string
  user_id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  criado_em: string
}): Perfil {
  return {
    id: linha.id,
    userId: linha.user_id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel as PapelPerfil,
    ativo: linha.ativo,
    criadoEm: linha.criado_em,
  }
}

/** Erro de escrita com a mensagem do Supabase (ou um texto utilizável). */
function erroDeEscrita(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao gravar o perfil no Supabase.')
}

/**
 * Perfil do usuário. Sem Supabase: `null` (modo local). Com Supabase: erro de
 * consulta lança, para não se confundirem "usuário sem perfil" com "não
 * consegui ler o banco".
 */
export async function obterPerfil(userId: string): Promise<Perfil | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('perfis')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  // consulta válida sem linha = usuário ainda sem perfil (não é erro)
  if (error) throw new Error(error.message || 'Falha ao ler o perfil no Supabase.')
  if (!data) return null
  return paraPerfil(data)
}

export async function criarPerfil(
  userId: string,
  nome: string,
  email: string,
  papel: PapelPerfil = 'admin',
): Promise<Perfil | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('perfis')
    .insert({ user_id: userId, nome, email, papel })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita(undefined)
  return paraPerfil(data)
}

export async function perfilAtivo(perfil: Perfil | null): Promise<boolean> {
  return perfil !== null && perfil.ativo
}

export async function verificarPapel(
  perfil: Perfil | null,
  permitidos: PapelPerfil[],
): Promise<boolean> {
  if (!perfil) return false
  if (!(await perfilAtivo(perfil))) return false
  return permitidos.includes(perfil.papel)
}
