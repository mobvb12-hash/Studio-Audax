// Audax Club — assinaturas dos clientes (planos Cabelo, Barba e Cabelo + Barba).
// Status é sempre derivado do vencimento (nunca armazenado); cancelamento
// preserva assinatura e pagamentos; pagamento renova o ciclo e entra no Caixa.
import { useContext, useMemo, useState } from 'react'
import { chipClasse } from '@/lib/apresentacao'
import AssinaturaDetalheModal from '@/components/AssinaturaDetalheModal'
import AssinaturaFormModal from '@/components/AssinaturaFormModal'
import { CelulaKpi } from '@/components/PainelUi'
import { hojeISO } from '@/modules/agenda/catalogo'
import { ContextoAuth } from '@/modules/auth/contexto'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'
import { useCaixa } from '@/modules/caixa/store'
import ListaAssinaturas from '@/modules/clube/components/ListaAssinaturas'
import {
  pagamentosNoMes,
  situacoesAssinaturas,
  statusAssinatura,
} from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import type { StatusAssinatura } from '@/modules/clube/types'
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

export default function Clube() {
  const { assinaturas, pagamentos } = useClube()
  const { lancamentos } = useCaixa()
  // Criar assinatura = `clube:assinatura_criar` (mapa único; RLS 042).
  // Sem sessão de auth (testes/render isolado) não há papel a consultar.
  const auth = useContext(ContextoAuth)
  const { pode } = useAuthPermissao()
  const podeCriarAssinatura = auth === null || pode('clube:assinatura_criar')

  // Recalculado a cada render: uma sessão que cruza a meia-noite não
  // pode continuar exibindo o "hoje" do dia anterior.
  const hoje = hojeISO()
  const mesAtual = hoje.slice(0, 7)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [edicaoId, setEdicaoId] = useState<string | null>(null)

  const situacoes = situacoesAssinaturas(assinaturas, hoje)
  const receitaPrevista = assinaturas
    .filter((a) => !a.cancelada)
    .reduce((soma, a) => soma + a.valorMensal, 0)
  const estornados = useMemo(
    () => new Set(lancamentos.filter((l) => l.estornado).map((l) => l.id)),
    [lancamentos],
  )
  const pagoNoMes = pagamentosNoMes(pagamentos, mesAtual, estornados)

  const chave = normalizarTexto(busca)
  const lista = assinaturas
    .filter((a) => filtro === 'todas' || statusAssinatura(a, hoje) === filtro)
    .filter((a) => !chave || normalizarTexto(a.cliente).includes(chave))
    .sort(
      (a, b) =>
        ORDEM_STATUS[statusAssinatura(a, hoje)] -
          ORDEM_STATUS[statusAssinatura(b, hoje)] ||
        a.proximoVencimento.localeCompare(b.proximoVencimento) ||
        a.cliente.localeCompare(b.cliente, 'pt-BR'),
    )

  const detalhe = detalheId
    ? assinaturas.find((a) => a.id === detalheId)
    : undefined
  const emEdicao = edicaoId
    ? assinaturas.find((a) => a.id === edicaoId)
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
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            Audax Club
          </h1>
          <p className="mt-2 text-[13px] text-[#3A352C]">
            Assinaturas · planos Cabelo, Barba e Cabelo + Barba · 10% de
            desconto em produtos para assinantes vigentes
          </p>
        </div>
        {podeCriarAssinatura && (
          <button
            type="button"
            onClick={() => setNovoAberto(true)}
            className="shrink-0 rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] transition-colors hover:bg-[#A8842C]"
          >
            + Nova assinatura
          </button>
        )}
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[760px] divide-x divide-[#E5DCC3]">
          {kpis.map((kpi) => (
            <CelulaKpi key={kpi.rotulo} rotulo={kpi.rotulo} valor={kpi.valor} />
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

      <ListaAssinaturas
        assinaturas={assinaturas}
        lista={lista}
        hoje={hoje}
        aoDetalhe={setDetalheId}
        aoEditar={setEdicaoId}
      />

      {novoAberto && <AssinaturaFormModal onFechar={() => setNovoAberto(false)} />}
      {emEdicao && (
        <AssinaturaFormModal
          assinatura={emEdicao}
          onFechar={() => setEdicaoId(null)}
        />
      )}
      {detalhe && (
        <AssinaturaDetalheModal
          assinatura={detalhe}
          onFechar={() => setDetalheId(null)}
        />
      )}
    </div>
  )
}
