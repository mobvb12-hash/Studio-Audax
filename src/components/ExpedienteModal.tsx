import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { useEffect, useState } from 'react'
import { useAgenda } from '@/modules/agenda/store'

type Props = {
  onFechar: () => void
}

export default function ExpedienteModal({ onFechar }: Props) {
  const { expediente, salvarExpediente } = useAgenda()
  const [inicio, setInicio] = useState(expediente.inicio)
  const [fim, setFim] = useState(expediente.fim)
  const [almocoInicio, setAlmocoInicio] = useState(expediente.almocoInicio)
  const [almocoFim, setAlmocoFim] = useState(expediente.almocoFim)
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    try {
      salvarExpediente({ inicio, fim, almocoInicio, almocoFim })
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#121110]">
              Expediente de trabalho
            </h2>
            <p className="mt-1 text-[13px] text-[#7C7469]">
              A agenda mostra apenas os horários dentro do expediente e o
              almoço fica bloqueado.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#7C7469] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="exp-inicio">
              Início do expediente *
            </label>
            <input
              id="exp-inicio"
              type="time"
              className={campo}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="exp-fim">
              Fim do expediente *
            </label>
            <input
              id="exp-fim"
              type="time"
              className={campo}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="exp-almoco-inicio">
              Início do almoço *
            </label>
            <input
              id="exp-almoco-inicio"
              type="time"
              className={campo}
              value={almocoInicio}
              onChange={(e) => setAlmocoInicio(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="exp-almoco-fim">
              Fim do almoço *
            </label>
            <input
              id="exp-almoco-fim"
              type="time"
              className={campo}
              value={almocoFim}
              onChange={(e) => setAlmocoFim(e.target.value)}
            />
          </div>
        </div>

        <p className="mt-3 text-[12px] text-[#7C7469]">
          Para trabalhar sem intervalo, use o mesmo horário no início e no fim
          do almoço.
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
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className="rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
          >
            Salvar expediente
          </button>
        </div>
      </div>
    </div>
  )
}
