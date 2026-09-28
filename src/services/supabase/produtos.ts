// Acesso ao Supabase — produtos (cadastro + saldo atual do estoque).
//
// Regras desta camada (as mesmas de clientes/profissionais/serviços/caixa):
//   • Sem Supabase: leituras devolvem `[]` e escritas `null`/`false` — o app
//     segue 100% local e isso não é erro.
//   • Erro REAL de consulta ou escrita nunca vira lista vazia nem sucesso: a
//     operação lança com a mensagem original do Supabase.
//   • Toda escrita é `upsert` pelo MESMO id do app, então reenviar pendência
//     atualiza a linha e não duplica produto.
import { supabase } from '@/lib/supabase'
import type { Produto } from '@/modules/produtos/types'

export type ProdutoRow = {
  id: string
  nome: string
  preco: number | string | null
  custo: number | string | null
  estoque: number | null
  estoque_minimo: number | null
  categoria: string | null
  foto: string | null
  ativo: boolean | null
  criado_em: string | null
  atualizado_em: string | null
}

function numero(valor: unknown, padrao = 0): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim() !== '') {
    const convertido = Number(valor)
    if (Number.isFinite(convertido)) return convertido
  }
  return padrao
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function paraProduto(row: ProdutoRow): Produto {
  return {
    id: row.id,
    nome: row.nome,
    preco: numero(row.preco),
    custo: numero(row.custo),
    estoque: Math.max(0, Math.trunc(numero(row.estoque))),
    estoqueMinimo: Math.max(0, Math.trunc(numero(row.estoque_minimo))),
    categoria: texto(row.categoria),
    foto: texto(row.foto),
    ativo: row.ativo === true,
    criadoEm: texto(row.criado_em) || new Date().toISOString(),
    atualizadoEm: texto(row.atualizado_em) || new Date().toISOString(),
  }
}

/** Produto do app na linha do banco (fonte da comparação de conflito). */
export function linhaProduto(p: Produto) {
  return {
    id: p.id,
    nome: p.nome,
    preco: p.preco,
    custo: p.custo,
    estoque: p.estoque,
    estoque_minimo: p.estoqueMinimo,
    categoria: p.categoria,
    foto: p.foto,
    ativo: p.ativo,
    criado_em: p.criadoEm,
    atualizado_em: p.atualizadoEm,
  }
}

function erroDeLeitura(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao ler produtos no Supabase.')
}

function erroDeEscrita(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao gravar produtos no Supabase.')
}

/**
 * Todos os produtos em ordem de nome. Vazio = base sem produtos.
 *
 * O `order` leva o nome CRU: o PostgREST não aceita expressão de função no
 * parâmetro `order` e recusa a requisição inteira com PGRST108
 * ("'lower' is not an embedded resource in this request"). A ordenação
 * case-insensitive é feita em `modules/produtos/store.tsx` (`ordenar`, com
 * `localeCompare(..., 'pt-BR')`), igual a clientes/profissionais/serviços —
 * aqui o `order` só garante uma base determinística.
 */
export async function listarProdutos(): Promise<Produto[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('produtos')
    .select('*')
    .order('nome', { ascending: true })
  if (error) throw erroDeLeitura(error.message)
  if (!data) throw erroDeLeitura(undefined)
  return data.map((linha) => paraProduto(linha as ProdutoRow))
}

/** Grava pelo id do app (atualização inclusiva) e confirma a linha. */
export async function criarProduto(p: Produto): Promise<Produto | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('produtos')
    .upsert(linhaProduto(p), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita(undefined)
  return paraProduto(data as ProdutoRow)
}

/** Confirma a linha gravada; registro inexistente é falha. */
export async function atualizarProduto(
  id: string,
  p: Produto,
): Promise<Produto | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('produtos')
    .update(linhaProduto(p))
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita('O produto não existe mais no Supabase.')
  return paraProduto(data as ProdutoRow)
}

/**
 * Reenvio das pendências locais: upsert por `id` (nunca duplica produto) e
 * devolve quantas linhas foram enviadas — 0 = indisponível ou falha.
 */
export async function importarProdutos(lista: Produto[]): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('produtos')
    .upsert(
      lista.map(linhaProduto),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}
