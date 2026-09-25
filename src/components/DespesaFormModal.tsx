import { useEffect, useState } from 'react'
import { useCaixa } from '@/modules/caixa/store'
import {
  CATEGORIAS_DESPESA,
  FORMAS_PAGAMENTO,
  FORMAS_ROTULO,
} from '@/modules/caixa/types'
import type { FormaPagamento } from '@/modules/caixa/types'
import { parseMoeda } from '@/lib/moeda'

type Props = {
  /** Dia do caixa em que a despesa é lançada (YYYY-MM-DD) */
  data: string
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function DespesaFormModal({ data, onFechar }: Props) {
  const { adicionarDespesa, diaFechado } = useCaixa()

  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS_DESPESA[0])
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    if (diaFechado(data)) {
      setErro(`O caixa de ${data} está fechado. Reabra o caixa para lançar.`)
      return
    }
    try {
      adicionarDespesa({
        data,
        descricao,
        categoria,
        valor: parseMoeda(valor),
        formaPagamento: forma,
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
            <h2 className="text-lg font-bold text-[#1C1A15]">Nova despesa</h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Diminui o resultado líquido do dia {data}.
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
            <label className={rotulo} htmlFor="des-desc">
              Descrição *
            </label>
            <input
              id="des-desc"
              className={campo}
              placeholder="Ex.: Energia elétrica"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="des-cat">
              Categoria
            </label>
            <select
              id="des-cat"
              className={campo}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="des-forma">
              Forma de pagamento *
            </label>
            <select
              id="des-forma"
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
            <label className={rotulo} htmlFor="des-valor">
              Valor (R$) *
            </label>
            <input
              id="des-valor"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 250,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="des-obs">
              Observação
            </label>
            <input
              id="des-obs"
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
            Lançar despesa
          </button>
        </div>
      </div>
    </div>
  )
}
