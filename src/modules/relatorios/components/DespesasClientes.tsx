import { CelulaKpi, Secao, Vazio } from '@/components/PainelUi'
import { dataCurta } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import type {
  ClientesRelatorio,
  DespesasRelatorio,
} from '@/modules/relatorios/calculos'

type Props = {
  despesas: DespesasRelatorio
  cli: ClientesRelatorio
}

/** Despesas do período e clientes atendidos no período. */
export default function DespesasClientes({ despesas, cli }: Props) {
  return (
    <>
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
    </>
  )
}
