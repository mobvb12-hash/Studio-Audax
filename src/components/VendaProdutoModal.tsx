import { useEffect, useState } from 'react'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import type { FormaPagamento } from '@/modules/caixa/types'
import { useProfissionais } from '@/modules/profissionais/store'
import { parseMoeda } from '@/lib/moeda'

type Props = {
  /** Dia do caixa em que a venda é lançada (YYYY-MM-DD) */
  data: string
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function VendaProdutoModal({ data, onFechar }: Props) {
  const { venderProduto, diaFechado } = useCaixa()
  const { profissionais } = useProfissionais()

  const [produto, setProduto] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [preco, setPreco] = useState('')
  const [desconto, setDesconto] = useState('0')
  const [profissional, setProfissional] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const qtdNum = Number(quantidade)
  const precoNum = parseMoeda(preco)
  const descontoNum = parseMoeda(desconto) || 0
  const total = Number.isFinite(qtdNum * precoNum)
    ? Math.max(0, qtdNum * precoNum - descontoNum)
    : 0

  function salvar() {
    if (diaFechado(data)) {
      setErro(`O caixa de ${data} está fechado. Reabra o caixa para lançar.`)
      return
    }
    try {
      venderProduto({
        data,
        produto,
        quantidade: qtdNum,
        preco: precoNum,
        desconto: descontoNum,
        formaPagamento: forma,
        profissional,
        observacao,
      })
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.')
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
              Venda de produto
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Entra como receita do dia na forma de pagamento escolhida.
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="vnd-produto">
              Produto *
            </label>
            <input
              id="vnd-produto"
              className={campo}
              placeholder="Ex.: Pomada"
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="vnd-qtd">
              Quantidade *
            </label>
            <input
              id="vnd-qtd"
              className={campo}
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="vnd-preco">
              Preço unitário (R$) *
            </label>
            <input
              id="vnd-preco"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 30,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="vnd-desconto">
              Desconto (R$)
            </label>
            <input
              id="vnd-desconto"
              className={campo}
              inputMode="decimal"
              placeholder="0"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="vnd-forma">
              Forma de pagamento *
            </label>
            <select
              id="vnd-forma"
              className={campo}
              value={forma}
              onChange={(e) => setForma(e.target.value as FormaPagamento)}
            >
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {FORMAS_ROTULO[f]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="vnd-prof">
              Profissional (opcional)
            </label>
            <select
              id="vnd-prof"
              className={campo}
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
            >
              <option value="">— Venda na loja —</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <span className={rotulo}>Total da venda</span>
            <div className="rounded-lg border border-[#E5DCC3] bg-[#F3ECDA] px-3 py-2 text-sm font-bold text-[#8A6A14]">
              R$ {total.toFixed(2).replace('.', ',')}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="vnd-obs">
              Observação
            </label>
            <input
              id="vnd-obs"
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
            onClick={salvar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Registrar venda
          </button>
        </div>
      </div>
    </div>
  )
}
