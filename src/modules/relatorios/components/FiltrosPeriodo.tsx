import { chipClasse } from '@/lib/apresentacao'
import type { Periodo } from '@/modules/comissoes/types'
import { ROTULO_TIPO, type TipoPeriodo } from '@/modules/relatorios/periodo'

type Props = {
  tipo: TipoPeriodo
  aoTipo: (tipo: TipoPeriodo) => void
  custom: Periodo
  aoCustom: (campo: 'inicio' | 'fim', valor: string) => void
  profFiltro: string
  aoProfFiltro: (valor: string) => void
  opcoesProf: string[]
}

/** Filtros de período e profissional — alimentam todos os relatórios. */
export default function FiltrosPeriodo({
  tipo,
  aoTipo,
  custom,
  aoCustom,
  profFiltro,
  aoProfFiltro,
  opcoesProf,
}: Props) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
      {(Object.keys(ROTULO_TIPO) as TipoPeriodo[]).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => aoTipo(id)}
          className={chipClasse(tipo === id)}
        >
          {ROTULO_TIPO[id]}
        </button>
      ))}
      {tipo === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Início do período"
            value={custom.inicio}
            onChange={(e) => aoCustom('inicio', e.target.value)}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
          />
          <span className="text-sm text-[#7C7469]">até</span>
          <input
            type="date"
            aria-label="Fim do período"
            value={custom.fim}
            onChange={(e) => aoCustom('fim', e.target.value)}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
          />
        </div>
      )}
      <select
        aria-label="Profissional"
        value={profFiltro}
        onChange={(e) => aoProfFiltro(e.target.value)}
        className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#121110] outline-none focus:border-[#8A6A14]"
      >
        <option value="todos">Todos os profissionais</option>
        {opcoesProf.map((nome) => (
          <option key={nome} value={nome}>
            {nome}
          </option>
        ))}
      </select>
    </div>
  )
}
