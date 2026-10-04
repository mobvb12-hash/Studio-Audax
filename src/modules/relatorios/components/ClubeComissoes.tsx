import { CelulaKpi, LinhaDetalhe, Secao, Vazio } from '@/components/PainelUi'
import { dataCurta } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import type { LinhaDetalhada } from '@/modules/comissoes/resumo'
import type { FechamentoComissao } from '@/modules/comissoes/types'
import type { ClubePeriodo } from '@/modules/relatorios/calculos'

type Props = {
  clubeRel: ClubePeriodo
  receitaClubeCaixa: number
  profFiltro: string
  temProducao: boolean
  profLinhas: LinhaDetalhada[]
  comisTotais: { qtd: number; producao: number; comissao: number }
  comisFech: { lista: FechamentoComissao[]; totalFechado: number }
  comisAbertas: number
}

/** Audax Club no período + comissões do período. */
export default function ClubeComissoes({
  clubeRel,
  receitaClubeCaixa,
  profFiltro,
  temProducao,
  profLinhas,
  comisTotais,
  comisFech,
  comisAbertas,
}: Props) {
  return (
    <>
      {/* Audax Club */}
      <Secao titulo="Audax Club">
        {!clubeRel.temDados ? (
          <Vazio texto="Nenhuma assinatura do Audax Club." />
        ) : (
          <>
            <div className="overflow-x-auto border-y border-[#E5DCC3]">
              <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
                <CelulaKpi
                  rotulo="Assinaturas ativas"
                  valor={String(clubeRel.situacoes.ativas)}
                />
                <CelulaKpi
                  rotulo="Próximas do vencimento"
                  valor={String(clubeRel.situacoes.proximas)}
                />
                <CelulaKpi
                  rotulo="Atrasadas"
                  valor={String(clubeRel.situacoes.atrasadas)}
                />
                <CelulaKpi
                  rotulo="Vencidas"
                  valor={String(clubeRel.situacoes.vencidas)}
                />
                <CelulaKpi
                  rotulo="Canceladas"
                  valor={String(clubeRel.situacoes.canceladas)}
                />
                <CelulaKpi
                  rotulo="Receita prevista/mês"
                  valor={formatarBRL(clubeRel.receitaPrevista)}
                />
              </div>
            </div>
            <div className="mt-4">
              <LinhaDetalhe
                rotulo="Assinaturas cadastradas"
                valor={String(clubeRel.total)}
              />
              <LinhaDetalhe
                rotulo="Pagamentos no período"
                valor={`${clubeRel.pagamentos} · ${formatarBRL(clubeRel.pagamentosValor)}`}
              />
              <LinhaDetalhe
                rotulo="Receita de assinaturas no caixa"
                valor={formatarBRL(receitaClubeCaixa)}
              />
            </div>
            {profFiltro !== 'todos' && (
              <p className="mt-3 text-[13px] text-[#3A352C]">
                Visão geral da barbearia — assinaturas do Audax Club não são
                filtradas por profissional.
              </p>
            )}
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
            {comisAbertas < -0.005 && (
              <p className="mt-3 text-[13px] text-[#3A352C]">
                Produção atual diferente do fechamento: fechadas no período{' '}
                {formatarBRL(comisFech.totalFechado)} contra{' '}
                {formatarBRL(comisTotais.comissao)} de produção atual. Os
                fechamentos permanecem congelados até reabertura.
              </p>
            )}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#7C7469] uppercase">
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
                      <td className="px-3 py-2 font-medium text-[#121110]">
                        {p.nome}
                      </td>
                      <td className="px-3 py-2 text-right text-[#7C7469]">
                        {p.percentual}%
                      </td>
                      <td className="px-3 py-2 text-right text-[#3A352C]">
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
                <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
                  Comissões fechadas
                </p>
                <ul className="mt-1.5 divide-y divide-[#EFE7D3]">
                  {comisFech.lista.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-[#3A352C]">
                        {f.profissionalNome} · {dataCurta(f.periodo.inicio)} a{' '}
                        {dataCurta(f.periodo.fim)}
                      </span>
                      <span className="font-semibold text-[#121110]">
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
    </>
  )
}
