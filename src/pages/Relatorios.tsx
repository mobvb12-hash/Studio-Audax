import { useMemo, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useClientes } from '@/modules/clientes/store'
import { useComissoes } from '@/modules/comissoes/store'
import { dentroDoPeriodo } from '@/modules/comissoes/producao'
import { linhasDetalhadasDoPeriodo, totaisDoPeriodo } from '@/modules/comissoes/resumo'
import { ROTULO_STATUS, type StatusEstoque } from '@/modules/estoque/indicadores'
import { useProdutos } from '@/modules/produtos/store'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Periodo } from '@/modules/comissoes/types'
import {
  clientesDoPeriodo,
  despesasDoPeriodo,
  faturamento,
  fechamentosDoPeriodo,
  formasPagamento,
  produtosDoPeriodo,
  resumoFinanceiro,
  servicosDoPeriodo,
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

function classeStatus(status: StatusEstoque): string {
  if (status === 'zerado') return 'text-red-700'
  if (status === 'baixo') return 'text-[#8A6A14]'
  return 'text-[#4A4436]'
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

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-t border-[#EFE7D3] py-2 text-sm first:border-t-0">
      <span className="text-[#4A4436]">{rotulo}</span>
      <span className="font-semibold text-[#1C1A15]">{valor}</span>
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
        <li
          key={d.data}
          className="flex items-center gap-3 py-2 text-[13px]"
        >
          <span className="w-20 shrink-0 text-[#8A8171]">
            {dataCurta(d.data)}
          </span>
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

export default function Relatorios() {
  const { lancamentos } = useCaixa()
  const { profissionais } = useProfissionais()
  const { clientes } = useClientes()
  const { produtos } = useProdutos()
  const { configDe, fechamentos } = useComissoes()
  const { agendamentos } = useAgenda()

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
  const fat = useMemo(() => faturamento(lancamentos, periodo), [lancamentos, periodo])
  const formas = useMemo(
    () => formasPagamento(lancamentos, periodo),
    [lancamentos, periodo],
  )
  const profLinhas = useMemo(
    () => linhasDetalhadasDoPeriodo(lancamentos, profissionais, configDe, periodo),
    [lancamentos, profissionais, configDe, periodo],
  )
  const servicos = useMemo(
    () => servicosDoPeriodo(lancamentos, periodo),
    [lancamentos, periodo],
  )
  const despesas = useMemo(
    () => despesasDoPeriodo(lancamentos, periodo),
    [lancamentos, periodo],
  )
  const cli = useMemo(
    () => clientesDoPeriodo(lancamentos, clientes, periodo),
    [lancamentos, clientes, periodo],
  )
  const prods = useMemo(
    () => produtosDoPeriodo(lancamentos, produtos, periodo),
    [lancamentos, produtos, periodo],
  )
  const comisTotais = useMemo(() => totaisDoPeriodo(profLinhas), [profLinhas])
  const comisFech = useMemo(
    () => fechamentosDoPeriodo(fechamentos, periodo),
    [fechamentos, periodo],
  )
  const comisAbertas = Math.max(
    0,
    Math.round((comisTotais.comissao - comisFech.totalFechado) * 100) / 100,
  )

  const temProducao = resumo.qtdAtendimentosPagos > 0

  const agenda = useMemo(() => {
    const lista = agendamentos.filter((ag) => dentroDoPeriodo(ag.data, periodo))
    return {
      total: lista.length,
      emAberto: lista.filter(
        (ag) => ag.status === 'pendente' || ag.status === 'confirmado',
      ).length,
      concluidos: lista.filter((ag) => ag.status === 'concluido').length,
      cancelados: lista.filter((ag) => ag.status === 'cancelado').length,
      naoCompareceu: lista.filter((ag) => ag.status === 'nao_compareceu')
        .length,
      remarcacoes: lista.reduce(
        (total, ag) => total + (ag.remarcacoes?.length ?? 0),
        0,
      ),
    }
  }, [agendamentos, periodo])

  function aplicarCustom(campo: 'inicio' | 'fim', valor: string) {
    if (!valor) return
    setCustom((atual) => ({ ...atual, [campo]: valor }))
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Relatórios
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {rotuloPeriodo(periodo)} · {resumo.qtdAtendimentosPagos}{' '}
            atendimento(s) pago(s) · {formas.linhas.length} forma(s) de
            pagamento
          </p>
        </div>
      </div>

      {/* Filtro único de período — alimenta todos os relatórios */}
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

      {/* Resumo financeiro */}
      <Secao titulo="Resumo financeiro">
        {!resumo.temDados ? (
          <Vazio texto="Nenhuma movimentação no período selecionado." />
        ) : (
          <div className="overflow-x-auto border-y border-[#E5DCC3]">
            <div className="flex min-w-[900px] divide-x divide-[#E5DCC3]">
              <CelulaKpi
                rotulo="Receita de serviços"
                valor={formatarBRL(resumo.receitaServicos)}
              />
              <CelulaKpi
                rotulo="Receita de produtos"
                valor={formatarBRL(resumo.receitaProdutos)}
              />
              <CelulaKpi
                rotulo="Receita de assinaturas"
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

        {/* Profissionais */}
        <Secao titulo="Profissionais">
          {!temProducao ? (
            <Vazio texto="Sem produção de atendimentos no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                    <th className="px-3 py-2 font-semibold">Profissional</th>
                    <th className="px-3 py-2 text-right font-semibold">Atend.</th>
                    <th className="px-3 py-2 text-right font-semibold">Produção</th>
                    <th className="px-3 py-2 text-right font-semibold">Produtos</th>
                    <th className="px-3 py-2 text-right font-semibold">Descontos</th>
                    <th className="px-3 py-2 text-right font-semibold">Estornos</th>
                    <th className="px-3 py-2 text-right font-semibold">%</th>
                    <th className="px-3 py-2 text-right font-semibold">Comissão</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Líquido após comissão
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE7D3]">
                  {profLinhas.map((p) => (
                    <tr key={p.chave}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-[#1C1A15]">
                          {p.nome}
                        </span>
                        {p.inativo && (
                          <span className="ml-2 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {p.qtd}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(p.producao)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(p.producaoProdutos)}
                        {p.qtdProdutos > 0 && (
                          <span className="ml-1 text-xs text-[#8A8171]">
                            ({p.qtdProdutos})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(p.descontos)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(p.estornos)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#8A8171]">
                        {p.percentual}%
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-[#8A6A14]">
                        {formatarBRL(p.comissao)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-[#6B8E5A]">
                        {formatarBRL(p.producao + p.producaoProdutos - p.comissao)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>

        {/* Serviços */}
        <Secao titulo="Serviços">
          {!servicos.temDados ? (
            <Vazio texto="Nenhum serviço realizado no período." />
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-[#E5DCC3] bg-[#FAF6EB] px-3 py-1.5 text-xs font-medium text-[#4A4436]">
                Mais realizado: {servicos.maisRealizado?.nome} (
                {servicos.maisRealizado?.qtd})
              </span>
              <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-3 py-1.5 text-xs font-medium text-[#8A6A14]">
                Maior receita: {servicos.maisReceita?.nome} (
                {formatarBRL(servicos.maisReceita?.faturamento ?? 0)})
              </span>
              <div className="mt-2 w-full overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                      <th className="px-3 py-2 font-semibold">Serviço</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Realizados
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Faturamento
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Ticket médio por serviço
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE7D3]">
                    {servicos.linhas.map((s) => (
                      <tr key={s.nome}>
                        <td className="px-3 py-2 font-medium text-[#1C1A15]">
                          {s.nome}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {s.qtd}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {formatarBRL(s.faturamento)}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {formatarBRL(s.ticketMedio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Secao>

        {/* Produtos */}
        <Secao titulo="Produtos">
          {!prods.temDados ? (
            <Vazio texto="Nenhum produto cadastrado." />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#E5DCC3] bg-[#FAF6EB] px-3 py-1.5 text-xs font-medium text-[#4A4436]">
                  Vendidos no período: {prods.qtdTotalVendida} un.
                </span>
                <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-3 py-1.5 text-xs font-medium text-[#8A6A14]">
                  Receita de produtos: {formatarBRL(prods.receitaTotal)}
                </span>
                <span className="rounded-full border border-[#E5DCC3] bg-[#FAF6EB] px-3 py-1.5 text-xs font-medium text-[#4A4436]">
                  Estoque baixo/zerado: {prods.baixos}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                      <th className="px-3 py-2 font-semibold">Produto</th>
                      <th className="px-3 py-2 font-semibold">Categoria</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Vendidos
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Receita
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Estoque atual
                      </th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE7D3]">
                    {prods.linhas.map((p) => (
                      <tr key={p.id} className={p.ativo ? '' : 'opacity-60'}>
                        <td className="px-3 py-2 font-medium text-[#1C1A15]">
                          {p.nome}
                          {!p.ativo && (
                            <span className="ml-1.5 text-xs text-[#A99E85]">
                              inativo
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[#4A4436]">
                          {p.categoria || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {p.qtdVendida}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {formatarBRL(p.receita)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[#1C1A15]">
                          {p.estoqueAtual}
                        </td>
                        <td
                          className={`px-3 py-2 font-medium ${classeStatus(p.status)}`}
                        >
                          {ROTULO_STATUS[p.status]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Secao>

        {/* Despesas */}
        <Secao titulo="Despesas do período">
          {!despesas.temDados ? (
            <Vazio texto="Nenhuma despesa no período selecionado." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex gap-4 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                      Total
                    </p>
                    <p className="mt-1 text-[22px] leading-none font-bold text-red-700">
                      {formatarBRL(despesas.total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                      Lançamentos
                    </p>
                    <p className="mt-1 text-[22px] leading-none font-bold text-[#1C1A15]">
                      {despesas.qtd}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-[#EFE7D3]">
                  {despesas.porCategoria.map((c) => (
                    <li
                      key={c.categoria}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-[#4A4436]">
                        {c.categoria}{' '}
                        <span className="text-xs text-[#8A8171]">({c.qtd})</span>
                      </span>
                      <span className="font-medium text-[#1C1A15]">
                        {formatarBRL(c.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                  Evolução das despesas
                </p>
                <ul className="mt-2 divide-y divide-[#EFE7D3]">
                  {despesas.evolucao.map((d) => (
                    <li
                      key={d.data}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-[#8A8171]">{dataCurta(d.data)}</span>
                      <span className="font-medium text-[#1C1A15]">
                        {formatarBRL(d.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Secao>

        {/* Clientes */}
        <Secao titulo="Clientes">
          {!cli.temDados ? (
            <Vazio texto="Nenhum cliente atendido no período selecionado." />
          ) : (
            <>
              <div className="overflow-x-auto border-y border-[#E5DCC3]">
                <div className="flex min-w-[700px] divide-x divide-[#E5DCC3]">
                  <CelulaKpi
                    rotulo="Clientes atendidos"
                    valor={String(cli.atendidos)}
                  />
                  <CelulaKpi rotulo="Novos clientes" valor={String(cli.novos)} />
                  <CelulaKpi
                    rotulo="Recorrentes"
                    valor={String(cli.recorrentes)}
                  />
                  <CelulaKpi
                    rotulo="Total gasto"
                    valor={formatarBRL(cli.totalGasto)}
                  />
                  <CelulaKpi
                    rotulo="Ticket médio por cliente"
                    valor={formatarBRL(cli.ticketMedio)}
                  />
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[380px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Atendimentos
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Total gasto
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE7D3]">
                    {cli.linhas.slice(0, 10).map((c) => (
                      <tr key={c.chave}>
                        <td className="px-3 py-2 font-medium text-[#1C1A15]">
                          {c.nome}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {c.atendimentos}
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {formatarBRL(c.gasto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Secao>

        {/* Comissões do período */}
        <Secao titulo="Comissões do período">
          {!temProducao && comisFech.lista.length === 0 ? (
            <Vazio texto="Sem produção para comissionar no período." />
          ) : (
            <>
              <div className="overflow-x-auto border-y border-[#E5DCC3]">
                <div className="flex min-w-[560px] divide-x divide-[#E5DCC3]">
                  <CelulaKpi
                    rotulo="Comissões a pagar"
                    valor={formatarBRL(comisTotais.comissao)}
                  />
                  <CelulaKpi
                    rotulo="Fechadas no período"
                    valor={formatarBRL(comisFech.totalFechado)}
                  />
                  <CelulaKpi
                    rotulo="Ainda abertas"
                    valor={formatarBRL(comisAbertas)}
                    destaque
                  />
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                      <th className="px-3 py-2 font-semibold">Profissional</th>
                      <th className="px-3 py-2 text-right font-semibold">%</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Produção
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Comissão
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFE7D3]">
                    {profLinhas.map((p) => (
                      <tr key={p.chave}>
                        <td className="px-3 py-2 font-medium text-[#1C1A15]">
                          {p.nome}
                        </td>
                        <td className="px-3 py-2 text-right text-[#8A8171]">
                          {p.percentual}%
                        </td>
                        <td className="px-3 py-2 text-right text-[#4A4436]">
                          {formatarBRL(p.producao)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[#8A6A14]">
                          {formatarBRL(p.comissao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {comisFech.lista.length > 0 && (
                <div className="mt-4 border-t border-[#EFE7D3] pt-3">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                    Comissões fechadas
                  </p>
                  <ul className="mt-1.5 divide-y divide-[#EFE7D3]">
                    {comisFech.lista.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <span className="text-[#4A4436]">
                          {f.profissionalNome} · {dataCurta(f.periodo.inicio)} a{' '}
                          {dataCurta(f.periodo.fim)}
                        </span>
                        <span className="font-semibold text-[#1C1A15]">
                          {formatarBRL(f.comissao)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Secao>
      </div>

      {/* Agendamentos do período */}
      <div className="mt-4">
        <Secao titulo="Agendamentos do período">
          <div className="overflow-x-auto border-y border-[#E5DCC3]">
            <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
              <CelulaKpi
                rotulo="Agendamentos"
                valor={String(agenda.total)}
              />
              <CelulaKpi
                rotulo="Em aberto"
                valor={String(agenda.emAberto)}
              />
              <CelulaKpi
                rotulo="Concluídos"
                valor={String(agenda.concluidos)}
              />
              <CelulaKpi
                rotulo="Cancelados"
                valor={String(agenda.cancelados)}
              />
              <CelulaKpi
                rotulo="Não compareceu"
                valor={String(agenda.naoCompareceu)}
              />
              <CelulaKpi
                rotulo="Remarcações"
                valor={String(agenda.remarcacoes)}
              />
            </div>
          </div>
        </Secao>
      </div>
    </div>
  )
}
