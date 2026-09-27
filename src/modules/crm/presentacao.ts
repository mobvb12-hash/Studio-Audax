import {
  STATUS_ROTULO as STATUS_AGENDAMENTO_ROTULO,
  type StatusAgendamento,
} from '@/modules/agenda/types'
import type { EventoHistorico } from '@/modules/crm/regras'
import {
  STATUS_ROTULO as STATUS_ROTULO_MENSAGEM,
  type MensagemWhats,
} from '@/modules/whatsapp/types'

/** Cor do badge de segmento do cliente (Crm e CrmClienteModal). */
export function corSegmento(segmento: string): string {
  switch (segmento) {
    case 'novo':
      return 'border-sky-300 bg-sky-50 text-sky-700'
    case 'ativo':
      return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
    case 'recorrente':
      return 'border-amber-300 bg-amber-100 text-amber-900'
    case 'sem_retorno':
      return 'border-orange-300 bg-orange-50 text-orange-800'
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700'
  }
}

/** Cor do badge de status de mensagem do WhatsApp. */
export function corStatusMensagem(status: MensagemWhats['status']): string {
  if (status === 'enviada')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'falhou')
    return 'border-red-300 bg-red-50 text-red-700'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

/** Cor do badge de status de agendamento no histórico do CRM. */
export function corStatusAgendamento(status: StatusAgendamento): string {
  if (status === 'concluido' || status === 'confirmado')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'cancelado') return 'border-red-200 bg-red-50 text-red-600'
  if (status === 'nao_compareceu')
    return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

/** Badge à direita de cada evento do histórico completo. */
export function badgeEvento(
  evento: EventoHistorico,
): { rotulo: string; classe: string } | null {
  if (evento.estornado)
    return { rotulo: 'Estornada', classe: 'border-red-200 bg-red-50 text-red-600' }
  if (evento.statusAgendamento)
    return {
      rotulo: STATUS_AGENDAMENTO_ROTULO[evento.statusAgendamento],
      classe: corStatusAgendamento(evento.statusAgendamento),
    }
  if (evento.statusMensagem)
    return {
      rotulo: STATUS_ROTULO_MENSAGEM[evento.statusMensagem],
      classe: corStatusMensagem(evento.statusMensagem),
    }
  return null
}
