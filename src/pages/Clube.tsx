// Audax Club — assinaturas dos clientes (planos Cabelo, Barba e Cabelo + Barba).
// Status é sempre derivado do vencimento (nunca armazenado); cancelamento
// preserva assinatura e pagamentos; pagamento renova o ciclo e entra no Caixa.
import { useMemo, useState } from 'react'
import AssinaturaDetalheModal from '@/components/AssinaturaDetalheModal'
import AssinaturaFormModal from '@/components/AssinaturaFormModal'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import {
  pagamentosNoMes,
  situacoesAssinaturas,
  statusAssinatura,
  statusClasse,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import {
  PLANOS_ROTULO,
  type AssinaturaClube,
  type StatusAssinatura,
} from '@/modules/clube/types'
import { formatarBRL, normalizarTexto } from '@/lib/moeda'

type Filtro = 'todas' | StatusAssinatura

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'ativa', rotulo: 'Ativas' },
  { id: 'proxima_vencimento', rotulo: 'Próximas' },
  { id: 'atrasada', rotulo: 'Atrasadas' },
  { id: 'vencida', rotulo: 'Vencidas' },
  { id: 'cancelada', rotulo: 'Canceladas' },
]

const ORDEM_STATUS: Record<StatusAssinatura, number> = {
  vencida: 0,
  atrasada: 1,
  proxima_vencimento: 2,
  ativa: 3,
  cancelada: 4,
}

function chipClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

export default function Clube() {
  const { assinaturas, pagamentos } = useClube()
  const { lancamentos } = useCaixa()

  const hoje = useMemo(() => hojeISO(), [])
  const mesAtual = hoje.slice(0, 7)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const situacoes = situacoesAssinaturas(assinaturas, hoje)
  const receitaPrevista = assinaturas
    .filter((a) => !a.cancelada)
    .reduce((soma, a) => soma + a.valorMensal, 0)
  const estornados = useMemo(
    () => new Set(lancamentos.filter((l) => l.estornado).map((l) => l.id)),
    [lancamentos],
  )
  const pagoNoMes = pagamentosNoMes(pagamentos, mesAtual, estornados)

  const lista = useMemo(() => {
    const chave = normalizarTexto(busca)
    return assinaturas
      .filter((a) => filtro === 'todas' || statusAssinatura(a, hoje) === filtro)
      .filter((a) => !chave || normalizarTexto(a.cliente).includes(chave))
      .sort(
        (a, b) =>
          ORDEM_STATUS[statusAssinatura(a, hoje)] -
            ORDEM_STATUS[statusAssinatura(b, hoje)] ||
          a.proximoVencimento.localeCompare(b.proximoVencimento) ||
          a.cliente.localeCompare(b.cliente, 'pt-BR'),
      )
  }, [assinaturas, filtro, busca, hoje])

  const detalhe = detalheId
    ? assinaturas.find((a) => a.id === detalheId)
    : undefined

  const kpis = [
    { rotulo: 'Assinantes ativos', valor: String(situacoes.ativas) },
    { rotulo: 'Próximos do vencimento', valor: String(situacoes.proximas) },
    { rotulo: 'Atrasadas', valor: String(situacoes.atrasadas) },
    { rotulo: 'Vencidas', valor: String(situacoes.vencidas) },
    { rotulo: 'Receita prevista/mês', valor: formatarBRL(receitaPrevista) },
    { rotulo: 'Pago no mês', valor: formatarBRL(pagoNoMes) },
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Audax Club
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            Assinaturas · planos Cabelo, Barba e Cabelo + Barba · 10% de
            desconto em produtos para assinantes vigentes
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNovoAberto(true)}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6F550F]"
        >
          + Nova assinatura
        </button>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
          {kpis.map((kpi) => (
            <div key={kpi.rotulo} className="min-w-[150px] flex-1 px-4 py-4">
              <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
                {kpi.rotulo}
              </p>
              <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
                {kpi.valor}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={chipClasse(filtro === f.id)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <input
          aria-label="Buscar assinatura por cliente"
          className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14] sm:w-64"
          placeholder="Buscar por cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

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
                        <button
                          type="button"
                          onClick={() => setDetalheId(a.id)}
                          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4436] hover:border-[#8A6A14] hover:bg-[#F3ECDA]"
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {novoAberto && <AssinaturaFormModal onFechar={() => setNovoAberto(false)} />}
      {detalhe && (
        <AssinaturaDetalheModal
          assinatura={detalhe}
          onFechar={() => setDetalheId(null)}
        />
      )}
    </div>
  )
}
