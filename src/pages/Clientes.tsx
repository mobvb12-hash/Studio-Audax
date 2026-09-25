import { useMemo, useState } from 'react'
import ClienteDetalheModal from '@/components/ClienteDetalheModal'
import ClienteFormModal from '@/components/ClienteFormModal'
import ConfirmarModal from '@/components/ConfirmarModal'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import {
  filtrarClientes,
  gastoDoCliente,
  gastosPorCliente,
  normalizarBusca,
  resumoAtendimentos,
  resumoClientes,
  type FiltroStatusCliente,
} from '@/modules/clientes/regras'
import { useClientes } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import {
  assinaturaVigente,
  statusAssinatura,
  STATUS_ROTULO,
} from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import { formatarBRL } from '@/lib/moeda'

const FILTROS: { id: FiltroStatusCliente; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'inativos', rotulo: 'Inativos' },
]

function chipClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export default function Clientes() {
  const { clientes, remover, alternarAtivo } = useClientes()
  const { agendamentos, renomearCliente: renomearNaAgenda } = useAgenda()
  const { lancamentos, renomearCliente: renomearNoCaixa } = useCaixa()
  const { assinaturaDoCliente, renomearCliente: renomearNoClube } = useClube()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroStatusCliente>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [historicoDo, setHistoricoDo] = useState<Cliente | null>(null)
  const [excluindo, setExcluindo] = useState<Cliente | null>(null)
  const [agendarPara, setAgendarPara] = useState<Cliente | null>(null)

  const hoje = useMemo(() => hojeISO(), [])
  const atendimentos = useMemo(
    () => resumoAtendimentos(agendamentos),
    [agendamentos],
  )
  const gastos = useMemo(
    () => gastosPorCliente(lancamentos, clientes),
    [lancamentos, clientes],
  )
  const resumo = useMemo(() => resumoClientes(clientes), [clientes])
  const totalConcluidos = useMemo(() => {
    let soma = 0
    for (const r of atendimentos.values()) soma += r.total
    return soma
  }, [atendimentos])
  const filtrados = useMemo(
    () => filtrarClientes(clientes, busca, filtro),
    [clientes, busca, filtro],
  )

  const kpis = [
    { rotulo: 'Total de clientes', valor: String(resumo.total) },
    { rotulo: 'Clientes ativos', valor: String(resumo.ativos) },
    { rotulo: 'Clientes inativos', valor: String(resumo.inativos) },
    { rotulo: 'Atendimentos concluídos', valor: String(totalConcluidos) },
  ]

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(cliente: Cliente) {
    setEditando(cliente)
    setModalAberto(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Clientes
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {resumo.total} cliente(s) cadastrado(s) ·{' '}
            {filtrados.length === resumo.total
              ? 'todos'
              : `${filtrados.length} exibido(s)`}
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo cliente
        </button>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[640px] divide-x divide-[#E5DCC3]">
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
        <div className="w-full sm:w-72">
          <label className="sr-only" htmlFor="cli-busca">
            Buscar cliente
          </label>
          <input
            id="cli-busca"
            className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          {clientes.length === 0
            ? 'Nenhum cliente cadastrado. Clique em “Novo cliente” para começar.'
            : busca.trim()
              ? 'Nenhum cliente encontrado para esta busca.'
              : filtro === 'ativos'
                ? 'Nenhum cliente ativo no momento.'
                : 'Nenhum cliente inativo no momento.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtrados.map((cliente) => {
            const info = atendimentos.get(normalizarBusca(cliente.nome))
            const gasto = gastoDoCliente(gastos, cliente)
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
                    onClick={() => setAgendarPara(cliente)}
                    className="rounded-lg bg-[#8A6A14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6F550F]"
                  >
                    Agendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoricoDo(cliente)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Histórico
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirEdicao(cliente)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => alternarAtivo(cliente.id)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                    aria-label={`${cliente.ativo ? 'Inativar' : 'Reativar'} ${cliente.nome}`}
                  >
                    {cliente.ativo ? 'Inativar' : 'Reativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcluindo(cliente)}
                    className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                    aria-label={`Excluir ${cliente.nome}`}
                  >
                    Excluir
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {modalAberto && (
        <ClienteFormModal
          cliente={editando}
          aoRenomear={(antigo, novo) => {
            renomearNaAgenda(antigo, novo)
            renomearNoCaixa(antigo, novo)
            renomearNoClube(antigo, novo)
          }}
          onFechar={() => setModalAberto(false)}
        />
      )}

      {historicoDo && (
        <ClienteDetalheModal
          cliente={historicoDo}
          onFechar={() => setHistoricoDo(null)}
        />
      )}

      {agendarPara && (
        <NovoAgendamentoModal
          clienteInicial={agendarPara.nome}
          onFechar={() => setAgendarPara(null)}
        />
      )}

      {excluindo && (
        <ConfirmarModal
          titulo="Excluir cliente"
          texto={`Excluir “${excluindo.nome}”? Os agendamentos e recebimentos já feitos do cliente são preservados no histórico.`}
          rotuloConfirmar="Sim, excluir"
          perigo
          onConfirmar={() => {
            remover(excluindo.id)
            setExcluindo(null)
          }}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}
