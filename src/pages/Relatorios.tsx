import { useMemo, useState } from 'react'
import { formatarBRL } from '@/lib/moeda'
import { CelulaKpi, Secao, Vazio } from '@/components/PainelUi'
import { useAgenda } from '@/modules/agenda/store'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import { useClientes } from '@/modules/clientes/store'
import { useClube } from '@/modules/clube/store'
import { useComissoes } from '@/modules/comissoes/store'
import { linhasDetalhadasDoPeriodo, totaisDoPeriodo } from '@/modules/comissoes/resumo'
import { montarPerfis, resumoSegmentos } from '@/modules/crm/regras'
import { useProdutos } from '@/modules/produtos/store'
import { useProfissionais } from '@/modules/profissionais/store'
import type { Periodo } from '@/modules/comissoes/types'
import {
  agendaDoPeriodo,
  clientesDoPeriodo,
  clubeDoPeriodo,
  despesasDoPeriodo,
  faturamento,
  fechamentosDoPeriodo,
  formasPagamento,
  produtosDoPeriodo,
  resumoFinanceiro,
  servicosDoPeriodo,
  variacaoPercentual,
} from '@/modules/relatorios/calculos'
import AgendaCrm from '@/modules/relatorios/components/AgendaCrm'
import ClubeComissoes from '@/modules/relatorios/components/ClubeComissoes'
import DespesasClientes from '@/modules/relatorios/components/DespesasClientes'
import FaturamentoFormas from '@/modules/relatorios/components/FaturamentoFormas'
import FiltrosPeriodo from '@/modules/relatorios/components/FiltrosPeriodo'
import ProducaoPeriodo from '@/modules/relatorios/components/ProducaoPeriodo'
import {
  periodoAnterior,
  periodoHoje,
  periodoMes,
  periodoMesAnterior,
  periodoOntem,
  periodoSemana,
  rotuloPeriodo,
  type TipoPeriodo,
} from '@/modules/relatorios/periodo'

export default function Relatorios() {
  const { lancamentos } = useCaixa()
  const { profissionais } = useProfissionais()
  const { clientes } = useClientes()
  const { produtos } = useProdutos()
  const { configDe, fechamentos } = useComissoes()
  const { agendamentos } = useAgenda()
  const { assinaturas, pagamentos } = useClube()

  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [custom, setCustom] = useState<Periodo>(() => periodoMes())
  const [profFiltro, setProfFiltro] = useState('todos')

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

  // Filtro por profissional: só restringe a entrada dos cálculos oficiais
  // (nenhuma conta é reimplementada e nada é gravado/alterado nos stores)
  const opcoesProf = useMemo(() => {
    const nomes = new Set<string>()
    profissionais.forEach((p) => nomes.add(p.nome))
    lancamentos.forEach((l) => {
      if (l.profissional) nomes.add(l.profissional)
    })
    agendamentos.forEach((a) => {
      if (a.profissional) nomes.add(a.profissional)
    })
    fechamentos.forEach((f) => {
      if (f.profissionalNome) nomes.add(f.profissionalNome)
    })
    if (profFiltro !== 'todos') nomes.add(profFiltro)
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [profissionais, lancamentos, agendamentos, fechamentos, profFiltro])

  const lancamentosFiltrados = useMemo(
    () =>
      profFiltro === 'todos'
        ? lancamentos
        : lancamentos.filter((l) => l.profissional === profFiltro),
    [lancamentos, profFiltro],
  )

  const agendamentosFiltrados = useMemo(
    () =>
      profFiltro === 'todos'
        ? agendamentos
        : agendamentos.filter((a) => a.profissional === profFiltro),
    [agendamentos, profFiltro],
  )

  const fechamentosFiltrados = useMemo(
    () =>
      profFiltro === 'todos'
        ? fechamentos
        : fechamentos.filter((f) => f.profissionalNome === profFiltro),
    [fechamentos, profFiltro],
  )

  const resumo = useMemo(
    () => resumoFinanceiro(lancamentosFiltrados, periodo),
    [lancamentosFiltrados, periodo],
  )
  const fat = useMemo(
    () => faturamento(lancamentosFiltrados, periodo),
    [lancamentosFiltrados, periodo],
  )
  const formas = useMemo(
    () => formasPagamento(lancamentosFiltrados, periodo),
    [lancamentosFiltrados, periodo],
  )
  const profLinhas = useMemo(
    () =>
      linhasDetalhadasDoPeriodo(
        lancamentosFiltrados,
        profissionais,
        configDe,
        periodo,
      ),
    [lancamentosFiltrados, profissionais, configDe, periodo],
  )
  const servicos = useMemo(
    () => servicosDoPeriodo(lancamentosFiltrados, periodo),
    [lancamentosFiltrados, periodo],
  )
  const despesas = useMemo(
    () => despesasDoPeriodo(lancamentosFiltrados, periodo),
    [lancamentosFiltrados, periodo],
  )
  const cli = useMemo(
    () => clientesDoPeriodo(lancamentosFiltrados, clientes, periodo),
    [lancamentosFiltrados, clientes, periodo],
  )
  const prods = useMemo(
    () => produtosDoPeriodo(lancamentosFiltrados, produtos, periodo),
    [lancamentosFiltrados, produtos, periodo],
  )
  const comisTotais = useMemo(() => totaisDoPeriodo(profLinhas), [profLinhas])
  const comisFech = useMemo(
    () => fechamentosDoPeriodo(fechamentosFiltrados, periodo),
    [fechamentosFiltrados, periodo],
  )
  // Diferença sem teto: quando o fechamento fica acima da produção atual o
  // valor fica negativo e a divergência aparece (não é escondida como 0).
  const comisAbertas =
    Math.round((comisTotais.comissao - comisFech.totalFechado) * 100) / 100

  const temProducao = resumo.qtdAtendimentosPagos > 0

  const agenda = useMemo(
    () => agendaDoPeriodo(agendamentosFiltrados, periodo),
    [agendamentosFiltrados, periodo],
  )

  // Guarda dos estornos sempre em cima da lista completa: protege o
  // Audax Club mesmo com o filtro de profissional ativo
  const estornados = useMemo(
    () => new Set(lancamentos.filter((l) => l.estornado).map((l) => l.id)),
    [lancamentos],
  )

  const clubeRel = useMemo(
    () => clubeDoPeriodo(assinaturas, pagamentos, periodo, estornados, hojeISO()),
    [assinaturas, pagamentos, periodo, estornados],
  )

  // Receita de assinaturas no caixa é visão do Clube, não do profissional
  const receitaClubeCaixa = useMemo(
    () => resumoFinanceiro(lancamentos, periodo).receitaClube,
    [lancamentos, periodo],
  )

  const perfisCrm = useMemo(
    () =>
      montarPerfis(clientes, agendamentosFiltrados, lancamentosFiltrados),
    [clientes, agendamentosFiltrados, lancamentosFiltrados],
  )
  const resumoCrm = useMemo(
    () => resumoSegmentos(perfisCrm),
    [perfisCrm],
  )

  // Comparação só entra quando a janela anterior tem dados reais
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo])
  const fatAnterior = useMemo(
    () => faturamento(lancamentosFiltrados, anterior),
    [lancamentosFiltrados, anterior],
  )
  const resumoAnterior = useMemo(
    () => resumoFinanceiro(lancamentosFiltrados, anterior),
    [lancamentosFiltrados, anterior],
  )
  const variacao = fatAnterior.temDados
    ? variacaoPercentual(fat.liquido, fatAnterior.liquido)
    : null

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
            {profFiltro !== 'todos' ? ` · Profissional: ${profFiltro}` : ''}
          </p>
        </div>
      </div>

      {/* Filtros de período e profissional — alimentam todos os relatórios */}
      <FiltrosPeriodo
        tipo={tipo}
        aoTipo={setTipo}
        custom={custom}
        aoCustom={aplicarCustom}
        profFiltro={profFiltro}
        aoProfFiltro={setProfFiltro}
        opcoesProf={opcoesProf}
      />

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
        <FaturamentoFormas
          fat={fat}
          fatAnterior={fatAnterior}
          resumoAnterior={resumoAnterior}
          anterior={anterior}
          variacao={variacao}
          formas={formas}
        />
        <ProducaoPeriodo
          temProducao={temProducao}
          profLinhas={profLinhas}
          servicos={servicos}
          prods={prods}
        />
        <DespesasClientes
          despesas={despesas}
          cli={cli}
          profFiltro={profFiltro}
        />
        <ClubeComissoes
          clubeRel={clubeRel}
          receitaClubeCaixa={receitaClubeCaixa}
          profFiltro={profFiltro}
          temProducao={temProducao}
          profLinhas={profLinhas}
          comisTotais={comisTotais}
          comisFech={comisFech}
          comisAbertas={comisAbertas}
        />
      </div>

      <AgendaCrm
        agenda={agenda}
        perfisCrm={perfisCrm}
        resumoCrm={resumoCrm}
        profFiltro={profFiltro}
      />
    </div>
  )
}
