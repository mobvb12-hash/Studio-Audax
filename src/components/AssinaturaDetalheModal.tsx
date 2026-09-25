import { useEffect, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import PagamentoAssinaturaModal from '@/components/PagamentoAssinaturaModal'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useClube } from '@/modules/clube/store'
import {
  assinaturaVigente,
  statusAssinatura,
  statusClasse,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import { PLANOS_ROTULO, type AssinaturaClube } from '@/modules/clube/types'
import { FORMAS_ROTULO } from '@/modules/caixa/types'
import { formatarBRL } from '@/lib/moeda'

type Props = {
  assinatura: AssinaturaClube
  onFechar: () => void
}

export default function AssinaturaDetalheModal({ assinatura, onFechar }: Props) {
  const { pagamentosDaAssinatura, cancelar } = useClube()
  const [pagamentoAberto, setPagamentoAberto] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const [mensagem, setMensagem] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // Modal filho aberto: o Escape fecha apenas o modal filho.
      if (pagamentoAberto || confirmarCancelamento) return
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar, pagamentoAberto, confirmarCancelamento])

  const hoje = hojeISO()
  const status = statusAssinatura(assinatura, hoje)
  const vigente = assinaturaVigente(assinatura, hoje)
  const pagamentos = pagamentosDaAssinatura(assinatura.id)
  const totalPago = pagamentos.reduce((soma, p) => soma + p.valor, 0)

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
              Histórico da assinatura
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {assinatura.cliente}
            </h2>
            <p className="mt-0.5 text-[13px] text-[#8A8171]">
              {PLANOS_ROTULO[assinatura.plano]} ·{' '}
              {formatarBRL(assinatura.valorMensal)}/mês
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
            <p className="text-[13px] leading-tight font-bold text-[#8A6A14]">
              {STATUS_ROTULO[status]}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#8A8171] uppercase">
              Status
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-[13px] leading-tight font-bold text-[#8A6A14]">
              {formatarDataLonga(assinatura.proximoVencimento)}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#8A8171] uppercase">
              Próximo venc.
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5 text-center">
            <p className="text-[13px] leading-tight font-bold text-[#8A6A14]">
              {formatarBRL(totalPago)}
            </p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-[#8A8171] uppercase">
              Total pago
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1">
          <dl className="divide-y divide-[#EFE7D3] text-sm">
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[#8A8171]">Situação</dt>
              <dd>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasse(status)}`}
                >
                  {STATUS_ROTULO[status]}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[#8A8171]">Cliente</dt>
              <dd className="font-medium text-[#1C1A15]">
                {assinatura.cliente}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[#8A8171]">Desde</dt>
              <dd className="font-medium text-[#1C1A15]">
                {formatarDataLonga(assinatura.dataAssinatura)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <dt className="text-[#8A8171]">Benefício</dt>
              <dd className="font-medium text-[#1C1A15]">
                {vigente ? '10% em produtos (PDV)' : 'Sem desconto (não vigente)'}
              </dd>
            </div>
            {assinatura.cancelada && (
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[#8A8171]">Cancelada em</dt>
                <dd className="font-medium text-red-700">
                  {assinatura.canceladaEm
                    ? formatarDataLonga(assinatura.canceladaEm)
                    : '—'}
                  {assinatura.motivoCancelamento &&
                    ` — ${assinatura.motivoCancelamento}`}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
            Pagamentos ({pagamentos.length})
          </p>
          {pagamentos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
              Nenhum pagamento registrado.
            </div>
          ) : (
            <ul className="divide-y divide-[#EFE7D3]">
              {pagamentos.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1C1A15]">
                      {formatarDataLonga(p.data)} ·{' '}
                      {FORMAS_ROTULO[p.formaPagamento]}
                    </p>
                    <p className="text-xs text-[#8A8171]">Renovação do ciclo</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[#8A6A14]">
                    {formatarBRL(p.valor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {mensagem && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-700">
            {mensagem}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Fechar
          </button>
          {!assinatura.cancelada && (
            <>
              <button
                type="button"
                onClick={() => setConfirmarCancelamento(true)}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Cancelar assinatura
              </button>
              <button
                type="button"
                onClick={() => setPagamentoAberto(true)}
                className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
              >
                + Registrar pagamento
              </button>
            </>
          )}
        </div>

        {pagamentoAberto && (
          <PagamentoAssinaturaModal
            assinatura={assinatura}
            aoPagar={() => setMensagem('Pagamento registrado e ciclo renovado.')}
            onFechar={() => setPagamentoAberto(false)}
          />
        )}
        {confirmarCancelamento && (
          <ConfirmarModal
            titulo="Cancelar assinatura"
            texto={`Cancelar a assinatura de ${assinatura.cliente} (${PLANOS_ROTULO[assinatura.plano]})? O histórico e os pagamentos permanecem registrados.`}
            rotuloConfirmar="Cancelar assinatura"
            perigo
            onConfirmar={() => {
              cancelar(assinatura.id)
              setConfirmarCancelamento(false)
            }}
            onFechar={() => setConfirmarCancelamento(false)}
          />
        )}
      </div>
    </div>
  )
}
