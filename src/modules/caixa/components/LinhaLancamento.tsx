import { formatarBRL } from '@/lib/moeda'
import type { Lancamento } from '@/modules/caixa/types'
import { FORMAS_ROTULO } from '@/modules/caixa/types'

function formatarHora(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Uma linha da lista de receitas/despesas do dia. */
export function LinhaLancamento({
  l,
  podeEstornar,
  onEstornar,
}: {
  l: Lancamento
  podeEstornar: boolean
  onEstornar: (l: Lancamento) => void
}) {
  const despesa = l.tipo === 'despesa'
  return (
    <li
      className={`flex items-center justify-between gap-3 py-2.5 ${l.estornado ? 'opacity-50' : ''}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#121110]">
          {despesa ? '' : `${formatarHora(l.criadoEm)} · `}
          {l.descricao}
          {l.profissional && (
            <span className="text-[#7C7469]"> · {l.profissional}</span>
          )}
        </p>
        <p className="text-xs text-[#7C7469]">
          {FORMAS_ROTULO[l.formaPagamento]}
          {despesa && l.categoria && ` · ${l.categoria}`}
          {l.desconto > 0 && ` · desconto ${formatarBRL(l.desconto)}`}
          {l.estornado && ' · estornado'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-sm font-semibold ${
            despesa ? 'text-red-700' : 'text-[#8A6A14]'
          }`}
        >
          {despesa ? '−' : '+'} {formatarBRL(l.valorLiquido)}
        </span>
        {podeEstornar && !l.estornado && (
          <button
            type="button"
            onClick={() => onEstornar(l)}
            className="rounded-lg px-2 py-1 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
          >
            Estornar
          </button>
        )}
      </div>
    </li>
  )
}
