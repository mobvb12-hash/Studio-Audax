import { useMemo, useState } from 'react'
import {
  PROFISSIONAIS,
  formatarDataLonga,
  hojeISO,
  somarDias,
} from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { StatusAgendamento } from '@/modules/agenda/types'

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

export default function Agenda({ onNovo }: { onNovo: () => void }) {
  const { agendamentos, mudarStatus, remover } = useAgenda()
  const [data, setData] = useState(hojeISO())
  const [profissional, setProfissional] = useState('todos')

  const doDia = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data === data)
        .filter((ag) =>
          profissional === 'todos' ? true : ag.profissional === profissional,
        )
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos, data, profissional],
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

      <div className="mt-5 flex flex-col gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Profissional
          </span>
          <select
            value={profissional}
            onChange={(e) => setProfissional(e.target.value)}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
          >
            <option value="todos">Todos</option>
            {PROFISSIONAIS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {doDia.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Nenhum agendamento para este dia. Clique em “Novo agendamento” para
          começar.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {doDia.map((ag) => (
            <li
              key={ag.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-[#F3ECDA] text-sm font-bold text-[#8A6A14]">
                {ag.horario}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1C1A15]">
                  {ag.cliente}{' '}
                  {ag.telefone && (
                    <span className="ml-1 font-normal text-[#8A8171]">
                      {ag.telefone}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-[#4A4436]">
                  {ag.servico} · {ag.profissional}
                  {ag.observacao ? ` · ${ag.observacao}` : ''}
                </p>
              </div>
              <span
                className={`shrink-0 self-start rounded-full border px-2.5 py-1 text-xs font-medium sm:self-center ${statusClasse(ag.status)}`}
              >
                {STATUS_ROTULO[ag.status]}
              </span>
              <div className="flex shrink-0 flex-wrap gap-1.5">
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
                  aria-label={`Excluir ${ag.cliente}`}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
