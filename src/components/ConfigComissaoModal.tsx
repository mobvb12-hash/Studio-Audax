import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { parseMoeda } from '@/lib/moeda'
import { useEffect, useState } from 'react'
import { useComissoes } from '@/modules/comissoes/store'
import type { ConfigComissao } from '@/modules/comissoes/types'

type Props = {
  profissionalId: string
  profissionalNome: string
  config: ConfigComissao
  onFechar: () => void
}

export default function ConfigComissaoModal({
  profissionalId,
  profissionalNome,
  config,
  onFechar,
}: Props) {
  const { salvarConfig } = useComissoes()
  const [percentual, setPercentual] = useState(() =>
    String(config.percentual).replace('.', ','),
  )
  const [ativo, setAtivo] = useState(config.ativo)
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    const numero = parseMoeda(percentual)
    if (!Number.isFinite(numero) || numero < 0) {
      setErro('Informe um percentual válido (ex.: 40 ou 40,5).')
      return
    }
    if (numero > 100) {
      setErro('O percentual não pode ser maior que 100%.')
      return
    }
    try {
      salvarConfig(profissionalId, { percentual: numero, ativo })
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
        className="w-full max-w-sm rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
              Configurar comissão
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#121110]">
              {profissionalNome}
            </h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#7C7469] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className={rotulo} htmlFor="cfg-percentual">
              Percentual de comissão (%)
            </label>
            <input
              id="cfg-percentual"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 40"
              value={percentual}
              onChange={(e) => setPercentual(e.target.value)}
            />
            <p className="mt-1 text-xs text-[#7C7469]">
              Calculado sobre a produção líquida de serviços do período.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
              className="h-4 w-4 accent-[#8A6A14]"
            />
            <span className="font-medium text-[#121110]">
              Profissional ativo no programa de comissão
            </span>
          </label>
          <p className="text-xs text-[#7C7469]">
            Desativar preserva todo o histórico e as comissões já fechadas.
          </p>
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
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className="rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
          >
            Salvar configuração
          </button>
        </div>
      </div>
    </div>
  )
}
