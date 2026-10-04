import { useContext, useMemo, useState } from 'react'
import { chipClasse } from '@/lib/apresentacao'
import ClienteDetalheModal from '@/components/ClienteDetalheModal'
import ClienteFormModal from '@/components/ClienteFormModal'
import ConfirmarModal from '@/components/ConfirmarModal'
import CrmClienteModal from '@/components/CrmClienteModal'
import { CelulaKpi } from '@/components/PainelUi'
import ItemCliente from '@/modules/clientes/components/ItemCliente'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useCrm } from '@/modules/crm/store'
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
import { useClube } from '@/modules/clube/store'
import { useEsperaOpcional } from '@/modules/espera/store'
import { useWhats } from '@/modules/whatsapp/store'
import { ContextoAuth } from '@/modules/auth/contexto'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'

const FILTROS: { id: FiltroStatusCliente; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'ativos', rotulo: 'Ativos' },
  { id: 'inativos', rotulo: 'Inativos' },
]

export default function Clientes() {
  const { clientes, remover, alternarAtivo } = useClientes()
  const { agendamentos, renomearCliente: renomearNaAgenda } = useAgenda()
  const { lancamentos, renomearCliente: renomearNoCaixa } = useCaixa()
  const { assinaturaDoCliente, renomearCliente: renomearNoClube } = useClube()
  const { renomearCliente: renomearNaEspera, pedidos } = useEsperaOpcional()
  const { interacoesDoCliente } = useCrm()
  const { mensagensDoCliente, renomearCliente: renomearNoWhats } = useWhats()
  // Excluir cliente = admin/dono no RLS (clientes_delete). Sem sessão de auth
  // (testes/render isolado) não há papel a consultar — mantém o comportamento.
  const auth = useContext(ContextoAuth)
  const { pode } = useAuthPermissao()
  const podeExcluirCliente = auth === null || pode('clientes:excluir')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroStatusCliente>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [historicoDo, setHistoricoDo] = useState<Cliente | null>(null)
  const [crmDo, setCrmDo] = useState<Cliente | null>(null)
  const [excluindo, setExcluindo] = useState<Cliente | null>(null)
  const [agendarPara, setAgendarPara] = useState<Cliente | null>(null)
  const [bloqueioExclusao, setBloqueioExclusao] = useState<{
    cliente: Cliente
    interacoes: number
    mensagens: number
    assinatura: boolean
    pedidos: number
  } | null>(null)

  // Recalculado a cada render: uma sessão que cruza a meia-noite não
  // pode continuar exibindo o "hoje" do dia anterior.
  const hoje = hojeISO()
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

  /**
   * Exclusão segura: cliente com interações CRM, conversas de WhatsApp,
   * assinatura ativa do Audax Club ou pedidos na fila não pode ser
   * removido (seria órfão nesses módulos — ids referenciados sumiriam).
   */
  function tentarExcluir(cliente: Cliente) {
    const interacoes = interacoesDoCliente(cliente.id).length
    const mensagens = mensagensDoCliente(cliente.id).length
    const assinatura = Boolean(assinaturaDoCliente(cliente.id))
    const pedidosVinculados = pedidos.filter(
      (p) => p.clienteId === cliente.id,
    ).length
    if (
      interacoes > 0 ||
      mensagens > 0 ||
      assinatura ||
      pedidosVinculados > 0
    ) {
      setBloqueioExclusao({
        cliente,
        interacoes,
        mensagens,
        assinatura,
        pedidos: pedidosVinculados,
      })
      return
    }
    setExcluindo(cliente)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            Clientes
          </h1>
          <p className="mt-2 text-[13px] text-[#3A352C]">
            {resumo.total} cliente(s) cadastrado(s) ·{' '}
            {filtrados.length === resumo.total
              ? 'todos'
              : `${filtrados.length} exibido(s)`}
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="shrink-0 rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
        >
          + Novo cliente
        </button>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[640px] divide-x divide-[#E5DCC3]">
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

      {bloqueioExclusao && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="text-sm text-red-800">
            <p className="font-bold">
              Não foi possível excluir “{bloqueioExclusao.cliente.nome}”.
            </p>
            <p className="mt-1">
              O cliente possui{' '}
              {[
                bloqueioExclusao.interacoes > 0 &&
                  `${bloqueioExclusao.interacoes} interação(ões) de CRM`,
                bloqueioExclusao.mensagens > 0 &&
                  `${bloqueioExclusao.mensagens} mensagem(ns) de WhatsApp`,
                bloqueioExclusao.assinatura &&
                  'assinatura ativa do Audax Club',
                bloqueioExclusao.pedidos > 0 &&
                  `${bloqueioExclusao.pedidos} pedido(s) na fila de espera`,
              ]
                .filter(Boolean)
                .join(', ')}{' '}
              vinculado(s) ao cadastro. Excluir agora deixaria esses
              registros sem cliente. Remova ou cancele esses vínculos
              antes de excluir, ou mantenha o cadastro.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBloqueioExclusao(null)}
            className="shrink-0 self-start rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 sm:self-auto"
          >
            Entendi
          </button>
        </div>
      )}

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
          {filtrados.map((cliente) => (
            <ItemCliente
              key={cliente.id}
              cliente={cliente}
              info={atendimentos.get(normalizarBusca(cliente.nome))}
              gasto={gastoDoCliente(gastos, cliente)}
              hoje={hoje}
              aoAgendar={() => setAgendarPara(cliente)}
              aoHistorico={() => setHistoricoDo(cliente)}
              aoCrm={() => setCrmDo(cliente)}
              aoEditar={() => abrirEdicao(cliente)}
              aoAlternar={() => alternarAtivo(cliente.id)}
              aoExcluir={
                podeExcluirCliente ? () => tentarExcluir(cliente) : undefined
              }
            />
          ))}
        </ul>
      )}

      {modalAberto && (
        <ClienteFormModal
          cliente={editando}
          aoRenomear={(antigo, novo) => {
            renomearNaAgenda(antigo, novo)
            renomearNoCaixa(antigo, novo)
            renomearNoClube(antigo, novo)
            renomearNaEspera(antigo, novo)
            renomearNoWhats(antigo, novo)
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

      {crmDo && (
        <CrmClienteModal
          cliente={crmDo}
          onFechar={() => setCrmDo(null)}
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
