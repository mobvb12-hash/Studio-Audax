import type { AgendamentoPainel } from '@/services/supabase/painel'

const DIAS_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

const STATUS_ATIVOS = ['pendente', 'confirmado']

/** Próximo = ainda ativo (pendente/confirmado) e a data não passou. */
export function ehProximo(agendamento: AgendamentoPainel, hoje: string): boolean {
  return (
    STATUS_ATIVOS.includes(agendamento.status) &&
    agendamento.data >= hoje
  )
}

/**
 * Separa a lista do cliente: `proximos` (mais próximos primeiro) e
 * `historico` (mais recentes primeiro, inclui cancelados/concluídos e
 * datas passadas com status ativo que já viraram histórico).
 */
export function separarAgendamentos(
  lista: AgendamentoPainel[],
  hoje: string,
): { proximos: AgendamentoPainel[]; historico: AgendamentoPainel[] } {
  const proximos = lista
    .filter((agendamento) => ehProximo(agendamento, hoje))
    .sort((a, b) =>
      a.data === b.data
        ? a.horario.localeCompare(b.horario)
        : a.data.localeCompare(b.data),
    )
  const historico = lista
    .filter((agendamento) => !ehProximo(agendamento, hoje))
    .sort((a, b) =>
      a.data === b.data
        ? b.horario.localeCompare(a.horario)
        : b.data.localeCompare(a.data),
    )
  return { proximos, historico }
}

/** 'YYYY-MM-DD' → 'segunda-feira, 5/1/2026' (sem depender de locale). */
export function formatarDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (!ano || !mes || !dia) return iso
  const data = new Date(ano, mes - 1, dia)
  const diaSemana = DIAS_SEMANA[data.getDay()] ?? ''
  return `${diaSemana}, ${dia}/${mes}/${ano}`
}

/** Rótulo curto do status (usa o rótulo oficial da Agenda). */
export function rotuloStatus(status: string): string {
  const conhecidos: Record<string, string> = {
    pendente: 'Pendente',
    confirmado: 'Confirmado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
    nao_compareceu: 'Não compareceu',
  }
  return conhecidos[status] ?? status
}
