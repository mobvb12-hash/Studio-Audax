import { useEffect, useState } from 'react'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import type { FormaPagamento } from '@/modules/caixa/types'
import { useClientes } from '@/modules/clientes/store'
import { useServicos } from '@/modules/servicos/store'
import { normalizarTexto } from '@/lib/moeda'

type Props = {
  agendamento: Agendamento
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function PagamentoModal({ agendamento, onFechar }: Props) {
  const { registrarPagamento, diaFechado } = useCaixa()
  const { mudarStatus } = useAgenda()
  const { servicos } = useServicos()
  const { clientes } = useClientes()

  const preco = servicos.find((s) => s.nome === agendamento.servico)?.preco ?? 0
  const clienteId = clientes.find(
    (c) => normalizarTexto(c.nome) === normalizarTexto(agendamento.cliente),
  )?.id

  const [valor, setValor] = useState(() => String(preco).replace('.', ','))
  const [desconto, setDesconto] = useState('0')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState(() =>
    diaFechado(agendamento.data)
      ? `O caixa de ${agendamento.data} está fechado. Reabra o caixa (com motivo) para registrar.`
      : '',
  )

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.'))
  const descontoNum = Number(desconto.replace(/\./g, '').replace(',', '.')) || 0
  const liquido = Number.isFinite(valorNum - descontoNum)
    ? Math.max(0, valorNum - descontoNum)
    : 0

  function salvar() {
    if (diaFechado(agendamento.data)) {
      setErro(
        `O caixa de ${agendamento.data} está fechado. Reabra o caixa para lançar.`,
      )
      return
    }
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setErro('Informe um valor válido (ex.: 70 ou 70,00).')
      return
    }
    if (!Number.isFinite(descontoNum) || descontoNum < 0) {
      setErro('Informe um desconto válido (ou 0).')
      return
    }
    if (descontoNum > valorNum) {
      setErro('O desconto não pode ser maior que o valor do serviço.')
      return
    }
    try {
      registrarPagamento({
        agendamentoId: agendamento.id,
        data: agendamento.data,
        hora: agendamento.horario,
        cliente: agendamento.cliente,
        clienteId,
        profissional: agendamento.profissional,
        servico: agendamento.servico,
        valor: valorNum,
        desconto: descontoNum,
        formaPagamento: forma,
        statusAgendamento: agendamento.status,
        observacao,
      })
      mudarStatus(agendamento.id, 'concluido')
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registrar.')
    }
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
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Registrar pagamento
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {agendamento.cliente}
            </h2>
            <p className="text-[13px] text-[#8A8171]">
              {agendamento.servico} · {agendamento.profissional} ·{' '}
              {agendamento.horario}
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
          <div>
            <label className={rotulo} htmlFor="pag-valor">
              Valor do serviço (R$) *
            </label>
            <input
              id="pag-valor"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 70,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="pag-desconto">
              Desconto (R$)
            </label>
            <input
              id="pag-desconto"
              className={campo}
              inputMode="decimal"
              placeholder="0"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="pag-forma">
              Forma de pagamento *
            </label>
            <select
              id="pag-forma"
              className={campo}
              value={forma}
              onChange={(e) => setForma(e.target.value as FormaPagamento)}
            >
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>
                  {FORMAS_ROTULO[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end">
            <span className={rotulo}>Total a receber</span>
            <div className="rounded-lg border border-[#E5DCC3] bg-[#F3ECDA] px-3 py-2 text-sm font-bold text-[#8A6A14]">
              R$ {liquido.toFixed(2).replace('.', ',')}
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="pag-obs">
              Observação
            </label>
            <input
              id="pag-obs"
              className={campo}
              placeholder="Opcional"
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
            Receber R$ {liquido.toFixed(2).replace('.', ',')}
          </button>
        </div>
      </div>
    </div>
  )
}
