import type { AgendamentoPainel } from '@/services/supabase/painel'
import { formatarDataBR, rotuloStatus } from '../dashboard'

/**
 * Cartão de agendamento do cliente — usado no dashboard e na lista completa
 * da aba Agendamentos. Mostra só o que a linha própria contém (RLS 018).
 */
export default function CartaoAgendamento({
  agendamento,
}: {
  agendamento: AgendamentoPainel
}) {
  return (
    <div className="rounded-xl border border-[#E5DCC3] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-[#1C1A15]">
            {agendamento.servico}
          </p>
          <p className="mt-0.5 text-[13px] text-[#8A8171]">
            {agendamento.profissional}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#FDFBF3] px-2 py-1 text-[12px] font-medium text-[#8A6A14]">
          {rotuloStatus(agendamento.status)}
        </span>
      </div>
      <p className="mt-3 text-[13px] font-medium text-[#4A4436]">
        {formatarDataBR(agendamento.data)} · {agendamento.horario}
        {agendamento.duracaoMin ? ` · ${agendamento.duracaoMin} min` : ''}
      </p>
      {agendamento.observacao && (
        <p className="mt-2 text-[12px] text-[#8A8171]">
          {agendamento.observacao}
        </p>
      )}
    </div>
  )
}
