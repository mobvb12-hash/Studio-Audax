// Regras puras do módulo Clientes — status ativo/inativo, busca com filtros,
// resumo de atendimentos e total gasto por cliente (sem estado, sem efeitos).
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { normalizarTexto } from '@/lib/moeda'
import { digitosDosTelefones, type Cliente } from './types'

export type FiltroStatusCliente = 'todos' | 'ativos' | 'inativos'

/** Minúsculas, sem acentos e sem espaços nas pontas. */
export function normalizarBusca(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/**
 * Lista exibida na página: filtro de status + busca por nome, e-mail ou
 * telefone (a busca aceita dígitos formatados ou não).
 */
export function filtrarClientes(
  clientes: Cliente[],
  busca: string,
  filtro: FiltroStatusCliente,
): Cliente[] {
  const termo = normalizarBusca(busca)
  const digitos = busca.replace(/\D/g, '')
  return clientes.filter((cliente) => {
    if (filtro === 'ativos' && !cliente.ativo) return false
    if (filtro === 'inativos' && cliente.ativo) return false
    if (!termo && !digitos) return true
    if (termo && normalizarBusca(cliente.nome).includes(termo)) return true
    if (termo && normalizarBusca(cliente.email).includes(termo)) return true
    if (
      digitos &&
      digitosDosTelefones(cliente.telefone, cliente.telefones).some((n) =>
        n.includes(digitos),
      )
    )
      return true
    return false
  })
}

export type ResumoClientes = {
  total: number
  ativos: number
  inativos: number
}

export function resumoClientes(clientes: Cliente[]): ResumoClientes {
  const ativos = clientes.filter((cliente) => cliente.ativo).length
  return { total: clientes.length, ativos, inativos: clientes.length - ativos }
}

export type ResumoAtendimentos = {
  /** Agendamentos concluídos do cliente */
  total: number
  /** YYYY-MM-DD do último concluído ('' se não houver) */
  ultimo: string
}

/**
 * Agendamentos concluídos agrupados por cliente (chave = nome normalizado).
 * Usado para "total de atendimentos" e "último atendimento" da lista.
 */
export function resumoAtendimentos(
  agendamentos: Agendamento[],
): Map<string, ResumoAtendimentos> {
  const mapa = new Map<string, ResumoAtendimentos>()
  for (const ag of agendamentos) {
    if (ag.status !== 'concluido') continue
    const chave = normalizarBusca(ag.cliente)
    if (!chave) continue
    const atual = mapa.get(chave) ?? { total: 0, ultimo: '' }
    atual.total += 1
    if (ag.data > atual.ultimo) atual.ultimo = ag.data
    mapa.set(chave, atual)
  }
  return mapa
}

function somar(mapa: Map<string, number>, chave: string, valor: number) {
  mapa.set(chave, (mapa.get(chave) ?? 0) + valor)
}

/**
 * Total gasto (receitas não estornadas) por `clienteId`. Lançamento sem
 * `clienteId` (ou com id de cliente já removido) é resolvido pelo nome —
 * mesmo critério do ClienteDetalheModal — para não perder histórico legado.
 */
export function gastosPorCliente(
  lancamentos: Lancamento[],
  clientes: Cliente[],
): Map<string, number> {
  const idPorNome = new Map(
    clientes.map((cliente) => [normalizarTexto(cliente.nome), cliente.id]),
  )
  const ids = new Set(clientes.map((cliente) => cliente.id))
  const mapa = new Map<string, number>()
  for (const l of lancamentos) {
    if (l.estornado || l.tipo !== 'receita') continue
    const id =
      l.clienteId && ids.has(l.clienteId)
        ? l.clienteId
        : l.cliente
          ? idPorNome.get(normalizarTexto(l.cliente))
          : undefined
    if (!id) continue
    somar(mapa, id, l.valorLiquido)
  }
  return mapa
}

/** Total gasto de um cliente no mapa (0 quando nunca gastou). */
export function gastoDoCliente(
  gastos: Map<string, number>,
  cliente: Cliente,
): number {
  return gastos.get(cliente.id) ?? 0
}
