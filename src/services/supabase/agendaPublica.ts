// ============================================================================
// Agendamento público (§16) — o cliente agenda por link.
//
// Mesma fonte de dados da Agenda interna (NUNCA uma segunda agenda):
//   • com Supabase: três funções SECURITY DEFINER da migration 012 —
//     catálogo, ocupação do dia e criação (que revalida no servidor);
//   • sem Supabase: localStorage da própria Agenda + as MESMAS regras de
//     `validarProposta` (expediente → almoço → bloqueio → conflito).
//
// Privacidade: o catálogo expõe só nome/preço/duração e a ocupação só
// horário/profissional/status — nenhum telefone, e-mail ou nome de cliente.
// ============================================================================
import { supabase } from '@/lib/supabase'
import { hojeISO } from '@/modules/agenda/catalogo'
import {
  carregarAgendamentos,
  carregarBloqueios,
  carregarExpediente,
  salvarAgendamentos,
} from '@/modules/agenda/persistencia'
import {
  EXPEDIENTE_PADRAO,
  bloqueioCobre,
  duracaoBase,
  emAlmoco,
  formatarMinutos,
  paraMinutos,
  slotsDoExpediente,
  validarProposta,
} from '@/modules/agenda/regras'
import type { Agendamento, Bloqueio, Expediente } from '@/modules/agenda/types'

export type ServicoPublico = {
  id?: string
  nome: string
  preco: number
  duracaoMin: number
}

export type ProfissionalPublico = { id?: string; nome: string }

export type CatalogoPublico = {
  servicos: ServicoPublico[]
  profissionais: ProfissionalPublico[]
}

export type PropostaPublica = {
  cliente: string
  telefone: string
  servico: string
  profissional: string
  data: string
  horario: string
  observacao?: string
}

export type ResultadoPublico =
  | { ok: true; id: string }
  | { ok: false; erro: string }

const CHAVE_SERVICOS = 'studio-audax:servicos:v1'
const CHAVE_PROFISSIONAIS = 'studio-audax:profissionais:v1'

/** Ocupação de um dia — sem dados pessoais (cliente nunca aparece aqui). */
type Ocupacao = {
  profissional: string
  horario: string
  servico?: string
  duracaoMin?: number
  status?: string
}

type BaseDoDia = {
  expediente: Expediente
  bloqueios: Bloqueio[]
  ocupacoes: Ocupacao[]
}

function lerJSON<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave)
    if (!bruto) return padrao
    const valor = JSON.parse(bruto)
    return (valor ?? padrao) as T
  } catch {
    return padrao
  }
}

function mensagemErro(erro: unknown, padrao: string): string {
  if (erro && typeof erro === 'object' && 'message' in erro) {
    const msg = String((erro as { message: unknown }).message ?? '').trim()
    if (msg) return msg.replace(/^[A-Z0-9]{5}:\s*/, '')
  }
  return padrao
}

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function duracaoServicoLocal(nome: string): number {
  const servicos = lerJSON<{ nome: string; duracaoMin?: number }[]>(
    CHAVE_SERVICOS,
    [],
  )
  const achado = servicos.find((s) => s.nome === nome)
  return achado?.duracaoMin || duracaoBase(nome)
}

/** Catálogo público: serviços/ativos e profissionais/ativos, sem dados internos. */
export async function carregarCatalogo(): Promise<CatalogoPublico> {
  const db = supabase()
  if (db) {
    const { data, error } = await db.rpc('agendamento_publico_catalogo')
    if (error) {
      throw new Error(
        mensagemErro(error, 'Não foi possível carregar os serviços.'),
      )
    }
    const obj = (data ?? {}) as {
      servicos?: unknown
      profissionais?: unknown
    }
    return {
      servicos: Array.isArray(obj.servicos)
        ? (obj.servicos as ServicoPublico[])
        : [],
      profissionais: Array.isArray(obj.profissionais)
        ? (obj.profissionais as ProfissionalPublico[])
        : [],
    }
  }

  type ServicoLocal = {
    nome: string
    preco?: number
    duracaoMin?: number
    ativo?: boolean
  }
  type ProfissionalLocal = { nome: string; ativo?: boolean }
  const servicosLocal = lerJSON<ServicoLocal[]>(CHAVE_SERVICOS, [])
  const profissionaisLocal = lerJSON<ProfissionalLocal[]>(
    CHAVE_PROFISSIONAIS,
    [],
  )
  return {
    servicos: servicosLocal
      .filter((s) => s.ativo !== false && s.nome)
      .map((s) => ({
        nome: s.nome,
        preco: Number(s.preco) || 0,
        duracaoMin: Number(s.duracaoMin) || 30,
      })),
    profissionais: profissionaisLocal
      .filter((p) => p.ativo !== false && p.nome)
      .map((p) => ({ nome: p.nome })),
  }
}

/** Base do dia (expediente + bloqueios + ocupação) da MESMA fonte da Agenda. */
async function baseDoDia(data: string): Promise<BaseDoDia> {
  const db = supabase()
  if (db) {
    const { data: pacote, error } = await db.rpc('agendamento_publico_slots', {
      p_data: data,
    })
    if (error) {
      throw new Error(
        mensagemErro(error, 'Não foi possível carregar os horários.'),
      )
    }
    const obj = (pacote ?? {}) as {
      expediente?: Partial<Expediente>
      bloqueios?: Bloqueio[]
      ocupacoes?: Ocupacao[]
    }
    return {
      expediente: { ...EXPEDIENTE_PADRAO, ...(obj.expediente ?? {}) },
      bloqueios: Array.isArray(obj.bloqueios) ? obj.bloqueios : [],
      ocupacoes: Array.isArray(obj.ocupacoes) ? obj.ocupacoes : [],
    }
  }
  return {
    expediente: carregarExpediente(),
    bloqueios: carregarBloqueios(),
    ocupacoes: carregarAgendamentos()
      .filter((a) => a.data === data)
      .map((a) => ({
        profissional: a.profissional,
        horario: a.horario,
        servico: a.servico,
        duracaoMin: a.duracaoMin,
        status: a.status,
      })),
  }
}

/**
 * Horários livres de um dia para o serviço/profissional escolhidos:
 * slots do expediente fora do almoço, sem ocupação e sem bloqueio,
 * com folga para a duração REAL do serviço.
 */
export async function horariosPublicos(
  data: string,
  profissional: string,
  duracaoMin: number,
): Promise<string[]> {
  if (!data || !profissional) return []
  const duracao = Math.max(5, duracaoMin || 30)
  const base = await baseDoDia(data)
  const expediente = base.expediente
  const duracaoDo = (servico?: string): number =>
    servico ? duracaoServicoLocal(servico) : 30

  const livres: string[] = []
  for (const slot of slotsDoExpediente(expediente)) {
    if (slot.intervalo) continue
    const inicio = paraMinutos(slot.hora)
    const fim = inicio + duracao
    if (fim > paraMinutos(expediente.fim)) continue
    if (emAlmoco(slot.hora, duracao, expediente)) continue
    const ocupado = base.ocupacoes.some((o) => {
      if (o.profissional !== profissional) return false
      if (o.status === 'cancelado' || o.status === 'nao_compareceu') return false
      const ini = paraMinutos(o.horario)
      const fimExistente =
        ini + Math.max(5, o.duracaoMin ?? duracaoDo(o.servico))
      return ini < fim && inicio < fimExistente
    })
    if (ocupado) continue
    if (
      bloqueioCobre(base.bloqueios, {
        data,
        horario: slot.hora,
        duracaoMin: duracao,
        profissional,
      })
    ) {
      continue
    }
    livres.push(formatarMinutos(inicio))
  }
  return livres
}

/**
 * Cria o agendamento público com status 'pendente' (a equipe confirma).
 * Com Supabase o servidor revalida tudo; sem Supabase roda as MESMAS
 * regras da Agenda interna. Nunca mente: erro do servidor vira mensagem.
 */
export async function criarAgendamentoPublico(
  p: PropostaPublica,
): Promise<ResultadoPublico> {
  const nome = p.cliente.trim()
  if (nome.length < 2) return { ok: false, erro: 'Informe seu nome.' }
  const fone = p.telefone.replace(/\D/g, '')
  if (fone.length < 10 || fone.length > 13) {
    return { ok: false, erro: 'Informe um telefone válido com DDD.' }
  }
  if (!p.servico) return { ok: false, erro: 'Escolha o serviço.' }
  if (!p.profissional) return { ok: false, erro: 'Escolha o profissional.' }
  if (!p.data || p.data < hojeISO()) {
    return { ok: false, erro: 'Escolha uma data a partir de hoje.' }
  }
  if (!/^\d{1,2}:\d{2}$/.test(p.horario)) {
    return { ok: false, erro: 'Horário inválido.' }
  }

  const db = supabase()
  if (db) {
    const { data, error } = await db.rpc('agendamento_publico_criar', {
      p_cliente: nome,
      p_telefone: p.telefone.trim(),
      p_servico: p.servico,
      p_profissional: p.profissional,
      p_data: p.data,
      p_horario: p.horario,
      p_observacao: (p.observacao ?? '').trim(),
    })
    if (error) {
      return {
        ok: false,
        erro: mensagemErro(error, 'Não foi possível agendar. Tente novamente.'),
      }
    }
    const id = String((data as { id?: string } | null)?.id ?? '')
    return { ok: true, id }
  }

  // Local: valida com a regra consolidada da Agenda e grava na mesma lista
  const duracaoMin = duracaoServicoLocal(p.servico)
  const validacao = validarProposta({
    agendamentos: carregarAgendamentos(),
    bloqueios: carregarBloqueios(),
    expediente: carregarExpediente(),
    data: p.data,
    horario: p.horario,
    profissional: p.profissional,
    duracaoMin,
  })
  if (!validacao.ok) return { ok: false, erro: validacao.erro }

  const registro: Agendamento = {
    id: gerarId(),
    cliente: nome,
    telefone: p.telefone.trim(),
    servico: p.servico,
    profissional: p.profissional,
    data: p.data,
    horario: p.horario,
    status: 'pendente',
    observacao: (p.observacao ?? '').trim(),
    criadoEm: new Date().toISOString(),
    duracaoMin,
  }
  salvarAgendamentos([...carregarAgendamentos(), registro])
  return { ok: true, id: registro.id }
}
