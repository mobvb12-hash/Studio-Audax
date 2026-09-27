import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { badgeEvento } from '@/modules/crm/presentacao'
import type { EventoHistorico } from '@/modules/crm/regras'
import { formatarBRL } from '@/lib/moeda'

/** Linha do tempo única do histórico completo do cliente. */
export default function HistoricoCliente({
  historico,
}: {
  historico: EventoHistorico[]
}) {
  return (
    <div className="mt-5 border-t border-[#E5DCC3] pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#1C1A15]">
          Histórico completo
        </h3>
        <span className="text-[11px] text-[#8A8171]">
          {historico.length} evento(s)
        </span>
      </div>
      {historico.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
          Nenhum evento no histórico deste cliente.
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-[#EFE7D3] rounded-lg border border-[#E5DCC3] bg-white px-3">
          {historico.map((evento) => {
            const badge = badgeEvento(evento)
            return (
              <li
                key={evento.id}
                className="flex items-start justify-between gap-2 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[11px] text-[#8A8171]">
                    {formatarDataLonga(evento.data)} · {evento.hora}
                  </p>
                  <p className="mt-0.5 text-sm text-[#4A4436]">
                    {evento.titulo}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {evento.valor !== undefined && (
                    <span className="text-xs font-semibold text-[#8A6A14]">
                      {formatarBRL(evento.valor)}
                    </span>
                  )}
                  {badge && (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.classe}`}
                    >
                      {badge.rotulo}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
