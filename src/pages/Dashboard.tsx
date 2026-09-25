// Painel — layout igual ao print, agora ligado à agenda real (localStorage).
// Financeiro/estoque/profissionais/clube continuam zerados até seus módulos.
import { hojeISO } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { StatusAgendamento } from '@/modules/agenda/types'

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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
}

function statusClasse(status: StatusAgendamento): string {
  if (status === 'confirmado')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'pendente')
    return 'border-amber-200 bg-amber-50 text-amber-700'
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
  const agendaHoje = porData(hojeISO())
  const totalHoje = agendaHoje.length

  const kpis = [
    {
      rotulo: 'Receita do mês',
      valor: formatarBRL(0),
      sub: '0 atendimento(s) concluído(s)',
    },
    { rotulo: 'Despesas do mês', valor: formatarBRL(0) },
    { rotulo: 'Comissões a pagar', valor: formatarBRL(0) },
    { rotulo: 'Resultado líquido', valor: formatarBRL(0), verde: true },
    { rotulo: 'Ticket médio', valor: formatarBRL(0) },
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
          <Cartao titulo="Estoque baixo" contador="0">
            <CaixaVazia texto="Nenhum produto abaixo do mínimo." />
          </Cartao>
          <Cartao titulo="Resumo de profissionais" contador="">
            <CaixaVazia texto="Nenhum profissional cadastrado." />
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
