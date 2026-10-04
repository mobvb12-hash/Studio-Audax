// Acesso ao Supabase — permissões individuais da equipe (migration 042).
//
// Uma linha em `perfis_permissoes` é uma EXCEÇÃO ao padrão do papel: gravar
// `permitido = true` concede, `gravar permitido = false` revoga, e apagar a
// linha devolve a regra ao papel. A tabela tem RLS própria: só admin escreve,
// ninguém escreve nas próprias permissões e `dono` nunca recebe exceção.
//
// Sem Supabase (VITE_SUPABASE_URL / ANON_KEY vazias) nada é lido nem gravado:
// a leitura devolve `{}` (padrão do papel) e a escrita lança com o aviso — a
// tela nunca finge que gravou no servidor.
import { supabase } from '@/lib/supabase'
import type { AcaoPermissao, PermissoesIndividuais } from '@/modules/auth/permissoes'
import { criarPerfil, type PapelPerfil, type Perfil } from './perfis'

export const SEM_SUPABASE_PERMISSOES =
  'Permissões exigem Supabase conectado para serem gravadas no servidor.'

function erroDeEscrita(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao gravar a permissão no Supabase.')
}

function erroDeLeitura(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao ler as permissões no Supabase.')
}

type LinhaPermissao = { perfil_id: string; acao: string; permitido: boolean }

function paraOverrides(linhas: LinhaPermissao[] | null): PermissoesIndividuais {
  const resultado: PermissoesIndividuais = {}
  for (const linha of linhas ?? []) {
    resultado[linha.acao as AcaoPermissao] = linha.permitido
  }
  return resultado
}

/**
 * Exceções gravadas para UM perfil. Sem Supabase: `{}` (manda o papel).
 * Falha de rede/RLS lança, para a UI não mostrar "sem exceção" quando não
 * conseguiu ler o banco.
 */
export async function carregarPermissoesDoPerfil(
  perfilId: string,
): Promise<PermissoesIndividuais> {
  const cliente = supabase()
  if (!cliente) return {}
  const { data, error } = await cliente
    .from('perfis_permissoes')
    .select('perfil_id, acao, permitido')
    .eq('perfil_id', perfilId)
  if (error) throw erroDeLeitura(error.message)
  return paraOverrides((data ?? []) as LinhaPermissao[])
}

/** Exceções de TODOS os perfis, agrupadas por perfil (tela de gestão). */
export async function carregarPermissoesDaEquipe(): Promise<
  Record<string, PermissoesIndividuais>
> {
  const cliente = supabase()
  if (!cliente) return {}
  const { data, error } = await cliente
    .from('perfis_permissoes')
    .select('perfil_id, acao, permitido')
  if (error) throw erroDeLeitura(error.message)
  const porPerfil: Record<string, PermissoesIndividuais> = {}
  for (const linha of (data ?? []) as LinhaPermissao[]) {
    porPerfil[linha.perfil_id] = {
      ...porPerfil[linha.perfil_id],
      [linha.acao]: linha.permitido,
    }
  }
  return porPerfil
}

/**
 * Grava (ou apaga) UMA exceção.
 *
 * `permitido = null` apaga a linha — é o caminho de "voltar ao padrão do
 * papel": assim o override não sobrevive a uma futura troca de papel da
 * pessoa, e a tabela só carrega diferenças de verdade.
 */
export async function definirPermissaoDoPerfil(
  perfilId: string,
  acao: AcaoPermissao,
  permitido: boolean | null,
): Promise<void> {
  const cliente = supabase()
  if (!cliente) throw new Error(SEM_SUPABASE_PERMISSOES)

  if (permitido === null) {
    const { error } = await cliente
      .from('perfis_permissoes')
      .delete()
      .eq('perfil_id', perfilId)
      .eq('acao', acao)
    if (error) throw erroDeEscrita(error.message)
    return
  }

  const { error } = await cliente
    .from('perfis_permissoes')
    .upsert({ perfil_id: perfilId, acao, permitido }, { onConflict: 'perfil_id,acao' })
  if (error) throw erroDeEscrita(error.message)
}

/** Equipe com acesso ao painel (perfis). Exige admin — a RLS decide. */
export async function listarPerfisEquipe(): Promise<Perfil[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('perfis')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw erroDeLeitura(error.message)
  return (data ?? []).map((linha) => ({
    id: linha.id,
    userId: linha.user_id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel as PapelPerfil,
    ativo: Boolean(linha.ativo),
    criadoEm: linha.criado_em,
  }))
}

export type NovoUsuario = {
  nome: string
  email: string
  senha: string
  papel: PapelPerfil
  /** Vínculo opcional com um cadastro de profissional. */
  profissionalId?: string | null
}

/**
 * Cria a conta de acesso (auth) e a linha de `perfis` da equipe.
 *
 * O signUp pode devolver sessão quando o projeto está com autoconfirmação de
 * e-mail ligada — nesse caso a sessão do ADMINISTRADOR seria trocada pela do
 * usuário recém-criado. Aqui a sessão anterior é guardada antes e restaurada
 * depois, para quem está criando não ser deslogado no meio da operação.
 * Confirmação de e-mail pendente: o login do novo usuário só abre depois que
 * ele confirmar — a função devolve `aviso` para a tela repassar.
 */
export async function criarUsuarioEquipe(
  usuario: NovoUsuario,
): Promise<{ perfil: Perfil | null; aviso: string | null }> {
  const cliente = supabase()
  if (!cliente) throw new Error(SEM_SUPABASE_PERMISSOES)

  const { data: sessaoAntes } = await cliente.auth.getSession()

  const { data: novo, error } = await cliente.auth.signUp({
    email: usuario.email,
    password: usuario.senha,
    options: { data: { nome: usuario.nome } },
  })
  if (error) throw erroDeEscrita(error.message)

  let aviso: string | null = null

  if (novo.session) {
    const anterior = sessaoAntes?.session
    if (anterior) {
      const restaurada = await cliente.auth.setSession({
        access_token: anterior.access_token,
        refresh_token: anterior.refresh_token,
      })
      if (restaurada.error) {
        throw new Error(
          `Usuário criado, mas a sessão do administrador não pôde ser restaurada (${restaurada.error.message}). Entre novamente.`,
        )
      }
    } else {
      aviso = 'Usuário criado. A sessão atual foi trocada — entre novamente com o seu login.'
    }
  } else {
    aviso = 'Usuário criado. Ele precisa confirmar o e-mail antes do primeiro acesso.'
  }

  if (!novo.user) throw erroDeEscrita(undefined)
  const perfil = await criarPerfil(novo.user.id, usuario.nome, usuario.email, usuario.papel)

  if (usuario.profissionalId) {
    const { data: vinculado, error: vinculo } = await cliente
      .from('profissionais')
      .update({ user_id: novo.user.id })
      .eq('id', usuario.profissionalId)
      .is('user_id', null)
      .select('id')
    if (vinculo) {
      aviso = `${aviso ? `${aviso} ` : ''}O acesso foi criado, mas o vínculo com o profissional falhou: ${vinculo.message}`
    } else if (!vinculo && (!vinculado || vinculado.length === 0)) {
      aviso = `${aviso ? `${aviso} ` : ''}O acesso foi criado, mas esse profissional já está vinculado a outro usuário.`
    }
  }

  return { perfil, aviso }
}

/** Troca papel ou ativo de um perfil (a trigger 017 aceita só admin). */
export async function atualizarPerfilDoUsuario(
  perfilId: string,
  mudanca: { papel?: PapelPerfil; ativo?: boolean },
): Promise<Perfil> {
  const cliente = supabase()
  if (!cliente) throw new Error(SEM_SUPABASE_PERMISSOES)
  const { data, error } = await cliente
    .from('perfis')
    .update(mudanca)
    .eq('id', perfilId)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita(undefined)
  return {
    id: data.id,
    userId: data.user_id,
    nome: data.nome,
    email: data.email,
    papel: data.papel as PapelPerfil,
    ativo: Boolean(data.ativo),
    criadoEm: data.criado_em,
  }
}
