// Acesso ao Supabase — profissionais (única camada que fala com a tabela
// `public.profissionais`). Sem regra de negócio da UI aqui: só leitura/escrita.
//
// Ausência de Supabase (VITE_SUPABASE_URL / ANON_KEY vazias) mantém o app
// 100% local: as escritas devolvem null/false e não há o que confirmar.
// Falha de escrita NÃO é silenciosa: `criarProfissional`,
// `atualizarProfissional`, `alternarAtivoProfissional` e `removerProfissional`
// lançam quando o Supabase recusa a operação, para que a tela possa avisar em
// vez de tratar a operação como concluída.
import { supabase } from '@/lib/supabase'
import type { Profissional, NovoProfissionalInput } from '@/modules/profissionais/types'

type ProfissionalRow = {
  id: string
  nome: string
  telefone: string
  email: string
  foto: string
  ativo: boolean
  criado_em: string
  /** migration 024 — podem não existir em bases ainda não migradas */
  whatsapp_notificacao?: string | null
  notificar_agendamentos?: boolean | null
}

function paraProfissional(row: ProfissionalRow): Profissional {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    email: row.email,
    foto: row.foto,
    ativo: row.ativo,
    criadoEm: row.criado_em,
    whatsappNotificacao: row.whatsapp_notificacao ?? '',
    notificarAgendamentos: row.notificar_agendamentos !== false,
  }
}

/** Erro de escrita com a mensagem do Supabase (ou um texto utilizável). */
function erroDeEscrita(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao gravar profissionais no Supabase.')
}

/**
 * Todos os profissionais, em ordem de nome.
 * Sem Supabase: `[]` (modo local). Com Supabase: erro de consulta lança —
 * lista vazia significa "não existe nenhum profissional", nunca "não consegui
 * ler", senão a integração do C2 trataria falha de rede como banco vazio e
 * reenviaria o cadastro local por cima do que já existe no servidor.
 */
export async function listarProfissionais(): Promise<Profissional[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('profissionais')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw new Error(error.message || 'Falha ao ler profissionais no Supabase.')
  if (!data) throw new Error('Falha ao ler profissionais no Supabase.')
  return data.map(paraProfissional)
}

export async function criarProfissional(
  input: NovoProfissionalInput & { id: string; criadoEm: string },
): Promise<Profissional | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('profissionais')
    .insert({
      id: input.id,
      nome: input.nome,
      telefone: input.telefone,
      email: input.email,
      foto: input.foto,
      whatsapp_notificacao: input.whatsappNotificacao ?? '',
      notificar_agendamentos: input.notificarAgendamentos !== false,
    })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita(undefined)
  return paraProfissional(data)
}

export async function atualizarProfissional(
  id: string,
  input: NovoProfissionalInput,
): Promise<Profissional | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('profissionais')
    .update({
      nome: input.nome,
      telefone: input.telefone,
      email: input.email,
      foto: input.foto,
      whatsapp_notificacao: input.whatsappNotificacao ?? '',
      notificar_agendamentos: input.notificarAgendamentos !== false,
    })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita('O profissional não existe mais no Supabase.')
  return paraProfissional(data)
}

export async function alternarAtivoProfissional(
  id: string,
  ativo: boolean,
): Promise<Profissional | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('profissionais')
    .update({ ativo })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita('O profissional não existe mais no Supabase.')
  return paraProfissional(data)
}

export async function removerProfissional(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('profissionais').delete().eq('id', id)
  if (error) throw erroDeEscrita(error.message)
  return true
}

/**
 * Envio das pendências locais: upsert por `id` (mesmo registro é atualizado,
 * nada é recriado com outro id).
 */
export async function importarProfissionais(
  lista: Profissional[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente.from('profissionais').upsert(
    lista.map((p) => ({
      id: p.id,
      nome: p.nome,
      telefone: p.telefone,
      email: p.email,
      foto: p.foto,
      ativo: p.ativo,
      criado_em: p.criadoEm,
      whatsapp_notificacao: p.whatsappNotificacao ?? '',
      notificar_agendamentos: p.notificarAgendamentos !== false,
    })),
    { onConflict: 'id' },
  )
  return error ? 0 : lista.length
}
