import { useMemo, useState } from 'react'
import CrmClienteModal from '@/components/CrmClienteModal'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useClientes } from '@/modules/clientes/store'
import { useClube } from '@/modules/clube/store'
import { assinaturaVigente } from '@/modules/clube/regras'
import {
  filtrarPerfis,
  montarPerfis,
  resumoSegmentos,
  type FiltroSegmento,
} from '@/modules/crm/regras'
import { useCrm } from '@/modules/crm/store'
import {
  SEGMENTOS_ORDEM,
  SEGMENTOS_ROTULO,
} from '@/modules/crm/types'
import type { Cliente } from '@/modules/clientes/types'
import { formatarBRL } from '@/lib/moeda'

function chipClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

function corSegmento(segmento: string): string {
  switch (segmento) {
    case 'novo':
      return 'border-sky-300 bg-sky-50 text-sky-700'
    case 'ativo':
      return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
    case 'recorrente':
      return 'border-amber-300 bg-amber-100 text-amber-900'
    case 'sem_retorno':
      return 'border-orange-300 bg-orange-50 text-orange-800'
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700'
  }
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export default function Crm() {
  const { clientes } = useClientes()
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  const { assinaturaDoCliente } = useClube()
  const { interacoes } = useCrm()
  const [busca, setBusca] = useState('')
  const [segmento, setSegmento] = useState<FiltroSegmento>('todos')
  const [detalheDo, setDetalheDo] = useState<Cliente | null>(null)
  const [agendarPara, setAgendarPara] = useState<Cliente | null>(null)

  const perfis = useMemo(
    () => montarPerfis(clientes, agendamentos, lancamentos),
    [clientes, agendamentos, lancamentos],
  )
  const filtrados = useMemo(
    () => filtrarPerfis(perfis, busca, segmento),
    [perfis, busca, segmento],
  )
  const resumo = useMemo(() => resumoSegmentos(perfis), [perfis])
  const hoje = useMemo(() => hojeISO(), [])

  const kpis = SEGMENTOS_ORDEM.map((seg) => ({
    rotulo: SEGMENTOS_ROTULO[seg],
    valor: String(resumo[seg]),
  }))

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            CRM
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {perfis.length} cliente(s) analisado(s) ·{' '}
            {filtrados.length === perfis.length
              ? 'todos'
              : `${filtrados.length} exibido(s)`}{' '}
            · {interacoes.length} interação(ões) registrada(s)
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[640px] divide-x divide-[#E5DCC3]">
          {kpis.map((kpi) => (
            <div key={kpi.rotulo} className="min-w-[120px] flex-1 px-4 py-4">
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
          <button
            type="button"
            onClick={() => setSegmento('todos')}
            className={chipClasse(segmento === 'todos')}
          >
            Todos
          </button>
          {SEGMENTOS_ORDEM.map((seg) => (
            <button
              key={seg}
              type="button"
              onClick={() => setSegmento(seg)}
              className={chipClasse(segmento === seg)}
            >
              {SEGMENTOS_ROTULO[seg]}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-72">
          <label className="sr-only" htmlFor="crm-busca">
            Buscar cliente
          </label>
          <input
            id="crm-busca"
            className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          {clientes.length === 0
            ? 'Nenhum cliente cadastrado. Cadastre em Clientes para começar o CRM.'
            : busca.trim()
              ? 'Nenhum cliente encontrado para esta busca.'
              : 'Nenhum cliente neste segmento.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtrados.map((perfil) => {
            const { cliente } = perfil
            const assinatura = assinaturaDoCliente(cliente.id)
            const vigente = assinatura
              ? assinaturaVigente(assinatura, hoje)
              : false
            return (
              <li
                key={cliente.id}
                className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
              >
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
                    {perfil.ultimoAtendimento
                      ? `Último: ${formatarDataLonga(perfil.ultimoAtendimento)} · `
                      : 'Nunca atendido · '}
                    {perfil.frequenciaDias
                      ? `frequência ~${perfil.frequenciaDias} dia(s)`
                      : 'sem frequência definida'}
                    {perfil.profissionalPreferido
                      ? ` · prefere ${perfil.profissionalPreferido}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${corSegmento(
                      perfil.segmento,
                    )}`}
                  >
                    {SEGMENTOS_ROTULO[perfil.segmento]}
                  </span>
                  {assinatura && (
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        vigente
                          ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                          : 'border-amber-300 bg-amber-100 text-amber-900'
                      }`}
                    >
                      {vigente ? 'Assinante' : 'Assinatura pendente'}
                    </span>
                  )}
                  <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436]">
                    {perfil.totalAtendimentos} atendimento(s)
                  </span>
                  <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-1 text-xs font-medium text-[#8A6A14]">
                    {formatarBRL(perfil.totalGasto)}
                  </span>
                  {perfil.servicos.slice(0, 2).map((s) => (
                    <span
                      key={s.nome}
                      className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs text-[#4A4436]"
                    >
                      {s.nome} ({s.qtd})
                    </span>
                  ))}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAgendarPara(cliente)}
                    className="rounded-lg bg-[#8A6A14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6F550F]"
                  >
                    Agendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetalheDo(cliente)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Detalhe
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {detalheDo && (
        <CrmClienteModal
          cliente={detalheDo}
          onFechar={() => setDetalheDo(null)}
        />
      )}

      {agendarPara && (
        <NovoAgendamentoModal
          clienteInicial={agendarPara.nome}
          onFechar={() => setAgendarPara(null)}
        />
      )}
    </div>
  )
}
