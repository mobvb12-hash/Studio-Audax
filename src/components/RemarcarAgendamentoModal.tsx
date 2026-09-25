import { useEffect, useMemo, useState } from 'react'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { slotsDoExpediente } from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Agendamento } from '@/modules/agenda/types'

type Props = {
  agendamento: Agendamento
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function RemarcarAgendamentoModal({
  agendamento,
  onFechar,
}: Props) {
  const { expediente, remarcar } = useAgenda()
  const { profissionais } = useProfissionais()
  const [data, setData] = useState(agendamento.data)
  const [horario, setHorario] = useState(agendamento.horario)
  const [profissional, setProfissional] = useState(agendamento.profissional)
  const [erro, setErro] = useState('')

  const horarios = useMemo(() => {
    const slots = slotsDoExpediente(expediente).filter((s) => !s.intervalo)
    if (!slots.some((s) => s.hora === agendamento.horario)) {
      return [{ hora: agendamento.horario, intervalo: false }, ...slots]
    }
    return slots
  }, [expediente, agendamento.horario])

  const opcoesProfissional = useMemo(() => {
    // Só profissionais ativos recebem a remarcação — o atual do
    // agendamento é mantido na lista mesmo se inativou depois (histórico)
    const nomes = profissionais.filter((p) => p.ativo).map((p) => p.nome)
    if (!nomes.includes(agendamento.profissional)) {
      return [agendamento.profissional, ...nomes]
    }
    return nomes
  }, [profissionais, agendamento.profissional])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function confirmar() {
    if (!data) {
      setErro('Escolha a data.')
      return
    }
    try {
      remarcar(agendamento.id, { data, horario, profissional })
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remarcar.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">
              Remarcar agendamento
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              {agendamento.cliente} · atual:{' '}
              {formatarDataLonga(agendamento.data)} às {agendamento.horario} com{' '}
              {agendamento.profissional}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="rm-data">
              Nova data *
            </label>
            <input
              id="rm-data"
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="rm-prof">
              Profissional *
            </label>
            <select
              id="rm-prof"
              className={campo}
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
            >
              {opcoesProfissional.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="rm-hora">
              Novo horário *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {horarios.map((h) => (
                <button
                  key={h.hora}
                  type="button"
                  onClick={() => setHorario(h.hora)}
                  className={`rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${
                    horario === h.hora
                      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
                      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
                  }`}
                >
                  {h.hora}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-3 text-[12px] text-[#8A8171]">
          O histórico de remarcações é preservado no agendamento.
        </p>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Confirmar remarcação
          </button>
        </div>
      </div>
    </div>
  )
}
