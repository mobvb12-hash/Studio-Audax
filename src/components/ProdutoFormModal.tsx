import { useEffect, useState } from 'react'
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { parseMoeda } from '@/lib/moeda'

type Props = {
  produto?: Produto | null
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function ProdutoFormModal({ produto, onFechar }: Props) {
  const { adicionar, atualizar } = useProdutos()
  const [nome, setNome] = useState(() => produto?.nome ?? '')
  const [preco, setPreco] = useState(() =>
    produto ? String(produto.preco.toFixed(2)).replace('.', ',') : '',
  )
  const [ativo, setAtivo] = useState(() => produto?.ativo ?? true)
  const [erro, setErro] = useState('')

  const editando = Boolean(produto)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    const precoNum = parseMoeda(preco)
    try {
      if (produto) {
        atualizar(produto.id, { nome, preco: precoNum, ativo })
      } else {
        adicionar({ nome, preco: precoNum, ativo })
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
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
              {editando ? 'Editar produto' : 'Novo produto'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Produto vendido no PDV. Estoque entra na próxima fase.
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

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div>
            <label className={rotulo} htmlFor="prd-nome">
              Nome *
            </label>
            <input
              id="prd-nome"
              className={campo}
              placeholder="Ex.: Pomada modeladora"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="prd-preco">
              Preço de venda (R$) *
            </label>
            <input
              id="prd-preco"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 30,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
          </div>
          <label
            className="flex items-center gap-2 text-sm text-[#1C1A15]"
            htmlFor="prd-ativo"
          >
            <input
              id="prd-ativo"
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Produto ativo (aparece no PDV)
          </label>
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
            {editando ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
        </div>
      </div>
    </div>
  )
}
