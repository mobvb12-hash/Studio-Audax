import type { StatusAgendamento } from '@/modules/agenda/types'

/** Classes de status para blocos clicáveis (grade da agenda). */
export function estiloStatus(status: StatusAgendamento): string {
  if (status === 'confirmado')
    return 'border-[#4F9417] bg-[#5FA83E] text-white hover:bg-[#549531]'
  if (status === 'pendente')
    return 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
  if (status === 'concluido')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33] hover:bg-[#DCEFD4]'
  if (status === 'nao_compareceu')
    return 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
  return 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
}

/** Classes de status para badges compactos (sem hover). */
export function estiloBadge(status: StatusAgendamento): string {
  if (status === 'confirmado') return 'border-[#4F9417] bg-[#5FA83E] text-white'
  if (status === 'pendente') return 'border-amber-300 bg-amber-100 text-amber-900'
  if (status === 'concluido') return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'nao_compareceu')
    return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-red-200 bg-red-50 text-red-600'
}
