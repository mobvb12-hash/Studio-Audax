// Acesso ao Supabase — Audax Club (assinaturas e pagamentos).
//
// Regras desta camada (as mesmas de clientes/profissionais/serviços/caixa/
// produtos/estoque/agenda/comissões):
//   • Sem Supabase: leituras devolvem `[]` e escritas `null` — o app segue 100%
//     local e isso não é erro.
//   • Erro REAL de consulta ou escrita nunca vira lista vazia nem sucesso: a
//     operação lança com a mensagem original do Supabase.
//   • Toda escrita é `upsert` pela MESMA chave do app (o `id` da assinatura e
//     do pagamento), então reenviar assinatura ou pagamento continua sendo UM
//     registro — nenhuma mensalidade entra duas vezes.
//   • O status da assinatura NÃO é gravado: é sempre derivado de
//     `proximo_vencimento` + `cancelada` (ver `modules/clube/regras.ts`).
import { supabase } from '@/lib/supabase'
import type { AssinaturaClube, PagamentoClube } from '@/modules/clube/types'

export type AssinaturaRow = {
  id: string
  cliente_id: string | null
  cliente: string | null
  plano: string | null
  valor_mensal: number | string | null
  data_assinatura: string | null
  proximo_vencimento: string | null
  cancelada: boolean | null
  cancelada_em: string | null
  motivo_cancelamento: string | null
  criado_em: string | null
  atualizado_em: string | null
}

export type PagamentoRow = {
  id: string
  assinatura_id: string | null
  cliente_id: string | null
  data: string | null
  valor: number | string | null
  forma_pagamento: string | null
  caixa_lancamento_id: string | null
  vencimento_coberto: string | null
  criado_em: string | null
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function numero(valor: unknown, padrao = 0): number {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim() !== '') {
    const convertido = Number(valor)
    if (Number.isFinite(convertido)) return convertido
  }
  return padrao
}

function erroDeLeitura(mensagem: string | undefined, tabela: string): Error {
  return new Error(mensagem || `Falha ao ler ${tabela} no Supabase.`)
}

function erroDeEscrita(mensagem: string | undefined, tabela: string): Error {
  return new Error(mensagem || `Falha ao gravar ${tabela} no Supabase.`)
}

/** Plano fora do conjunto conhecido cai em `cabelo` (valor mais conservador). */
function planoDe(valor: string): AssinaturaClube['plano'] {
  if (valor === 'barba' || valor === 'cabelo_barba' || valor === 'cabelo') {
    return valor
  }
  return 'cabelo'
}

export function paraAssinatura(row: AssinaturaRow): AssinaturaClube {
  const criadoEm = texto(row.criado_em) || new Date().toISOString()
  return {
    id: row.id,
    clienteId: texto(row.cliente_id),
    cliente: texto(row.cliente),
    plano: planoDe(texto(row.plano)),
    valorMensal: numero(row.valor_mensal),
    dataAssinatura: texto(row.data_assinatura),
    proximoVencimento: texto(row.proximo_vencimento),
    cancelada: row.cancelada === true,
    canceladaEm: texto(row.cancelada_em) || undefined,
    motivoCancelamento: texto(row.motivo_cancelamento) || undefined,
    criadoEm,
    atualizadoEm: texto(row.atualizado_em) || criadoEm,
  }
}

export function paraPagamento(row: PagamentoRow): PagamentoClube {
  return {
    id: row.id,
    assinaturaId: texto(row.assinatura_id),
    clienteId: texto(row.cliente_id),
    data: texto(row.data),
    valor: numero(row.valor),
    formaPagamento: texto(row.forma_pagamento) as PagamentoClube['formaPagamento'],
    caixaLancamentoId: texto(row.caixa_lancamento_id) || undefined,
    vencimentoCoberto: texto(row.vencimento_coberto) || undefined,
    criadoEm: texto(row.criado_em) || new Date().toISOString(),
  }
}

export function linhaAssinatura(a: AssinaturaClube) {
  return {
    id: a.id,
    cliente_id: a.clienteId || null,
    cliente: a.cliente,
    plano: a.plano,
    valor_mensal: a.valorMensal,
    data_assinatura: a.dataAssinatura,
    proximo_vencimento: a.proximoVencimento,
    cancelada: a.cancelada,
    cancelada_em: a.canceladaEm ?? null,
    motivo_cancelamento: a.motivoCancelamento ?? null,
    criado_em: a.criadoEm,
    atualizado_em: a.atualizadoEm ?? a.criadoEm,
  }
}

export function linhaPagamento(p: PagamentoClube) {
  return {
    id: p.id,
    assinatura_id: p.assinaturaId || null,
    cliente_id: p.clienteId || null,
    data: p.data,
    valor: p.valor,
    forma_pagamento: p.formaPagamento,
    caixa_lancamento_id: p.caixaLancamentoId ?? null,
    vencimento_coberto: p.vencimentoCoberto ?? null,
    criado_em: p.criadoEm,
  }
}

// ---------------------------------------------------------------------------
// Assinaturas (chave: id do app)
// ---------------------------------------------------------------------------

export async function listarAssinaturas(): Promise<AssinaturaClube[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente.from('clube_assinaturas').select('*')
  if (error) throw erroDeLeitura(error.message, 'as assinaturas do clube')
  if (!data) throw erroDeLeitura(undefined, 'as assinaturas do clube')
  return data.map((linha) => paraAssinatura(linha as AssinaturaRow))
}

export async function gravarAssinatura(
  assinatura: AssinaturaClube,
): Promise<AssinaturaClube | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('clube_assinaturas')
    .upsert(linhaAssinatura(assinatura), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'a assinatura do clube')
  if (!data) throw erroDeEscrita(undefined, 'a assinatura do clube')
  return paraAssinatura(data as AssinaturaRow)
}

export async function importarAssinaturas(
  lista: AssinaturaClube[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('clube_assinaturas')
    .upsert(
      lista.map(linhaAssinatura),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}

// ---------------------------------------------------------------------------
// Pagamentos (chave: id do app — histórico, não muda depois de gravado)
// ---------------------------------------------------------------------------

export async function listarPagamentos(): Promise<PagamentoClube[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('clube_pagamentos')
    .select('*')
    .order('criado_em', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'os pagamentos do clube')
  if (!data) throw erroDeLeitura(undefined, 'os pagamentos do clube')
  return data.map((linha) => paraPagamento(linha as PagamentoRow))
}

export async function gravarPagamento(
  pagamento: PagamentoClube,
): Promise<PagamentoClube | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('clube_pagamentos')
    .upsert(linhaPagamento(pagamento), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o pagamento do clube')
  if (!data) throw erroDeEscrita(undefined, 'o pagamento do clube')
  return paraPagamento(data as PagamentoRow)
}

export async function importarPagamentos(
  lista: PagamentoClube[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('clube_pagamentos')
    .upsert(
      lista.map(linhaPagamento),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}
