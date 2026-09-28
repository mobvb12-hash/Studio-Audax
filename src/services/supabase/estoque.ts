// Acesso ao Supabase — movimentações de estoque (histórico imutável).
//
// Regras desta camada (as mesmas de clientes/profissionais/serviços/caixa):
//   • Sem Supabase: leitura `[]` e escrita `null` — o app segue 100% local e
//     isso não é erro.
//   • Erro REAL de consulta ou escrita lança com a mensagem original.
//   • Integridade de estoque: a chave primária é o MESMO id gerado pelo app e
//     toda escrita é `upsert` por `id`. Reenviar a mesma movimentação — ou a
//     mesma venda inteira, no retry da sincronização — ATUALIZA a linha e
//     nunca cria uma segunda movimentação, então o estoque não baixa duas
//     vezes.
import { supabase } from '@/lib/supabase'
import type { MovimentacaoEstoque } from '@/modules/estoque/types'

export type MovimentacaoRow = {
  id: string
  produto_id: string | null
  produto: string
  tipo: string
  quantidade: number
  estoque_antes: number | null
  estoque_depois: number | null
  custo_unitario: number | string | null
  data: string
  hora: string | null
  origem: string
  venda_id: string | null
  fornecedor: string | null
  motivo: string | null
  observacao: string | null
  criado_em: string | null
}

const TIPOS = ['inicial', 'entrada', 'venda', 'estorno', 'ajuste']
const ORIGENS = ['cadastro', 'pdv', 'estorno', 'manual']

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

export function paraMovimentacao(row: MovimentacaoRow): MovimentacaoEstoque {
  return {
    id: row.id,
    produtoId: texto(row.produto_id),
    produto: texto(row.produto),
    tipo: (TIPOS.includes(row.tipo) ? row.tipo : 'entrada') as MovimentacaoEstoque['tipo'],
    quantidade: numero(row.quantidade),
    estoqueAntes: numero(row.estoque_antes),
    estoqueDepois: numero(row.estoque_depois),
    custoUnitario: numero(row.custo_unitario),
    fornecedor: texto(row.fornecedor) || undefined,
    data: texto(row.data),
    hora: texto(row.hora),
    origem: (ORIGENS.includes(row.origem)
      ? row.origem
      : 'manual') as MovimentacaoEstoque['origem'],
    vendaId: texto(row.venda_id) || undefined,
    motivo: (texto(row.motivo) || undefined) as MovimentacaoEstoque['motivo'],
    observacao: texto(row.observacao) || undefined,
    criadoEm: texto(row.criado_em) || new Date().toISOString(),
  }
}

/** Movimentação do app na linha do banco (fonte da comparação de conflito). */
export function linhaMovimentacao(m: MovimentacaoEstoque) {
  return {
    id: m.id,
    produto_id: m.produtoId,
    produto: m.produto,
    tipo: m.tipo,
    quantidade: m.quantidade,
    estoque_antes: m.estoqueAntes,
    estoque_depois: m.estoqueDepois,
    custo_unitario: m.custoUnitario,
    data: m.data,
    hora: m.hora,
    origem: m.origem,
    venda_id: m.vendaId ?? null,
    fornecedor: m.fornecedor ?? '',
    motivo: m.motivo ?? '',
    observacao: m.observacao ?? '',
    criado_em: m.criadoEm,
  }
}

function erroDeLeitura(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao ler o estoque no Supabase.')
}

function erroDeEscrita(mensagem: string | undefined): Error {
  return new Error(mensagem || 'Falha ao gravar o estoque no Supabase.')
}

/** Histórico completo, do mais antigo ao mais novo. */
export async function listarMovimentacoes(): Promise<MovimentacaoEstoque[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('estoque_movimentacoes')
    .select('*')
    .order('criado_em', { ascending: true })
  if (error) throw erroDeLeitura(error.message)
  if (!data) throw erroDeLeitura(undefined)
  return data.map((linha) => paraMovimentacao(linha as MovimentacaoRow))
}

/**
 * Grava a movimentação pelo MESMO id do app: `upsert` torna o reenvio
 * idempotente (uma movimentação reenviada continua sendo uma só) e a linha
 * devolvida confirma o que o servidor gravou.
 */
export async function gravarMovimentacao(
  m: MovimentacaoEstoque,
): Promise<MovimentacaoEstoque | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('estoque_movimentacoes')
    .upsert(linhaMovimentacao(m), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message)
  if (!data) throw erroDeEscrita(undefined)
  return paraMovimentacao(data as MovimentacaoRow)
}

/**
 * Reenvio das pendências: upsert por `id` + contagem. É o caminho usado pela
 * sincronização — reenviar a mesma lista várias vezes nunca duplica
 * movimentação nem baixa o estoque de novo.
 */
export async function importarMovimentacoes(
  lista: MovimentacaoEstoque[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('estoque_movimentacoes')
    .upsert(
      lista.map(linhaMovimentacao),
      { onConflict: 'id' },
    )
  if (error) {
    console.warn('[estoque] falha ao enviar as movimentações para o Supabase.', {
      codigo: error.code,
      mensagem: error.message,
      detalhes: error.details,
    })
    return 0
  }
  return lista.length
}
