import { useMemo } from 'react'
import { CAMPO_SELECT, ROTULO_FORM } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import { hojeISO } from '@/modules/agenda/catalogo'
import type { MovimentacaoEstoque } from '@/modules/estoque/types'
import {
  ROTULO_TIPO_MOVIMENTACAO,
  type TipoMovimentacao,
} from '@/modules/estoque/types'
import type { Produto } from '@/modules/produtos/types'

export type FiltroPeriodo = 'tudo' | 'hoje' | 'semana' | 'mes'

type Props = {
  movimentacoes: MovimentacaoEstoque[]
  produtos: Produto[]
  periodo: FiltroPeriodo
  produtoId: string
  tipo: TipoMovimentacao | ''
  aoMudarPeriodo: (periodo: FiltroPeriodo) => void
  aoMudarProduto: (produtoId: string) => void
  aoMudarTipo: (tipo: TipoMovimentacao | '') => void
  aoEntrada: () => void
  aoAjuste: () => void
}

const ORIGEM_ROTULO: Record<string, string> = {
  cadastro: 'Cadastro',
  pdv: 'PDV',
  estorno: 'Estorno',
  manual: 'Manual',
}

function inicioDoPeriodo(periodo: FiltroPeriodo): string {
  if (periodo === 'tudo') return ''
  if (periodo === 'hoje') return hojeISO()
  const d = new Date()
  if (periodo === 'semana') {
    d.setDate(d.getDate() - 6)
  } else {
    d.setDate(1)
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function MovimentacoesEstoque({
  movimentacoes,
  produtos,
  periodo,
  produtoId,
  tipo,
  aoMudarPeriodo,
  aoMudarProduto,
  aoMudarTipo,
  aoEntrada,
  aoAjuste,
}: Props) {
  const movimentacoesFiltradas = useMemo(() => {
    const inicio = inicioDoPeriodo(periodo)
    return movimentacoes
      .filter((m) => {
        if (inicio && m.data < inicio) return false
        if (produtoId && m.produtoId !== produtoId) return false
        if (tipo && m.tipo !== tipo) return false
        return true
      })
      .sort((a, b) =>
        `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`),
      )
  }, [movimentacoes, periodo, produtoId, tipo])

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <div>
          <label className={ROTULO_FORM} htmlFor="mv-periodo">
            Período
          </label>
          <select
            id="mv-periodo"
            className={CAMPO_SELECT}
            value={periodo}
            onChange={(e) => aoMudarPeriodo(e.target.value as FiltroPeriodo)}
          >
            <option value="tudo">Tudo</option>
            <option value="hoje">Hoje</option>
            <option value="semana">Últimos 7 dias</option>
            <option value="mes">Mês atual</option>
          </select>
        </div>
        <div>
          <label className={ROTULO_FORM} htmlFor="mv-produto">
            Produto
          </label>
          <select
            id="mv-produto"
            className={CAMPO_SELECT}
            value={produtoId}
            onChange={(e) => aoMudarProduto(e.target.value)}
          >
            <option value="">Todos</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ROTULO_FORM} htmlFor="mv-tipo">
            Tipo
          </label>
          <select
            id="mv-tipo"
            className={CAMPO_SELECT}
            value={tipo}
            onChange={(e) => aoMudarTipo(e.target.value as TipoMovimentacao | '')}
          >
            <option value="">Todos</option>
            {(Object.keys(ROTULO_TIPO_MOVIMENTACAO) as TipoMovimentacao[]).map(
              (t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_MOVIMENTACAO[t]}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={aoEntrada}
            className="rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
          >
            + Nova entrada
          </button>
          <button
            type="button"
            onClick={aoAjuste}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
          >
            + Ajuste
          </button>
        </div>
      </div>

      {movimentacoesFiltradas.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Nenhuma movimentação no filtro selecionado.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#7C7469] uppercase">
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Produto</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                <th className="px-3 py-2 text-right font-semibold">Antes</th>
                <th className="px-3 py-2 text-right font-semibold">Depois</th>
                <th className="px-3 py-2 text-right font-semibold">Custo un.</th>
                <th className="px-3 py-2 font-semibold">Origem</th>
                <th className="px-3 py-2 font-semibold">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE7D3]">
              {movimentacoesFiltradas.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 text-[#3A352C]">
                    {m.data} · {m.hora}
                  </td>
                  <td className="px-3 py-2 font-medium text-[#121110]">
                    {m.produto}
                  </td>
                  <td className="px-3 py-2 text-[#3A352C]">
                    {ROTULO_TIPO_MOVIMENTACAO[m.tipo]}
                    {m.motivo && ` · ${m.motivo}`}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      m.quantidade < 0 ? 'text-red-700' : 'text-[#3F6B33]'
                    }`}
                  >
                    {m.quantidade > 0 ? '+' : ''}
                    {m.quantidade}
                  </td>
                  <td className="px-3 py-2 text-right text-[#3A352C]">
                    {m.estoqueAntes}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-[#121110]">
                    {m.estoqueDepois}
                  </td>
                  <td className="px-3 py-2 text-right text-[#3A352C]">
                    {formatarBRL(m.custoUnitario)}
                  </td>
                  <td className="px-3 py-2 text-[#3A352C]">
                    {ORIGEM_ROTULO[m.origem] ?? m.origem}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-[#7C7469]">
                    {[m.fornecedor, m.observacao].filter(Boolean).join(' · ') ||
                      '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
