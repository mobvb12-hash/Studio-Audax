import { useMemo, useState } from 'react'
import {
  PROFISSIONAIS,
  formatarDataLonga,
  hojeISO,
  somarDias,
} from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento, StatusAgendamento } from '@/modules/agenda/types'

const STATUS_ROTULO: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function statusClasse(status: StatusAgendamento): string {
  if (status === 'confirmado')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'pendente')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'concluido')
    return 'border-[#E5DCC3] bg-[#F3ECDA] text-[#4A4436]'
  return 'border-red-200 bg-red-50 text-red-600'
}

function CardAgendamento({
  ag,
  mudarStatus,
  remover,
}: {
  ag: Agendamento
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
}) {
  return (
    <li className="rounded-lg border border-[#E5DCC3] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-[#F3ECDA] px-2 py-1 text-sm font-bold text-[#8A6A14]">
          {ag.horario}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasse(ag.status)}`}
        >
          {STATUS_ROTULO[ag.status]}
        </span>
      </div>
      <p className="mt-2 truncate text-sm font-bold text-[#1C1A15]">
        {ag.cliente}{' '}
        {ag.telefone && (
          <span className="ml-1 font-normal text-[#8A8171]">{ag.telefone}</span>
        )}
      </p>
      <p className="mt-0.5 truncate text-[13px] text-[#4A4436]">
        {ag.servico}
        {ag.observacao ? ` · ${ag.observacao}` : ''}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {ag.status === 'pendente' && (
          <button
            type="button"
            onClick={() => mudarStatus(ag.id, 'confirmado')}
            className="rounded-lg bg-[#8A6A14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6F550F]"
          >
            Confirmar
          </button>
        )}
        {ag.status !== 'concluido' && ag.status !== 'cancelado' && (
          <button
            type="button"
            onClick={() => mudarStatus(ag.id, 'concluido')}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
          >
            Concluir
          </button>
        )}
        {ag.status !== 'cancelado' && ag.status !== 'concluido' && (
          <button
            type="button"
            onClick={() => mudarStatus(ag.id, 'cancelado')}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={() => remover(ag.id)}
          className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
          aria-label={`Excluir agendamento de ${ag.cliente}`}
        >
          Excluir
        </button>
      </div>
    </li>
  )
}

export default function Agenda({ onNovo }: { onNovo: () => void }) {
  const { agendamentos, mudarStatus, remover } = useAgenda()
  const [data, setData] = useState(hojeISO())

  const doDia = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data === data)
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos, data],
  )

  const pendentes = doDia.filter((a) => a.status === 'pendente').length
  const confirmados = doDia.filter((a) => a.status === 'confirmado').length

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Agenda
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {formatarDataLonga(data)} · {doDia.length} atendimento(s) ·{' '}
            {pendentes} pendente(s) · {confirmados} confirmado(s)
          </p>
        </div>
        <button
          type="button"
          onClick={onNovo}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo agendamento
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <button
          type="button"
          onClick={() => setData((d) => somarDias(d, -1))}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F3ECDA]"
          aria-label="Dia anterior"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setData(hojeISO())}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-medium hover:bg-[#F3ECDA]"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setData((d) => somarDias(d, 1))}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F3ECDA]"
          aria-label="Próximo dia"
        >
          ›
        </button>
        <input
          type="date"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PROFISSIONAIS.map((profissional) => {
          const lista = doDia.filter(
            (ag) => ag.profissional === profissional,
          )
          return (
            <section
              key={profissional}
              className="flex flex-col rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4"
            >
              <header className="flex items-center justify-between border-b border-[#E9DDC0] pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E9DDC0] text-xs font-bold text-[#8A6A14]">
                    {profissional.slice(0, 2).toUpperCase()}
                  </span>
                  <h2 className="text-[15px] font-bold text-[#1C1A15]">
                    {profissional}
                  </h2>
                </div>
                <span className="text-sm font-semibold text-[#8A8171]">
                  {lista.length} agend.
                </span>
              </header>

              {lista.length === 0 ? (
                <div className="mt-3 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-8 text-center text-sm text-[#A99E85]">
                  Nenhum agendamento neste dia.
                </div>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {lista.map((ag) => (
                    <CardAgendamento
                      key={ag.id}
                      ag={ag}
                      mudarStatus={mudarStatus}
                      remover={remover}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
