// Painel — layout igual ao print, agora ligado à agenda real (localStorage).
// Financeiro/estoque/profissionais ligados aos seus módulos; Audax Club real.
import { hojeISO } from '@/modules/agenda/catalogo'
import { duracaoBase, horariosDisponiveis } from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import type { StatusAgendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import { periodoMes } from '@/modules/comissoes/periodo'
import { linhasDoPeriodo, totaisDoPeriodo } from '@/modules/comissoes/resumo'
import { useComissoes } from '@/modules/comissoes/store'
import { pagamentosNoMes, situacoesAssinaturas } from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import { produtosComEstoqueBaixo } from '@/modules/estoque/indicadores'
import { useProdutos } from '@/modules/produtos/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { formatarBRL } from '@/lib/moeda'
import Avatar from '@/components/Avatar'
import type { PaginaId } from '@/layouts/AppLayout'

const ACESSOS: { id: PaginaId; rotulo: string }[] = [
  { id: 'agenda', rotulo: 'Agenda' },
  { id: 'caixa', rotulo: 'Caixa' },
  { id: 'comissoes', rotulo: 'Comissões' },
  { id: 'clube', rotulo: 'Clube de assinaturas' },
  { id: 'relatorios', rotulo: 'Relatórios' },
  { id: 'estoque', rotulo: 'Produtos / Estoque' },
]

function dataHoje(): string {
  const texto = new Date().toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const STATUS_ROTULO: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

function statusClasse(status: StatusAgendamento): string {
  if (status === 'confirmado')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'pendente')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'nao_compareceu')
    return 'border-slate-200 bg-slate-50 text-slate-600'
  if (status === 'cancelado') return 'border-red-200 bg-red-50 text-red-600'
  return 'border-[#E5DCC3] bg-[#F3ECDA] text-[#4A4436]'
}

function Cartao({
  titulo,
  contador,
  children,
}: {
  titulo: string
  contador: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-[#1C1A15]">{titulo}</h2>
        <span className="text-sm font-semibold text-[#8A8171]">{contador}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function CaixaVazia({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
      {texto}
    </div>
  )
}

export default function Dashboard({
  onNovo,
  onIrParaEstoque,
  onIrPara,
}: {
  onNovo: () => void
  /** Navega para a tela de Produtos/Estoque já filtrada em estoque baixo */
  onIrParaEstoque?: () => void
  /** Navegação rápida para os módulos de gestão */
  onIrPara?: (pagina: PaginaId) => void
}) {
  const { porData, expediente, bloqueios } = useAgenda()
  const { profissionais } = useProfissionais()
  const { lancamentos, resumoDoDia, diaFechado } = useCaixa()
  const { configDe } = useComissoes()
  const { produtos } = useProdutos()
  const { assinaturas, pagamentos } = useClube()
  const agendaHoje = porData(hojeISO())
  const totalHoje = agendaHoje.length

  // Alerta real de horários livres hoje (expediente − agendamentos − bloqueios)
  const disponibilidade = horariosDisponiveis(
    hojeISO(),
    expediente,
    bloqueios,
    agendaHoje,
    profissionais.map((p) => p.nome),
    duracaoBase,
  )

  const mesAtual = hojeISO().slice(0, 7)
  const doMes = lancamentos.filter(
    (l) => !l.estornado && l.data.startsWith(mesAtual),
  )
  const receitaMes = doMes
    .filter((l) => l.tipo === 'receita')
    .reduce((soma, l) => soma + l.valorLiquido, 0)
  const despesasMes = doMes
    .filter((l) => l.tipo === 'despesa')
    .reduce((soma, l) => soma + l.valorLiquido, 0)
  const atendimentosMes = doMes.filter((l) => l.origem === 'atendimento')
  const vendasMes = doMes.filter((l) => l.origem === 'produto')
  const ticketMedio =
    atendimentosMes.length > 0
      ? atendimentosMes.reduce((soma, l) => soma + l.valorLiquido, 0) /
        atendimentosMes.length
      : 0

  const comissaoMes = totaisDoPeriodo(
    linhasDoPeriodo(lancamentos, profissionais, configDe, periodoMes()),
  ).comissao

  const resumoHoje = resumoDoDia(hojeISO())

  // Estoque real: ativo e com atual <= mínimo (inclui zerados)
  const estoqueBaixo = produtosComEstoqueBaixo(produtos)
  const estoqueZerado = estoqueBaixo.filter((p) => p.estoque <= 0)

  // Audax Club real: status derivado do vencimento
  const situacoes = situacoesAssinaturas(assinaturas, hojeISO())
  const receitaPrevista = assinaturas
    .filter((a) => !a.cancelada)
    .reduce((soma, a) => soma + a.valorMensal, 0)
  const estornados = new Set(
    lancamentos.filter((l) => l.estornado).map((l) => l.id),
  )
  const pagamentosClubeMes = pagamentosNoMes(pagamentos, mesAtual, estornados)

  const kpis = [
    {
      rotulo: 'Receita do mês',
      valor: formatarBRL(receitaMes),
      sub: `${atendimentosMes.length} atendimento(s) · ${vendasMes.length} venda(s)`,
    },
    { rotulo: 'Despesas do mês', valor: formatarBRL(despesasMes) },
    { rotulo: 'Comissões a pagar', valor: formatarBRL(comissaoMes) },
    {
      rotulo: 'Resultado líquido',
      valor: formatarBRL(receitaMes - despesasMes),
      verde: true,
    },
    { rotulo: 'Ticket médio', valor: formatarBRL(ticketMedio) },
    { rotulo: 'Hoje', valor: String(totalHoje), sub: 'agend.' },
    { rotulo: 'Assinaturas ativas', valor: String(situacoes.ativas) },
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Painel
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {dataHoje()} · Studio Audax
          </p>
        </div>
        <button
          type="button"
          onClick={onNovo}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6F550F]"
        >
          + Novo agendamento
        </button>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[900px] divide-x divide-[#E5DCC3]">
          {kpis.map((kpi) => (
            <div key={kpi.rotulo} className="min-w-[150px] flex-1 px-4 py-4">
              <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
                {kpi.rotulo}
              </p>
              <p
                className={`mt-1.5 text-[22px] leading-none font-bold ${
                  'verde' in kpi && kpi.verde
                    ? 'text-[#6B8E5A]'
                    : 'text-[#8A6A14]'
                }`}
              >
                {kpi.valor}{' '}
                {kpi.sub === 'agend.' && (
                  <span className="text-[13px] font-medium">agend.</span>
                )}
              </p>
              {kpi.sub && kpi.sub !== 'agend.' && (
                <p className="mt-1.5 text-[11px] leading-snug text-[#8A8171]">
                  {kpi.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {onIrPara && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Acessos rápidos
          </span>
          {ACESSOS.map((acesso) => (
            <button
              key={acesso.id}
              type="button"
              onClick={() => onIrPara(acesso.id)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-sm font-medium text-[#4A4436] transition-colors hover:border-[#8A6A14] hover:bg-[#F3ECDA]"
            >
              {acesso.rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Cartao titulo="Agenda de hoje" contador={String(totalHoje)}>
            {totalHoje === 0 ? (
              <CaixaVazia texto="Nenhum agendamento para hoje." />
            ) : (
              <ul className="divide-y divide-[#EFE7D3]">
                {agendaHoje.slice(0, 5).map((ag) => (
                  <li
                    key={ag.id}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#1C1A15]">
                        {ag.horario} — {ag.cliente}
                      </p>
                      <p className="truncate text-xs text-[#8A8171]">
                        {ag.servico} · {ag.profissional}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasse(ag.status)}`}
                    >
                      {STATUS_ROTULO[ag.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-[#E9DDC0] pt-3 text-sm">
              <span className="font-medium text-[#1C1A15]">
                Horários disponíveis hoje
              </span>
              <span className="font-semibold text-[#8A6A14]">
                {disponibilidade.horarios.length} horário(s) ·{' '}
                {disponibilidade.vagas} vaga(s)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#8A8171]">
              {disponibilidade.horarios.length === 0
                ? 'Sem vagas no expediente de hoje.'
                : `Próximos: ${disponibilidade.horarios.slice(0, 4).join(', ')}`}
            </p>
          </Cartao>
          <Cartao titulo="Fila de espera agora" contador="0">
            <CaixaVazia texto="Ninguém na fila." />
          </Cartao>
        </div>

        <div className="flex flex-col gap-4">
          <Cartao
            titulo="Caixa de hoje"
            contador={diaFechado(hojeISO()) ? 'fechado' : 'aberto'}
          >
            <div className="flex items-center justify-between py-1.5 text-sm">
              <span className="font-medium text-[#1C1A15]">Recebido hoje</span>
              <span className="font-semibold text-[#8A6A14]">
                {formatarBRL(resumoHoje.totalRecebido)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#EFE7D3] py-1.5 text-sm">
              <span className="font-medium text-[#1C1A15]">Despesas hoje</span>
              <span className="font-semibold text-red-700">
                {formatarBRL(resumoHoje.despesas)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#EFE7D3] py-1.5 text-sm">
              <span className="font-medium text-[#1C1A15]">Resultado</span>
              <span className="font-semibold text-[#6B8E5A]">
                {formatarBRL(resumoHoje.liquido)}
              </span>
            </div>
            <div className="mt-3 border-t border-[#E9DDC0] pt-3">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                Por forma de pagamento
              </p>
              <ul className="mt-1.5 divide-y divide-[#EFE7D3]">
                {FORMAS_PAGAMENTO.map((f) => (
                  <li
                    key={f}
                    className="flex items-center justify-between py-1.5 text-[13px]"
                  >
                    <span className="text-[#4A4436]">{FORMAS_ROTULO[f]}</span>
                    <span className="font-medium text-[#1C1A15]">
                      {formatarBRL(resumoHoje.porForma[f])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {resumoHoje.porProfissional.length > 0 && (
              <div className="mt-3 border-t border-[#E9DDC0] pt-3">
                <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                  Por profissional
                </p>
                <ul className="mt-1.5 divide-y divide-[#EFE7D3]">
                  {resumoHoje.porProfissional.map((p) => (
                    <li
                      key={p.nome}
                      className="flex items-center justify-between py-1.5 text-[13px]"
                    >
                      <span className="text-[#4A4436]">
                        {p.nome}{' '}
                        <span className="text-xs text-[#8A8171]">
                          ({p.qtd})
                        </span>
                      </span>
                      <span className="font-medium text-[#1C1A15]">
                        {formatarBRL(p.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Cartao>
          <Cartao
            titulo="Estoque baixo"
            contador={String(estoqueBaixo.length)}
          >
            {estoqueBaixo.length === 0 ? (
              <CaixaVazia texto="Nenhum produto abaixo do mínimo." />
            ) : (
              <>
                <ul className="divide-y divide-[#EFE7D3]">
                  {estoqueBaixo.slice(0, 5).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="truncate text-[#1C1A15]">{p.nome}</span>
                      <span
                        className={`shrink-0 font-semibold ${
                          p.estoque <= 0
                            ? 'text-red-700'
                            : 'text-[#8A6A14]'
                        }`}
                      >
                        {p.estoque} un.
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-[#8A8171]">
                  {estoqueZerado.length} com estoque zerado
                </p>
                {onIrParaEstoque && (
                  <button
                    type="button"
                    onClick={onIrParaEstoque}
                    className="mt-3 w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm font-medium text-[#4A4436] hover:border-[#8A6A14] hover:bg-[#F3ECDA]"
                  >
                    Ver estoque →
                  </button>
                )}
              </>
            )}
          </Cartao>
          <Cartao
            titulo="Resumo de profissionais"
            contador={String(profissionais.length)}
          >
            {profissionais.length === 0 ? (
              <CaixaVazia texto="Nenhum profissional cadastrado." />
            ) : (
              <ul className="divide-y divide-[#EFE7D3]">
                {profissionais.map((prof) => {
                  const hoje = agendaHoje.filter(
                    (ag) =>
                      ag.profissional === prof.nome &&
                      ag.status !== 'cancelado' &&
                      ag.status !== 'nao_compareceu',
                  ).length
                  return (
                    <li
                      key={prof.id}
                      className="flex items-center justify-between gap-2 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar
                          nome={prof.nome}
                          foto={prof.foto}
                          tamanho="sm"
                        />
                        <p className="truncate text-sm font-bold text-[#1C1A15]">
                          {prof.nome}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-[#8A8171]">
                        {hoje} hoje
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Cartao>

          <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[#1C1A15]">
                Assinaturas
              </h2>
              <span className="text-[13px] text-[#8A8171]">
                {situacoes.ativas} ativa(s)
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-[#1C1A15]">
                Receita recorrente prevista/mês
              </span>
              <span className="font-semibold text-[#1C1A15]">
                {formatarBRL(receitaPrevista)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#E9DDC0] py-2 text-sm">
              <span className="font-medium text-[#1C1A15]">
                Pagamentos do clube este mês
              </span>
              <span className="font-semibold text-[#1C1A15]">
                {formatarBRL(pagamentosClubeMes)}
              </span>
            </div>
            <div className="mt-3 border-t border-[#E9DDC0] pt-3">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
                Situações de vencimento
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-[#BFE0B2] bg-[#E9F5E4] px-2.5 py-1 text-xs font-medium text-[#3F6B33]">
                  {situacoes.ativas} ativas
                </span>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                  {situacoes.proximas} próxima(s)
                </span>
                <span className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                  {situacoes.atrasadas} atrasada(s)
                </span>
                <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                  {situacoes.vencidas} vencida(s)
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
