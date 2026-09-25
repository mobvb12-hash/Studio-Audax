import { useMemo, useState } from 'react'
import {
  HORARIOS,
  formatarDataLonga,
  hojeISO,
  somarDias,
} from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento, StatusAgendamento } from '@/modules/agenda/types'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'

export type SlotAgendamento = {
  data: string
  horario: string
  profissional: string
}

type Slot = { hora: string; intervalo: boolean }

type Props = {
  onNovo: (slot?: SlotAgendamento) => void
}

const STATUS_ROTULO: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

function montarSlots(): Slot[] {
  const slots: Slot[] = HORARIOS.map((hora) => ({ hora, intervalo: false }))
  const pos = HORARIOS.indexOf('11:30')
  const almoco: Slot[] = [
    { hora: '12:00', intervalo: true },
    { hora: '12:30', intervalo: true },
  ]
  if (pos >= 0) slots.splice(pos + 1, 0, ...almoco)
  else slots.push(...almoco)
  return slots
}

const SLOTS = montarSlots()

function somaMinutos(hora: string, min: number): string {
  const [h, m] = hora.split(':').map(Number)
  const total = h * 60 + m + min
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function estiloStatus(status: StatusAgendamento): string {
  if (status === 'confirmado')
    return 'border-[#4F9417] bg-[#5FA83E] text-white hover:bg-[#549531]'
  if (status === 'pendente')
    return 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
  if (status === 'concluido')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33] hover:bg-[#DCEFD4]'
  return 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
}

function estiloBadge(status: StatusAgendamento): string {
  if (status === 'confirmado') return 'border-[#4F9417] bg-[#5FA83E] text-white'
  if (status === 'pendente') return 'border-amber-300 bg-amber-100 text-amber-900'
  if (status === 'concluido') return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  return 'border-red-200 bg-red-50 text-red-600'
}

function DetalheAgendamento({
  ag,
  duracaoDo,
  mudarStatus,
  remover,
  onFechar,
}: {
  ag: Agendamento
  duracaoDo: (servico: string) => number
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
  onFechar: () => void
}) {
  const duracao = duracaoDo(ag.servico)
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              {ag.profissional}
            </p>
            <h2 className="text-lg font-bold text-[#1C1A15]">{ag.cliente}</h2>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${estiloBadge(ag.status)}`}
          >
            {STATUS_ROTULO[ag.status]}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#8A8171]">Horário</dt>
            <dd className="font-medium text-[#1C1A15]">
              {ag.horario} – {somaMinutos(ag.horario, duracao)} ({duracao} min)
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#8A8171]">Serviço</dt>
            <dd className="text-right font-medium text-[#1C1A15]">
              {ag.servico}
            </dd>
          </div>
          {ag.telefone && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#8A8171]">Telefone</dt>
              <dd className="font-medium text-[#1C1A15]">{ag.telefone}</dd>
            </div>
          )}
          {ag.observacao && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#8A8171]">Obs.</dt>
              <dd className="text-right font-medium text-[#1C1A15]">
                {ag.observacao}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {ag.status === 'pendente' && (
            <button
              type="button"
              onClick={() => {
                mudarStatus(ag.id, 'confirmado')
                onFechar()
              }}
              className="rounded-lg bg-[#8A6A14] px-3 py-2 text-xs font-semibold text-white hover:bg-[#6F550F]"
            >
              Confirmar
            </button>
          )}
          {ag.status !== 'concluido' && ag.status !== 'cancelado' && (
            <button
              type="button"
              onClick={() => {
                mudarStatus(ag.id, 'concluido')
                onFechar()
              }}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium hover:bg-[#F3ECDA]"
            >
              Concluir
            </button>
          )}
          {ag.status !== 'cancelado' && ag.status !== 'concluido' && (
            <button
              type="button"
              onClick={() => {
                mudarStatus(ag.id, 'cancelado')
                onFechar()
              }}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              remover(ag.id)
              onFechar()
            }}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Excluir
          </button>
        </div>

        <button
          type="button"
          onClick={onFechar}
          className="mt-4 w-full rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

export default function Agenda({ onNovo }: Props) {
  const { agendamentos, mudarStatus, remover } = useAgenda()
  const { profissionais } = useProfissionais()
  const { servicos } = useServicos()
  const [data, setData] = useState(hojeISO())
  const [selecionado, setSelecionado] = useState<Agendamento | null>(null)

  const doDia = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data === data)
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos, data],
  )

  const colunas = useMemo(() => {
    const nomes = profissionais.map((p) => p.nome)
    for (const ag of doDia) {
      if (!nomes.includes(ag.profissional)) nomes.push(ag.profissional)
    }
    return nomes
  }, [profissionais, doDia])

  const duracaoDo = useMemo(() => {
    return (servico: string) =>
      servicos.find((s) => s.nome === servico)?.duracaoMin ?? 30
  }, [servicos])

  const pendentes = doDia.filter((a) => a.status === 'pendente').length
  const confirmados = doDia.filter((a) => a.status === 'confirmado').length

  const linhaDe = (hora: string) => SLOTS.findIndex((s) => s.hora === hora) + 2

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
          onClick={() => onNovo()}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Agendar
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
        <span className="ml-auto text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
          Clique em um horário vazio para agendar
        </span>
      </div>

      {/* Grade de horários — barbeiros lado a lado */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
        <div
          className="grid min-w-[640px]"
          style={{
            gridTemplateColumns: `56px repeat(${colunas.length}, minmax(0, 1fr))`,
            gridTemplateRows: `auto repeat(${SLOTS.length}, minmax(52px, auto))`,
          }}
        >
          {/* Cabeçalho */}
          <div className="border-b border-r border-[#E5DCC3] bg-[#FAF6EB]" />
          {colunas.map((prof) => (
            <div
              key={prof}
              className="flex items-center gap-2 border-b border-r border-[#E5DCC3] bg-[#FAF6EB] px-3 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E9DDC0] text-[11px] font-bold text-[#8A6A14]">
                {prof.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#1C1A15]">
                  {prof}
                </p>
                <p className="text-[10px] text-[#8A8171]">Barbeiro(a)</p>
              </div>
            </div>
          ))}

          {/* Linhas de horário */}
          {SLOTS.map((slot, i) => (
            <div
              key={`hora-${slot.hora}`}
              className="flex items-start justify-end border-r border-b border-[#E5DCC3] bg-[#FAF6EB] pr-2 pt-1.5 text-[11px] font-semibold text-[#8A8171]"
              style={{ gridColumn: 1, gridRow: i + 2 }}
            >
              {slot.hora}
            </div>
          ))}

          {SLOTS.map((slot, i) =>
            colunas.map((prof, c) =>
              slot.intervalo ? null : (
                <div
                  key={`${slot.hora}-${prof}`}
                  className="cursor-pointer border-r border-b border-[#EFE7D3] transition-colors hover:bg-[#F7F1E2]"
                  style={{ gridColumn: c + 2, gridRow: i + 2 }}
                  onClick={() =>
                    onNovo({ data, horario: slot.hora, profissional: prof })
                  }
                  aria-label={`Agendar ${slot.hora} com ${prof}`}
                />
              ),
            ),
          )}

          {/* Faixa de almoço */}
          <div
            className="flex items-center justify-center border-b border-[#E5DCC3] bg-[#EDE5D2] text-xs font-medium text-[#A99E85]"
            style={{
              gridColumn: `2 / ${colunas.length + 2}`,
              gridRow: `${SLOTS.findIndex((s) => s.intervalo) + 2} / span 2`,
            }}
          >
            Almoço — 12:00 às 13:00
          </div>

          {/* Agendamentos posicionados na grade */}
          {doDia.map((ag) => {
            const linha = linhaDe(ag.horario)
            if (linha < 2) return null
            const coluna = colunas.indexOf(ag.profissional)
            if (coluna < 0) return null
            const duracao = duracaoDo(ag.servico)
            const spanMax = SLOTS.length + 2 - linha
            const span = Math.max(
              1,
              Math.min(Math.ceil(duracao / 30), spanMax),
            )
            return (
              <button
                key={ag.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelecionado(ag)
                }}
                className={`z-10 m-[2px] flex flex-col items-center justify-center overflow-hidden rounded-md border px-1.5 text-center transition-colors ${estiloStatus(ag.status)}`}
                style={{
                  gridColumn: coluna + 2,
                  gridRow: `${linha} / span ${span}`,
                }}
              >
                <span className="w-full truncate text-xs leading-tight font-bold">
                  {ag.cliente}
                </span>
                <span className="text-[10px] leading-tight opacity-90">
                  {ag.horario}–{somaMinutos(ag.horario, duracao)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selecionado && (
        <DetalheAgendamento
          ag={selecionado}
          duracaoDo={duracaoDo}
          mudarStatus={mudarStatus}
          remover={remover}
          onFechar={() => setSelecionado(null)}
        />
      )}
    </div>
  )
}
