// Relatórios — períodos do filtro único da página.
// Hoje/Semana/Mês são reaproveitados da tela de Comissões (fonte única).
import {
  periodoHoje,
  periodoMes,
  periodoSemana,
  rotuloPeriodo,
} from '@/modules/comissoes/periodo'
import type { Periodo } from '@/modules/comissoes/types'

export { periodoHoje, periodoMes, periodoSemana, rotuloPeriodo }

function iso(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function periodoOntem(): Periodo {
  const ontem = new Date()
  ontem.setDate(ontem.getDate() - 1)
  const dia = iso(ontem)
  return { inicio: dia, fim: dia }
}

export function periodoMesAnterior(): Periodo {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  return { inicio: iso(inicio), fim: iso(fim) }
}
