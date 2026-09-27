// Acesso ao Supabase — serviços (única camada que fala com a tabela
// `public.servicos`). Sem regra de negócio da UI aqui: só leitura/escrita.
//
// Ausência de Supabase (VITE_SUPABASE_URL / ANON_KEY vazias) mantém o app
// 100% local: as escritas devolvem null/false e não há o que confirmar.
// Falha de escrita NÃO é silenciosa: `criarServico`, `atualizarServico`,
// `alternarAtivoServico` e `removerServico` lançam quando o Supabase recusa a
// operação, para que a tela possa avisar em vez de tratar a operação como
// concluída.
import { supabase } from '@/lib/supabase'
import type { Servico, NovoServicoInput } from '@/modules/servicos/types'

type ServicoRow = {
  id: string
  nome: string
  preco: number
  duracao_min: number
  categoria: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

function paraServico(row: ServicoRow): Servico {
  return {
    id: row.id,
    nome: row.nome,
    preco: row.preco,
    duracaoMin: row.duracao_min,
    categoria: row.categoria,
    ativo: row.ativo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  }
}

/** Erro de escrita com a mensagem do Supabase (ou um texto utilizável). */
function erroDeEscrita(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao gravar serviços no Supabase.')
}

export async function listarServicos(): Promise<Servico[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('servicos')
    .select('*')
    .order('nome', { ascending: true })
  if (error || !data) return []
  return data.map(paraServico)
}

export async function criarServico(
  input: NovoServicoInput & { id: string; criadoEm: string; atualizadoEm: string },
): Promise<Servico | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('servicos')
    .insert({
      id: input.id,
      nome: input.nome,
      preco: input.preco,
      duracao_min: input.duracaoMin,
      categoria: input.categoria ?? '',
    })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita(undefined)
  return paraServico(data)
}

export async function atualizarServico(
  id: string,
  input: NovoServicoInput,
): Promise<Servico | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('servicos')
    .update({
      nome: input.nome,
      preco: input.preco,
      duracao_min: input.duracaoMin,
      categoria: input.categoria ?? '',
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita('O serviço não existe mais no Supabase.')
  return paraServico(data)
}

export async function alternarAtivoServico(
  id: string,
  ativo: boolean,
): Promise<Servico | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('servicos')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita('O serviço não existe mais no Supabase.')
  return paraServico(data)
}

export async function removerServico(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('servicos').delete().eq('id', id)
  if (error) throw erroDeEscrita(error.message)
  return true
}

/**
 * Envio das pendências locais: upsert por `id` (mesmo registro é atualizado,
 * nada é recriado com outro id).
 */
export async function importarServicos(lista: Servico[]): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente.from('servicos').upsert(
    lista.map((s) => ({
      id: s.id,
      nome: s.nome,
      preco: s.preco,
      duracao_min: s.duracaoMin,
      categoria: s.categoria,
      ativo: s.ativo,
      criado_em: s.criadoEm,
      atualizado_em: s.atualizadoEm,
    })),
    { onConflict: 'id' },
  )
  return error ? 0 : lista.length
}
