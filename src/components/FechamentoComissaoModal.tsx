import { useEffect, useState } from 'react'
import { rotuloPeriodo } from '@/modules/comissoes/periodo'
import { useComissoes } from '@/modules/comissoes/store'
import type { Periodo } from '@/modules/comissoes/types'
import { formatarBRL } from '@/lib/moeda'

type Props = {
  profissionalId: string
  profissionalNome: string
  periodo: Periodo
  qtdAtendimentos: number
  producao: number
  percentual: number
  comissao: number
  onFechar: () => void
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-t border-[#EFE7D3] py-2 text-sm">
      <span className="text-[#4A4436]">{rotulo}</span>
      <span className="font-semibold text-[#1C1A15]">{valor}</span>
    </div>
  )
}

export default function FechamentoComissaoModal({
  profissionalId,
  profissionalNome,
  periodo,
  qtdAtendimentos,
  producao,
  percentual,
  comissao,
  onFechar,
}: Props) {
  const { fecharComissao } = useComissoes()
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
      fecharComissao({
        profissionalId,
        profissionalNome,
        periodo,
        qtdAtendimentos,
        producao,
        percentual,
        comissao,
      })
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível fechar.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
          Fechamento de comissão
        </p>
        <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
          {profissionalNome}
        </h2>

        <div className="mt-4">
          <Linha rotulo="Período" valor={rotuloPeriodo(periodo)} />
          <Linha
            rotulo="Atendimentos pagos"
            valor={String(qtdAtendimentos)}
          />
          <Linha
            rotulo="Produção líquida"
            valor={formatarBRL(producao)}
          />
          <Linha rotulo="Percentual" valor={`${percentual}%`} />
          <div className="flex items-center justify-between border-t-2 border-[#E5DCC3] py-2.5 text-sm">
            <span className="font-bold text-[#1C1A15]">Comissão a pagar</span>
            <span className="text-base font-bold text-[#8A6A14]">
              {formatarBRL(comissao)}
            </span>
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-[#F3ECDA] px-3 py-2 text-[13px] text-[#4A4436]">
          Ao confirmar, o valor é congelado no histórico. Alterações futuras de
          produção ou percentual não mudam este fechamento — qualquer correção
          exige reabertura explícita com motivo, registrada na auditoria.
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
            Confirmar fechamento
          </button>
        </div>
      </div>
    </div>
  )
}
