import { useEffect, useMemo } from 'react'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { StatusAgendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import type { Cliente } from '@/modules/clientes/types'
import { formatarBRL, normalizarTexto } from '@/lib/moeda'

type Props = {
  cliente: Cliente
  onFechar: () => void
}

const STATUS_ROTULO: Record<StatusAgendamento, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

function badgeStatus(status: StatusAgendamento): string {
  if (status === 'concluido')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'cancelado') return 'border-red-200 bg-red-50 text-red-600'
  if (status === 'nao_compareceu')
    return 'border-slate-300 bg-slate-100 text-slate-700'
  if (status === 'confirmado')
    return 'border-[#4F9417] bg-[#E9F5E4] text-[#3F6B33]'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

export default function ClienteDetalheModal({ cliente, onFechar }: Props) {
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const chave = normalizarTexto(cliente.nome)

  const historico = useMemo(
    () =>
      agendamentos
        .filter((ag) => normalizarTexto(ag.cliente) === chave)
        .sort((a, b) =>
          `${b.data} ${b.horario}`.localeCompare(`${a.data} ${a.horario}`),
        ),
    [agendamentos, chave],
  )

  const recebido = useMemo(
    () =>
      lancamentos.filter(
        (l) =>
          !l.estornado &&
          l.tipo === 'receita' &&
          (l.clienteId === cliente.id ||
            (l.cliente ? normalizarTexto(l.cliente) === chave : false)),
      ),
    [lancamentos, cliente.id, chave],
  )

  const totalGasto = recebido.reduce((soma, l) => soma + l.valorLiquido, 0)
  const concluidos = historico.filter((ag) => ag.status === 'concluido').length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Histórico do cliente
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {cliente.nome}
            </h2>
            <p className="text-[13px] text-[#8A8171]">
              {cliente.telefone || 'Sem telefone'}
              {cliente.email && ` · ${cliente.email}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {historico.length}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#8A8171] uppercase">
              Agendamentos
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {concluidos}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#8A8171] uppercase">
              Concluídos
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-lg leading-none font-bold text-[#8A6A14]">
              {formatarBRL(totalGasto)}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#8A8171] uppercase">
              Total gasto
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Atendimentos
          </p>
          {historico.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
              Nenhum agendamento para este cliente.
            </div>
          ) : (
            <ul className="divide-y divide-[#EFE7D3]">
              {historico.map((ag) => (
                <li key={ag.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#1C1A15]">
                      {formatarDataLonga(ag.data)} · {ag.horario}
                    </p>
                    <p className="truncate text-xs text-[#8A8171]">
                      {ag.servico} · {ag.profissional}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${badgeStatus(ag.status)}`}
                  >
                    {STATUS_ROTULO[ag.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Pagamentos
          </p>
          {recebido.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
              Nenhum recebimento registrado.
            </div>
          ) : (
            <ul className="divide-y divide-[#EFE7D3]">
              {recebido.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1C1A15]">
                      {l.descricao}
                    </p>
                    <p className="text-xs text-[#8A8171]">
                      {formatarDataLonga(l.data)} · {l.hora}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[#8A6A14]">
                    {formatarBRL(l.valorLiquido)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={onFechar}
          className="mt-5 w-full rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}
