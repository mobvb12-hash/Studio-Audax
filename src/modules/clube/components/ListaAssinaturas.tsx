import { formatarDataLonga } from '@/modules/agenda/catalogo'
import {
  statusAssinatura,
  statusClasse,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import { PLANOS_ROTULO, type AssinaturaClube } from '@/modules/clube/types'
import { formatarBRL } from '@/lib/moeda'

type Props = {
  assinaturas: AssinaturaClube[]
  lista: AssinaturaClube[]
  hoje: string
  aoDetalhe: (assinaturaId: string) => void
  aoEditar: (assinaturaId: string) => void
}

/** Tabela de assinaturas do Audax Club (com estados vazio/filtrado). */
export default function ListaAssinaturas({
  assinaturas,
  lista,
  hoje,
  aoDetalhe,
  aoEditar,
}: Props) {
  return (
    <section className="mt-4 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
      <h2 className="text-[15px] font-bold text-[#1C1A15]">Assinaturas</h2>
      {assinaturas.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-8 text-center text-sm text-[#A99E85]">
          Nenhuma assinatura cadastrada.
        </div>
      ) : lista.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-8 text-center text-sm text-[#A99E85]">
          Nenhuma assinatura encontrada com este filtro.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Plano</th>
                <th className="px-3 py-2 text-right font-semibold">
                  Mensalidade
                </th>
                <th className="px-3 py-2 font-semibold">Assinatura desde</th>
                <th className="px-3 py-2 font-semibold">Próximo venc.</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFE7D3]">
              {lista.map((a: AssinaturaClube) => {
                const status = statusAssinatura(a, hoje)
                return (
                  <tr key={a.id}>
                    <td className="px-3 py-2 font-medium text-[#1C1A15]">
                      {a.cliente}
                    </td>
                    <td className="px-3 py-2 text-[#4A4436]">
                      {PLANOS_ROTULO[a.plano]}
                    </td>
                    <td className="px-3 py-2 text-right text-[#4A4436]">
                      {formatarBRL(a.valorMensal)}
                    </td>
                    <td className="px-3 py-2 text-[#4A4436]">
                      {formatarDataLonga(a.dataAssinatura)}
                    </td>
                    <td className="px-3 py-2 text-[#1C1A15]">
                      {formatarDataLonga(a.proximoVencimento)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasse(status)}`}
                      >
                        {STATUS_ROTULO[status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => aoDetalhe(a.id)}
                          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4436] hover:border-[#8A6A14] hover:bg-[#F3ECDA]"
                        >
                          Detalhes
                        </button>
                        {!a.cancelada && (
                          <button
                            type="button"
                            onClick={() => aoEditar(a.id)}
                            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4436] hover:border-[#8A6A14] hover:bg-[#F3ECDA]"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
