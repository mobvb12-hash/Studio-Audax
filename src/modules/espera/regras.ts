// Regras puras da Lista de Espera — compatibilidade com a Agenda e filtros
// (sem estado, sem efeitos). A sugestão de encaixe usa as regras oficiais
// da Agenda (expediente, bloqueios, conflitos e duração do serviço).
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import { duracaoBase, horariosDisponiveis, paraMinutos } from '@/modules/agenda/regras'
import type { Agendamento, Bloqueio, Expediente } from '@/modules/agenda/types'
import { normalizarBusca } from '@/modules/clientes/regras'
import type {
  NovoPedidoInput,
  PedidoEspera,
  StatusEspera,
} from './types'

/** Janela de horário compatível com um pedido */
export type Janela = {
  /** YYYY-MM-DD */
  data: string
  /** HH:MM */
  horario: string
  profissional: string
}

/** Valida os campos de um pedido — mensagem pronta para o operador. */
export function validarPedido(input: NovoPedidoInput): void {
  if (!input.clienteId.trim() || !input.cliente.trim())
    throw new Error('Selecione o cliente.')
  if (!input.servico.trim()) throw new Error('Selecione o serviço desejado.')
  const periodo = input.periodo ?? 'qualquer'
  if (periodo !== 'manha' && periodo !== 'tarde' && periodo !== 'qualquer')
    throw new Error('Período inválido.')
}

type PedidoCompatibilidade = Pick<
  PedidoEspera,
  'profissional' | 'dataPreferida' | 'periodo'
>

/**
 * Compatibilidade entre pedido e janela: profissional livre, data
 * preferida e período (manhã = até 11:59, tarde = a partir de 12:00).
 */
export function compativel(
  pedido: PedidoCompatibilidade,
  janela: Janela,
): boolean {
  if (pedido.profissional && pedido.profissional !== janela.profissional)
    return false
  if (pedido.dataPreferida && pedido.dataPreferida !== janela.data)
    return false
  const minutos = paraMinutos(janela.horario)
  if (pedido.periodo === 'manha') return minutos < 12 * 60
  if (pedido.periodo === 'tarde') return minutos >= 12 * 60
  return true
}

export type EncaixeInput = {
  pedido: PedidoEspera
  expediente: Expediente
  bloqueios: Bloqueio[]
  agendamentos: Agendamento[]
  /** Nomes dos profissionais ativos */
  profissionais: string[]
  /** Omitido = hoje */
  hoje?: string
  /** Dias corridos à frente quando não há data preferida (padrão 7) */
  diasFrente?: number
  /** Máximo de janelas retornadas (padrão 6) */
  limite?: number
}

/**
 * Encaixes livres na agenda para o pedido: reusa horariosDisponiveis da
 * Agenda para cada profissional candidato, filtrando pelo período do
 * pedido. Sempre a partir de hoje — data preferida no passado = vazio.
 */
export function encaixesDisponiveis(input: EncaixeInput): Janela[] {
  const hoje = input.hoje ?? hojeISO()
  const diasFrente = input.diasFrente ?? 7
  const limite = input.limite ?? 6
  const { pedido, expediente, bloqueios, agendamentos, profissionais } = input

  const profissionaisDoPedido = pedido.profissional
    ? profissionais.includes(pedido.profissional)
      ? [pedido.profissional]
      : []
    : profissionais

  const datas: string[] = []
  if (pedido.dataPreferida) {
    if (pedido.dataPreferida >= hoje) datas.push(pedido.dataPreferida)
  } else {
    for (let i = 0; i < diasFrente; i++) datas.push(somarDias(hoje, i))
  }

  const janelas: Janela[] = []
  for (const data of datas) {
    const doDia = agendamentos.filter((ag) => ag.data === data)
    for (const profissional of profissionaisDoPedido) {
      const { horarios } = horariosDisponiveis(
        data,
        expediente,
        bloqueios,
        doDia,
        [profissional],
        duracaoBase,
      )
      for (const horario of horarios) {
        const janela = { data, horario, profissional }
        if (!compativel(pedido, janela)) continue
        janelas.push(janela)
      }
    }
  }

  return janelas
    .sort(
      (a, b) =>
        (a.data === b.data
          ? a.horario === b.horario
            ? a.profissional.localeCompare(b.profissional, 'pt-BR')
            : a.horario < b.horario
              ? -1
              : 1
          : a.data < b.data
            ? -1
            : 1),
    )
    .slice(0, limite)
}

export type PedidoComPosicao = {
  pedido: PedidoEspera
  /** 1..N na fila de aguardando; null para encerrados */
  posicao: number | null
}

/**
 * Posição na fila: quem está aguardando em ordem de chegada (criadoEm),
 * encerrados ao fim sem posição. Não altera a lista recebida.
 */
export function comPosicao(pedidos: PedidoEspera[]): PedidoComPosicao[] {
  const aguardando = pedidos
    .filter((p) => p.status === 'aguardando')
    .sort(
      (a, b) =>
        a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id),
    )
  const encerrados = pedidos
    .filter((p) => p.status !== 'aguardando')
    .sort(
      (a, b) =>
        b.criadoEm.localeCompare(a.criadoEm) || a.id.localeCompare(b.id),
    )
  return [
    ...aguardando.map((pedido, i) => ({ pedido, posicao: i + 1 })),
    ...encerrados.map((pedido) => ({ pedido, posicao: null })),
  ]
}

/** Filtro da lista: status + busca por nome/telefone (posições preservadas). */
export function filtrarPosicoes(
  itens: PedidoComPosicao[],
  busca: string,
  status: StatusEspera | 'todos',
): PedidoComPosicao[] {
  const termo = normalizarBusca(busca)
  const digitos = busca.replace(/\D/g, '')
  return itens.filter(({ pedido }) => {
    if (status !== 'todos' && pedido.status !== status) return false
    if (!termo && !digitos) return true
    if (termo && normalizarBusca(pedido.cliente).includes(termo)) return true
    if (digitos && pedido.telefone.replace(/\D/g, '').includes(digitos))
      return true
    return false
  })
}
