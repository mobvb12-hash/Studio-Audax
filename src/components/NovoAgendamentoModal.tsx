import { useEffect, useState } from 'react'
import { HORARIOS, hojeISO } from '@/modules/agenda/catalogo'
import { verificarConflito } from '@/modules/agenda/regras'
import { useAgenda } from '@/modules/agenda/store'
import { useClientes } from '@/modules/clientes/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'
import { normalizarTexto } from '@/lib/moeda'

type Props = {
  /** Pré-preenche o cliente (ação "Agendar" vinda da página Clientes) */
  clienteInicial?: string
  dataInicial?: string
  horarioInicial?: string
  profissionalInicial?: string
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function NovoAgendamentoModal({
  clienteInicial,
  dataInicial,
  horarioInicial,
  profissionalInicial,
  onFechar,
}: Props) {
  const { adicionar, agendamentos } = useAgenda()
  const { clientes, porNome } = useClientes()
  const { servicos } = useServicos()
  const { profissionais } = useProfissionais()
  const [cliente, setCliente] = useState(clienteInicial ?? '')
  const [telefone, setTelefone] = useState(
    () => (clienteInicial ? porNome(clienteInicial)?.telefone ?? '' : ''),
  )
  const [servico, setServico] = useState(() => servicos[0]?.nome ?? '')
  const [profissional, setProfissional] = useState(
    () => profissionalInicial ?? profissionais[0]?.nome ?? '',
  )
  const [data, setData] = useState(() => dataInicial ?? hojeISO())
  const [horario, setHorario] = useState(() => horarioInicial ?? '14:00')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    if (cliente.trim().length < 2) {
      setErro('Informe o nome do cliente.')
      return
    }
    if (!data) {
      setErro('Escolha a data.')
      return
    }
    if (!horario) {
      setErro('Escolha o horário.')
      return
    }
    if (!servico) {
      setErro('Cadastre um serviço no módulo Serviços antes de agendar.')
      return
    }
    if (!profissional) {
      setErro('Cadastre um profissional no módulo Profissionais antes de agendar.')
      return
    }
    const duracaoDo = (nome: string) =>
      servicos.find((s) => s.nome === nome)?.duracaoMin ?? 30
    const conflito = verificarConflito(
      agendamentos,
      {
        data,
        horario,
        profissional,
        duracaoMin: duracaoDo(servico),
      },
      duracaoDo,
    )
    if (conflito.conflito) {
      setErro(
        `Conflito: ${conflito.agendamento.cliente} ocupa ${conflito.agendamento.horario}–${conflito.fimExistente} com ${profissional} (duração de ${duracaoDo(conflito.agendamento.servico)} min).`,
      )
      return
    }
    const clienteChave = normalizarTexto(cliente)
    const jaAgendado = agendamentos.find(
      (ag) =>
        ag.data === data &&
        ag.horario === horario &&
        normalizarTexto(ag.cliente) === clienteChave &&
        ag.status !== 'cancelado' &&
        ag.status !== 'nao_compareceu',
    )
    if (jaAgendado) {
      setErro(
        `Cliente já tem agendamento neste horário com ${jaAgendado.profissional} (${jaAgendado.servico}).`,
      )
      return
    }
    adicionar({
      cliente,
      telefone,
      servico,
      profissional,
      data,
      horario,
      observacao,
    })
    onFechar()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">
              Novo agendamento
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Salvo neste navegador (localStorage) até o backend chegar.
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ag-cliente">
              Cliente *
            </label>
            <input
              id="ag-cliente"
              className={campo}
              placeholder="Ex.: Lucas Mendes"
              list="ag-lista-clientes"
              value={cliente}
              onChange={(e) => {
                const valor = e.target.value
                setCliente(valor)
                const existente = porNome(valor)
                if (existente?.telefone) setTelefone(existente.telefone)
              }}
            />
            <datalist id="ag-lista-clientes">
              {clientes
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.telefone}
                  </option>
                ))}
            </datalist>
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-tel">
              Telefone / WhatsApp
            </label>
            <input
              id="ag-tel"
              className={campo}
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-servico">
              Serviço
            </label>
            <select
              id="ag-servico"
              className={campo}
              value={servico}
              onChange={(e) => setServico(e.target.value)}
            >
              {servicos.length === 0 && <option value="">Sem serviços</option>}
              {servicos.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome} — R$ {s.preco}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-prof">
              Profissional
            </label>
            <select
              id="ag-prof"
              className={campo}
              value={profissional}
              onChange={(e) => setProfissional(e.target.value)}
            >
              {profissionais.length === 0 && (
                <option value="">Sem profissionais</option>
              )}
              {profissionais.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="ag-data">
              Data *
            </label>
            <input
              id="ag-data"
              type="date"
              className={campo}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ag-hora">
              Horário *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {HORARIOS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorario(h)}
                  className={`rounded-md border px-2.5 py-1.5 text-[13px] font-medium ${
                    horario === h
                      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
                      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ag-obs">
              Observação
            </label>
            <textarea
              id="ag-obs"
              className={`${campo} min-h-[64px] resize-y`}
              placeholder="Ex.: primeira vez, prefere tesoura..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Salvar agendamento
          </button>
        </div>
      </div>
    </div>
  )
}
