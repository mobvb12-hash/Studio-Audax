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
  }
}

export async function listarProfissionais(): Promise<Profissional[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('profissionais')
    .select('*')
    .order('nome', { ascending: true })
  if (error || !data) return []
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
    })
    .select()
    .maybeSingle()
  if (error || !data) return null
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
    })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error || !data) return null
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
  if (error || !data) return null
  return paraProfissional(data)
}

export async function removerProfissional(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('profissionais').delete().eq('id', id)
  return !error
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
    })),
    { onConflict: 'id' },
  )
  return error ? 0 : lista.length
}
