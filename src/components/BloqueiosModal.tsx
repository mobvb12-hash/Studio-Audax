import { useEffect, useState } from 'react'
import { hojeISO } from '@/modules/agenda/catalogo'
import { TIPOS_BLOQUEIO_ROTULO, rotuloBloqueio } from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import { useProfissionais } from '@/modules/profissionais/store'
import type { TipoBloqueio } from '@/modules/agenda/types'

type Props = {
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

const TIPOS = Object.keys(TIPOS_BLOQUEIO_ROTULO) as TipoBloqueio[]

export default function BloqueiosModal({ onFechar }: Props) {
  const { bloqueios, criarBloqueio, removerBloqueio } = useAgenda()
  const { profissionais } = useProfissionais()
  const [profissional, setProfissional] = useState(
    () => profissionais[0]?.nome ?? '',
  )
  const [data, setData] = useState(hojeISO())
  const [dataFim, setDataFim] = useState('')
  const [inicio, setInicio] = useState('08:00')
  const [fim, setFim] = useState('20:00')
  const [tipo, setTipo] = useState<TipoBloqueio>('folga')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function criar() {
    setErro('')
    try {
      criarBloqueio({
        profissional,
        data,
        dataFim,
        inicio,
        fim,
        tipo,
        motivo,
      })
      setMotivo('')
      setDataFim('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar.')
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
              Bloqueios da agenda
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Almoço, folga, férias ou ausência impedem novos agendamentos no
              período.
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

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={rotulo} htmlFor="blk-prof">
              Profissional *
            </label>
            <select
              id="blk-prof"
              className={campo}
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
            >
              {profissionais.length === 0 && (
                <option value="">Sem profissionais</option>
              )}
              {profissionais.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="blk-data">
              Data *
            </label>
            <input
              id="blk-data"
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="blk-data-fim">
              Até (opcional)
            </label>
            <input
              id="blk-data-fim"
              type="date"
              className={campo}
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="blk-inicio">
              Início *
            </label>
            <input
              id="blk-inicio"
              type="time"
              className={campo}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="blk-fim">
              Fim *
            </label>
            <input
              id="blk-fim"
              type="time"
              className={campo}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="blk-tipo">
              Motivo *
            </label>
            <select
              id="blk-tipo"
              className={campo}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoBloqueio)}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_BLOQUEIO_ROTULO[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="blk-motivo">
              Detalhe
            </label>
            <input
              id="blk-motivo"
              className={campo}
              placeholder={
                tipo === 'outro' ? 'Ex.: atendimento externo' : 'Opcional'
              }
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={criar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Criar bloqueio
          </button>
        </div>

        <div className="mt-5 border-t border-[#E5DCC3] pt-4">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Bloqueios cadastrados
          </p>
          {bloqueios.length === 0 ? (
            <p className="mt-2 text-sm text-[#4A4436]">
              Nenhum bloqueio cadastrado.
            </p>
          ) : (
            <ul className="mt-2 flex max-h-48 flex-col gap-2 overflow-y-auto">
              {bloqueios.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#E5DCC3] bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1C1A15]">
                      {rotuloBloqueio(b)}
                    </p>
                    <p className="truncate text-xs text-[#8A8171]">
                      {b.data}
                      {b.dataFim ? ` a ${b.dataFim}` : ''} · {b.inicio}–
                      {b.fim} · {b.profissional}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removerBloqueio(b.id)}
                    className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
