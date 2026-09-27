import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { FORMAS_ROTULO, type Lancamento } from '@/modules/caixa/types'
import { formatarBRL } from '@/lib/moeda'

type Props = {
  vendas: Lancamento[]
}

export default function HistoricoVendas({ vendas }: Props) {
  return (
    <section className="mt-4 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <h2 className="text-[15px] font-bold text-[#1C1A15]">
        Histórico de vendas
      </h2>
      {vendas.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-8 text-center text-sm text-[#A99E85]">
          Nenhuma venda registrada.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Profissional</th>
                <th className="px-3 py-2 font-semibold">Produtos</th>
                <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                <th className="px-3 py-2 text-right font-semibold">Desconto</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Pagamento</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE7D3]">
              {vendas.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-2 text-[#4A4436]">
                    {formatarDataLonga(v.data)} · {v.hora}
                  </td>
                  <td className="px-3 py-2 text-[#1C1A15]">{v.cliente || '—'}</td>
                  <td className="px-3 py-2 text-[#1C1A15]">
                    {v.profissional || '—'}
                  </td>
                  <td className="px-3 py-2 text-[#4A4436]">
                    {v.itens
                      ? v.itens
                          .map((i) => `${i.quantidade}× ${i.produto}`)
                          .join(', ')
                      : v.descricao}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A4436]">
                    {v.quantidade ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A4436]">
                    {formatarBRL(v.valor)}
                  </td>
                  <td className="px-3 py-2 text-right text-[#4A4436]">
                    {formatarBRL(v.desconto)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-[#1C1A15]">
                    {formatarBRL(v.valorLiquido)}
                  </td>
                  <td className="px-3 py-2 text-[#4A4436]">
                    {FORMAS_ROTULO[v.formaPagamento]}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        v.estornado
                          ? 'border-red-200 bg-red-50 text-red-600'
                          : 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                      }`}
                    >
                      {v.estornado ? 'Estornado' : 'Concluída'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
