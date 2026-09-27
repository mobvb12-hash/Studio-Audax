import { BarraEvolucao, LinhaDetalhe, Secao, Vazio } from '@/components/PainelUi'
import { formatarBRL } from '@/lib/moeda'
import type { Periodo } from '@/modules/comissoes/types'
import type {
  Faturamento,
  FormaLinha,
  ResumoFinanceiro,
} from '@/modules/relatorios/calculos'
import { rotuloPeriodo } from '@/modules/relatorios/periodo'

type Props = {
  fat: Faturamento
  fatAnterior: Faturamento
  resumoAnterior: ResumoFinanceiro
  anterior: Periodo
  variacao: number | null
  formas: { linhas: FormaLinha[]; total: number; temDados: boolean }
}

/** Faturamento do período (com comparação) + formas de pagamento. */
export default function FaturamentoFormas({
  fat,
  fatAnterior,
  resumoAnterior,
  anterior,
  variacao,
  formas,
}: Props) {
  return (
    <>
      {/* Faturamento */}
      <Secao titulo="Faturamento">
        {!fat.temDados ? (
          <Vazio texto="Sem faturamento no período selecionado." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <LinhaDetalhe
                rotulo="Faturamento bruto (total)"
                valor={formatarBRL(fat.bruto)}
              />
              <LinhaDetalhe
                rotulo="Descontos concedidos"
                valor={formatarBRL(fat.descontos)}
              />
              <LinhaDetalhe
                rotulo="Serviços (líquido)"
                valor={formatarBRL(fat.servicos)}
              />
              <LinhaDetalhe
                rotulo="Produtos (líquido)"
                valor={formatarBRL(fat.produtos)}
              />
              <LinhaDetalhe
                rotulo="Assinaturas (líquido)"
                valor={formatarBRL(fat.clube)}
              />
              <LinhaDetalhe
                rotulo="Estornos (fora da receita)"
                valor={formatarBRL(fat.estornos)}
              />
              <LinhaDetalhe
                rotulo="Despesas (no período)"
                valor={formatarBRL(fat.despesas)}
              />
              <LinhaDetalhe
                rotulo="Resultado líquido (receita – despesas)"
                valor={formatarBRL(fat.liquido - fat.despesas)}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                Evolução por dia
              </p>
              {fat.evolucao.length === 0 ? (
                <Vazio texto="Sem lançamentos no período." />
              ) : (
                <BarraEvolucao dias={fat.evolucao} />
              )}
            </div>
          </div>
        )}
        {fat.temDados && fatAnterior.temDados && (
          <div className="mt-4 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB] p-3">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Comparação com o período anterior
            </p>
            <p className="mt-1 text-xs text-[#8A8171]">
              {rotuloPeriodo(anterior)}
            </p>
            <div className="mt-1">
              <LinhaDetalhe
                rotulo="Receita líquida no anterior"
                valor={formatarBRL(fatAnterior.liquido)}
              />
              <LinhaDetalhe
                rotulo="Atendimentos pagos no anterior"
                valor={String(resumoAnterior.qtdAtendimentosPagos)}
              />
            </div>
            {variacao !== null && (
              <p
                className={`mt-2 text-sm font-semibold ${
                  variacao > 0
                    ? 'text-[#6B8E5A]'
                    : variacao < 0
                      ? 'text-red-700'
                      : 'text-[#4A4436]'
                }`}
              >
                Receita: {variacao > 0 ? '+' : ''}
                {variacao}% vs. anterior
              </p>
            )}
          </div>
        )}
      </Secao>

      {/* Formas de pagamento */}
      <Secao titulo="Formas de pagamento">
        {!formas.temDados ? (
          <Vazio texto="Nenhum recebimento no período selecionado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                  <th className="px-3 py-2 font-semibold">Forma</th>
                  <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                  <th className="px-3 py-2 text-right font-semibold">Valor</th>
                  <th className="px-3 py-2 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE7D3]">
                {formas.linhas.map((f) => (
                  <tr key={f.forma}>
                    <td className="px-3 py-2 font-medium text-[#1C1A15]">
                      {f.rotulo}
                    </td>
                    <td className="px-3 py-2 text-right text-[#4A4436]">
                      {f.qtd}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-[#1C1A15]">
                      {formatarBRL(f.valor)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#8A8171]">
                      {f.percentual}%
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#FAF6EB] font-semibold">
                  <td className="px-3 py-2 text-[#1C1A15]">Total</td>
                  <td className="px-3 py-2 text-right text-[#4A4436]">
                    {formas.linhas.reduce((t, f) => t + f.qtd, 0)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#8A6A14]">
                    {formatarBRL(formas.total)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#8A8171]">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  )
}
