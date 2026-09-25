// Regras puras do módulo CRM — segmentação por comportamento real,
// perfis derivados da agenda/caixa e filtros (sem estado, sem efeitos).
// Nenhum dado é duplicado: tudo é calculado a partir de Clientes, Agenda
// e Caixa que já existem no sistema.
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { gastosPorCliente, normalizarBusca } from '@/modules/clientes/regras'
import type { Cliente } from '@/modules/clientes/types'
import type { SegmentoCliente } from './types'

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
      profissionalPreferido: profissionais[0]?.[0] ?? null,
    }
  })
}

export type FiltroSegmento = SegmentoCliente | 'todos'

/** Busca por nome/telefone/e-mail + filtro de segmento da lista do CRM. */
export function filtrarPerfis(
  perfis: PerfilCliente[],
  busca: string,
  segmento: FiltroSegmento,
): PerfilCliente[] {
  const termo = normalizarBusca(busca)
  const digitos = busca.replace(/\D/g, '')
  return perfis.filter((perfil) => {
    if (segmento !== 'todos' && perfil.segmento !== segmento) return false
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
