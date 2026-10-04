import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import type { Produto } from '@/modules/produtos/types'

/** Item do carrinho do PDV (estoque no momento em que o item entrou). */
export type ItemCarrinho = {
  produtoId: string
  produto: string
  quantidade: number
  preco: number
  estoque: number
}

type Props = {
  produtos: Produto[]
  produtoSel: string
  aoProduto: (produtoId: string) => void
  qtdTexto: string
  aoQtd: (texto: string) => void
  carrinho: ItemCarrinho[]
  aoAdicionar: () => void
  aoDefinirQuantidade: (produtoId: string, texto: string) => void
  aoAlterarQuantidade: (produtoId: string, delta: number) => void
  aoRemover: (produtoId: string) => void
}

export default function SelecaoCarrinho({
  produtos,
  produtoSel,
  aoProduto,
  qtdTexto,
  aoQtd,
  carrinho,
  aoAdicionar,
  aoDefinirQuantidade,
  aoAlterarQuantidade,
  aoRemover,
}: Props) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <h2 className="text-[15px] font-bold text-[#121110]">Produtos</h2>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={rotulo} htmlFor="pdv-produto">
            Produto *
          </label>
          <select
            id="pdv-produto"
            className={campo}
            value={produtoSel}
            onChange={(e) => aoProduto(e.target.value)}
          >
            <option value="">Selecione um produto...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {formatarBRL(p.preco)} · estoque {p.estoque}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-24">
          <label className={rotulo} htmlFor="pdv-qtd">
            Quantidade *
          </label>
          <input
            id="pdv-qtd"
            className={campo}
            inputMode="numeric"
            value={qtdTexto}
            onChange={(e) => aoQtd(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={aoAdicionar}
          className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
        >
          Adicionar ao carrinho
        </button>
      </div>

      <h3 className="mt-5 text-[13px] font-bold text-[#121110]">Carrinho</h3>
      {carrinho.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
          Carrinho vazio.
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#7C7469] uppercase">
                <th className="px-2 py-2 font-semibold">Produto</th>
                <th className="px-2 py-2 text-right font-semibold">Qtd</th>
                <th className="px-2 py-2 text-right font-semibold">Estoque</th>
                <th className="px-2 py-2 text-right font-semibold">Unitário</th>
                <th className="px-2 py-2 text-right font-semibold">Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE7D3]">
              {carrinho.map((i) => (
                <tr key={i.produtoId}>
                  <td className="px-2 py-2 font-medium text-[#121110]">
                    {i.produto}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Diminuir ${i.produto}`}
                        onClick={() => aoAlterarQuantidade(i.produtoId, -1)}
                        className="h-6 w-6 rounded border border-[#E5DCC3] bg-white text-[#3A352C] hover:bg-[#F3ECDA]"
                      >
                        −
                      </button>
                      <input
                        aria-label={`Quantidade de ${i.produto}`}
                        className="w-12 rounded border border-[#E5DCC3] bg-white px-1 py-0.5 text-right text-sm outline-none focus:border-[#8A6A14]"
                        inputMode="numeric"
                        value={i.quantidade}
                        onChange={(e) =>
                          aoDefinirQuantidade(i.produtoId, e.target.value)
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Aumentar ${i.produto}`}
                        onClick={() => aoAlterarQuantidade(i.produtoId, 1)}
                        className="h-6 w-6 rounded border border-[#E5DCC3] bg-white text-[#3A352C] hover:bg-[#F3ECDA]"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-[#7C7469]">
                    {i.estoque}
                  </td>
                  <td className="px-2 py-2 text-right text-[#3A352C]">
                    {formatarBRL(i.preco)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-[#121110]">
                    {formatarBRL(i.quantidade * i.preco)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Remover ${i.produto}`}
                      onClick={() => aoRemover(i.produtoId)}
                      className="rounded px-1.5 text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
