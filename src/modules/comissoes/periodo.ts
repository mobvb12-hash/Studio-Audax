// Períodos da tela de Comissões (datas locais YYYY-MM-DD)
import type { Periodo } from './types'

function iso(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function periodoHoje(): Periodo {
  const hoje = iso(new Date())
  return { inicio: hoje, fim: hoje }
}

/** Semana corrente (segunda a domingo). */
export function periodoSemana(): Periodo {
  const hoje = new Date()
  const diaSemana = hoje.getDay() // 0 = domingo
  const ateSegunda = diaSemana === 0 ? 6 : diaSemana - 1
  const segunda = new Date(hoje)
  segunda.setDate(hoje.getDate() - ateSegunda)
  const domingo = new Date(segunda)
  domingo.setDate(segunda.getDate() + 6)
  return { inicio: iso(segunda), fim: iso(domingo) }
}

/** Mês corrente. */
export function periodoMes(): Periodo {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  return { inicio: iso(inicio), fim: iso(fim) }
}

export function rotuloPeriodo(periodo: Periodo): string {
  if (periodo.inicio === periodo.fim) {
    const [ano, mes, dia] = periodo.inicio.split('-').map(Number)
    return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR')
  }
  const fmt = (data: string) => {
    const [ano, mes, dia] = data.split('-').map(Number)
    return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR')
  }
  return `${fmt(periodo.inicio)} — ${fmt(periodo.fim)}`
}
