import type { Agendamento } from '@/modules/agenda/types'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import type { Cliente } from '@/modules/clientes/types'
import {
  ORIGEM_ROTULO,
  STATUS_ROTULO,
  TEMPLATES_ROTULO,
  type MensagemWhats,
  type StatusMensagem,
} from '@/modules/whatsapp/types'
import { formatarISO } from '@/lib/apresentacao'

function corStatus(status: StatusMensagem): string {
  if (status === 'enviada')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'falhou') return 'border-red-300 bg-red-50 text-red-700'
  return 'border-amber-300 bg-amber-50 text-amber-800'
}

type Props = {
  filtradas: MensagemWhats[]
  total: number
  agendamentos: Agendamento[]
  clientes: Cliente[]
  aoEnviar: (mensagem: MensagemWhats) => void
  aoMarcarEnviada: (mensagemId: string) => void
  aoRegistrarFalha: (mensagem: MensagemWhats) => void
  aoVerHistorico: (cliente: Cliente) => void
}

/** Lista de mensagens da central (filtrada) com ações por mensagem. */
export default function ListaMensagens({
  filtradas,
  total,
  agendamentos,
  clientes,
  aoEnviar,
  aoMarcarEnviada,
  aoRegistrarFalha,
  aoVerHistorico,
}: Props) {
  return (
    <div className="mt-3">
      {filtradas.length === 0 ? (
        <p className="text-sm text-[#A99E85]">
          {total === 0
            ? 'Nenhuma mensagem registrada. Use os templates acima, o CRM ou as Automações.'
            : 'Nenhuma mensagem com este filtro.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtradas.map((m) => {
            const ag = m.agendamentoId
              ? agendamentos.find((a) => a.id === m.agendamentoId)
              : undefined
            return (
              <li
                key={m.id}
                className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${corStatus(
                      m.status,
                    )}`}
                  >
                    {STATUS_ROTULO[m.status]}
                  </span>
                  <p className="text-sm font-bold text-[#121110]">{m.cliente}</p>
                  <span className="text-[11px] font-medium text-[#7C7469]">
                    {TEMPLATES_ROTULO[m.template]} · {ORIGEM_ROTULO[m.origem]}{' '}
                    · {formatarISO(m.criadoEm)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#3A352C]">{m.texto}</p>
                {ag && (
                  <p className="mt-1 text-[12px] text-[#8A6A14]">
                    Agendamento · {formatarDataLonga(ag.data)} às {ag.horario}
                  </p>
                )}
                {m.motivoFalha && (
                  <p className="mt-1 text-[12px] text-red-700">{m.motivoFalha}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => aoEnviar(m)}
                    className="rounded-lg border border-[#8A6A14] bg-white px-2.5 py-1 text-xs font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
                  >
                    Enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => aoMarcarEnviada(m.id)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                  >
                    Marcar enviada
                  </button>
                  <button
                    type="button"
                    onClick={() => aoRegistrarFalha(m)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                  >
                    Registrar falha
                  </button>
                  <button
                    type="button"
                    aria-label={`Histórico de ${m.cliente}`}
                    onClick={() => {
                      const cliente = clientes.find((c) => c.id === m.clienteId)
                      if (cliente) aoVerHistorico(cliente)
                    }}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                  >
                    Ver histórico
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
