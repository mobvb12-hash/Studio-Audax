import { useMemo } from 'react'
import { CAMPO_SELECT, ROTULO_FORM } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import { ROTULO_STATUS, statusEstoque } from '@/modules/estoque/indicadores'
import type { Produto } from '@/modules/produtos/types'

export type FiltroStatus = 'todos' | 'baixo' | 'zerado' | 'inativos'

type Props = {
  produtos: Produto[]
  filtroStatus: FiltroStatus
  aoMudarFiltro: (filtro: FiltroStatus) => void
  aoNovo: () => void
  aoEditar: (produto: Produto) => void
  aoEntrada: (produtoId: string) => void
  aoAlternar: (produtoId: string) => void
}

function badgeStatus(produto: Produto): string {
  const status = statusEstoque(produto)
  if (status === 'zerado') return 'border-red-200 bg-red-50 text-red-600'
  if (status === 'baixo') return 'border-amber-300 bg-amber-100 text-amber-900'
  return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
}

export default function ListaProdutos({
  produtos,
  filtroStatus,
  aoMudarFiltro,
  aoNovo,
  aoEditar,
  aoEntrada,
  aoAlternar,
}: Props) {
  const visiveis = useMemo(() => {
    const ordenados = [...produtos].sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    if (filtroStatus === 'baixo')
      return ordenados.filter((p) => p.ativo && statusEstoque(p) !== 'normal')
    if (filtroStatus === 'zerado')
      return ordenados.filter((p) => statusEstoque(p) === 'zerado')
    if (filtroStatus === 'inativos') return ordenados.filter((p) => !p.ativo)
    return ordenados
  }, [produtos, filtroStatus])

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className={ROTULO_FORM} htmlFor="flt-status">
            Filtro
          </label>
          <select
            id="flt-status"
            className={CAMPO_SELECT}
            value={filtroStatus}
            onChange={(e) => aoMudarFiltro(e.target.value as FiltroStatus)}
          >
            <option value="todos">Todos</option>
            <option value="baixo">Estoque baixo</option>
            <option value="zerado">Estoque zerado</option>
            <option value="inativos">Inativos</option>
          </select>
        </div>
        <button
          type="button"
          onClick={aoNovo}
          className="rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
        >
          + Novo produto
        </button>
      </div>

      {visiveis.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          {filtroStatus === 'todos'
            ? 'Nenhum produto cadastrado. Clique em “+ Novo produto” para começar.'
            : 'Nenhum produto neste filtro.'}
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {visiveis.map((produto) => (
            <li
              key={produto.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-[#121110]">
                  <span className="truncate">{produto.nome}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeStatus(produto)}`}
                  >
                    {ROTULO_STATUS[statusEstoque(produto)]}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      produto.ativo
                        ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                        : 'border-slate-300 bg-slate-100 text-slate-600'
                    }`}
                  >
                    {produto.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </p>
                <p className="mt-0.5 text-[13px] text-[#3A352C]">
                  Venda: {formatarBRL(produto.preco)} · Custo:{' '}
                  {formatarBRL(produto.custo)} · Estoque: {produto.estoque} un
                  (mín. {produto.estoqueMinimo})
                  {produto.categoria && ` · ${produto.categoria}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => aoEditar(produto)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => aoEntrada(produto.id)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Entrada
                </button>
                <button
                  type="button"
                  onClick={() => aoAlternar(produto.id)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  {produto.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
