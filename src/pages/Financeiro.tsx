import { useMemo, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
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
  rotuloPeriodo,
} from '@/modules/relatorios/periodo'

type TipoPeriodo = 'hoje' | 'ontem' | 'semana' | 'mes' | 'mesAnterior' | 'custom'

const ROTULO_TIPO: Record<TipoPeriodo, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Esta semana',
  mes: 'Este mês',
  mesAnterior: 'Mês anterior',
  custom: 'Personalizado',
}

function chipPeriodo(ativo: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativo
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR')
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
      {texto}
    </div>
  )
}

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <h2 className="text-[15px] font-bold text-[#1C1A15]">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function CelulaKpi({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="min-w-[150px] flex-1 px-4 py-4">
      <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
        {rotulo}
      </p>
      <p
        className={`mt-1.5 text-[22px] leading-none font-bold ${
          destaque ? 'text-[#6B8E5A]' : 'text-[#8A6A14]'
        }`}
      >
        {valor}
      </p>
    </div>
  )
}

function BarraEvolucao({
  dias,
}: {
  dias: { data: string; receita: number; despesa: number }[]
}) {
  const maximo = Math.max(1, ...dias.map((d) => Math.max(d.receita, d.despesa)))
  return (
    <ul className="mt-3 divide-y divide-[#EFE7D3]">
      {dias.map((d) => (
        <li key={d.data} className="flex items-center gap-3 py-2 text-[13px]">
          <span className="w-20 shrink-0 text-[#8A8171]">{dataCurta(d.data)}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-2 rounded-full bg-[#8A6A14]"
                style={{ width: `${(d.receita / maximo) * 100}%` }}
                aria-hidden="true"
              />
              <span className="shrink-0 font-medium text-[#1C1A15]">
                {formatarBRL(d.receita)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-2 rounded-full bg-red-300"
                style={{ width: `${(d.despesa / maximo) * 100}%` }}
                aria-hidden="true"
              />
              <span className="shrink-0 text-xs text-[#8A8171]">
                {formatarBRL(d.despesa)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function Financeiro() {
  const { lancamentos } = useCaixa()

  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [custom, setCustom] = useState<Periodo>(() => periodoMes())

  const periodo = useMemo<Periodo>(() => {
    if (tipo === 'hoje') return periodoHoje()
    if (tipo === 'ontem') return periodoOntem()
    if (tipo === 'semana') return periodoSemana()
    if (tipo === 'mes') return periodoMes()
    if (tipo === 'mesAnterior') return periodoMesAnterior()
    return custom
  }, [tipo, custom])

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
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Financeiro
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
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
            className={chipPeriodo(tipo === id)}
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
            <span className="text-sm text-[#8A8171]">até</span>
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
              <div className="flex flex-wrap gap-4 text-xs text-[#8A8171]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full bg-[#8A6A14]"
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
      </div>
    </div>
  )
}
