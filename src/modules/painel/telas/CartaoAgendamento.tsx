import type { AgendamentoPainel } from '@/services/supabase/painel'
import { formatarDataBR, rotuloStatus } from '../dashboard'

/**
 * Cartão de agendamento do cliente — usado no dashboard e na lista completa
 * da aba Agendamentos. Mostra só o que a linha própria contém (RLS 018):
 * nenhuma função administrativa e nenhum dado de outro cliente.
 */
export default function CartaoAgendamento({
  agendamento,
  destaque,
}: {
  agendamento: AgendamentoPainel
  /** Card do "próximo horário": presença em destaque, tipografia maior. */
  destaque?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        destaque
          ? 'border-gold-300 bg-gold-200/40'
          : 'border-cream-300 bg-cream-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`truncate font-semibold text-noir-900 ${
              destaque ? 'text-[17px]' : 'text-[15px]'
            }`}
          >
            {agendamento.servico}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-noir-500">
            {agendamento.profissional}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-cream-300 bg-cream-100 px-2.5 py-1 text-[11.5px] font-medium text-noir-700">
          {rotuloStatus(agendamento.status)}
        </span>
      </div>
      <p className="mt-3 text-[13.5px] font-medium tabular-nums text-noir-800">
        {formatarDataBR(agendamento.data)} · {agendamento.horario}
        {agendamento.duracaoMin ? ` · ${agendamento.duracaoMin} min` : ''}
      </p>
      {agendamento.observacao && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-noir-500">
          {agendamento.observacao}
        </p>
      )}
    </div>
  )
}