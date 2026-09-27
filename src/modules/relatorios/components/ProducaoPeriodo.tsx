import { Secao, Vazio } from '@/components/PainelUi'
import { formatarBRL } from '@/lib/moeda'
import type { LinhaDetalhada } from '@/modules/comissoes/resumo'
import {
  ROTULO_STATUS,
  type StatusEstoque,
} from '@/modules/estoque/indicadores'
import type { ProdutosRelatorio } from '@/modules/relatorios/calculos'
import { servicosDoPeriodo } from '@/modules/relatorios/calculos'

type ServicosRelatorio = ReturnType<typeof servicosDoPeriodo>

type Props = {
  temProducao: boolean
  profLinhas: LinhaDetalhada[]
  servicos: ServicosRelatorio
  prods: ProdutosRelatorio
}

function classeStatus(status: StatusEstoque): string {
  if (status === 'zerado') return 'text-red-700'
  if (status === 'baixo') return 'text-[#8A6A14]'
  return 'text-[#4A4436]'
}

/** Produção do período: profissionais, serviços e produtos. */
export default function ProducaoPeriodo({
  temProducao,
  profLinhas,
  servicos,
  prods,
}: Props) {
  return (
    <>
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
                  <th className="px-3 py-2 text-right font-semibold">
                    Produção
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Produtos
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Descontos
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Estornos
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">%</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Comissão
                  </th>
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
    </>
  )
}
