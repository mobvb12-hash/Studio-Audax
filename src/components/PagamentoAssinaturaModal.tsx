import { useEffect, useRef, useState } from 'react'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useClube } from '@/modules/clube/store'
import { proximoVencimentoAposPagamento } from '@/modules/clube/regras'
import { PLANOS_ROTULO, type AssinaturaClube } from '@/modules/clube/types'
import {
  FORMAS_PAGAMENTO,
  FORMAS_ROTULO,
  type FormaPagamento,
} from '@/modules/caixa/types'
import { formatarBRL, parseMoeda } from '@/lib/moeda'

type Props = {
  assinatura: AssinaturaClube
  onFechar: () => void
  /** Chamado após o pagamento ser registrado com sucesso */
  aoPagar?: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

function valorInicial(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function PagamentoAssinaturaModal({
  assinatura,
  onFechar,
  aoPagar,
}: Props) {
  const { registrarPagamento } = useClube()

  const [data, setData] = useState(() => hojeISO())
  const [valorTexto, setValorTexto] = useState(() =>
    valorInicial(assinatura.valorMensal),
  )
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [erro, setErro] = useState('')
  /** Anti duplo clique: um submit por vez até dar erro/sucesso */
  const salvandoRef = useRef(false)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const novoVencimento = proximoVencimentoAposPagamento(
    assinatura.proximoVencimento,
    data,
  )

  function confirmar() {
    if (salvandoRef.current) return
    if (!forma) {
      setErro('Selecione a forma de pagamento.')
      return
    }
    salvandoRef.current = true
    try {
      registrarPagamento({
        assinaturaId: assinatura.id,
        data,
        valor: parseMoeda(valorTexto),
        formaPagamento: forma,
      })
      aoPagar?.()
      onFechar()
    } catch (e) {
      salvandoRef.current = false
      setErro(
        e instanceof Error
          ? e.message
          : 'Não foi possível registrar o pagamento.',
      )
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
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Pagamento de renovação
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {assinatura.cliente}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#8A8171]">
              {PLANOS_ROTULO[assinatura.plano]} ·{' '}
              {formatarBRL(assinatura.valorMensal)}/mês
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

        <div className="mt-4 rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-[#8A8171]">Vencimento atual</span>
            <span className="font-medium text-[#1C1A15]">
              {formatarDataLonga(assinatura.proximoVencimento)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-[#EFE7D3] py-0.5">
            <span className="text-[#8A8171]">Novo vencimento</span>
            <span className="font-semibold text-[#8A6A14]">
              {formatarDataLonga(novoVencimento)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className={rotulo} htmlFor="pag-data">
              Data do pagamento *
            </label>
            <input
              id="pag-data"
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="pag-valor">
              Valor (R$) *
            </label>
            <input
              id="pag-valor"
              className={campo}
              inputMode="decimal"
              value={valorTexto}
              onChange={(e) => setValorTexto(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={rotulo} htmlFor="pag-forma">
              Forma de pagamento *
            </label>
            <select
              id="pag-forma"
              className={campo}
              value={forma}
              onChange={(e) => setForma(e.target.value as FormaPagamento | '')}
            >
              <option value="">Selecione...</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {FORMAS_ROTULO[f]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-[#F3ECDA] px-3 py-2 text-[13px] text-[#4A4436]">
          O pagamento entra no Caixa do dia (quando aberto) e renova o ciclo por
          1 mês.
        </p>

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
            Voltar
          </button>
          <button
            type="button"
            onClick={confirmar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Confirmar pagamento
          </button>
        </div>
      </div>
    </div>
  )
}
