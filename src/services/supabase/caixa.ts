// Acesso ao Supabase — Caixa (lançamentos, fechamentos, auditoria).
//
// Regras desta camada (as mesmas de clientes/profissionais/serviços):
//   • Sem Supabase (VITE_SUPABASE_URL / ANON_KEY vazias): o app segue 100%
//     local — leituras devolvem `[]` e escritas `null`/`false`. Não é erro.
//   • Erro REAL de consulta ou de escrita nunca vira lista vazia nem sucesso:
//     a consulta lança com a mensagem original do Supabase.
//   • `importar*` devolvem quantas linhas foram enviadas (0 = falha) para que
//     quem chama compare com o esperado — é o que permite reenviar pendência
//     sem nunca duplicar: o upsert é por `id`, a chave gerada pelo app.
import { supabase } from '@/lib/supabase'
import type {
  EventoAuditoria,
  Fechamento,
  Lancamento,
  ResumoFechamento,
} from '@/modules/caixa/types'

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export type LancamentoRow = {
  id: string
  tipo: string
  origem: string
  data: string
  hora: string | null
  descricao: string | null
  valor: number | string | null
  desconto: number | string | null
  valor_liquido: number | string | null
  forma_pagamento: string
  cliente: string | null
  cliente_id: string | null
  profissional: string | null
  servico: string | null
  agendamento_id: string | null
  assinatura_id: string | null
  produto: string | null
  quantidade: number | null
  itens: unknown
  categoria: string | null
  observacao: string | null
  estornado: boolean | null
  estornado_em: string | null
  criado_em: string | null
}

export type FechamentoRow = {
  id: string
  data: string
  fechado_em: string | null
  resumo: unknown
  reaberto: unknown
}

export type AuditoriaRow = {
  id: string
  acao: string
  data: string
  descricao: string | null
  motivo: string | null
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

function objeto(valor: unknown): Record<string, unknown> | undefined {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return undefined
  return valor as Record<string, unknown>
}

/** Converte a linha do banco no lançamento do app (fidelidade total). */
export function paraLancamento(row: LancamentoRow): Lancamento {
  const itens = Array.isArray(row.itens) ? row.itens : []
  return {
    id: row.id,
    tipo: row.tipo === 'despesa' ? 'despesa' : 'receita',
    origem:
      row.origem === 'produto' || row.origem === 'clube' ? row.origem : 'atendimento',
    data: texto(row.data),
    hora: texto(row.hora),
    descricao: texto(row.descricao),
    valor: numero(row.valor),
    desconto: numero(row.desconto),
    valorLiquido: numero(row.valor_liquido),
    formaPagamento: (
      ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro'].includes(
        row.forma_pagamento,
      )
        ? row.forma_pagamento
        : 'outro'
    ) as Lancamento['formaPagamento'],
    cliente: texto(row.cliente) || undefined,
    clienteId: texto(row.cliente_id) || undefined,
    profissional: texto(row.profissional) || undefined,
    servico: texto(row.servico) || undefined,
    agendamentoId: texto(row.agendamento_id) || undefined,
    assinaturaId: texto(row.assinatura_id) || undefined,
    produto: texto(row.produto) || undefined,
    quantidade:
      typeof row.quantidade === 'number' && Number.isFinite(row.quantidade)
        ? row.quantidade
        : undefined,
    itens: itens.length > 0 ? (itens as Lancamento['itens']) : undefined,
    categoria: texto(row.categoria) || undefined,
    observacao: texto(row.observacao) || undefined,
    criadoEm: texto(row.criado_em) || new Date().toISOString(),
    estornado: row.estornado === true,
    estornadoEm: texto(row.estornado_em) || undefined,
  }
}

export function paraFechamento(row: FechamentoRow): Fechamento {
  return {
    id: row.id,
    data: texto(row.data),
    fechadoEm: texto(row.fechado_em) || new Date().toISOString(),
    resumo: objeto(row.resumo) as unknown as ResumoFechamento,
    reaberto: objeto(row.reaberto) as Fechamento['reaberto'],
  }
}

export function paraEvento(row: AuditoriaRow): EventoAuditoria {
  return {
    id: row.id,
    acao: row.acao === 'reabertura' ? 'reabertura' : 'estorno',
    data: texto(row.data),
    descricao: texto(row.descricao),
    motivo: texto(row.motivo) || undefined,
    criadoEm: texto(row.criado_em) || new Date().toISOString(),
  }
}

/** Lançamento do app na linha do banco (fonte da comparação de conflito). */
export function linhaLancamento(l: Lancamento) {
  return {
    id: l.id,
    tipo: l.tipo,
    origem: l.origem,
    data: l.data,
    hora: l.hora,
    descricao: l.descricao,
    valor: l.valor,
    desconto: l.desconto,
    valor_liquido: l.valorLiquido,
    forma_pagamento: l.formaPagamento,
    cliente: l.cliente ?? null,
    cliente_id: l.clienteId ?? null,
    profissional: l.profissional ?? null,
    servico: l.servico ?? '',
    agendamento_id: l.agendamentoId ?? null,
    assinatura_id: l.assinaturaId ?? null,
    produto: l.produto ?? '',
    quantidade: l.quantidade ?? null,
    itens: l.itens ?? [],
    categoria: l.categoria ?? '',
    observacao: l.observacao ?? '',
    estornado: l.estornado ?? false,
    estornado_em: l.estornadoEm ?? null,
    criado_em: l.criadoEm,
  }
}

export function linhaFechamento(f: Fechamento) {
  return {
    id: f.id,
    data: f.data,
    fechado_em: f.fechadoEm,
    resumo: f.resumo ?? {},
    reaberto: f.reaberto ?? null,
  }
}

export function linhaAuditoria(a: EventoAuditoria) {
  return {
    id: a.id,
    acao: a.acao,
    data: a.data,
    descricao: a.descricao,
    motivo: a.motivo ?? null,
    criado_em: a.criadoEm,
  }
}

// ---------------------------------------------------------------------------
// Leituras — erro real lança, consulta vazia devolve lista vazia
// ---------------------------------------------------------------------------

/** Todos os lançamentos, do mais antigo ao mais novo. */
export async function listarLancamentos(): Promise<Lancamento[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('caixa_lancamentos')
    .select('*')
    .order('criado_em', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'os lançamentos')
  if (!data) throw erroDeLeitura(undefined, 'os lançamentos')
  return data.map((linha) => paraLancamento(linha as LancamentoRow))
}

export async function listarFechamentos(): Promise<Fechamento[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('caixa_fechamentos')
    .select('*')
    .order('fechado_em', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'os fechamentos')
  if (!data) throw erroDeLeitura(undefined, 'os fechamentos')
  return data.map((linha) => paraFechamento(linha as FechamentoRow))
}

export async function listarAuditoria(): Promise<EventoAuditoria[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('caixa_auditoria')
    .select('*')
    .order('criado_em', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'a auditoria')
  if (!data) throw erroDeLeitura(undefined, 'a auditoria')
  return data.map((linha) => paraEvento(linha as AuditoriaRow))
}

// ---------------------------------------------------------------------------
// Escritas — sempre confirmam o resultado
// ---------------------------------------------------------------------------

/**
 * Grava (ou atualiza) o lançamento pelo MESMO id do app — `upsert` torna o
 * reenvio de pendência idempotente: nunca nasce um lançamento duplicado nem
 * um valor contado duas vezes.
 */
export async function criarLancamento(l: Lancamento): Promise<Lancamento | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('caixa_lancamentos')
    .upsert(linhaLancamento(l), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o lançamento')
  if (!data) throw erroDeEscrita(undefined, 'o lançamento')
  return paraLancamento(data as LancamentoRow)
}

/** Estorno/renomeação: confirma a linha gravada. */
export async function atualizarLancamento(
  id: string,
  l: Lancamento,
): Promise<Lancamento | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('caixa_lancamentos')
    .update(linhaLancamento(l))
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o lançamento')
  if (!data) throw erroDeEscrita('O lançamento não existe mais no Supabase.', 'o lançamento')
  return paraLancamento(data as LancamentoRow)
}

export async function removerLancamento(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('caixa_lancamentos').delete().eq('id', id)
  if (error) throw erroDeEscrita(error.message, 'o lançamento')
  return true
}

export async function criarFechamento(f: Fechamento): Promise<Fechamento | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('caixa_fechamentos')
    .upsert(linhaFechamento(f), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o fechamento')
  if (!data) throw erroDeEscrita(undefined, 'o fechamento')
  return paraFechamento(data as FechamentoRow)
}

/** Reabertura: confirma a linha gravada. */
export async function atualizarFechamento(
  id: string,
  f: Fechamento,
): Promise<Fechamento | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('caixa_fechamentos')
    .update(linhaFechamento(f))
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o fechamento')
  if (!data) throw erroDeEscrita('O fechamento não existe mais no Supabase.', 'o fechamento')
  return paraFechamento(data as FechamentoRow)
}

export async function criarEventoAuditoria(
  evento: EventoAuditoria,
): Promise<EventoAuditoria | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('caixa_auditoria')
    .upsert(linhaAuditoria(evento), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o evento de auditoria')
  if (!data) throw erroDeEscrita(undefined, 'o evento de auditoria')
  return paraEvento(data as AuditoriaRow)
}

// ---------------------------------------------------------------------------
// Importação (pendência/migração): upsert por `id` + contagem
// ---------------------------------------------------------------------------

/** Quantas linhas foram realmente enviadas; 0 = indisponível ou falha. */
export async function importarLancamentos(lista: Lancamento[]): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('caixa_lancamentos')
    .upsert(
      lista.map(linhaLancamento),
      { onConflict: 'id' },
    )
  if (error) {
    console.warn('[caixa] falha ao enviar os lançamentos para o Supabase.', {
      codigo: error.code,
      mensagem: error.message,
      detalhes: error.details,
    })
    return 0
  }
  return lista.length
}

export async function importarFechamentos(lista: Fechamento[]): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('caixa_fechamentos')
    .upsert(
      lista.map(linhaFechamento),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}

export async function importarAuditoria(
  lista: EventoAuditoria[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('caixa_auditoria')
    .upsert(
      lista.map(linhaAuditoria),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}
