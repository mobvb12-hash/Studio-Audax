// Regras puras do módulo CRM — segmentação por comportamento real,
// perfis derivados da agenda/caixa e filtros (sem estado, sem efeitos).
// Nenhum dado é duplicado: tudo é calculado a partir de Clientes, Agenda
// e Caixa que já existem no sistema.
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento, StatusAgendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { gastosPorCliente, normalizarBusca } from '@/modules/clientes/regras'
import type { Cliente } from '@/modules/clientes/types'
import {
  TEMPLATES_ROTULO,
  type MensagemWhats,
  type StatusMensagem,
} from '@/modules/whatsapp/types'
import {
  ehGrupoRetorno,
  TIPOS_INTERACAO_ROTULO,
  type GrupoRetorno,
  type Interacao,
  type SegmentoCliente,
} from './types'

/** Último atendimento há até N dias = cliente ainda ativo */
export const DIAS_ATIVO = 30
/** Passou de N dias sem retorno = inativo (também vale para cadastro sem visita) */
export const DIAS_INATIVO = 90

export type ClassificacaoEntrada = {
  totalAtendimentos: number
  /** Dias desde o último atendimento (null = nunca teve atendimento) */
  diasDesdeUltimo: number | null
  diasDesdeCadastro: number
}

/**
 * Segmenta o cliente pelo comportamento real registrado no sistema:
 * - sem atendimentos: 'novo' (cadastro recente) ou 'inativo' (cadastro antigo);
 * - com atendimentos: 'inativo' (> 90 dias), 'sem_retorno' (31–90 dias),
 *   'recorrente' (3+ visitas nos últimos 30 dias) ou 'ativo' (1–2 nos últimos 30).
 */
export function classificarSegmento(e: ClassificacaoEntrada): SegmentoCliente {
  if (e.totalAtendimentos > 0) {
    const dias = e.diasDesdeUltimo ?? 0
    if (dias > DIAS_INATIVO) return 'inativo'
    if (dias <= DIAS_ATIVO) {
      return e.totalAtendimentos >= 3 ? 'recorrente' : 'ativo'
    }
    return 'sem_retorno'
  }
  return e.diasDesdeCadastro > DIAS_INATIVO ? 'inativo' : 'novo'
}

/** Diferença em dias entre duas datas YYYY-MM-DD (negativo se a primeira é posterior). */
export function diasEntre(dataDe: string, dataAte: string): number {
  const a = Date.parse(`${dataDe.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${dataAte.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export type ServicoUtilizado = { nome: string; qtd: number }

/** Produto comprado no caixa/PDV, agregado por nome */
export type ProdutoComprado = { nome: string; qtd: number }

export type PerfilCliente = {
  cliente: Cliente
  segmento: SegmentoCliente
  /** Atendimentos concluídos (cancelados/não compareceu não contam) */
  totalAtendimentos: number
  /** YYYY-MM-DD ('' se nunca) */
  primeiroAtendimento: string
  ultimoAtendimento: string
  /** Dias desde o último atendimento (null se nunca) */
  diasDesdeUltimo: number | null
  /** Média de dias entre atendimentos (null com menos de 2 datas distintas) */
  frequenciaDias: number | null
  totalGasto: number
  /** Serviços mais usados pelo cliente, do mais para o menos usado */
  servicos: ServicoUtilizado[]
  /** Produtos comprados (caixa/PDV), do mais para o menos comprado */
  produtos: ProdutoComprado[]
  profissionalPreferido: string | null
}

type Concluidos = {
  agendamentos: Agendamento[]
  datas: string[]
}

function concluidosDoCliente(
  agendamentos: Agendamento[],
  nomeCliente: string,
): Concluidos {
  const chave = normalizarBusca(nomeCliente)
  const lista = agendamentos.filter(
    (ag) => ag.status === 'concluido' && normalizarBusca(ag.cliente) === chave,
  )
  const datas = [...new Set(lista.map((ag) => ag.data))].sort()
  return { agendamentos: lista, datas }
}

function frequencia(datas: string[]): number | null {
  if (datas.length < 2) return null
  let soma = 0
  for (let i = 1; i < datas.length; i++) {
    soma += diasEntre(datas[i - 1], datas[i])
  }
  return Math.round(soma / (datas.length - 1))
}

function contar(agendamentos: Agendamento[], campo: 'servico' | 'profissional') {
  const mapa = new Map<string, number>()
  for (const ag of agendamentos) {
    const valor = ag[campo].trim()
    if (!valor) continue
    mapa.set(valor, (mapa.get(valor) ?? 0) + 1)
  }
  return mapa
}

/**
 * Produtos comprados pelo cliente no caixa/PDV: vendas de produto não
 * estornadas, resolvidas por clienteId (quando existe) ou por nome.
 * Itens do PDV contam um a um; lançamentos antigos usam produto/qtd.
 */
function produtosDoCliente(
  lancamentos: Lancamento[],
  cliente: Cliente,
): ProdutoComprado[] {
  const chave = normalizarBusca(cliente.nome)
  const mapa = new Map<string, number>()
  for (const l of lancamentos) {
    if (l.origem !== 'produto' || l.estornado) continue
    const dono = l.clienteId
      ? l.clienteId === cliente.id
      : l.cliente
        ? normalizarBusca(l.cliente) === chave
        : false
    if (!dono) continue
    const itens =
      l.itens && l.itens.length > 0
        ? l.itens
        : l.produto
          ? [{ produto: l.produto, quantidade: l.quantidade ?? 1 }]
          : []
    for (const item of itens) {
      const nome = item.produto.trim()
      const qtd = item.quantidade
      if (!nome || qtd <= 0) continue
      mapa.set(nome, (mapa.get(nome) ?? 0) + qtd)
    }
  }
  return [...mapa.entries()]
    .map(([nome, qtd]) => ({ nome, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Perfis de todos os clientes calculados a partir dos dados reais:
 * atendimentos concluídos (agenda), gasto total (caixa) e cadastro.
 * Não altera nenhum dos arrays recebidos.
 */
export function montarPerfis(
  clientes: Cliente[],
  agendamentos: Agendamento[],
  lancamentos: Lancamento[],
  hoje: string = hojeISO(),
): PerfilCliente[] {
  const gastos = gastosPorCliente(lancamentos, clientes)
  return clientes.map((cliente) => {
    const { agendamentos: meus, datas } = concluidosDoCliente(
      agendamentos,
      cliente.nome,
    )
    const total = meus.length
    const ultimo = datas.length > 0 ? datas[datas.length - 1] : ''
    const diasDesdeUltimo = ultimo ? diasEntre(ultimo, hoje) : null
    const diasDesdeCadastro = diasEntre(cliente.criadoEm, hoje)

    const porServico = [...contar(meus, 'servico').entries()]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'))

    const profissionais = [...contar(meus, 'profissional').entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'),
    )

    return {
      cliente,
      segmento: classificarSegmento({
        totalAtendimentos: total,
        diasDesdeUltimo,
        diasDesdeCadastro,
      }),
      totalAtendimentos: total,
      primeiroAtendimento: datas[0] ?? '',
      ultimoAtendimento: ultimo,
      diasDesdeUltimo,
      frequenciaDias: frequencia(datas),
      totalGasto: gastos.get(cliente.id) ?? 0,
      servicos: porServico,
      produtos: produtosDoCliente(lancamentos, cliente),
      profissionalPreferido: profissionais[0]?.[0] ?? null,
    }
  })
}

export type FiltroSegmento = SegmentoCliente | GrupoRetorno | 'todos'

/** Segmentos que compõem cada grupo de retorno. */
export function segmentosDoGrupo(grupo: GrupoRetorno): SegmentoCliente[] {
  if (grupo === 'ativos') return ['ativo', 'recorrente']
  if (grupo === 'risco') return ['sem_retorno']
  return ['inativo']
}

/** Contagem por grupo de retorno (ativos, risco de retorno, inativos). */
export function resumoGrupos(
  resumo: ResumoSegmentos,
): Record<GrupoRetorno, number> {
  return {
    ativos: resumo.ativo + resumo.recorrente,
    risco: resumo.sem_retorno,
    inativos: resumo.inativo,
  }
}

/** Busca por nome/telefone/e-mail + filtro de segmento ou grupo da lista do CRM. */
export function filtrarPerfis(
  perfis: PerfilCliente[],
  busca: string,
  segmento: FiltroSegmento,
): PerfilCliente[] {
  const termo = normalizarBusca(busca)
  const digitos = busca.replace(/\D/g, '')
  const doGrupo = ehGrupoRetorno(segmento) ? segmentosDoGrupo(segmento) : null
  return perfis.filter((perfil) => {
    if (segmento !== 'todos') {
      if (doGrupo) {
        if (!doGrupo.includes(perfil.segmento)) return false
      } else if (perfil.segmento !== segmento) return false
    }
    if (!termo && !digitos) return true
    const { cliente } = perfil
    if (termo && normalizarBusca(cliente.nome).includes(termo)) return true
    if (termo && normalizarBusca(cliente.email).includes(termo)) return true
    if (digitos && cliente.telefone.replace(/\D/g, '').includes(digitos))
      return true
    return false
  })
}

export type ResumoSegmentos = Record<SegmentoCliente, number>

export function resumoSegmentos(perfis: PerfilCliente[]): ResumoSegmentos {
  const resumo: ResumoSegmentos = {
    novo: 0,
    ativo: 0,
    recorrente: 0,
    sem_retorno: 0,
    inativo: 0,
  }
  for (const perfil of perfis) resumo[perfil.segmento] += 1
  return resumo
}

/** Próximo agendamento futuro (>= hoje) do cliente — pendente ou confirmado. */
export function proximoAgendamento(
  agendamentos: Agendamento[],
  nomeCliente: string,
  hoje: string = hojeISO(),
): Agendamento | null {
  const chave = normalizarBusca(nomeCliente)
  const futuros = agendamentos
    .filter(
      (ag) =>
        normalizarBusca(ag.cliente) === chave &&
        ag.data >= hoje &&
        (ag.status === 'pendente' || ag.status === 'confirmado'),
    )
    .sort((a, b) =>
      a.data === b.data ? a.horario.localeCompare(b.horario) : a.data < b.data ? -1 : 1,
    )
  return futuros[0] ?? null
}

/** Sugere a próxima data pela frequência média (usado no CRM/IA). */
export function proximaDataSugerida(
  ultimoAtendimento: string,
  frequenciaDias: number | null,
): string | null {
  if (!ultimoAtendimento || !frequenciaDias || frequenciaDias <= 0) return null
  return somarDias(ultimoAtendimento, frequenciaDias)
}

/**
 * Dias até o próximo aniversário (0 = hoje). Cruza o ano quando já
 * passou; nascimento inválido/ausente devolve null.
 */
export function diasParaAniversario(
  nascimento: string,
  hoje: string = hojeISO(),
): number | null {
  if (!nascimento || nascimento.length < 10) return null
  const [, mes, dia] = nascimento.slice(0, 10).split('-').map(Number)
  if (!mes || !dia) return null
  const hojeMs = Date.parse(`${hoje.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(hojeMs)) return null
  const ano = new Date(hojeMs).getUTCFullYear()
  let alvo = Date.UTC(ano, mes - 1, dia)
  if (alvo < hojeMs) alvo = Date.UTC(ano + 1, mes - 1, dia)
  return Math.round((alvo - hojeMs) / 86_400_000)
}

/**
 * Clientes com aniversário no mês corrente (ordenados por dia do mês).
 * Cliente sem nascimento não entra.
 */
export function aniversariantesDoMes(
  clientes: Cliente[],
  hoje: string = hojeISO(),
): Cliente[] {
  const mes = hoje.slice(5, 7)
  return clientes
    .filter((c) => c.nascimento && c.nascimento.slice(5, 7) === mes)
    .sort(
      (a, b) =>
        a.nascimento.slice(8, 10).localeCompare(b.nascimento.slice(8, 10)) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    )
}

// ---------------------------------------------------------------------------
// Histórico completo — linha do tempo única do cliente (derivada, sem cópia)

export type TipoEventoHistorico =
  | 'agendamento'
  | 'pagamento'
  | 'interacao'
  | 'mensagem'

export const TIPOS_EVENTO_ROTULO: Record<TipoEventoHistorico, string> = {
  agendamento: 'Atendimento',
  pagamento: 'Pagamento',
  interacao: 'Interação',
  mensagem: 'WhatsApp',
}

export type EventoHistorico = {
  id: string
  tipo: TipoEventoHistorico
  /** YYYY-MM-DD */
  data: string
  /** HH:MM (quando conhecido; '' caso contrário) */
  hora: string
  /** Título prefixado pela origem do evento */
  titulo: string
  /** Valor recebido (pagamentos) */
  valor?: number
  estornado?: boolean
  statusAgendamento?: StatusAgendamento
  statusMensagem?: StatusMensagem
}

export type EntradaHistorico = {
  agendamentos: Agendamento[]
  lancamentos: Lancamento[]
  interacoes: Interacao[]
  mensagens: MensagemWhats[]
}

/**
 * Linha do tempo completa do cliente: visitas (agenda), pagamentos (caixa),
 * interações (CRM) e mensagens (WhatsApp) em uma única lista do mais
 * recente para o mais antigo. Derivada das fontes oficiais — nada é
 * duplicado em armazenamento.
 */
export function montarHistorico(
  cliente: Cliente,
  entrada: EntradaHistorico,
): EventoHistorico[] {
  const chave = normalizarBusca(cliente.nome)
  const eventos: EventoHistorico[] = []

  for (const ag of entrada.agendamentos) {
    if (normalizarBusca(ag.cliente) !== chave) continue
    eventos.push({
      id: `agendamento-${ag.id}`,
      tipo: 'agendamento',
      data: ag.data,
      hora: ag.horario,
      titulo: `Agendamento · ${ag.servico} · ${ag.profissional}`,
      statusAgendamento: ag.status,
    })
  }

  for (const l of entrada.lancamentos) {
    if (l.tipo === 'despesa') continue
    const dono = l.clienteId
      ? l.clienteId === cliente.id
      : l.cliente
        ? normalizarBusca(l.cliente) === chave
        : false
    if (!dono) continue
    eventos.push({
      id: `pagamento-${l.id}`,
      tipo: 'pagamento',
      data: l.data,
      hora: l.hora,
      titulo: `Pagamento · ${l.descricao}`,
      valor: l.valorLiquido,
      estornado: Boolean(l.estornado),
    })
  }

  for (const i of entrada.interacoes) {
    if (i.clienteId !== cliente.id) continue
    eventos.push({
      id: `interacao-${i.id}`,
      tipo: 'interacao',
      data: i.criadoEm.slice(0, 10),
      hora: i.criadoEm.slice(11, 16),
      titulo: `${TIPOS_INTERACAO_ROTULO[i.tipo]} · ${i.texto}`,
    })
  }

  for (const m of entrada.mensagens) {
    if (m.clienteId !== cliente.id) continue
    eventos.push({
      id: `mensagem-${m.id}`,
      tipo: 'mensagem',
      data: m.criadoEm.slice(0, 10),
      hora: m.criadoEm.slice(11, 16),
      titulo: `WhatsApp · ${TEMPLATES_ROTULO[m.template]} · ${m.texto}`,
      statusMensagem: m.status,
    })
  }

  return eventos.sort((a, b) => {
    const ka = `${a.data} ${a.hora}`
    const kb = `${b.data} ${b.hora}`
    if (ka !== kb) return kb.localeCompare(ka)
    return b.id.localeCompare(a.id)
  })
}
