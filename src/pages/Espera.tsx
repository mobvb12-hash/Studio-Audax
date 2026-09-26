import { useMemo, useState, type FormEvent } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import { formatarDataCurta } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useClientes } from '@/modules/clientes/store'
import {
  comPosicao,
  encaixesDisponiveis,
  filtrarPosicoes,
} from '@/modules/espera/regras'
import { useEspera } from '@/modules/espera/store'
import {
  PERIODOS_ESPERA,
  PERIODOS_ESPERA_ROTULO,
  STATUS_ESPERA_ORDEM,
  STATUS_ESPERA_ROTULO,
  type NovoPedidoInput,
  type PedidoEspera,
  type PeriodoEspera,
  type StatusEspera,
} from '@/modules/espera/types'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'

const CLASSE_ENTRADA =
  'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]'

function chipClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

function corStatus(status: StatusEspera): string {
  if (status === 'atendido')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'cancelado')
    return 'border-red-300 bg-red-50 text-red-700'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

const ROTULOS_FILTRO: Record<StatusEspera | 'todos', string> = {
  todos: 'Todos',
  aguardando: 'Aguardando',
  atendido: 'Atendidos',
  cancelado: 'Cancelados',
}

/** Lista de Espera — fila separada da Agenda, com encaixes compatíveis. */
export default function Espera() {
  const { clientes } = useClientes()
  const { profissionais } = useProfissionais()
  const { servicos } = useServicos()
  const { expediente, bloqueios, agendamentos } = useAgenda()
  const { pedidos, adicionar, editar, mudarStatus, remover } = useEspera()

  const [clienteId, setClienteId] = useState('')
  const [servico, setServico] = useState('')
  const [profissional, setProfissional] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoEspera>('qualquer')
  const [dataPreferida, setDataPreferida] = useState('')
  const [observacao, setObservacao] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<StatusEspera | 'todos'>('todos')
  const [removendo, setRemovendo] = useState<PedidoEspera | null>(null)
  const [agendar, setAgendar] = useState<{
    cliente: string
    data: string
    horario: string
    profissional: string
  } | null>(null)

  const profissionaisAtivos = useMemo(
    () => profissionais.filter((p) => p.ativo).map((p) => p.nome),
    [profissionais],
  )
  const naFila = useMemo(
    () => pedidos.filter((p) => p.status === 'aguardando').length,
    [pedidos],
  )
  const exibidos = useMemo(
    () => filtrarPosicoes(comPosicao(pedidos), busca, status),
    [pedidos, busca, status],
  )

  const opcoesClientes = clientes.filter(
    (c) => c.ativo || c.id === clienteId,
  )
  const opcoesServicos = servicos.filter((s) => s.ativo || s.nome === servico)
  const opcoesProfissionais = profissionais.filter(
    (p) => p.ativo || p.nome === profissional,
  )

  function limpar() {
    setClienteId('')
    setServico('')
    setProfissional('')
    setPeriodo('qualquer')
    setDataPreferida('')
    setObservacao('')
  }

  function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const cliente = clientes.find((c) => c.id === clienteId)
    if (!cliente) {
      setErro('Selecione o cliente.')
      return
    }
    const input: NovoPedidoInput = {
      clienteId,
      cliente: cliente.nome,
      telefone: cliente.telefone,
      servico,
      profissional,
      periodo,
      dataPreferida,
      observacao,
    }
    try {
      if (editandoId) {
        editar(editandoId, input)
        setEditandoId(null)
      } else {
        adicionar(input)
      }
      limpar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.')
    }
  }

  function iniciarEdicao(pedido: PedidoEspera) {
    setErro('')
    setEditandoId(pedido.id)
    setClienteId(pedido.clienteId)
    setServico(pedido.servico)
    setProfissional(pedido.profissional)
    setPeriodo(pedido.periodo)
    setDataPreferida(pedido.dataPreferida)
    setObservacao(pedido.observacao)
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setErro('')
    limpar()
  }

  function encerrar(pedido: PedidoEspera, novo: 'atendido' | 'cancelado') {
    setErro('')
    try {
      mudarStatus(pedido.id, novo)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.')
    }
  }

  const filtrosStatus: (StatusEspera | 'todos')[] = ['todos', ...STATUS_ESPERA_ORDEM]

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Fila de Espera
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {naFila} aguardando · {pedidos.length} pedido(s) no total · a fila
            é separada da Agenda e não envia mensagens sozinha
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto border-y border-[#E5DCC3]">
        <div className="flex min-w-[480px] divide-x divide-[#E5DCC3]">
          <div className="min-w-[120px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Na fila
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
              {naFila}
            </p>
          </div>
          <div className="min-w-[120px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Atendimentos
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
              {pedidos.filter((p) => p.status === 'atendido').length}
            </p>
          </div>
          <div className="min-w-[120px] flex-1 px-4 py-4">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
              Cancelamentos
            </p>
            <p className="mt-1.5 text-[22px] leading-none font-bold text-[#8A6A14]">
              {pedidos.filter((p) => p.status === 'cancelado').length}
            </p>
          </div>
        </div>
      </div>

      {/* Formulário — cadastro e edição */}
      <form
        onSubmit={enviar}
        className="mt-5 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4"
      >
        <h2 className="text-sm font-bold text-[#1C1A15]">
          {editandoId ? 'Editar pedido da fila' : 'Adicionar à fila'}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label
              htmlFor="espera-cliente"
              className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase"
            >
              Cliente
            </label>
            <select
              id="espera-cliente"
              className={`mt-1 w-full ${CLASSE_ENTRADA}`}
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Selecione o cliente...</option>
              {opcoesClientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="espera-servico"
              className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase"
            >
              Serviço desejado
            </label>
            <select
              id="espera-servico"
              className={`mt-1 w-full ${CLASSE_ENTRADA}`}
              value={servico}
              onChange={(e) => setServico(e.target.value)}
            >
              <option value="">Selecione o serviço...</option>
              {opcoesServicos.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="espera-profissional"
              className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase"
            >
              Profissional
            </label>
            <select
              id="espera-profissional"
              className={`mt-1 w-full ${CLASSE_ENTRADA}`}
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
            >
              <option value="">Qualquer</option>
              {opcoesProfissionais.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Período preferido
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {PERIODOS_ESPERA.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodo(p)}
                  className={chipClasse(periodo === p)}
                >
                  {PERIODOS_ESPERA_ROTULO[p]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label
              htmlFor="espera-data"
              className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase"
            >
              Data preferida (opcional)
            </label>
            <input
              id="espera-data"
              type="date"
              className={`mt-1 w-full ${CLASSE_ENTRADA}`}
              value={dataPreferida}
              onChange={(e) => setDataPreferida(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="espera-obs"
              className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase"
            >
              Observação (opcional)
            </label>
            <input
              id="espera-obs"
              className={`mt-1 w-full ${CLASSE_ENTRADA}`}
              placeholder="Ex.: prefere o Audax"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            {editandoId ? 'Salvar alterações' : 'Adicionar à fila'}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={cancelarEdicao}
              className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
            >
              Cancelar edição
            </button>
          )}
        </div>
        {erro && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}
      </form>

      {/* Filtros */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filtrosStatus.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={chipClasse(status === s)}
            >
              {ROTULOS_FILTRO[s]}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-72">
          <label className="sr-only" htmlFor="espera-busca">
            Buscar na fila
          </label>
          <input
            id="espera-busca"
            className={CLASSE_ENTRADA}
            placeholder="Buscar por nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {exibidos.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          {pedidos.length === 0
            ? 'Ninguém na fila de espera. Adicione clientes pelo formulário acima.'
            : 'Nenhum pedido com este filtro.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {exibidos.map(({ pedido, posicao }) => {
            const janelas =
              pedido.status === 'aguardando'
                ? encaixesDisponiveis({
                    pedido,
                    expediente,
                    bloqueios,
                    agendamentos,
                    profissionais: profissionaisAtivos,
                  })
                : []
            return (
              <li
                key={pedido.id}
                className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3ECDA] text-sm font-bold text-[#8A6A14]">
                    {posicao === null ? '—' : `#${posicao}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#1C1A15]">
                      {pedido.cliente}{' '}
                      {pedido.telefone && (
                        <span className="ml-1 font-normal text-[#8A8171]">
                          {pedido.telefone}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] text-[#4A4436]">
                      {pedido.servico} ·{' '}
                      {pedido.profissional || 'qualquer profissional'} ·{' '}
                      {PERIODOS_ESPERA_ROTULO[pedido.periodo]}
                      {pedido.dataPreferida
                        ? ` · ${formatarDataCurta(pedido.dataPreferida)}`
                        : ''}
                    </p>
                    {pedido.observacao && (
                      <p className="mt-0.5 text-[13px] text-[#8A8171]">
                        {pedido.observacao}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${corStatus(
                      pedido.status,
                    )}`}
                  >
                    {STATUS_ESPERA_ROTULO[pedido.status]}
                  </span>
                </div>

                {janelas.length > 0 && (
                  <div className="mt-3 border-t border-[#E9DDC0] pt-3">
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
                      Horários compatíveis (livres na agenda)
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {janelas.slice(0, 3).map((j) => (
                        <button
                          key={`${j.data}-${j.horario}-${j.profissional}`}
                          type="button"
                          onClick={() =>
                            setAgendar({
                              cliente: pedido.cliente,
                              data: j.data,
                              horario: j.horario,
                              profissional: j.profissional,
                            })
                          }
                          className="rounded-lg border border-[#8A6A14] bg-white px-2.5 py-1 text-xs font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
                        >
                          {formatarDataCurta(j.data)} {j.horario} ·{' '}
                          {j.profissional}
                        </button>
                      ))}
                      {janelas.length > 3 && (
                        <span className="text-[11px] text-[#8A8171]">
                          + {janelas.length - 3} horário(s)
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pedido.status === 'aguardando' && (
                    <>
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(pedido)}
                        className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => encerrar(pedido, 'atendido')}
                        className="rounded-lg border border-[#BFE0B2] bg-[#E9F5E4] px-2.5 py-1 text-xs font-medium text-[#3F6B33] hover:bg-[#DCEED4]"
                      >
                        Atendido
                      </button>
                      <button
                        type="button"
                        onClick={() => encerrar(pedido, 'cancelado')}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Cancelar pedido
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setRemovendo(pedido)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:border-red-300 hover:text-red-700"
                  >
                    Remover
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {removendo && (
        <ConfirmarModal
          titulo="Remover da fila"
          texto={`Remover o pedido de ${removendo.cliente} da lista de espera?`}
          rotuloConfirmar="Remover da fila"
          perigo
          onConfirmar={() => {
            remover(removendo.id)
            setRemovendo(null)
          }}
          onFechar={() => setRemovendo(null)}
        />
      )}

      {agendar && (
        <NovoAgendamentoModal
          clienteInicial={agendar.cliente}
          dataInicial={agendar.data}
          horarioInicial={agendar.horario}
          profissionalInicial={agendar.profissional}
          onFechar={() => setAgendar(null)}
        />
      )}
    </div>
  )
}
