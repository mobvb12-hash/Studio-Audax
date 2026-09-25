import { useMemo, useState } from 'react'
import Avatar from '@/components/Avatar'
import ConfirmarModal from '@/components/ConfirmarModal'
import ProfissionalFormModal from '@/components/ProfissionalFormModal'
import { useAgenda } from '@/modules/agenda/store'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Profissional } from '@/modules/profissionais/types'

export default function Profissionais() {
  const { profissionais, remover } = useProfissionais()
  const { agendamentos } = useAgenda()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Profissional | null>(null)
  const [excluindo, setExcluindo] = useState<Profissional | null>(null)

  const contagem = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const ag of agendamentos) {
      if (ag.status === 'cancelado' || ag.status === 'nao_compareceu') continue
      mapa.set(ag.profissional, (mapa.get(ag.profissional) ?? 0) + 1)
    }
    return mapa
  }, [agendamentos])

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Profissionais
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {profissionais.length} profissional(is) · cada um vira uma coluna
            na Agenda
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditando(null)
            setModalAberto(true)
          }}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo profissional
        </button>
      </div>

      {profissionais.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Nenhum profissional cadastrado. A Agenda precisa de pelo menos um.
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {profissionais.map((prof) => (
            <li
              key={prof.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <Avatar nome={prof.nome} foto={prof.foto} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1C1A15]">
                  {prof.nome}
                </p>
                <p className="mt-0.5 text-[13px] text-[#4A4436]">
                  {prof.telefone || 'Sem telefone'}
                  {prof.email ? ` · ${prof.email}` : ''}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-[#E5DCC3] bg-white px-3 py-1 text-xs font-medium text-[#4A4436]">
                {contagem.get(prof.nome) ?? 0} atendimento(s)
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(prof)
                    setModalAberto(true)
                  }}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => setExcluindo(prof)}
                  className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                  aria-label={`Excluir ${prof.nome}`}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <ProfissionalFormModal
          profissional={editando}
          onFechar={() => setModalAberto(false)}
        />
      )}

      {excluindo && (
        <ConfirmarModal
          titulo="Excluir profissional"
          texto={`Excluir “${excluindo.nome}”? Os agendamentos e recebimentos já feitos são preservados no histórico.`}
          rotuloConfirmar="Sim, excluir"
          perigo
          onConfirmar={() => {
            remover(excluindo.id)
            setExcluindo(null)
          }}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}
