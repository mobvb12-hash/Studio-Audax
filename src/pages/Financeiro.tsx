import { useMemo, useState } from 'react'
import { chipClasse } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import { BarraEvolucao, CelulaKpi, Secao, Vazio } from '@/components/PainelUi'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import type { Periodo } from '@/modules/comissoes/types'
import {
  faturamento,
  formasPagamento,
  resumoFinanceiro,
} from '@/modules/relatorios/calculos'
import {
  periodoHoje,
  periodoMes,
  periodoMesAnterior,
  periodoOntem,
  periodoSemana,
  ROTULO_TIPO,
  rotuloPeriodo,
  type TipoPeriodo,
} from '@/modules/relatorios/periodo'

export default function Financeiro() {
  const { lancamentos } = useCaixa()

  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [custom, setCustom] = useState<Periodo>(() => periodoMes())

  // Dia corrente como dependência: "hoje"/"ontem"/"semana" não podem
  // ficar congelados numa sessão que cruza a meia-noite.
  const hoje = hojeISO()

  const periodo = useMemo<Periodo>(() => {
    if (tipo === 'hoje') return periodoHoje()
    if (tipo === 'ontem') return periodoOntem()
    if (tipo === 'semana') return periodoSemana()
    if (tipo === 'mes') return periodoMes()
    if (tipo === 'mesAnterior') return periodoMesAnterior()
    return custom
    // `hoje` é dependência proposital (força o recálculo quando o dia vira)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, custom, hoje])

  const resumo = useMemo(
    () => resumoFinanceiro(lancamentos, periodo),
    [lancamentos, periodo],
  )
  const fat = useMemo(
    () => faturamento(lancamentos, periodo),
    [lancamentos, periodo],
  )
  const formas = useMemo(
    () => formasPagamento(lancamentos, periodo),
    [lancamentos, periodo],
  )

  function aplicarCustom(campo: 'inicio' | 'fim', valor: string) {
    if (!valor) return
    setCustom((atual) => ({ ...atual, [campo]: valor }))
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            Financeiro
          </h1>
          <p className="mt-2 text-[13px] text-[#3A352C]">
            {rotuloPeriodo(periodo)} · {resumo.qtdAtendimentosPagos}{' '}
            atendimento(s) pago(s) · Resultado{' '}
            {formatarBRL(resumo.resultado)}
          </p>
        </div>
      </div>

      {/* Filtro de período — mesmo padrão da tela de Relatórios */}
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        {(Object.keys(ROTULO_TIPO) as TipoPeriodo[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTipo(id)}
            className={chipClasse(tipo === id)}
          >
            {ROTULO_TIPO[id]}
          </button>
        ))}
        {tipo === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Início do período"
              value={custom.inicio}
              onChange={(e) => aplicarCustom('inicio', e.target.value)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            />
            <span className="text-sm text-[#7C7469]">até</span>
            <input
              type="date"
              aria-label="Fim do período"
              value={custom.fim}
              onChange={(e) => aplicarCustom('fim', e.target.value)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            />
          </div>
        )}
      </div>

      {/* Resumo do período */}
      <Secao titulo="Resumo financeiro">
        {!resumo.temDados ? (
          <Vazio texto="Nenhuma movimentação no período selecionado." />
        ) : (
          <div className="overflow-x-auto border-y border-[#E5DCC3]">
            <div className="flex min-w-[960px] divide-x divide-[#E5DCC3]">
              <CelulaKpi
                rotulo="Receita de serviços"
                valor={formatarBRL(resumo.receitaServicos)}
              />
              <CelulaKpi
                rotulo="Receita de produtos"
                valor={formatarBRL(resumo.receitaProdutos)}
              />
              <CelulaKpi
                rotulo="Receita do Club"
                valor={formatarBRL(resumo.receitaClube)}
              />
              <CelulaKpi
                rotulo="Receita total"
                valor={formatarBRL(resumo.receitaTotal)}
              />
              <CelulaKpi rotulo="Despesas" valor={formatarBRL(resumo.despesas)} />
              <CelulaKpi rotulo="Estornos" valor={formatarBRL(resumo.estornos)} />
              <CelulaKpi
                rotulo="Resultado líquido"
                valor={formatarBRL(resumo.resultado)}
                destaque={resumo.resultado >= 0}
              />
              <CelulaKpi
                rotulo="Ticket médio"
                valor={formatarBRL(resumo.ticketMedio)}
              />
              <CelulaKpi
                rotulo="Atendimentos pagos"
                valor={String(resumo.qtdAtendimentosPagos)}
              />
            </div>
          </div>
        )}
      </Secao>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Evolução diária */}
        <Secao titulo="Evolução diária">
          {fat.evolucao.length === 0 ? (
            <Vazio texto="Sem lançamentos no período." />
          ) : (
            <>
              <div className="flex flex-wrap gap-4 text-xs text-[#7C7469]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full bg-[#C9A24A]"
                    aria-hidden="true"
                  />
                  Receita
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full bg-red-300"
                    aria-hidden="true"
                  />
                  Despesa
                </span>
              </div>
              <BarraEvolucao dias={fat.evolucao} />
            </>
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
                  <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#7C7469] uppercase">
                    <th className="px-3 py-2 font-semibold">Forma</th>
                    <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                    <th className="px-3 py-2 text-right font-semibold">Valor</th>
                    <th className="px-3 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE7D3]">
                  {formas.linhas.map((f) => (
                    <tr key={f.forma}>
                      <td className="px-3 py-2 font-medium text-[#121110]">
                        {f.rotulo}
                      </td>
                      <td className="px-3 py-2 text-right text-[#3A352C]">
                        {f.qtd}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-[#121110]">
                        {formatarBRL(f.valor)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#7C7469]">
                        {f.percentual}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#FAF6EB] font-semibold">
                    <td className="px-3 py-2 text-[#121110]">Total</td>
                    <td className="px-3 py-2 text-right text-[#3A352C]">
                      {formas.linhas.reduce((t, f) => t + f.qtd, 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#8A6A14]">
                      {formatarBRL(formas.total)}
                    </td>
                    <td className="px-3 py-2 text-right text-[#7C7469]">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      </div>
    </div>
  )
}
