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
  duracaoBase,
  horariosLivresPorProfissional,
  validarProposta,
} from '@/modules/agenda/regras'
import type { OcupacaoAgenda, SlotLivre } from '@/modules/agenda/regras'
import type { Agendamento, Bloqueio, Expediente } from '@/modules/agenda/types'

export type ServicoPublico = {
  id?: string
  nome: string
  preco: number
  duracaoMin: number
  /** ids de complemento sugeridos pela própria casa (nunca pré-marcados) */
  complementos?: string[]
}

export type ProfissionalPublico = { id?: string; nome: string }

/** Dados oficiais da casa — vêm da configuração, nunca são digitados no código. */
export type BarbeariaPublica = {
  endereco: string
  telefone: string
  instagram: string
  mapa: string
}

export type CatalogoPublico = {
  servicos: ServicoPublico[]
  profissionais: ProfissionalPublico[]
  barbearia: BarbeariaPublica
}

export type PropostaPublica = {
  cliente: string
  telefone: string
  servico: string
  profissional: string
  data: string
  horario: string
  observacao?: string
  /** ids de complemento do catálogo oficial (opcional) */
  complementos?: string[]
}

export type ResultadoPublico =
  | { ok: true; id: string }
  | { ok: false; erro: string }

const CHAVE_SERVICOS = 'studio-audax:servicos:v1'
const CHAVE_PROFISSIONAIS = 'studio-audax:profissionais:v1'

/**
 * Ocupação de um dia — sem dados pessoais (cliente nunca aparece aqui).
 * É exatamente o formato estrutural que a regra da Agenda consome.
 */
type Ocupacao = OcupacaoAgenda

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
  const achado = lerJSON<{ nome: string; duracaoMin?: number }[]>(
    CHAVE_SERVICOS,
    [],
  ).find((s) => s.nome === nome)
  return achado?.duracaoMin || duracaoBase(nome)
}

/** Serviço local por id — usado para somar a duração dos complementos. */
function servicosPorIdLocal(id: string): { nome: string } {
  return (
    lerJSON<{ id?: string; nome: string; duracaoMin?: number }[]>(
      CHAVE_SERVICOS,
      [],
    ).find((s) => s.id === id) ?? { nome: '' }
  )
}

/** Barbearia vazia: o catálogo público sempre devolve o objeto. */
const BARBEARIA_VAZIA: BarbeariaPublica = {
  endereco: '',
  telefone: '',
  instagram: '',
  mapa: '',
}

function normalizarBarbearia(bruto: unknown): BarbeariaPublica {
  const obj = (bruto ?? {}) as Record<string, unknown>
  const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
  return {
    endereco: texto(obj.endereco),
    telefone: texto(obj.telefone),
    instagram: texto(obj.instagram),
    mapa: texto(obj.mapa),
  }
}

/**
 * Catálogo público: serviços/ativos (com complementos), profissionais/ativos
 * e os dados oficiais da casa. Sem dados internos nem telefone de cliente.
 */
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
      barbearia?: unknown
    }
    return {
      servicos: Array.isArray(obj.servicos)
        ? (obj.servicos as ServicoPublico[])
        : [],
      profissionais: Array.isArray(obj.profissionais)
        ? (obj.profissionais as ProfissionalPublico[])
        : [],
      barbearia: normalizarBarbearia(obj.barbearia),
    }
  }

  type ServicoLocal = {
    nome: string
    preco?: number
    duracaoMin?: number
    ativo?: boolean
    complementos?: string[]
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
        complementos: Array.isArray(s.complementos) ? s.complementos : [],
      })),
    profissionais: profissionaisLocal
      .filter((p) => p.ativo !== false && p.nome)
      .map((p) => ({ nome: p.nome })),
    barbearia: BARBEARIA_VAZIA,
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
 * Horários livres de um dia para TODOS os profissionais de uma vez.
 *
 * Este é o ponto que resolve "escolher Cleiton → ver só o Cleiton": a
 * disponibilidade vem da MESMA regra da Agenda interna
 * (`horariosLivresPorProfissional`, que também trata expediente, almoço,
 * bloqueio e sobreposição por duração) aplicada sobre o pacote oficial de
 * ocupações — e devolve, para cada horário, a lista de quem está livre.
 *
 * `08:00 → [Cleiton, Ítalo]` vira duas opções clicáveis na tela. O cliente
 * não precisa escolher profissional antes de descobrir os horários, e escolher
 * um horário já define o profissional.
 *
 * Não há aqui nenhuma regra nova: é a regra da Agenda, chamada uma vez para
 * todos os profissionais.
 */
export async function horariosPublicosPorProfissional(
  data: string,
  duracaoMin: number,
  profissionais: string[],
): Promise<SlotLivre[]> {
  if (!data || profissionais.length === 0) return []
  const base = await baseDoDia(data)
  return horariosLivresPorProfissional(
    data,
    base.expediente,
    base.bloqueios,
    base.ocupacoes,
    profissionais,
    duracaoServicoLocal,
    Math.max(5, duracaoMin || 30),
  )
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
  const slots = await horariosPublicosPorProfissional(data, duracaoMin, [
    profissional,
  ])
  return slots.map((slot) => slot.horario)
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
    const complementos = (p.complementos ?? []).map((id) => id.trim()).filter(Boolean)
    // Com complemento entra pela RPC nova (027), que valida os ids contra a
    // coluna oficial `servicos.complementos` e delega a MESMA criação de
    // baixo nível. Sem complemento, segue o caminho de sempre.
    const rpc = complementos.length
      ? 'agendamento_publico_criar_complementos'
      : 'agendamento_publico_criar'
    const { data, error } = await db.rpc(rpc, {
      p_cliente: nome,
      p_telefone: p.telefone.trim(),
      p_servico: p.servico,
      p_profissional: p.profissional,
      p_data: p.data,
      p_horario: p.horario,
      p_observacao: (p.observacao ?? '').trim(),
      ...(complementos.length ? { p_complementos: complementos } : {}),
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
  const duracaoBaseMin = duracaoServicoLocal(p.servico)
  const duracaoComplementos = (p.complementos ?? []).reduce(
    (soma, id) => soma + duracaoServicoLocal(servicosPorIdLocal(id).nome),
    0,
  )
  const duracaoMin = duracaoBaseMin + duracaoComplementos
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
