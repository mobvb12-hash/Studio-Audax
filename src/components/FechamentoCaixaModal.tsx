import { useEffect, useState } from 'react'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import { formatarBRL } from '@/lib/moeda'

type Props = {
  /** Dia do caixa sendo fechado (YYYY-MM-DD) */
  data: string
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

export default function FechamentoCaixaModal({ data, onFechar }: Props) {
  const { resumoDoDia, fecharCaixa } = useCaixa()
  const [erro, setErro] = useState('')
  const resumo = resumoDoDia(data)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function confirmar() {
    try {
      fecharCaixa(data)
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Fechamento de caixa
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {formatarDataLonga(data)}
            </h2>
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

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Resumo do dia
          </p>
          <Linha
            rotulo={`Atendimentos recebidos (${resumo.qtdAtendimentos})`}
            valor={formatarBRL(resumo.receitasAtendimentos)}
          />
          <Linha
            rotulo={`Vendas de produto (${resumo.qtdProdutos})`}
            valor={formatarBRL(resumo.receitasProdutos)}
          />
          <Linha
            rotulo="Assinaturas do clube"
            valor={formatarBRL(resumo.receitasClube)}
          />
          <Linha rotulo="Descontos" valor={formatarBRL(resumo.descontos)} />
          <Linha rotulo="Total recebido" valor={formatarBRL(resumo.totalRecebido)} />
          <Linha rotulo="Despesas" valor={formatarBRL(resumo.despesas)} />
          <div className="flex items-center justify-between border-t-2 border-[#E5DCC3] py-2.5 text-sm">
            <span className="font-bold text-[#1C1A15]">Resultado líquido</span>
            <span className="text-base font-bold text-[#8A6A14]">
              {formatarBRL(resumo.liquido)}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Por forma de pagamento
          </p>
          {FORMAS_PAGAMENTO.map((f) => (
            <Linha
              key={f}
              rotulo={FORMAS_ROTULO[f]}
              valor={formatarBRL(resumo.porForma[f])}
            />
          ))}
        </div>

        {resumo.porProfissional.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Por profissional
            </p>
            {resumo.porProfissional.map((p) => (
              <Linha
                key={p.nome}
                rotulo={`${p.nome} (${p.qtd})`}
                valor={formatarBRL(p.valor)}
              />
            ))}
          </div>
        )}

        <p className="mt-4 rounded-lg bg-[#F3ECDA] px-3 py-2 text-[13px] text-[#4A4436]">
          Ao confirmar, o caixa do dia fica somente leitura. Novos lançamentos
          exigirão reabertura com motivo, que fica registrado na auditoria.
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
