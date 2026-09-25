import { useEffect, useState } from 'react'
import {
  HORARIOS,
  PROFISSIONAIS,
  SERVICOS,
  hojeISO,
} from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'

type Props = {
  aberto: boolean
  dataInicial?: string
  horarioInicial?: string
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function NovoAgendamentoModal({
  aberto,
  dataInicial,
  horarioInicial,
  onFechar,
}: Props) {
  const { adicionar, agendamentos } = useAgenda()
  const [cliente, setCliente] = useState('')
  const [telefone, setTelefone] = useState('')
  const [servico, setServico] = useState(SERVICOS[0].nome)
  const [profissional, setProfissional] = useState(PROFISSIONAIS[0])
  const [data, setData] = useState(hojeISO())
  const [horario, setHorario] = useState('14:00')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (aberto) {
      setCliente('')
      setTelefone('')
      setServico(SERVICOS[0].nome)
      setProfissional(PROFISSIONAIS[0])
      setData(dataInicial ?? hojeISO())
      setHorario(horarioInicial ?? '14:00')
      setObservacao('')
      setErro('')
    }
  }, [aberto, dataInicial, horarioInicial])

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null

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
    const conflito = agendamentos.some(
      (ag) =>
        ag.data === data &&
        ag.horario === horario &&
        ag.profissional === profissional &&
        ag.status !== 'cancelado',
    )
    if (conflito) {
      setErro('Este profissional já tem agendamento neste horário.')
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
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
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
              {SERVICOS.map((s) => (
                <option key={s.nome} value={s.nome}>
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
              {PROFISSIONAIS.map((p) => (
                <option key={p} value={p}>
                  {p}
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
