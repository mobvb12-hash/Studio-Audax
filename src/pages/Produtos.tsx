import { useMemo, useState } from 'react'
import AjusteEstoqueModal from '@/components/AjusteEstoqueModal'
import EntradaEstoqueModal from '@/components/EntradaEstoqueModal'
import ProdutoFormModal from '@/components/ProdutoFormModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useEstoque } from '@/modules/estoque/store'
import { ROTULO_STATUS, statusEstoque } from '@/modules/estoque/indicadores'
import {
  ROTULO_TIPO_MOVIMENTACAO,
  type TipoMovimentacao,
} from '@/modules/estoque/types'
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { formatarBRL } from '@/lib/moeda'

type Aba = 'produtos' | 'movimentacoes'
type FiltroStatus = 'todos' | 'baixo' | 'zerado' | 'inativos'
type FiltroPeriodo = 'tudo' | 'hoje' | 'semana' | 'mes'

const ORIGEM_ROTULO: Record<string, string> = {
  cadastro: 'Cadastro',
  pdv: 'PDV',
  estorno: 'Estorno',
  manual: 'Manual',
}

const campo =
  'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

function abaClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

function lerFiltroInicial(): FiltroStatus {
  try {
    const valor = sessionStorage.getItem('studio-audax:estoque:filtro')
    sessionStorage.removeItem('studio-audax:estoque:filtro')
    return valor === 'baixo' ? 'baixo' : 'todos'
  } catch {
    return 'todos'
  }
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

function badgeStatus(produto: Produto): string {
  const status = statusEstoque(produto)
  if (status === 'zerado') return 'border-red-200 bg-red-50 text-red-600'
  if (status === 'baixo') return 'border-amber-300 bg-amber-100 text-amber-900'
  return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
}

export default function Produtos() {
  const { produtos, alternarAtivo } = useProdutos()
  const { movimentacoes } = useEstoque()

  const [aba, setAba] = useState<Aba>('produtos')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>(lerFiltroInicial)
  const [modalProduto, setModalProduto] = useState<
    { modo: 'novo' } | { modo: 'editar'; produto: Produto } | null
  >(null)
  const [entradaProduto, setEntradaProduto] = useState<string | undefined>()
  const [ajusteProduto, setAjusteProduto] = useState<string | undefined>()
  const [entradaAberta, setEntradaAberta] = useState(false)
  const [ajusteAberto, setAjusteAberto] = useState(false)

  const [fPeriodo, setFPeriodo] = useState<FiltroPeriodo>('tudo')
  const [fProduto, setFProduto] = useState('')
  const [fTipo, setFTipo] = useState<TipoMovimentacao | ''>('')

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

  const movimentacoesFiltradas = useMemo(() => {
    const inicio = inicioDoPeriodo(fPeriodo)
    return movimentacoes
      .filter((m) => {
        if (inicio && m.data < inicio) return false
        if (fProduto && m.produtoId !== fProduto) return false
        if (fTipo && m.tipo !== fTipo) return false
        return true
      })
      .sort((a, b) =>
        `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`),
      )
  }, [movimentacoes, fPeriodo, fProduto, fTipo])

  function abrirEntrada(produtoId?: string) {
    setEntradaProduto(produtoId)
    setEntradaAberta(true)
  }

  function abrirAjuste(produtoId?: string) {
    setAjusteProduto(produtoId)
    setAjusteAberto(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Produtos
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {produtos.length} produto(s) · {movimentacoes.length} movimentação(ões)
            de estoque · histórico completo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={abaClasse(aba === 'produtos')}
            onClick={() => setAba('produtos')}
          >
            Produtos
          </button>
          <button
            type="button"
            className={abaClasse(aba === 'movimentacoes')}
            onClick={() => setAba('movimentacoes')}
          >
            Movimentações
          </button>
        </div>
      </div>

      {aba === 'produtos' && (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase"
                htmlFor="flt-status"
              >
                Filtro
              </label>
              <select
                id="flt-status"
                className={campo}
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
              >
                <option value="todos">Todos</option>
                <option value="baixo">Estoque baixo</option>
                <option value="zerado">Estoque zerado</option>
                <option value="inativos">Inativos</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setModalProduto({ modo: 'novo' })}
              className="rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
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
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-[#1C1A15]">
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
                    <p className="mt-0.5 text-[13px] text-[#4A4436]">
                      Venda: {formatarBRL(produto.preco)} · Custo:{' '}
                      {formatarBRL(produto.custo)} · Estoque: {produto.estoque} un
                      (mín. {produto.estoqueMinimo})
                      {produto.categoria && ` · ${produto.categoria}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setModalProduto({ modo: 'editar', produto })
                      }
                      className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEntrada(produto.id)}
                      className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                    >
                      Entrada
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarAtivo(produto.id)}
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
      )}

      {aba === 'movimentacoes' && (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase"
                htmlFor="mv-periodo"
              >
                Período
              </label>
              <select
                id="mv-periodo"
                className={campo}
                value={fPeriodo}
                onChange={(e) => setFPeriodo(e.target.value as FiltroPeriodo)}
              >
                <option value="tudo">Tudo</option>
                <option value="hoje">Hoje</option>
                <option value="semana">Últimos 7 dias</option>
                <option value="mes">Mês atual</option>
              </select>
            </div>
            <div>
              <label
                className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase"
                htmlFor="mv-produto"
              >
                Produto
              </label>
              <select
                id="mv-produto"
                className={campo}
                value={fProduto}
                onChange={(e) => setFProduto(e.target.value)}
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
              <label
                className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase"
                htmlFor="mv-tipo"
              >
                Tipo
              </label>
              <select
                id="mv-tipo"
                className={campo}
                value={fTipo}
                onChange={(e) => setFTipo(e.target.value as TipoMovimentacao | '')}
              >
                <option value="">Todos</option>
                {(
                  Object.keys(ROTULO_TIPO_MOVIMENTACAO) as TipoMovimentacao[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_MOVIMENTACAO[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => abrirEntrada()}
                className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
              >
                + Nova entrada
              </button>
              <button
                type="button"
                onClick={() => abrirAjuste()}
                className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
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
                  <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Produto</th>
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                    <th className="px-3 py-2 text-right font-semibold">Antes</th>
                    <th className="px-3 py-2 text-right font-semibold">Depois</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Custo un.
                    </th>
                    <th className="px-3 py-2 font-semibold">Origem</th>
                    <th className="px-3 py-2 font-semibold">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE7D3]">
                  {movimentacoesFiltradas.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-[#4A4436]">
                        {m.data} · {m.hora}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#1C1A15]">
                        {m.produto}
                      </td>
                      <td className="px-3 py-2 text-[#4A4436]">
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
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {m.estoqueAntes}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-[#1C1A15]">
                        {m.estoqueDepois}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(m.custoUnitario)}
                      </td>
                      <td className="px-3 py-2 text-[#4A4436]">
                        {ORIGEM_ROTULO[m.origem] ?? m.origem}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-[#8A8171]">
                        {[m.fornecedor, m.observacao]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalProduto && (
        <ProdutoFormModal
          produto={modalProduto.modo === 'editar' ? modalProduto.produto : null}
          onFechar={() => setModalProduto(null)}
        />
      )}
      {entradaAberta && (
        <EntradaEstoqueModal
          produtoId={entradaProduto}
          onFechar={() => setEntradaAberta(false)}
        />
      )}
      {ajusteAberto && (
        <AjusteEstoqueModal
          produtoId={ajusteProduto}
          onFechar={() => setAjusteAberto(false)}
        />
      )}
    </div>
  )
}
