import { useEffect, useMemo, useState } from 'react'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useClientes } from '@/modules/clientes/store'
import { useServicos } from '@/modules/servicos/store'

type Props = {
  agendamento: Agendamento
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function EditarAgendamentoModal({
  agendamento,
  onFechar,
}: Props) {
  const { editar } = useAgenda()
  const { clientes, porNome } = useClientes()
  const { servicos } = useServicos()
  const [cliente, setCliente] = useState(agendamento.cliente)
  const [telefone, setTelefone] = useState(agendamento.telefone)
  const [servico, setServico] = useState(agendamento.servico)
  const [observacao, setObservacao] = useState(agendamento.observacao)
  const [erro, setErro] = useState('')

  // Novos serviços precisam estar ativos; o serviço atual do agendamento
  // permanece na lista mesmo inativo/fora do catálogo (histórico preservado)
  const servicosAtivos = useMemo(
    () => servicos.filter((s) => s.ativo),
    [servicos],
  )
  const atualNoSelect = useMemo(
    () => servicosAtivos.some((s) => s.nome === agendamento.servico),
    [servicosAtivos, agendamento.servico],
  )
  const rotuloAtual = useMemo(() => {
    const completo = servicos.find((s) => s.nome === agendamento.servico)
    if (!completo) return `${agendamento.servico} (fora do catálogo)`
    if (completo.ativo) return agendamento.servico
    return `${agendamento.servico} (inativo)`
  }, [servicos, agendamento.servico])

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
    if (!servico) {
      setErro('Cadastre um serviço no módulo Serviços antes de editar.')
      return
    }
    const servicoSel = servicos.find((s) => s.nome === servico)
    const mudouDeServico = servico !== agendamento.servico
    if (mudouDeServico) {
      if (!servicoSel) {
        setErro('Cadastre um serviço no módulo Serviços antes de editar.')
        return
      }
      if (!servicoSel.ativo) {
        setErro('Serviço inativo — escolha outro serviço.')
        return
      }
    }
    try {
      editar(agendamento.id, {
        cliente,
        telefone,
        servico,
        observacao,
        duracaoMin: servicoSel?.duracaoMin,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
      return
    }
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
              Editar agendamento
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              {agendamento.cliente} · {formatarDataLonga(agendamento.data)} às{' '}
              {agendamento.horario} com {agendamento.profissional}
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
            <label className={rotulo} htmlFor="ed-cliente">
              Cliente *
            </label>
            <input
              id="ed-cliente"
              className={campo}
              placeholder="Ex.: Lucas Mendes"
              list="ed-lista-clientes"
              value={cliente}
              onChange={(e) => {
                const valor = e.target.value
                setCliente(valor)
                const existente = porNome(valor)
                if (existente?.telefone) setTelefone(existente.telefone)
              }}
            />
            <datalist id="ed-lista-clientes">
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
            <label className={rotulo} htmlFor="ed-tel">
              Telefone / WhatsApp
            </label>
            <input
              id="ed-tel"
              className={campo}
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="ed-servico">
              Serviço
            </label>
            <select
              id="ed-servico"
              className={campo}
              value={servico}
              onChange={(e) => setServico(e.target.value)}
            >
              {!atualNoSelect && (
                <option value={agendamento.servico}>{rotuloAtual}</option>
              )}
              {servicosAtivos.length === 0 && atualNoSelect && (
                <option value="">Sem serviços ativos</option>
              )}
              {servicosAtivos.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome} — R$ {s.preco}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="ed-obs">
              Observação
            </label>
            <textarea
              id="ed-obs"
              className={`${campo} min-h-[64px] resize-y`}
              placeholder="Ex.: primeira vez, prefere tesoura..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        <p className="mt-3 text-[12px] text-[#8A8171]">
          Data, horário e profissional não mudam aqui — use{' '}
          <strong>Remarcar</strong> para mover o agendamento.
        </p>

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
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  )
}
