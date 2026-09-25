// Painel — layout igual ao print, agora ligado à agenda real (localStorage).
// Financeiro/estoque/profissionais/clube continuam zerados até seus módulos.
import { hojeISO } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { StatusAgendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import { useProfissionais } from '@/modules/profissionais/store'
import { formatarBRL } from '@/lib/moeda'
import Avatar from '@/components/Avatar'

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

export default function Dashboard({ onNovo }: { onNovo: () => void }) {
  const { porData } = useAgenda()
  const { profissionais } = useProfissionais()
  const { lancamentos, resumoDoDia, diaFechado } = useCaixa()
  const agendaHoje = porData(hojeISO())
  const totalHoje = agendaHoje.length

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
  const ticketMedio =
    atendimentosMes.length > 0
      ? atendimentosMes.reduce((soma, l) => soma + l.valorLiquido, 0) /
        atendimentosMes.length
      : 0

  const resumoHoje = resumoDoDia(hojeISO())

  const kpis = [
    {
      rotulo: 'Receita do mês',
      valor: formatarBRL(receitaMes),
      sub: `${atendimentosMes.length} atendimento(s) recebido(s)`,
    },
    { rotulo: 'Despesas do mês', valor: formatarBRL(despesasMes) },
    { rotulo: 'Comissões a pagar', valor: formatarBRL(0), sub: 'em breve' },
    {
      rotulo: 'Resultado líquido',
      valor: formatarBRL(receitaMes - despesasMes),
      verde: true,
    },
    { rotulo: 'Ticket médio', valor: formatarBRL(ticketMedio) },
    { rotulo: 'Hoje', valor: String(totalHoje), sub: 'agend.' },
    { rotulo: 'Assinaturas ativas', valor: '0' },
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
          <Cartao titulo="Estoque baixo" contador="0">
            <CaixaVazia texto="Nenhum produto abaixo do mínimo." />
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
                      ag.status !== 'cancelado',
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
              <span className="text-[13px] text-[#8A8171]">0 ativas</span>
            </div>
            <div className="mt-4 flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-[#1C1A15]">
                Receita recorrente prevista/mês
              </span>
              <span className="font-semibold text-[#1C1A15]">
                {formatarBRL(0)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#E9DDC0] py-2 text-sm">
              <span className="font-medium text-[#1C1A15]">
                Pagamentos do clube este mês
              </span>
              <span className="font-semibold text-[#1C1A15]">
                {formatarBRL(0)}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
