import { useEffect, useMemo, useState } from 'react'
import Avatar from '@/components/Avatar'
import BloqueiosModal from '@/components/BloqueiosModal'
import ExpedienteModal from '@/components/ExpedienteModal'
import PagamentoModal from '@/components/PagamentoModal'
import RemarcarAgendamentoModal from '@/components/RemarcarAgendamentoModal'
import {
  formatarDataCurta,
  formatarDataLonga,
  hojeISO,
  inicioSemana,
  somarDias,
} from '@/modules/agenda/catalogo'
import {
  bloqueioCobre,
  paraMinutos,
  rotuloBloqueio,
  slotsDoExpediente,
} from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento, StatusAgendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'

export type SlotAgendamento = {
  data: string
  horario: string
  profissional: string
}

type Coluna = { nome: string; foto: string }

type Props = {
  onNovo: (slot?: SlotAgendamento) => void
}

const STATUS_ROTULO: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

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
  if (status === 'nao_compareceu')
    return 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
  return 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
}

function estiloBadge(status: StatusAgendamento): string {
  if (status === 'confirmado') return 'border-[#4F9417] bg-[#5FA83E] text-white'
  if (status === 'pendente') return 'border-amber-300 bg-amber-100 text-amber-900'
  if (status === 'concluido') return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'nao_compareceu')
    return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-red-200 bg-red-50 text-red-600'
}

function rotuloDia(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const texto = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'short',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

function DetalheAgendamento({
  ag,
  duracaoDo,
  mudarStatus,
  remover,
  pago,
  onPagar,
  onRemarcar,
  onFechar,
}: {
  ag: Agendamento
  duracaoDo: (servico: string) => number
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
  pago: boolean
  onPagar: () => void
  onRemarcar: () => void
  onFechar: () => void
}) {
  const duracao = duracaoDo(ag.servico)
  const bloqueado = ag.status === 'cancelado' || ag.status === 'nao_compareceu'
  const emAberto = ag.status === 'pendente' || ag.status === 'confirmado'
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const remarcacoes = ag.remarcacoes ?? []
  const ultimaRemarcacao = remarcacoes[remarcacoes.length - 1]

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

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
          {ultimaRemarcacao && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#8A8171]">Remarcado</dt>
              <dd className="text-right font-medium text-[#1C1A15]">
                {remarcacoes.length}× — antes{' '}
                {formatarDataCurta(ultimaRemarcacao.de.data)} às{' '}
                {ultimaRemarcacao.de.horario} ({ultimaRemarcacao.de.profissional}
                )
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-[#8A8171]">Recebimento</dt>
            <dd
              className={`font-semibold ${pago ? 'text-[#3F6B33]' : 'text-[#8A6A14]'}`}
            >
              {pago ? 'Pago' : 'Em aberto'}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {pago ? (
            <span className="rounded-lg border border-[#BFE0B2] bg-[#E9F5E4] px-3 py-2 text-xs font-semibold text-[#3F6B33]">
              Pagamento registrado — opções liberadas apenas no Caixa
            </span>
          ) : (
            <>
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
              {!bloqueado && (
                <button
                  type="button"
                  onClick={onPagar}
                  className="rounded-lg bg-[#5FA83E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#549531]"
                >
                  {ag.status === 'concluido'
                    ? 'Registrar pagamento'
                    : 'Concluir e receber'}
                </button>
              )}
              {emAberto && (
                <button
                  type="button"
                  onClick={onRemarcar}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
                >
                  Remarcar
                </button>
              )}
              {emAberto && (
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
              {emAberto && (
                <button
                  type="button"
                  onClick={() => {
                    mudarStatus(ag.id, 'nao_compareceu')
                    onFechar()
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Não compareceu
                </button>
              )}
              {emAberto && (
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
              {!pago && !confirmandoExclusao && (
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(true)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Excluir
                </button>
              )}
              {!pago && confirmandoExclusao && (
                <>
                  <span className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Excluir este agendamento? Esta ação não pode ser desfeita.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      remover(ag.id)
                      onFechar()
                    }}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Sim, excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(false)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Voltar
                  </button>
                </>
              )}
            </>
          )}
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
  const { agendamentos, mudarStatus, remover, expediente, bloqueios } =
    useAgenda()
  const { jaPago } = useCaixa()
  const { profissionais } = useProfissionais()
  const { servicos } = useServicos()
  const [data, setData] = useState(hojeISO())
  const [visual, setVisual] = useState<'dia' | 'semana'>('dia')
  const [selecionado, setSelecionado] = useState<Agendamento | null>(null)
  const [pagando, setPagando] = useState<Agendamento | null>(null)
  const [remarcando, setRemarcando] = useState<Agendamento | null>(null)
  const [expedienteAberto, setExpedienteAberto] = useState(false)
  const [bloqueiosAberto, setBloqueiosAberto] = useState(false)

  const slots = useMemo(() => slotsDoExpediente(expediente), [expediente])

  const doDia = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data === data)
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos, data],
  )

  const inicioSemanaISO = useMemo(() => inicioSemana(data), [data])
  const diasSemana = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => somarDias(inicioSemanaISO, i)),
    [inicioSemanaISO],
  )
  const doSemana = useMemo(
    () =>
      agendamentos
        .filter((ag) => ag.data >= diasSemana[0] && ag.data <= diasSemana[6])
        .sort((a, b) =>
          `${a.data} ${a.horario}`.localeCompare(`${b.data} ${b.horario}`),
        ),
    [agendamentos, diasSemana],
  )

  const colunas = useMemo<Coluna[]>(() => {
    const lista: Coluna[] = profissionais.map((p) => ({
      nome: p.nome,
      foto: p.foto ?? '',
    }))
    for (const ag of doDia) {
      if (!lista.some((c) => c.nome === ag.profissional))
        lista.push({ nome: ag.profissional, foto: '' })
    }
    return lista
  }, [profissionais, doDia])

  const duracaoDo = useMemo(() => {
    return (servico: string) =>
      servicos.find((s) => s.nome === servico)?.duracaoMin ?? 30
  }, [servicos])

  const pendentes = doDia.filter((a) => a.status === 'pendente').length
  const confirmados = doDia.filter((a) => a.status === 'confirmado').length

  const linhaDe = (hora: string) => slots.findIndex((s) => s.hora === hora) + 2

  const celulaBloqueada = (profissional: string, hora: string) =>
    bloqueioCobre(bloqueios, {
      data,
      horario: hora,
      duracaoMin: 30,
      profissional,
    }) !== null

  const linhaAlmoco = slots.findIndex((s) => s.intervalo)
  const spanAlmoco = slots.filter((s) => s.intervalo).length
  const temAlmoco = linhaAlmoco >= 0

  const passo = visual === 'semana' ? 7 : 1
  // Clique rápido na semana agenda com o primeiro profissional ativo
  const profissionalPadrao =
    (profissionais.find((p) => p.ativo) ?? profissionais[0])?.nome ?? ''
  // Profissional inativo mantém coluna e histórico, apenas sinalizado
  const profissionalInativo = (nome: string) =>
    profissionais.some((p) => p.nome === nome && !p.ativo)

  const botaoNav =
    'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F3ECDA]'
  const chipToggle =
    'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors'
  const botaoToolbar =
    'rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]'

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Agenda
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {visual === 'dia'
              ? `${formatarDataLonga(data)} · ${doDia.length} atendimento(s) · ${pendentes} pendente(s) · ${confirmados} confirmado(s)`
              : `Semana de ${formatarDataCurta(diasSemana[0])} a ${formatarDataCurta(diasSemana[6])} · ${doSemana.length} atendimento(s)`}
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
          onClick={() => setData((d) => somarDias(d, -passo))}
          className={botaoNav}
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
          onClick={() => setData((d) => somarDias(d, passo))}
          className={botaoNav}
          aria-label="Próximo dia"
        >
          ›
        </button>
        <input
          type="date"
          aria-label="Data da agenda"
          value={data}
          onChange={(e) => e.target.value && setData(e.target.value)}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#E5DCC3] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setVisual('dia')}
              className={`${chipToggle} ${
                visual === 'dia'
                  ? 'bg-[#8A6A14] text-white'
                  : 'text-[#4A4436] hover:bg-[#F3ECDA]'
              }`}
            >
              Dia
            </button>
            <button
              type="button"
              onClick={() => setVisual('semana')}
              className={`${chipToggle} ${
                visual === 'semana'
                  ? 'bg-[#8A6A14] text-white'
                  : 'text-[#4A4436] hover:bg-[#F3ECDA]'
              }`}
            >
              Semana
            </button>
          </div>
          <button
            type="button"
            onClick={() => setExpedienteAberto(true)}
            className={botaoToolbar}
          >
            Expediente
          </button>
          <button
            type="button"
            onClick={() => setBloqueiosAberto(true)}
            className={botaoToolbar}
          >
            Bloqueios
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
        Clique em um horário vazio para agendar
      </p>

      {visual === 'dia' && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
          <div
            className="grid min-w-[640px]"
            style={{
              gridTemplateColumns: `56px repeat(${colunas.length}, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${slots.length}, minmax(52px, auto))`,
            }}
          >
            {/* Cabeçalho */}
            <div className="border-b border-r border-[#E5DCC3] bg-[#FAF6EB]" />
            {colunas.map((col) => (
              <div
                key={col.nome}
                className="flex items-center gap-2 border-b border-r border-[#E5DCC3] bg-[#FAF6EB] px-3 py-2"
              >
                <Avatar nome={col.nome} foto={col.foto} tamanho="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#1C1A15]">
                    {col.nome}
                  </p>
                  <p className="text-[10px] text-[#8A8171]">
                    Barbeiro(a)
                    {profissionalInativo(col.nome) ? ' · inativo' : ''}
                  </p>
                </div>
              </div>
            ))}

            {/* Linhas de horário */}
            {slots.map((slot, i) => (
              <div
                key={`hora-${slot.hora}`}
                className="flex items-start justify-end border-r border-b border-[#E5DCC3] bg-[#FAF6EB] pr-2 pt-1.5 text-[11px] font-semibold text-[#8A8171]"
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                {slot.hora}
              </div>
            ))}

            {/* Células clicáveis */}
            {slots.map((slot, i) =>
              colunas.map((col, c) => {
                if (slot.intervalo) return null
                const bloqueada = celulaBloqueada(col.nome, slot.hora)
                if (bloqueada)
                  return (
                    <div
                      key={`${slot.hora}-${col.nome}`}
                      className="cursor-default border-r border-b border-[#EFE7D3] bg-[#F5EFE0]"
                      style={{ gridColumn: c + 2, gridRow: i + 2 }}
                      aria-disabled="true"
                      aria-label={`Bloqueado ${slot.hora} com ${col.nome}`}
                    />
                  )
                return (
                  <div
                    key={`${slot.hora}-${col.nome}`}
                    className="cursor-pointer border-r border-b border-[#EFE7D3] transition-colors hover:bg-[#F7F1E2]"
                    style={{ gridColumn: c + 2, gridRow: i + 2 }}
                    onClick={() =>
                      onNovo({
                        data,
                        horario: slot.hora,
                        profissional: col.nome,
                      })
                    }
                    aria-label={`Agendar ${slot.hora} com ${col.nome}`}
                  />
                )
              }),
            )}

            {/* Faixa de almoço (expediente) */}
            {temAlmoco && (
              <div
                className="flex items-center justify-center border-b border-[#E5DCC3] bg-[#EDE5D2] text-xs font-medium text-[#A99E85]"
                style={{
                  gridColumn: `2 / ${colunas.length + 2}`,
                  gridRow: `${linhaAlmoco + 2} / span ${spanAlmoco}`,
                }}
              >
                Almoço — {expediente.almocoInicio} às {expediente.almocoFim}
              </div>
            )}

            {/* Bloqueios do dia (por profissional) */}
            {colunas.flatMap((col, c) =>
              bloqueios
                .filter(
                  (b) =>
                    b.profissional === col.nome &&
                    data >= b.data &&
                    data <= (b.dataFim ?? b.data),
                )
                .map((b) => {
                  const ini = paraMinutos(b.inicio)
                  const fim = paraMinutos(b.fim)
                  let linha = -1
                  let span = 0
                  slots.forEach((slot, i) => {
                    const s = paraMinutos(slot.hora)
                    if (s < fim && s + 30 > ini) {
                      if (linha < 0) linha = i
                      span += 1
                    }
                  })
                  if (linha < 0 || span === 0) return null
                  return (
                    <div
                      key={`${b.id}-${col.nome}`}
                      className="z-10 m-[2px] flex flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-[#C9BFA4] bg-[#EDE5D2] px-1 text-center"
                      style={{
                        gridColumn: c + 2,
                        gridRow: `${linha + 2} / span ${span}`,
                      }}
                    >
                      <span className="w-full truncate text-[11px] leading-tight font-semibold text-[#8A8171]">
                        {rotuloBloqueio(b)}
                      </span>
                      <span className="text-[10px] leading-tight text-[#A99E85]">
                        {b.inicio}–{b.fim}
                      </span>
                    </div>
                  )
                }),
            )}

            {/* Agendamentos posicionados na grade */}
            {doDia.map((ag) => {
              const linha = linhaDe(ag.horario)
              if (linha < 2) return null
              const coluna = colunas.findIndex((c) => c.nome === ag.profissional)
              if (coluna < 0) return null
              const duracao = duracaoDo(ag.servico)
              const spanMax = slots.length + 2 - linha
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
      )}

      {visual === 'semana' && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
          <div
            className="grid min-w-[840px]"
            style={{
              gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${slots.length}, minmax(56px, auto))`,
            }}
          >
            {/* Cabeçalho */}
            <div className="border-b border-r border-[#E5DCC3] bg-[#FAF6EB]" />
            {diasSemana.map((dia) => (
              <div
                key={dia}
                className={`border-b border-r border-[#E5DCC3] px-2 py-2 text-center ${
                  dia === hojeISO() ? 'bg-[#F7F1E2]' : 'bg-[#FAF6EB]'
                }`}
              >
                <p className="text-[11px] font-bold text-[#1C1A15]">
                  {rotuloDia(dia)} · {formatarDataCurta(dia)}
                </p>
                {dia === hojeISO() && (
                  <p className="text-[10px] font-semibold text-[#8A6A14]">
                    Hoje
                  </p>
                )}
              </div>
            ))}

            {/* Linhas de horário */}
            {slots.map((slot, i) => (
              <div
                key={`w-hora-${slot.hora}`}
                className="flex items-start justify-end border-r border-b border-[#E5DCC3] bg-[#FAF6EB] pr-2 pt-1.5 text-[11px] font-semibold text-[#8A8171]"
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                {slot.hora}
              </div>
            ))}

            {/* Células da semana */}
            {slots.map((slot, i) =>
              diasSemana.map((dia, d) => {
                if (slot.intervalo) return null
                const ags = agendamentos.filter(
                  (ag) => ag.data === dia && ag.horario === slot.hora,
                )
                const cobertos = bloqueios.filter(
                  (b) =>
                    dia >= b.data &&
                    dia <= (b.dataFim ?? b.data) &&
                    paraMinutos(slot.hora) < paraMinutos(b.fim) &&
                    paraMinutos(slot.hora) + 30 > paraMinutos(b.inicio),
                )
                const iniciando = cobertos.filter(
                  (b) =>
                    paraMinutos(b.inicio) >= paraMinutos(slot.hora) &&
                    paraMinutos(b.inicio) <
                      paraMinutos(slot.hora) + 30,
                )
                return (
                  <div
                    key={`${dia}-${slot.hora}`}
                    className={`flex flex-col gap-0.5 overflow-hidden border-r border-b border-[#EFE7D3] p-0.5 transition-colors ${
                      cobertos.length > 0
                        ? 'cursor-default bg-[#F5EFE0]'
                        : 'cursor-pointer hover:bg-[#F7F1E2]'
                    }`}
                    style={{ gridColumn: d + 2, gridRow: i + 2 }}
                    onClick={() => {
                      if (cobertos.length > 0 || slot.intervalo) return
                      onNovo({
                        data: dia,
                        horario: slot.hora,
                        profissional: profissionalPadrao,
                      })
                    }}
                    aria-label={
                      cobertos.length > 0
                        ? `Bloqueado ${slot.hora} em ${formatarDataCurta(dia)}`
                        : `Agendar ${slot.hora} em ${formatarDataCurta(dia)}`
                    }
                  >
                    {iniciando.map((b) => (
                      <span
                        key={b.id}
                        className="truncate rounded border border-dashed border-[#C9BFA4] bg-[#EDE5D2] px-1 text-[9px] leading-tight font-medium text-[#8A8171]"
                      >
                        {rotuloBloqueio(b)} · {b.inicio}–{b.fim}
                      </span>
                    ))}
                    {ags.map((ag) => (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelecionado(ag)
                        }}
                        className={`flex w-full flex-col items-start overflow-hidden rounded border px-1 py-0.5 text-left transition-colors ${estiloStatus(ag.status)}`}
                      >
                        <span className="w-full truncate text-[10px] leading-tight font-bold">
                          {ag.cliente}
                        </span>
                        <span className="w-full truncate text-[9px] leading-tight opacity-90">
                          {ag.horario} · {ag.profissional}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              }),
            )}

            {/* Faixa de almoço (expediente) */}
            {temAlmoco && (
              <div
                className="flex items-center justify-center border-b border-[#E5DCC3] bg-[#EDE5D2] text-xs font-medium text-[#A99E85]"
                style={{
                  gridColumn: '2 / 9',
                  gridRow: `${linhaAlmoco + 2} / span ${spanAlmoco}`,
                }}
              >
                Almoço — {expediente.almocoInicio} às {expediente.almocoFim}
              </div>
            )}
          </div>
        </div>
      )}

      {selecionado && (
        <DetalheAgendamento
          ag={selecionado}
          duracaoDo={duracaoDo}
          mudarStatus={mudarStatus}
          remover={remover}
          pago={Boolean(jaPago(selecionado.id))}
          onPagar={() => {
            setPagando(selecionado)
            setSelecionado(null)
          }}
          onRemarcar={() => {
            setRemarcando(selecionado)
            setSelecionado(null)
          }}
          onFechar={() => setSelecionado(null)}
        />
      )}

      {pagando && (
        <PagamentoModal
          agendamento={pagando}
          onFechar={() => setPagando(null)}
        />
      )}

      {remarcando && (
        <RemarcarAgendamentoModal
          agendamento={remarcando}
          onFechar={() => setRemarcando(null)}
        />
      )}

      {expedienteAberto && (
        <ExpedienteModal onFechar={() => setExpedienteAberto(false)} />
      )}

      {bloqueiosAberto && (
        <BloqueiosModal onFechar={() => setBloqueiosAberto(false)} />
      )}
    </div>
  )
}
