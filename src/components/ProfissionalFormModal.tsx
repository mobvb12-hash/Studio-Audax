import { useEffect, useState } from 'react'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Profissional } from '@/modules/profissionais/types'

type Props = {
  profissional?: Profissional | null
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function ProfissionalFormModal({
  profissional,
  onFechar,
}: Props) {
  const { adicionar, atualizar } = useProfissionais()
  const [nome, setNome] = useState(() => profissional?.nome ?? '')
  const [erro, setErro] = useState('')

  const editando = Boolean(profissional)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    if (nome.trim().length < 2) {
      setErro('Informe o nome do profissional.')
      return
    }
    const dados = { nome }
    if (profissional) atualizar(profissional.id, dados)
    else adicionar(dados)
    onFechar()
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
            <h2 className="text-lg font-bold text-[#1C1A15]">
              {editando ? 'Editar profissional' : 'Novo profissional'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Vira uma coluna na grade da Agenda.
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

        <div className="mt-4">
          <label className={rotulo} htmlFor="prof-nome">
            Nome *
          </label>
          <input
            id="prof-nome"
            className={campo}
            placeholder="Ex.: Audax"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

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
            onClick={salvar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            {editando ? 'Salvar alterações' : 'Cadastrar profissional'}
          </button>
        </div>
      </div>
    </div>
  )
}
