// Regras puras do módulo Clientes — status ativo/inativo, busca com filtros,
// resumo de atendimentos e total gasto por cliente (sem estado, sem efeitos).
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { normalizarTexto } from '@/lib/moeda'
import { digitosDosTelefones, type Cliente } from './types'

export type FiltroStatusCliente = 'todos' | 'ativos' | 'inativos'

/** Minúsculas, sem acentos e sem espaços nas pontas. */
export function normalizarBusca(texto: string): string {
  return normalizarTexto(texto)
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

/** Remove tudo que não for dígito. */
export function digitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

export type CamposNascimento = { dia: string; mes: string; ano: string }

/**
 * Monta o ISO (YYYY-MM-DD) do nascimento a partir dos campos do formulário.
 * Vazio quando nada foi preenchido; `erro` quando o preenchimento é parcial
 * ou inválido (ano fora do intervalo ou data inexistente).
 */
export function montarNascimento(
  { dia, mes, ano }: CamposNascimento,
  anoAtual: number,
): { iso: string; erro?: string } {
  const algumPreenchido = Boolean(dia || mes || ano)
  if (!algumPreenchido) return { iso: '' }
  if (!dia || !mes || !ano) {
    return { iso: '', erro: 'Informe dia, mês e ano do nascimento ou deixe em branco.' }
  }
  const a = Number(ano)
  if (Number.isNaN(a) || a < 1900 || a > anoAtual) {
    return { iso: '', erro: 'Ano de nascimento inválido.' }
  }
  const d = Number(dia)
  const m = Number(mes)
  const testada = new Date(a, m - 1, d)
  if (
    testada.getFullYear() !== a ||
    testada.getMonth() !== m - 1 ||
    testada.getDate() !== d
  ) {
    return { iso: '', erro: 'Data de nascimento inválida.' }
  }
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return { iso: `${a}-${mm}-${dd}` }
}

export type DadosClienteForm = {
  nome: string
  telefone: string
  email: string
  cpf: string
  cnpj: string
}

/** Primeira mensagem de validação do formulário de cliente ('' = válido). */
export function validarDadosCliente(dados: DadosClienteForm): string {
  if (dados.nome.trim().length < 2) return 'Informe o nome do cliente.'
  if (!digitos(dados.telefone)) return 'Informe o telefone do cliente.'
  if (dados.email.trim() && !/^\S+@\S+\.\S+$/.test(dados.email.trim()))
    return 'Informe um e-mail válido ou deixe em branco.'
  if (dados.cpf.trim() && digitos(dados.cpf).length !== 11)
    return 'Informe um CPF com 11 dígitos ou deixe em branco.'
  if (dados.cnpj.trim() && digitos(dados.cnpj).length !== 14)
    return 'Informe um CNPJ com 14 dígitos ou deixe em branco.'
  return ''
}
