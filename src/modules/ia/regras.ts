// Regras puras da Central de IA — analisa dados reais já existentes
// (clientes, agenda, caixa e serviços) e devolve sugestões. NUNCA altera
// dados, preços, estoque, Caixa ou Clube e NUNCA envia WhatsApp: toda
// ação aqui é apenas uma proposta que exige confirmação humana.
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { normalizarBusca } from '@/modules/clientes/regras'
import type { Cliente } from '@/modules/clientes/types'
import { montarPerfis, type PerfilCliente } from '@/modules/crm/regras'
import type { Servico } from '@/modules/servicos/types'
import type { IdTemplate } from '@/modules/whatsapp/types'
import { textoTemplate } from '@/modules/whatsapp/templates'

export type TipoSugestao =
  | 'reativacao'
  | 'servico_complementar'
  | 'oportunidade_atendimento'

export const TIPOS_SUGESTAO_ORDEM: TipoSugestao[] = [
  'reativacao',
  'servico_complementar',
  'oportunidade_atendimento',
]

export const TIPOS_SUGESTAO_ROTULO: Record<TipoSugestao, string> = {
  reativacao: 'Reativação de clientes',
  servico_complementar: 'Serviço complementar',
  oportunidade_atendimento: 'Oportunidade de atendimento',
}

/** Ação proposta — só executa com confirmação humana na tela */
export type AcaoSugestao =
  | { tipo: 'mensagem'; template: IdTemplate; texto: string }
  | { tipo: 'nota'; texto: string }

export type SugestaoIa = {
  /** Id determinístico (tipo:cliente[:serviço]) — estável entre análises */
  id: string
  tipo: TipoSugestao
  clienteId: string
  cliente: string
  titulo: string
  descricao: string
  acao: AcaoSugestao
}

export type EntradaSugestoes = {
  clientes: Cliente[]
  agendamentos: Agendamento[]
  lancamentos: Lancamento[]
  servicos: Servico[]
  /** YYYY-MM-DD (padrão = hoje) */
  hoje?: string
}

/** Mínimo de atendimentos do cliente para sugerir serviços complementares */
export const MIN_ATENDIMENTOS_COMPLEMENTAR = 2
/** Mínimo de atendimentos reais do serviço no estabelecimento para sugerir */
export const MIN_DEMANDA_COMPLEMENTAR = 2

function contarAtendimentosPorServico(agendamentos: Agendamento[]) {
  const mapa = new Map<string, number>()
  for (const ag of agendamentos) {
    if (ag.status !== 'concluido') continue
    const nome = ag.servico.trim()
    if (!nome) continue
    mapa.set(nome, (mapa.get(nome) ?? 0) + 1)
  }
  return mapa
}

function temAgendamentoFuturo(
  agendamentos: Agendamento[],
  nomeCliente: string,
  hoje: string,
): boolean {
  const chave = normalizarBusca(nomeCliente)
  return agendamentos.some(
    (ag) =>
      normalizarBusca(ag.cliente) === chave &&
      ag.data >= hoje &&
      (ag.status === 'pendente' || ag.status === 'confirmado'),
  )
}

function sugestaoReativacao(perfil: PerfilCliente): SugestaoIa | null {
  const { cliente, segmento } = perfil
  if (segmento !== 'sem_retorno' && segmento !== 'inativo') return null
  if (perfil.totalAtendimentos < 1) return null
  const dias = perfil.diasDesdeUltimo ?? 0
  const texto = textoTemplate('reativacao', {
    nome: cliente.nome,
    ultimoAtendimento: perfil.ultimoAtendimento,
    diasSemAtendimento: dias,
  })
  return {
    id: `reativacao:${cliente.id}`,
    tipo: 'reativacao',
    clienteId: cliente.id,
    cliente: cliente.nome,
    titulo: `Reativar ${cliente.nome}`,
    descricao: `${perfil.totalAtendimentos} atendimento(s), último em ${formatarDataLonga(perfil.ultimoAtendimento)} (${dias} dia(s) atrás).${perfil.frequenciaDias ? ` Frequência histórica de ~${perfil.frequenciaDias} dia(s).` : ''}`,
    acao: { tipo: 'mensagem', template: 'reativacao', texto },
  }
}

function sugestaoOportunidade(
  perfil: PerfilCliente,
  agendamentos: Agendamento[],
  hoje: string,
): SugestaoIa | null {
  const { cliente, segmento } = perfil
  if (segmento !== 'ativo' && segmento !== 'recorrente') return null
  if (!perfil.frequenciaDias || perfil.diasDesdeUltimo === null) return null
  if (perfil.diasDesdeUltimo < perfil.frequenciaDias) return null
  if (temAgendamentoFuturo(agendamentos, cliente.nome, hoje)) return null
  return {
    id: `oportunidade:${cliente.id}`,
    tipo: 'oportunidade_atendimento',
    clienteId: cliente.id,
    cliente: cliente.nome,
    titulo: `Horário em aberto: ${cliente.nome}`,
    descricao: `Frequência média de ${perfil.frequenciaDias} dia(s); último atendimento há ${perfil.diasDesdeUltimo} dia(s); nenhum horário futuro marcado.`,
    acao: {
      tipo: 'nota',
      texto: `Oportunidade de atendimento (IA): ${cliente.nome} costuma vir a cada ${perfil.frequenciaDias} dia(s) e já passou ${perfil.diasDesdeUltimo} dia(s) sem agendar. Entrar em contato para remarcar.`,
    },
  }
}

function sugestaoComplementar(
  perfil: PerfilCliente,
  servicos: Servico[],
  demanda: Map<string, number>,
): SugestaoIa | null {
  const { cliente } = perfil
  if (perfil.totalAtendimentos < MIN_ATENDIMENTOS_COMPLEMENTAR) return null
  const usados = new Set(perfil.servicos.map((s) => normalizarBusca(s.nome)))
  const candidatos = servicos
    .filter((s) => s.ativo && s.nome.trim())
    .filter((s) => !usados.has(normalizarBusca(s.nome)))
    .map((s) => ({ servico: s, qtd: demanda.get(s.nome.trim()) ?? 0 }))
    .filter((c) => c.qtd >= MIN_DEMANDA_COMPLEMENTAR)
    .sort((a, b) => b.qtd - a.qtd || a.servico.nome.localeCompare(b.servico.nome, 'pt-BR'))
  const melhor = candidatos[0]
  if (!melhor) return null
  return {
    id: `complementar:${cliente.id}:${melhor.servico.id}`,
    tipo: 'servico_complementar',
    clienteId: cliente.id,
    cliente: cliente.nome,
    titulo: `Oferecer ${melhor.servico.nome} para ${cliente.nome}`,
    descricao: `${cliente.nome} já fez ${perfil.totalAtendimentos} atendimento(s) e nunca contratou "${melhor.servico.nome}", que foi feito ${melhor.qtd} vez(es) no salão.`,
    acao: {
      tipo: 'nota',
      texto: `Sugestão da IA: oferecer ${melhor.servico.nome} para ${cliente.nome} no próximo contato — serviço já feito ${melhor.qtd} vez(es) no salão.`,
    },
  }
}

/**
 * Gera as sugestões a partir dos dados reais do sistema. Função pura:
 * não modifica nenhuma entrada e não executa nenhuma ação — a decisão
 * (e a execução) fica com o humano na tela da Central de IA.
 */
export function gerarSugestoes(entrada: EntradaSugestoes): SugestaoIa[] {
  const hoje = entrada.hoje ?? hojeISO()
  const perfis = montarPerfis(
    entrada.clientes,
    entrada.agendamentos,
    entrada.lancamentos,
    hoje,
  )
  const demanda = contarAtendimentosPorServico(entrada.agendamentos)

  const sugestoes: SugestaoIa[] = []
  for (const perfil of perfis) {
    // Cliente inativo no cadastro não recebe sugestões.
    if (!perfil.cliente.ativo) continue
    const reativar = sugestaoReativacao(perfil)
    if (reativar) sugestoes.push(reativar)
    const oportunidade = sugestaoOportunidade(
      perfil,
      entrada.agendamentos,
      hoje,
    )
    if (oportunidade) sugestoes.push(oportunidade)
    const complementar = sugestaoComplementar(
      perfil,
      entrada.servicos,
      demanda,
    )
    if (complementar) sugestoes.push(complementar)
  }

  return sugestoes.sort((a, b) => {
    const ta = TIPOS_SUGESTAO_ORDEM.indexOf(a.tipo)
    const tb = TIPOS_SUGESTAO_ORDEM.indexOf(b.tipo)
    if (ta !== tb) return ta - tb
    return a.cliente.localeCompare(b.cliente, 'pt-BR')
  })
}

/** Remove sugestões já confirmadas/descartadas pelo humano. */
export function semTratadas(
  sugestoes: SugestaoIa[],
  tratadas: ReadonlySet<string> | string[],
): SugestaoIa[] {
  const conjunto =
    tratadas instanceof Set ? tratadas : new Set(tratadas)
  return sugestoes.filter((s) => !conjunto.has(s.id))
}

/**
 * Assistente de texto do WhatsApp: acrescenta ao texto oficial do template
 * uma frase pessoal calculada apenas com fatos do perfil (visitas e
 * profissional preferido). `agendamento` deve ser informado quando a
 * mensagem trata de um horário futuro — sem ele só frases atemporais
 * entram. Sem personalização aplicável, o texto base volta intacto.
 */
export function personalizarTexto(
  textoBase: string,
  perfil: PerfilCliente,
  agendamento?: Agendamento | null,
): string {
  const base = textoBase.trim()
  const total = perfil.totalAtendimentos
  if (agendamento && total === 0) {
    return `${base} Essa será a sua primeira visita ao Studio Audax — seja bem-vindo(a)!`
  }
  if (
    agendamento &&
    total >= 3 &&
    perfil.profissionalPreferido &&
    agendamento.profissional === perfil.profissionalPreferido
  ) {
    return `${base} Você já passou por aqui ${total} vez(es) — e desta vez é com ${perfil.profissionalPreferido}, o seu preferido.`
  }
  if (!agendamento && total >= 5 && perfil.primeiroAtendimento) {
    const [ano, mes, dia] = perfil.primeiroAtendimento.split('-')
    return `${base} Você já é da casa: são ${total} atendimentos conosco desde ${dia}/${mes}/${ano}.`
  }
  if (agendamento && total >= 3) {
    return `${base} Essa será a sua visita de número ${total + 1} no Studio Audax.`
  }
  return base
}
