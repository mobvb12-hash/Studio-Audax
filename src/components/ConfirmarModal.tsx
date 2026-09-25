import { useEffect, useState } from 'react'

type Props = {
  titulo: string
  texto: string
  rotuloConfirmar: string
  perigo?: boolean
  /** Mostra um campo de motivo obrigatório (ex.: reabertura de caixa) */
  motivoObrigatorio?: boolean
  rotuloMotivo?: string
  placeholderMotivo?: string
  onConfirmar: (motivo?: string) => void
  onFechar: () => void
}

export default function ConfirmarModal({
  titulo,
  texto,
  rotuloConfirmar,
  perigo = false,
  motivoObrigatorio = false,
  rotuloMotivo = 'Motivo',
  placeholderMotivo = 'Descreva o motivo...',
  onConfirmar,
  onFechar,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function confirmar() {
    if (motivoObrigatorio && motivo.trim().length < 3) {
      setErro('Informe o motivo (mínimo 3 letras).')
      return
    }
    try {
      onConfirmar(motivoObrigatorio ? motivo.trim() : undefined)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[#1C1A15]">{titulo}</h2>
        <p className="mt-2 text-sm text-[#4A4436]">{texto}</p>

        {motivoObrigatorio && (
          <div className="mt-4">
            <label
              className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase"
              htmlFor="conf-motivo"
            >
              {rotuloMotivo} *
            </label>
            <textarea
              id="conf-motivo"
              className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]"
              rows={3}
              placeholder={placeholderMotivo}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        )}

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
            Voltar
          </button>
          <button
            type="button"
            onClick={confirmar}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              perigo
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#8A6A14] hover:bg-[#6F550F]'
            }`}
          >
            {rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
