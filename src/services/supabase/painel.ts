// Acesso ao Supabase — painel do cliente (autenticação + RPCs da 018).
//
// Sem Supabase configurado `clientePainel()` devolve null e o painel mostra
// o aviso de configuração (mesmo critério do portão do app).
// As escritas do painel passam por RPCs SECURITY DEFINER (018): o servidor
// valida a posse — nada de escrita direta sujeita a policy nesta camada.
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { MotivoSessao, SessaoInfo } from '@/modules/auth/tipos'
import type { AssinaturaClube } from '@/modules/clube/types'
import { ehPlanoClube, PLANOS_ROTULO } from '@/modules/clube/types'
import type {
  ClientePainel,
  DadosCadastro,
  DadosPerfilPainel,
  EstadoVinculo,
  RegistroCliente,
  ResultadoVinculo,
} from '@/modules/painel/tipos'
import { urlRedefinicao } from '@/modules/painel/regras'
import { hojeISO } from '@/modules/agenda/catalogo'

const ESTADOS_VINCULO: EstadoVinculo[] = [
  'vinculado',
  'criado',
  'ambiguo',
  'precisa_dados',
  'nao_confirmado',
]

function paraSessao(sessao: Session | null): SessaoInfo | null {
  if (!sessao) return null
  const bruto = sessao.expires_at
  let expiraEm: number | null = null
  if (typeof bruto === 'number') {
    expiraEm = bruto
  } else if (typeof bruto === 'string') {
    const parsed = Date.parse(bruto) / 1000
    expiraEm = Number.isFinite(parsed) ? parsed : null
  }
  return { email: sessao.user?.email ?? '', expiraEm }
}

function paraRegistro(linha: Record<string, unknown>): RegistroCliente {
  return {
    id: String(linha.id ?? ''),
    nome: String(linha.nome ?? ''),
    telefone: String(linha.telefone ?? ''),
    email: String(linha.email ?? ''),
    nascimento: String(linha.nascimento ?? ''),
    genero: String(linha.genero ?? 'nao_informado'),
  }
}

export function adaptarPainelSupabase(cliente: SupabaseClient): ClientePainel {
  return {
    async sessao() {
      const { data } = await cliente.auth.getSession()
      return paraSessao(data.session)
    },
    async confirmar() {
      try {
        const { data, error } = await cliente.auth.getUser()
        return !error && data.user !== null
      } catch {
        return false
      }
    },
    observar(mudou) {
      const { data } = cliente.auth.onAuthStateChange((evento, sessao) => {
        const info = paraSessao(sessao)
        const ev = String(evento)
        const motivo: MotivoSessao | 'recuperar' =
          ev === 'PASSWORD_RECOVERY'
            ? 'recuperar'
            : info
              ? 'entrado'
              : ev === 'TOKEN_REFRESH_EXPIRED' || ev === '401'
                ? 'expirada'
                : 'saiu'
        mudou(info, motivo)
      })
      return () => data.subscription.unsubscribe()
    },
    async entrar(email, senha) {
      const { data, error } = await cliente.auth.signInWithPassword({
        email,
        password: senha,
      })
      if (error) throw new Error(error.message)
      const info = paraSessao(data.session)
      if (!info) throw new Error('Não foi possível iniciar a sessão.')
      return info
    },
    async sair() {
      const { error } = await cliente.auth.signOut()
      if (error) throw new Error(error.message)
    },
    async cadastrar(dados: DadosCadastro) {
      const { data, error } = await cliente.auth.signUp({
        email: dados.email,
        password: dados.senha,
        options: { data: { nome: dados.nome, telefone: dados.telefone } },
      })
      if (error) throw new Error(error.message)
      return paraSessao(data.session)
    },
    async recuperar(email) {
      const { error } = await cliente.auth.resetPasswordForEmail(email, {
        redirectTo: urlRedefinicao(),
      })
      if (error) throw new Error(error.message)
    },
    async redefinir(senha) {
      const { error } = await cliente.auth.updateUser({ password: senha })
      if (error) throw new Error(error.message)
    },
    async vincular(nome, telefone, nascimento): Promise<ResultadoVinculo> {
      const { data, error } = await cliente.rpc('painel_cliente_vincular', {
        p_nome: nome,
        p_telefone: telefone,
        p_nascimento: nascimento,
      })
      if (error) throw new Error(error.message)
      const bruto = data as { estado?: string; clienteId?: string } | null
      const estado = String(bruto?.estado ?? '')
      if (!ESTADOS_VINCULO.includes(estado as EstadoVinculo)) {
        throw new Error('Não foi possível concluir o vínculo. Tente novamente.')
      }
      const resultado: ResultadoVinculo = { estado: estado as EstadoVinculo }
      if (bruto?.clienteId) resultado.clienteId = bruto.clienteId
      return resultado
    },
    async atualizar(dados: DadosPerfilPainel): Promise<RegistroCliente> {
      const { data, error } = await cliente.rpc('painel_cliente_atualizar', {
        p_nome: dados.nome,
        p_telefone: dados.telefone,
        p_nascimento: dados.nascimento,
        p_genero: dados.genero,
      })
      if (error) throw new Error(error.message)
      if (!data || typeof data !== 'object') {
        throw new Error('Não foi possível salvar o cadastro.')
      }
      return paraRegistro(data as Record<string, unknown>)
    },
  }
}

/** Cliente do painel a partir do ambiente (null = sem Supabase). */
export function clientePainel(): ClientePainel | null {
  const cliente = supabase()
  return cliente ? adaptarPainelSupabase(cliente) : null
}

// ----------------------------------------------------------------------------
// Leitura do painel — a RLS de posse (018) já limita às LINHAS DO PRÓPRIO
// cliente; as colunas pedidas são só as que o cliente precisa enxergar.
// ----------------------------------------------------------------------------

export type AgendamentoPainel = {
  id: string
  servico: string
  profissional: string
  data: string
  horario: string
  status: string
  duracaoMin: number | null
  observacao: string
  criadoEm: string
}

export type CadastroPainel = {
  id: string
  nome: string
  telefone: string
  email: string
  nascimento: string
  genero: string
}

/**
 * Agendamentos do próprio cliente (histórico + futuros), ordenados do mais
 * antigo para o mais novo. A policy `agendamentos_select_proprio` garante
 * que só as linhas com `cliente_id` da sessão voltem.
 */
export async function listarMeusAgendamentos(): Promise<AgendamentoPainel[]> {
  const db = supabase()
  if (!db) return []
  const { data, error } = await db
    .from('agendamentos')
    .select(
      'id, servico, profissional, data, horario, status, duracao_min, observacao, criado_em',
    )
    .order('data', { ascending: true })
    .order('horario', { ascending: true })
  if (error) {
    throw new Error(
      error.message || 'Não foi possível carregar seus agendamentos.',
    )
  }
  const linhas = Array.isArray(data) ? data : []
  return linhas.map((linha) => ({
    id: String(linha.id ?? ''),
    servico: String(linha.servico ?? ''),
    profissional: String(linha.profissional ?? ''),
    data: String(linha.data ?? ''),
    horario: String(linha.horario ?? ''),
    status: String(linha.status ?? ''),
    duracaoMin:
      typeof linha.duracao_min === 'number' ? linha.duracao_min : null,
    observacao: String(linha.observacao ?? ''),
    criadoEm: String(linha.criado_em ?? ''),
  }))
}

/**
 * Cadastro do próprio cliente (policy `clientes_select_proprio`).
 * `null` = sessão ainda sem cadastro vinculado (não é erro).
 */
export async function obterMeuCadastro(): Promise<CadastroPainel | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db
    .from('clientes')
    .select('id, nome, telefone, email, nascimento, genero')
    .maybeSingle()
  if (error) {
    throw new Error(error.message || 'Não foi possível carregar seu cadastro.')
  }
  if (!data) return null
  return {
    id: String(data.id ?? ''),
    nome: String(data.nome ?? ''),
    telefone: String(data.telefone ?? ''),
    email: String(data.email ?? ''),
    nascimento: String(data.nascimento ?? ''),
    genero: String(data.genero ?? 'nao_informado'),
  }
}

// ----------------------------------------------------------------------------
// Agendamento pelo painel (FASE F) — MESMA base da Agenda oficial:
//   • catálogo/horários vêm das RPCs públicas da 012 (mesma da página
//     pública `#/agendar`);
//   • a criação passa pela RPC `painel_agendamento_criar` (019), que
//     envolve `agendamento_publico_criar` e valida os complementos.
// ----------------------------------------------------------------------------

function erroMensagem(mensagem: string | undefined, padrao: string): string {
  const texto = (mensagem ?? '').trim()
  if (!texto) return padrao
  return texto.replace(/^[A-Z0-9]{5}:\s*/, '')
}

export type ComplementoServico = {
  id: string
  nome: string
  preco: number
  duracaoMin: number
}

export type ServicoComComplementos = {
  id: string
  nome: string
  preco: number
  duracaoMin: number
  /** Sugeridos como complemento deste serviço (resolvidos e ativos). */
  complementos: ComplementoServico[]
}

/**
 * Serviços ativos com seus complementos configurados na coluna
 * `servicos.complementos` (ids). Ids de complemento inativo/ausente são
 * ignorados — a RPC (019) continua validando no servidor na criação.
 * Sem Supabase: `[]` (o painel exige Supabase para existir).
 */
export async function listarServicosComComplementos(): Promise<
  ServicoComComplementos[]
> {
  const db = supabase()
  if (!db) return []
  const { data, error } = await db
    .from('servicos')
    .select('id, nome, preco, duracao_min, complementos, ativo')
    .eq('ativo', true)
    .order('nome', { ascending: true })
  if (error) {
    throw new Error(
      erroMensagem(error.message, 'Não foi possível carregar os serviços.'),
    )
  }
  const linhas = Array.isArray(data) ? data : []
  const porId = new Map<string, ComplementoServico>()
  for (const linha of linhas) {
    porId.set(String(linha.id), {
      id: String(linha.id),
      nome: String(linha.nome ?? ''),
      preco: Number(linha.preco) || 0,
      duracaoMin: Number(linha.duracao_min) || 30,
    })
  }
  return linhas.map((linha) => {
    const ids = Array.isArray(linha.complementos) ? linha.complementos : []
    const complementos: ComplementoServico[] = []
    for (const bruto of ids) {
      const servico = porId.get(String(bruto))
      if (servico && servico.id !== String(linha.id)) {
        complementos.push(servico)
      }
    }
    return {
      id: String(linha.id),
      nome: String(linha.nome ?? ''),
      preco: Number(linha.preco) || 0,
      duracaoMin: Number(linha.duracao_min) || 30,
      complementos,
    }
  })
}

export type PropostaPainel = {
  servico: string
  profissional: string
  data: string
  horario: string
  observacao?: string
  /** Ids dos complementos escolhidos (nunca pré-marcados na tela). */
  complementos?: string[]
}

export type ResultadoPainel =
  | { ok: true; id: string }
  | { ok: false; erro: string }

/**
 * Cria o agendamento do cliente logado pela RPC 019 (wrap da oficial 012).
 * Nome/telefone vêm do cadastro vinculado — esta camada NÃO envia dados de
 * terceiros. Erros já amigáveis do servidor passam como estão.
 */
export async function criarAgendamentoPainel(
  p: PropostaPainel,
): Promise<ResultadoPainel> {
  if (!p.servico) return { ok: false, erro: 'Escolha o serviço.' }
  if (!p.profissional) return { ok: false, erro: 'Escolha o profissional.' }
  if (!p.data || p.data < hojeISO()) {
    return { ok: false, erro: 'Escolha uma data a partir de hoje.' }
  }
  if (!/^\d{1,2}:\d{2}$/.test(p.horario)) {
    return { ok: false, erro: 'Horário inválido.' }
  }
  const db = supabase()
  if (!db) {
    return {
      ok: false,
      erro: 'Agendamento indisponível sem conexão com o Supabase.',
    }
  }
  const { data, error } = await db.rpc('painel_agendamento_criar', {
    p_servico: p.servico,
    p_profissional: p.profissional,
    p_data: p.data,
    p_horario: p.horario,
    p_observacao: (p.observacao ?? '').trim(),
    p_complementos: p.complementos ?? [],
  })
  if (error) {
    return {
      ok: false,
      erro: erroMensagem(
        error.message,
        'Não foi possível agendar. Tente novamente.',
      ),
    }
  }
  const id = String((data as { id?: string } | null)?.id ?? '')
  if (!id) {
    return { ok: false, erro: 'Não foi possível agendar. Tente novamente.' }
  }
  return { ok: true, id }
}

/**
 * Cancela um agendamento do próprio cliente (RPC 019 → regras oficiais da
 * 015: pagamento não estornado bloqueia, status ativo obrigatório).
 */
export async function cancelarAgendamentoPainel(
  id: string,
): Promise<ResultadoPainel> {
  if (!id) return { ok: false, erro: 'Agendamento não encontrado.' }
  const db = supabase()
  if (!db) {
    return {
      ok: false,
      erro: 'Ação indisponível sem conexão com o Supabase.',
    }
  }
  const { data, error } = await db.rpc('painel_agendamento_cancelar', {
    p_id: id,
  })
  if (error) {
    return {
      ok: false,
      erro: erroMensagem(error.message, 'Não foi possível cancelar.'),
    }
  }
  return { ok: true, id: String((data as { id?: string } | null)?.id ?? id) }
}

/**
 * Remarcação do próprio cliente (RPC 019 → `ia_agendamento_remarcar` da 015):
 * mesma validação de expediente/almoço/bloqueio/conflito da Agenda, com o
 * histórico `remarcacoes` registrado na linha.
 */
export async function remarcarAgendamentoPainel(
  id: string,
  data: string,
  horario: string,
): Promise<ResultadoPainel> {
  if (!id) return { ok: false, erro: 'Agendamento não encontrado.' }
  if (!data || data < hojeISO()) {
    return { ok: false, erro: 'Escolha uma data a partir de hoje.' }
  }
  if (!/^\d{1,2}:\d{2}$/.test(horario)) {
    return { ok: false, erro: 'Horário inválido.' }
  }
  const db = supabase()
  if (!db) {
    return {
      ok: false,
      erro: 'Ação indisponível sem conexão com o Supabase.',
    }
  }
  const { data: resposta, error } = await db.rpc(
    'painel_agendamento_remarsar',
    { p_id: id, p_data: data, p_horario: horario },
  )
  if (error) {
    return {
      ok: false,
      erro: erroMensagem(error.message, 'Não foi possível remarcar.'),
    }
  }
  return {
    ok: true,
    id: String((resposta as { id?: string } | null)?.id ?? id),
  }
}

// ----------------------------------------------------------------------------
// Clube do painel (FASE Q) — RPC `painel_clube_minha` (020): assinatura e
// pagamentos PRÓPRIOS. As tabelas do Club mantêm a política larga da área
// admin (`authenticated using (true)`), então o painel só lê por esta RPC
// com posse por `cliente_id` — nunca uma consulta direta nas tabelas.
// ----------------------------------------------------------------------------

export type ClubePagamentoPainel = {
  data: string
  valor: number
  formaPagamento: string
}

export type ClubePainel = {
  /** Assinatura no formato do módulo Club (status/rotulos reutilizados). */
  assinatura: AssinaturaClube
  /** Plano como gravado no banco, para exibir sem depender do enum. */
  planoRotulo: string
  pagamentos: ClubePagamentoPainel[]
}

/**
 * Assinatura + últimos pagamentos do PRÓPRIO cliente (RPC 020).
 * `null` = sem assinatura de clube (não é erro).
 */
export async function carregarMeuClube(): Promise<ClubePainel | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.rpc('painel_clube_minha')
  if (error) {
    throw new Error(error.message || 'Não foi possível carregar o Clube.')
  }
  if (!data) return null
  const corpo = data as {
    assinatura?: Record<string, unknown> | null
    pagamentos?: Record<string, unknown>[] | null
  }
  const bruta = corpo.assinatura
  if (!bruta) return null
  const planoBruto = String(bruta.plano ?? '')
  const assinatura: AssinaturaClube = {
    id: String(bruta.id ?? ''),
    clienteId: String(bruta.cliente_id ?? ''),
    cliente: String(bruta.cliente ?? ''),
    plano: ehPlanoClube(planoBruto) ? planoBruto : 'cabelo',
    valorMensal: Number(bruta.valor_mensal ?? 0),
    dataAssinatura: String(bruta.data_assinatura ?? ''),
    proximoVencimento: String(bruta.proximo_vencimento ?? ''),
    cancelada: bruta.cancelada === true,
    canceladaEm: bruta.cancelada_em ? String(bruta.cancelada_em) : undefined,
    motivoCancelamento: bruta.motivo_cancelamento
      ? String(bruta.motivo_cancelamento)
      : undefined,
    criadoEm: String(bruta.criado_em ?? ''),
    atualizadoEm: bruta.atualizado_em
      ? String(bruta.atualizado_em)
      : undefined,
  }
  const pagamentos: ClubePagamentoPainel[] = (
    Array.isArray(corpo.pagamentos) ? corpo.pagamentos : []
  ).map((pagamento) => ({
    data: String(pagamento.data ?? ''),
    valor: Number(pagamento.valor ?? 0),
    formaPagamento: String(pagamento.forma_pagamento ?? 'outro'),
  }))
  return {
    assinatura,
    planoRotulo:
      (PLANOS_ROTULO as Record<string, string>)[planoBruto] ?? planoBruto,
    pagamentos,
  }
}
