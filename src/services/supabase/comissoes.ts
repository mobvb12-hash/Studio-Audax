// Acesso ao Supabase — Comissões (configurações, fechamentos, auditoria).
//
// Regras desta camada (as mesmas de clientes/profissionais/serviços/caixa/
// produtos/estoque/agenda):
//   • Sem Supabase: leituras devolvem `[]` e escritas `null` — o app segue 100%
//     local e isso não é erro.
//   • Erro REAL de consulta ou escrita nunca vira lista vazia nem sucesso: a
//     operação lança com a mensagem original do Supabase.
//   • Toda escrita é `upsert` pela MESMA chave do app (o `profissional_id` da
//     configuração, o `id` do fechamento e do evento), então reenviar um
//     fechamento continua sendo UM fechamento — a comissão não é duplicada nem
//     paga duas vezes.
import { supabase } from '@/lib/supabase'
import type {
  ConfigComissao,
  EventoAuditoriaComissao,
  FechamentoComissao,
} from '@/modules/comissoes/types'

export type ConfigRow = {
  profissional_id: string
  percentual: number | string | null
  ativo: boolean | null
  atualizado_em: string | null
}

export type FechamentoRow = {
  id: string
  profissional_id: string | null
  profissional_nome: string | null
  periodo_inicio: string
  periodo_fim: string
  qtd_atendimentos: number | null
  producao: number | string | null
  percentual: number | string | null
  comissao: number | string | null
  fechado_em: string | null
  atualizado_em: string | null
  reaberto: unknown
}

export type AuditoriaRow = {
  id: string
  profissional_id: string | null
  profissional_nome: string | null
  acao: string | null
  periodo_inicio: string
  periodo_fim: string
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

function objeto(valor: unknown): Record<string, unknown> | undefined {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return undefined
  return valor as Record<string, unknown>
}

function erroDeLeitura(mensagem: string | undefined, tabela: string): Error {
  return new Error(mensagem || `Falha ao ler ${tabela} no Supabase.`)
}

function erroDeEscrita(mensagem: string | undefined, tabela: string): Error {
  return new Error(mensagem || `Falha ao gravar ${tabela} no Supabase.`)
}

export function paraConfig(row: ConfigRow): ConfigComissao {
  return {
    profissionalId: row.profissional_id,
    percentual: numero(row.percentual),
    ativo: row.ativo === true,
    atualizadoEm: texto(row.atualizado_em) || new Date().toISOString(),
  }
}

export function paraFechamento(row: FechamentoRow): FechamentoComissao {
  return {
    id: row.id,
    profissionalId: texto(row.profissional_id),
    profissionalNome: texto(row.profissional_nome),
    periodo: {
      inicio: texto(row.periodo_inicio),
      fim: texto(row.periodo_fim),
    },
    qtdAtendimentos: numero(row.qtd_atendimentos),
    producao: numero(row.producao),
    percentual: numero(row.percentual),
    comissao: numero(row.comissao),
    fechadoEm: texto(row.fechado_em) || new Date().toISOString(),
    atualizadoEm: texto(row.atualizado_em) || undefined,
    reaberto: objeto(row.reaberto) as FechamentoComissao['reaberto'],
  }
}

export function paraEvento(row: AuditoriaRow): EventoAuditoriaComissao {
  return {
    id: row.id,
    acao: row.acao === 'reabertura' ? 'reabertura' : 'fechamento',
    profissionalId: texto(row.profissional_id),
    profissionalNome: texto(row.profissional_nome),
    periodo: {
      inicio: texto(row.periodo_inicio),
      fim: texto(row.periodo_fim),
    },
    descricao: texto(row.descricao),
    motivo: texto(row.motivo) || undefined,
    criadoEm: texto(row.criado_em) || new Date().toISOString(),
  }
}

export function linhaConfig(c: ConfigComissao) {
  return {
    profissional_id: c.profissionalId,
    percentual: c.percentual,
    ativo: c.ativo,
    atualizado_em: c.atualizadoEm ?? new Date().toISOString(),
  }
}

export function linhaFechamento(f: FechamentoComissao) {
  return {
    id: f.id,
    profissional_id: f.profissionalId || null,
    profissional_nome: f.profissionalNome,
    periodo_inicio: f.periodo.inicio,
    periodo_fim: f.periodo.fim,
    qtd_atendimentos: f.qtdAtendimentos,
    producao: f.producao,
    percentual: f.percentual,
    comissao: f.comissao,
    fechado_em: f.fechadoEm,
    atualizado_em: f.atualizadoEm ?? f.reaberto?.em ?? f.fechadoEm,
    reaberto: f.reaberto ?? null,
  }
}

export function linhaAuditoria(a: EventoAuditoriaComissao) {
  return {
    id: a.id,
    profissional_id: a.profissionalId || null,
    profissional_nome: a.profissionalNome,
    acao: a.acao,
    periodo_inicio: a.periodo.inicio,
    periodo_fim: a.periodo.fim,
    descricao: a.descricao,
    motivo: a.motivo ?? null,
    criado_em: a.criadoEm,
  }
}

// ---------------------------------------------------------------------------
// Configurações (chave: profissional_id)
// ---------------------------------------------------------------------------

export async function listarConfigs(): Promise<ConfigComissao[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente.from('comissoes_configs').select('*')
  if (error) throw erroDeLeitura(error.message, 'as configurações de comissão')
  if (!data) throw erroDeLeitura(undefined, 'as configurações de comissão')
  return data.map((linha) => paraConfig(linha as ConfigRow))
}

export async function gravarConfig(
  c: ConfigComissao,
): Promise<ConfigComissao | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('comissoes_configs')
    .upsert(linhaConfig(c), { onConflict: 'profissional_id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'a configuração de comissão')
  if (!data) throw erroDeEscrita(undefined, 'a configuração de comissão')
  return paraConfig(data as ConfigRow)
}

export async function importarConfigs(
  lista: ConfigComissao[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('comissoes_configs')
    .upsert(
      lista.map(linhaConfig),
      { onConflict: 'profissional_id' },
    )
  return error ? 0 : lista.length
}

// ---------------------------------------------------------------------------
// Fechamentos (chave: id do app)
// ---------------------------------------------------------------------------

export async function listarFechamentos(): Promise<FechamentoComissao[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('comissoes_fechamentos')
    .select('*')
    .order('fechado_em', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'os fechamentos de comissão')
  if (!data) throw erroDeLeitura(undefined, 'os fechamentos de comissão')
  return data.map((linha) => paraFechamento(linha as FechamentoRow))
}

export async function gravarFechamento(
  f: FechamentoComissao,
): Promise<FechamentoComissao | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('comissoes_fechamentos')
    .upsert(linhaFechamento(f), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o fechamento de comissão')
  if (!data) throw erroDeEscrita(undefined, 'o fechamento de comissão')
  return paraFechamento(data as FechamentoRow)
}

export async function importarFechamentos(
  lista: FechamentoComissao[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('comissoes_fechamentos')
    .upsert(
      lista.map(linhaFechamento),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}

// ---------------------------------------------------------------------------
// Auditoria (chave: id do app)
// ---------------------------------------------------------------------------

export async function listarAuditoria(): Promise<EventoAuditoriaComissao[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente.from('comissoes_auditoria').select('*')
  if (error) throw erroDeLeitura(error.message, 'a auditoria de comissão')
  if (!data) throw erroDeLeitura(undefined, 'a auditoria de comissão')
  return data.map((linha) => paraEvento(linha as AuditoriaRow))
}

export async function gravarEvento(
  a: EventoAuditoriaComissao,
): Promise<EventoAuditoriaComissao | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('comissoes_auditoria')
    .upsert(linhaAuditoria(a), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o evento de auditoria')
  if (!data) throw erroDeEscrita(undefined, 'o evento de auditoria')
  return paraEvento(data as AuditoriaRow)
}

export async function importarAuditoria(
  lista: EventoAuditoriaComissao[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('comissoes_auditoria')
    .upsert(
      lista.map(linhaAuditoria),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}
