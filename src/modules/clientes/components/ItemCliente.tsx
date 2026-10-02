import { iniciais } from '@/lib/apresentacao'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import type { ResumoAtendimentos } from '@/modules/clientes/regras'
import { useClube } from '@/modules/clube/store'
import {
  assinaturaVigente,
  statusAssinatura,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import type { Cliente } from '@/modules/clientes/types'
import { formatarBRL } from '@/lib/moeda'

/** Linha de um cliente na listagem (badges + ações). */
export default function ItemCliente({
  cliente,
  info,
  gasto,
  hoje,
  aoAgendar,
  aoHistorico,
  aoCrm,
  aoEditar,
  aoAlternar,
  aoExcluir,
}: {
  cliente: Cliente
  info?: ResumoAtendimentos
  gasto: number
  hoje: string
  aoAgendar: () => void
  aoHistorico: () => void
  aoCrm: () => void
  aoEditar: () => void
  aoAlternar: () => void
  /** Omitido quando o papel do usuário não pode excluir (RLS admin-only). */
  aoExcluir?: () => void
}) {
  const { assinaturaDoCliente } = useClube()
  const assinatura = assinaturaDoCliente(cliente.id)
  const vigente = assinatura ? assinaturaVigente(assinatura, hoje) : false

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3ECDA] text-sm font-bold text-[#8A6A14]">
        {iniciais(cliente.nome)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[#1C1A15]">
          {cliente.nome}{' '}
          {cliente.telefone && (
            <span className="ml-1 font-normal text-[#8A8171]">
              {cliente.telefone}
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-[#4A4436]">
          {cliente.email && `${cliente.email} · `}
          {cliente.observacao || 'Sem observações'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            cliente.ativo
              ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
              : 'border-slate-300 bg-slate-100 text-slate-700'
          }`}
        >
          {cliente.ativo ? 'Ativo' : 'Inativo'}
        </span>
        {assinatura && (
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              vigente
                ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                : 'border-amber-300 bg-amber-100 text-amber-900'
            }`}
          >
            {vigente
              ? 'Assinante'
              : `Assinatura ${STATUS_ROTULO[
                  statusAssinatura(assinatura, hoje)
                ].toLowerCase()}`}
          </span>
        )}
        <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436]">
          {info?.total ?? 0} atendimento(s)
        </span>
        {info?.ultimo && (
          <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-1 text-xs font-medium text-[#8A6A14]">
            Último: {formatarDataLonga(info.ultimo)}
          </span>
        )}
        <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-1 text-xs font-medium text-[#8A6A14]">
          {formatarBRL(gasto)}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
        <button
          type="button"
          onClick={aoAgendar}
          className="rounded-lg bg-[#8A6A14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6F550F]"
        >
          Agendar
        </button>
        <button
          type="button"
          onClick={aoHistorico}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
        >
          Histórico
        </button>
        <button
          type="button"
          onClick={aoCrm}
          aria-label={`CRM de ${cliente.nome}`}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
        >
          CRM
        </button>
        <button
          type="button"
          onClick={aoEditar}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={aoAlternar}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
          aria-label={`${cliente.ativo ? 'Inativar' : 'Reativar'} ${cliente.nome}`}
        >
          {cliente.ativo ? 'Inativar' : 'Reativar'}
        </button>
        {aoExcluir && (
          <button
            type="button"
            onClick={aoExcluir}
            className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
            aria-label={`Excluir ${cliente.nome}`}
          >
            Excluir
          </button>
        )}
      </div>
    </li>
  )
}
