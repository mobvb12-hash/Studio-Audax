// ============================================================================
// Club → Pote: acesso ao Supabase.
//
// Mesmo padrão dos outros serviços do projeto: a camada remota é isolada aqui e
// o resto do app só conhece as funções puras de `modules/clube/pote.ts`.
//
// SEM SEGREDO NO FRONTEND (item 24): nada aqui leva chave de service_role.
// As regras críticas são recalculadas pelo servidor a cada chamada — este
// arquivo só entrega o que o banco respondeu.
// ============================================================================
import { supabase } from '@/lib/supabase'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { FichaProducao, Periodo, RateioPote } from '@/modules/clube/pote'

export type RespostaBeneficio = {
  ok: boolean
  servicoEncontrado: boolean
  clienteId?: string | null
  assinaturaId?: string | null
  cliente?: string
  plano?: string | null
  statusAssinatura?: string | null
  beneficioLiberado?: boolean
  usarBeneficio?: boolean
  servicoId?: string | null
  servico?: string
  categoria?: string
  valorTabela: number
  valorPago: number
  beneficio: number
  tipoBeneficio: 'ilimitado' | 'desconto' | 'avulso'
  descontoPercentual: number
  motivo?: string | null
  registrado?: boolean
  id?: string
  periodoPote?: string
}

export type FechamentoPote = {
  id: string
  periodoInicio: string
  periodoFim: string
  receita: number
  percentual: number
  pote: number
  producaoTotal: number
  fichasTotal: number
  partes: RateioPote['partes']
  fechadoPor: string
  fechadoEm: string
  reaberto?: { em: string; motivo: string } | null
}

export type CalculoPote = RateioPote & {
  ok: boolean
  motivo?: string | null
  periodoInicio: string
  periodoFim: string
  percentualConfigurado?: number | null
  poteAtivo?: boolean
  participantesConfigurados?: string[]
  jaFechado?: boolean
}

export type ListagemPote = {
  fechamentos: FechamentoPote[]
  fichas: FichaProducao[]
  config: {
    ativo?: boolean
    percentual?: number
    participantes?: string[]
  }
}

function erro(error: unknown, padrao: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    const mensagem = String((error as { message: unknown }).message ?? '').trim()
    if (mensagem) return new Error(mensagem.replace(/^[A-Z0-9]{5}:\s*/, ''))
  }
  return new Error(padrao)
}

/**
 * O benefício de um serviço, decidido pelo SERVIDOR.
 *
 * É a única fonte da resposta: a interface não calcula cobertura, desconto nem
 * preço — ela mostra o que o banco decidiu. Quando a assinatura está irregular,
 * vem `beneficioLiberado: false` com a `motivo` que o WhatsApp também mostra.
 */
export async function resolverBeneficio(p: {
  clienteId?: string
  telefone?: string
  servico: string
  data: string
  usarBeneficio?: boolean
}): Promise<RespostaBeneficio> {
  const db = supabase()
  if (!db) {
    return {
      ok: false,
      servicoEncontrado: false,
      valorTabela: 0,
      valorPago: 0,
      beneficio: 0,
      tipoBeneficio: 'avulso',
      descontoPercentual: 0,
      motivo: 'Serviço indisponível.',
    }
  }
  const { data, error } = await db.rpc('audax_clube_beneficio', {
    p_cliente_id: p.clienteId ?? '',
    p_telefone: p.telefone ?? '',
    p_servico: p.servico,
    p_data: p.data || hojeISO(),
    p_usar_beneficio: p.usarBeneficio ?? true,
  })
  if (error) throw erro(error, 'Não foi possível consultar a assinatura.')
  return (data ?? {
    ok: false,
    servicoEncontrado: false,
    valorTabela: 0,
    valorPago: 0,
    beneficio: 0,
    tipoBeneficio: 'avulso',
    descontoPercentual: 0,
    motivo: 'Não foi possível consultar a assinatura.',
  }) as RespostaBeneficio
}

/**
 * Registra a ficha de produção do Club.
 *
 * O SERVIDOR revalida a assinatura e recalcula os valores: o que o app manda é
 * só o contexto do atendimento (quem, qual serviço, quando). Uma assinatura
 * em atraso devolve `registrado: false` e nenhuma ficha é criada — é a regra do
 * item 3 garantida no banco, não na tela.
 */
export async function registrarAtendimentoClub(p: {
  clienteId?: string
  telefone?: string
  servico: string
  profissional: string
  data: string
  horario?: string
  duracaoMin?: number
  agendamentoId?: string
  origem?: 'caixa' | 'agenda' | 'manual'
  usarBeneficio?: boolean
}): Promise<RespostaBeneficio> {
  const db = supabase()
  if (!db) throw new Error('Sem conexão com o banco.')
  const { data, error } = await db.rpc('clube_atendimento_registrar', {
    p_cliente_id: p.clienteId ?? '',
    p_telefone: p.telefone ?? '',
    p_servico: p.servico,
    p_profissional: p.profissional,
    p_data: p.data || hojeISO(),
    p_horario: p.horario ?? '',
    p_duracao_min: p.duracaoMin ?? 0,
    p_agendamento_id: p.agendamentoId ?? '',
    p_origem: p.origem ?? 'caixa',
    p_usar_beneficio: p.usarBeneficio ?? true,
  })
  if (error) throw erro(error, 'Não foi possível registrar a produção do Club.')
  return (data ?? {}) as RespostaBeneficio
}

/** Estorna uma ficha — corrige produção sem apagar histórico. */
export async function estornarFicha(id: string, motivo: string): Promise<void> {
  const db = supabase()
  if (!db) throw new Error('Sem conexão com o banco.')
  const { error } = await db.rpc('clube_producao_estornar', {
    p_id: id,
    p_motivo: motivo,
  })
  if (error) throw erro(error, 'Não foi possível estornar a ficha.')
}

/** Dry run: o que a tela mostra antes de fechar (item 18). */
export async function calcularPote(p: {
  periodo: Periodo
  percentual?: number
  participantes?: string[]
}): Promise<CalculoPote> {
  const db = supabase()
  if (!db) throw new Error('Sem conexão com o banco.')
  const { data, error } = await db.rpc('clube_pote_calcular', {
    p_inicio: p.periodo.inicio,
    p_fim: p.periodo.fim,
    p_percentual: p.percentual ?? null,
    p_profissionais: p.participantes ?? [],
  })
  if (error) throw erro(error, 'Não foi possível calcular o fechamento.')
  return normalizaCalculo(data as Record<string, unknown>)
}

/** Fecha o período: snapshot imutável + auditoria (item 21). */
export async function fecharPote(p: {
  periodo: Periodo
  percentual?: number
  participantes?: string[]
  responsavel?: string
}): Promise<{ id: string; fechadoEm: string }> {
  const db = supabase()
  if (!db) throw new Error('Sem conexão com o banco.')
  const { data, error } = await db.rpc('clube_pote_fechar', {
    p_inicio: p.periodo.inicio,
    p_fim: p.periodo.fim,
    p_percentual: p.percentual ?? null,
    p_profissionais: p.participantes ?? [],
    p_responsavel: p.responsavel ?? '',
  })
  if (error) throw erro(error, 'Não foi possível fechar o pote.')
  const retorno = (data ?? {}) as { id?: string; fechadoEm?: string }
  return { id: retorno.id ?? '', fechadoEm: retorno.fechadoEm ?? '' }
}

/** Reabre com motivo, preservando o histórico do cálculo (item 22). */
export async function reabrirPote(id: string, motivo: string): Promise<void> {
  const db = supabase()
  if (!db) throw new Error('Sem conexão com o banco.')
  const { error } = await db.rpc('clube_pote_reabrir', { p_id: id, p_motivo: motivo })
  if (error) throw erro(error, 'Não foi possível reabrir o fechamento.')
}

/** Fechamentos e fichas do período — para o relatório e o detalhamento. */
export async function listarPote(
  periodo?: Periodo,
): Promise<ListagemPote> {
  const db = supabase()
  if (!db) return { fechamentos: [], fichas: [], config: {} }
  const { data, error } = await db.rpc('clube_pote_listar', {
    p_inicio: periodo?.inicio ?? null,
    p_fim: periodo?.fim ?? null,
  })
  if (error) throw erro(error, 'Não foi possível carregar o fechamento.')
const bruto = (data ?? {}) as { fechamentos?: unknown; fichas?: unknown; config?: unknown }
  const fichasBrutas = Array.isArray(bruto.fichas) ? bruto.fichas : []
  const fechamentosBrutos = Array.isArray(bruto.fechamentos) ? bruto.fechamentos : []
  return {
    fechamentos: fechamentosBrutos as FechamentoPote[],
    fichas: (fichasBrutas as Record<string, unknown>[]).map(normalizaFicha),
    config: (bruto.config ?? {}) as ListagemPote['config'],
  }
}

/** snake_case do banco → camelCase do app. */
function normalizaFicha(linha: Record<string, unknown>): FichaProducao {
  return {
    id: String(linha.id ?? ''),
    clienteId: (linha.clienteId as string) ?? undefined,
    cliente: String(linha.cliente ?? ''),
    plano: String(linha.plano ?? ''),
    servico: String(linha.servico ?? ''),
    valorTabela: Number(linha.valorTabela ?? 0),
    valorPago: Number(linha.valorPago ?? 0),
    beneficio: Number(linha.beneficio ?? 0),
    tipoBeneficio: (linha.tipoBeneficio as FichaProducao['tipoBeneficio']) ?? 'avulso',
    descontoPercentual: Number(linha.descontoPercentual ?? 0),
    profissionalId: (linha.profissionalId as string) ?? undefined,
    profissional: String(linha.profissional ?? ''),
    data: String(linha.data ?? ''),
    horario: String(linha.horario ?? ''),
    duracaoMin: Number(linha.duracaoMin ?? 0),
    fichas: Number(linha.fichas ?? 1),
    periodoPote: String(linha.periodoPote ?? ''),
    estornado: Boolean(linha.estornado),
    fechamentoId: (linha.fechamentoId as string) ?? null,
  }
}

/** snake_case do banco → o formato de `CalculoPote`. */
function normalizaCalculo(bruto: Record<string, unknown>): CalculoPote {
  const listaBruta = Array.isArray(bruto.partes) ? bruto.partes : []
  const partes = (listaBruta as Record<string, unknown>[]).map((p) => ({
    profissionalId: (p.profissionalId as string) ?? undefined,
    profissional: String(p.profissional ?? ''),
    fichas: Number(p.fichas ?? 0),
    producaoReferencia: Number(p.producaoReferencia ?? 0),
    participacao: Number(p.participacao ?? 0),
    valor: Number(p.valor ?? 0),
  }))
  return {
    ok: Boolean(bruto.ok),
    motivo: (bruto.motivo as string) ?? null,
    receita: Number(bruto.receita ?? 0),
    percentual: Number(bruto.percentual ?? 0),
    pote: Number(bruto.pote ?? 0),
    fichasTotal: Number(bruto.fichasTotal ?? 0),
    producaoTotal: 0,
    partes,
    somaPartes: Number(bruto.somaPartes ?? 0),
    qtdPagamentos: 0,
    valorPagoTotal: 0,
    beneficioTotal: 0,
    atendimentosClub: 0,
    atendimentosAvulso: 0,
    utilizacao: 0,
    porServico: {},
    periodoInicio: String(bruto.periodoInicio ?? ''),
    periodoFim: String(bruto.periodoFim ?? ''),
    percentualConfigurado: (bruto.percentualConfigurado as number) ?? null,
    poteAtivo: Boolean(bruto.poteAtivo),
    participantesConfigurados: (bruto.participantesConfigurados as string[]) ?? [],
    jaFechado: Boolean(bruto.jaFechado),
  }
}