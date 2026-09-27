// Acesso ao Supabase — Agenda (agendamentos, bloqueios, expediente).
//
// Regras desta camada (as mesmas de clientes/profissionais/serviços/caixa/
// produtos/estoque):
//   • Sem Supabase: leituras devolvem `[]`/`null` e escritas `null`/`false` —
//     o app segue 100% local e isso não é erro.
//   • Erro REAL de consulta ou escrita nunca vira lista vazia nem sucesso: a
//     operação lança com a mensagem original do Supabase.
//   • Toda escrita é `upsert` pelo MESMO id gerado pelo app, então reenviar a
//     agenda (ou o mesmo agendamento) atualiza a linha e nunca cria um
//     segundo agendamento.
//   • `atualizado_em` é só o carimbo de conflito da sincronização: o app
//     escolhe a versão mais recente sem inventar regra de agenda nova.
import { supabase } from '@/lib/supabase'
import type {
  Agendamento,
  Bloqueio,
  Expediente,
  Remarcacao,
  StatusAgendamento,
} from '@/modules/agenda/types'

const STATUS = [
  'pendente',
  'confirmado',
  'concluido',
  'cancelado',
  'nao_compareceu',
]
const TIPOS_BLOQUEIO = ['almoco', 'folga', 'ferias', 'ausencia', 'outro']

export type AgendamentoRow = {
  id: string
  cliente: string
  telefone: string | null
  servico: string
  profissional: string
  data: string
  horario: string
  status: string
  duracao_min: number | null
  observacao: string | null
  remarcacoes: unknown
  criado_em: string | null
  atualizado_em: string | null
}

export type BloqueioRow = {
  id: string
  profissional: string
  data: string
  data_fim: string | null
  inicio: string
  fim: string
  tipo: string
  motivo: string | null
  criado_em: string | null
  atualizado_em: string | null
}

export type ExpedienteRow = {
  chave: string
  inicio: string
  fim: string
  almoco_inicio: string
  almoco_fim: string
  atualizado_em: string | null
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

function erroDeLeitura(mensagem: string | undefined, tabela: string): Error {
  return new Error(mensagem || `Falha ao ler ${tabela} no Supabase.`)
}

function erroDeEscrita(mensagem: string | undefined, tabela: string): Error {
  return new Error(mensagem || `Falha ao gravar ${tabela} no Supabase.`)
}

export function paraAgendamento(row: AgendamentoRow): Agendamento {
  const criadoEm = texto(row.criado_em) || new Date().toISOString()
  const remarcacoes = Array.isArray(row.remarcacoes)
    ? (row.remarcacoes as Remarcacao[])
    : []
  return {
    id: row.id,
    cliente: row.cliente,
    telefone: texto(row.telefone),
    servico: row.servico,
    profissional: row.profissional,
    data: texto(row.data),
    horario: texto(row.horario),
    status: (STATUS.includes(row.status) ? row.status : 'pendente') as StatusAgendamento,
    observacao: texto(row.observacao),
    criadoEm,
    // registro antigo (sem carimbo) herda o horário de criação
    atualizadoEm: texto(row.atualizado_em) || criadoEm,
    duracaoMin:
      typeof row.duracao_min === 'number' && Number.isFinite(row.duracao_min)
        ? row.duracao_min
        : undefined,
    remarcacoes: remarcacoes.length > 0 ? remarcacoes : undefined,
  }
}

export function paraBloqueio(row: BloqueioRow): Bloqueio {
  const criadoEm = texto(row.criado_em) || new Date().toISOString()
  return {
    id: row.id,
    profissional: row.profissional,
    data: texto(row.data),
    dataFim: texto(row.data_fim) || undefined,
    inicio: texto(row.inicio),
    fim: texto(row.fim),
    tipo: (TIPOS_BLOQUEIO.includes(row.tipo) ? row.tipo : 'outro') as Bloqueio['tipo'],
    motivo: texto(row.motivo),
    criadoEm,
    atualizadoEm: texto(row.atualizado_em) || criadoEm,
  }
}

export function paraExpediente(row: ExpedienteRow): Expediente {
  return {
    inicio: texto(row.inicio),
    fim: texto(row.fim),
    almocoInicio: texto(row.almoco_inicio),
    almocoFim: texto(row.almoco_fim),
  }
}

/** Agendamento do app na linha do banco (fonte da comparação de conflito). */
export function linhaAgendamento(ag: Agendamento) {
  return {
    id: ag.id,
    cliente: ag.cliente,
    telefone: ag.telefone,
    servico: ag.servico,
    profissional: ag.profissional,
    data: ag.data,
    horario: ag.horario,
    status: ag.status,
    duracao_min: ag.duracaoMin ?? null,
    observacao: ag.observacao,
    remarcacoes: ag.remarcacoes ?? [],
    criado_em: ag.criadoEm,
    atualizado_em: ag.atualizadoEm ?? ag.criadoEm,
  }
}

export function linhaBloqueio(b: Bloqueio) {
  return {
    id: b.id,
    profissional: b.profissional,
    data: b.data,
    data_fim: b.dataFim ?? null,
    inicio: b.inicio,
    fim: b.fim,
    tipo: b.tipo,
    motivo: b.motivo,
    criado_em: b.criadoEm,
    atualizado_em: b.atualizadoEm ?? b.criadoEm,
  }
}

export function linhaExpediente(e: Expediente, atualizadoEm: string) {
  return {
    chave: 'padrao',
    inicio: e.inicio,
    fim: e.fim,
    almoco_inicio: e.almocoInicio,
    almoco_fim: e.almocoFim,
    atualizado_em: atualizadoEm,
  }
}

// ---------------------------------------------------------------------------
// Agendamentos
// ---------------------------------------------------------------------------

export async function listarAgendamentos(): Promise<Agendamento[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('agendamentos')
    .select('*')
    .order('data', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'a agenda')
  if (!data) throw erroDeLeitura(undefined, 'a agenda')
  return data.map((linha) => paraAgendamento(linha as AgendamentoRow))
}

/** Grava pelo id do app (atualização inclusiva) e confirma a linha. */
export async function gravarAgendamento(
  ag: Agendamento,
): Promise<Agendamento | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('agendamentos')
    .upsert(linhaAgendamento(ag), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o agendamento')
  if (!data) throw erroDeEscrita(undefined, 'o agendamento')
  return paraAgendamento(data as AgendamentoRow)
}

export async function removerAgendamento(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('agendamentos').delete().eq('id', id)
  if (error) throw erroDeEscrita(error.message, 'o agendamento')
  return true
}

export async function importarAgendamentos(
  lista: Agendamento[],
): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('agendamentos')
    .upsert(
      lista.map(linhaAgendamento),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}

// ---------------------------------------------------------------------------
// Bloqueios
// ---------------------------------------------------------------------------

export async function listarBloqueios(): Promise<Bloqueio[]> {
  const cliente = supabase()
  if (!cliente) return []
  const { data, error } = await cliente
    .from('bloqueios')
    .select('*')
    .order('data', { ascending: true })
  if (error) throw erroDeLeitura(error.message, 'os bloqueios')
  if (!data) throw erroDeLeitura(undefined, 'os bloqueios')
  return data.map((linha) => paraBloqueio(linha as BloqueioRow))
}

export async function gravarBloqueio(b: Bloqueio): Promise<Bloqueio | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('bloqueios')
    .upsert(linhaBloqueio(b), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o bloqueio')
  if (!data) throw erroDeEscrita(undefined, 'o bloqueio')
  return paraBloqueio(data as BloqueioRow)
}

export async function removerBloqueio(id: string): Promise<boolean> {
  const cliente = supabase()
  if (!cliente) return false
  const { error } = await cliente.from('bloqueios').delete().eq('id', id)
  if (error) throw erroDeEscrita(error.message, 'o bloqueio')
  return true
}

export async function importarBloqueios(lista: Bloqueio[]): Promise<number> {
  const cliente = supabase()
  if (!cliente || lista.length === 0) return 0
  const { error } = await cliente
    .from('bloqueios')
    .upsert(
      lista.map(linhaBloqueio),
      { onConflict: 'id' },
    )
  return error ? 0 : lista.length
}

// ---------------------------------------------------------------------------
// Expediente (objeto único, chave 'padrao')
// ---------------------------------------------------------------------------

/** Expediente salvo no servidor; `null` = ainda não configurado lá. */
export async function lerExpediente(): Promise<{
  expediente: Expediente
  atualizadoEm: string
} | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('agenda_expediente')
    .select('*')
    .eq('chave', 'padrao')
    .maybeSingle()
  if (error) throw erroDeLeitura(error.message, 'o expediente')
  if (!data) return null
  const row = data as ExpedienteRow
  return {
    expediente: paraExpediente(row),
    atualizadoEm: texto(row.atualizado_em) || new Date().toISOString(),
  }
}

export async function gravarExpediente(
  expediente: Expediente,
  atualizadoEm: string,
): Promise<Expediente | null> {
  const cliente = supabase()
  if (!cliente) return null
  const { data, error } = await cliente
    .from('agenda_expediente')
    .upsert(linhaExpediente(expediente, atualizadoEm), { onConflict: 'chave' })
    .select()
    .maybeSingle()
  if (error) throw erroDeEscrita(error.message, 'o expediente')
  if (!data) throw erroDeEscrita(undefined, 'o expediente')
  return paraExpediente(data as ExpedienteRow)
}
