import { formatarDataLonga } from '@/modules/agenda/catalogo'
import type { PerfilCliente } from '@/modules/crm/regras'
import type { Agendamento } from '@/modules/agenda/types'
import { formatarBRL } from '@/lib/moeda'

/** Resumo do comportamento do cliente (KPIs, serviços e produtos usados). */
export default function ResumoComportamento({
  perfil,
  futuro,
}: {
  perfil: PerfilCliente
  futuro: Agendamento | null
}) {
  return (
    <>
      {/* Resumo do comportamento (derivado de agenda/caixa — sem cópia de dados) */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Último atendimento
          </p>
          <p className="mt-1 text-sm font-bold text-[#121110]">
            {perfil.ultimoAtendimento
              ? formatarDataLonga(perfil.ultimoAtendimento)
              : 'Nunca'}
          </p>
        </div>
        <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Próxima visita
          </p>
          <p className="mt-1 text-sm font-bold text-[#121110]">
            {futuro
              ? `${formatarDataLonga(futuro.data)} · ${futuro.horario}`
              : 'Sem agendamento'}
          </p>
        </div>
        <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Frequência
          </p>
          <p className="mt-1 text-sm font-bold text-[#121110]">
            {perfil.frequenciaDias
              ? `a cada ${perfil.frequenciaDias} dia(s)`
              : 'Sem histórico suficiente'}
          </p>
        </div>
        <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Total gasto
          </p>
          <p className="mt-1 text-sm font-bold text-[#121110]">
            {formatarBRL(perfil.totalGasto)}
          </p>
        </div>
        <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Atendimentos
          </p>
          <p className="mt-1 text-sm font-bold text-[#121110]">
            {perfil.totalAtendimentos}
            {perfil.profissionalPreferido
              ? ` · ${perfil.profissionalPreferido}`
              : ''}
          </p>
        </div>
      </div>

      {perfil.servicos.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Serviços usados:
          </span>
          {perfil.servicos.map((s) => (
            <span
              key={s.nome}
              className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-0.5 text-xs font-medium text-[#8A6A14]"
            >
              {s.nome} ({s.qtd})
            </span>
          ))}
        </div>
      )}

      {perfil.produtos.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-[#7C7469] uppercase">
            Produtos comprados:
          </span>
          {perfil.produtos.map((p) => (
            <span
              key={p.nome}
              className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs text-[#3A352C]"
            >
              {p.nome} ({p.qtd})
            </span>
          ))}
        </div>
      )}
    </>
  )
}
