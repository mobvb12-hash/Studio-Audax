import { useState } from 'react'
import ProdutoFormModal from '@/components/ProdutoFormModal'
import { formatarBRL } from '@/lib/moeda'
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'

export default function Produtos() {
  const { produtos, alternarAtivo } = useProdutos()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Produto | null>(null)

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Produtos
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {produtos.length} produto(s) cadastrado(s) · vendidos no PDV ·
            controle de estoque na próxima fase
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo produto
        </button>
      </div>

      {produtos.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          Nenhum produto cadastrado. Clique em “+ Novo produto” para começar.
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {produtos.map((produto) => (
            <li
              key={produto.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1C1A15]">
                  {produto.nome}{' '}
                  <span
                    className={`ml-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      produto.ativo
                        ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                        : 'border-slate-300 bg-slate-100 text-slate-600'
                    }`}
                  >
                    {produto.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </p>
                <p className="mt-0.5 text-[13px] text-[#4A4436]">
                  Preço: {formatarBRL(produto.preco)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(produto)
                    setModalAberto(true)
                  }}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Editar
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

      {modalAberto && (
        <ProdutoFormModal
          produto={editando}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </div>
  )
}
