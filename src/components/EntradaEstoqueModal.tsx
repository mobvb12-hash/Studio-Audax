import { useEffect, useState } from 'react'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useEstoque } from '@/modules/estoque/store'
import { useProdutos } from '@/modules/produtos/store'
import { parseMoeda } from '@/lib/moeda'

type Props = {
  produtoId?: string
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function EntradaEstoqueModal({ produtoId, onFechar }: Props) {
  const { produtos } = useProdutos()
  const { entrada } = useEstoque()

  const [produto, setProduto] = useState(produtoId ?? '')
  const [quantidade, setQuantidade] = useState('1')
  const [custo, setCusto] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [data, setData] = useState(() => hojeISO())
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function confirmar() {
    try {
      entrada({
        produtoId: produto,
        quantidade: Number(quantidade),
        custoUnitario: custo.trim() === '' ? 0 : parseMoeda(custo),
        fornecedor: fornecedor || undefined,
        data,
        observacao: observacao || undefined,
      })
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar a entrada.')
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
            <h2 className="text-lg font-bold text-[#1C1A15]">Entrada de estoque</h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Soma ao estoque atual e registra a movimentação.
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
            <label className={rotulo} htmlFor="ent-produto">
              Produto *
            </label>
            <select
              id="ent-produto"
              className={campo}
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
            >
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · estoque {p.estoque}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="ent-quantidade">
              Quantidade *
            </label>
            <input
              id="ent-quantidade"
              className={campo}
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="ent-custo">
              Custo unitário (R$)
            </label>
            <input
              id="ent-custo"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 12,00"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="ent-data">
              Data *
            </label>
            <input
              id="ent-data"
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="ent-fornecedor">
              Fornecedor
            </label>
            <input
              id="ent-fornecedor"
              className={campo}
              placeholder="Opcional"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={rotulo} htmlFor="ent-observacao">
              Observação
            </label>
            <input
              id="ent-observacao"
              className={campo}
              placeholder="Opcional"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
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
            onClick={confirmar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Registrar entrada
          </button>
        </div>
      </div>
    </div>
  )
}
