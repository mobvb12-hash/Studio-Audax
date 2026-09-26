import { useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import ServicoFormModal from '@/components/ServicoFormModal'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useEsperaOpcional } from '@/modules/espera/store'
import { servicoEmUso } from '@/modules/servicos/regras'
import { useServicos } from '@/modules/servicos/store'
import type { Servico } from '@/modules/servicos/types'
import { formatarBRL } from '@/lib/moeda'

export default function Servicos() {
  const { servicos, remover, alternarAtivo } = useServicos()
  const { agendamentos, renomearServico: renomearNaAgenda } = useAgenda()
  const { lancamentos, renomearServico: renomearNoCaixa } = useCaixa()
  const { renomearServico: renomearNaEspera } = useEsperaOpcional()
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Servico | null>(null)
  const [excluindo, setExcluindo] = useState<Servico | null>(null)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return servicos
    return servicos.filter(
      (s) =>
        s.nome.toLowerCase().includes(termo) ||
        s.categoria.toLowerCase().includes(termo),
    )
  }, [servicos, busca])

  const ativos = servicos.filter((s) => s.ativo).length
  const inativos = servicos.length - ativos

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Serviços
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {servicos.length} serviço(s) · {ativos} ativo(s) · {inativos}{' '}
            inativo(s) · preço e duração usados na Agenda
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo serviço
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <label className="sr-only" htmlFor="srv-busca">
          Buscar serviço
        </label>
        <input
          id="srv-busca"
          className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
          placeholder="Buscar serviço..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          {servicos.length === 0
            ? 'Nenhum serviço cadastrado. Clique em “Novo serviço” para começar.'
            : 'Nenhum serviço encontrado para esta busca.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtrados.map((servico) => (
            <li
              key={servico.id}
              className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#F3ECDA] text-sm font-bold text-[#8A6A14]">
                {servico.duracaoMin}
                <span className="text-[10px] font-medium">min</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#1C1A15]">
                  {servico.nome}
                </p>
                <p className="mt-0.5 text-[13px] text-[#4A4436]">
                  Duração de {servico.duracaoMin} minutos
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      servico.ativo
                        ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                    }`}
                  >
                    {servico.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                  {servico.categoria && (
                    <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs font-medium text-[#4A4436]">
                      {servico.categoria}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-[#E5DCC3] bg-white px-3 py-1 text-sm font-semibold text-[#8A6A14]">
                {formatarBRL(servico.preco)}
              </span>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditando(servico)
                    setModalAberto(true)
                  }}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => alternarAtivo(servico.id)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  aria-label={`${servico.ativo ? 'Inativar' : 'Reativar'} ${servico.nome}`}
                >
                  {servico.ativo ? 'Inativar' : 'Reativar'}
                </button>
                <button
                  type="button"
                  onClick={() => setExcluindo(servico)}
                  className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                  aria-label={`Excluir ${servico.nome}`}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalAberto && (
        <ServicoFormModal
          servico={editando}
          aoRenomear={(antigo, novo) => {
            renomearNaAgenda(antigo, novo)
            renomearNoCaixa(antigo, novo)
            renomearNaEspera(antigo, novo)
          }}
          onFechar={() => setModalAberto(false)}
        />
      )}

      {excluindo && (
        <ConfirmarModal
          titulo="Excluir serviço"
          texto={`Excluir “${excluindo.nome}”? Agendamentos e pagamentos já feitos com este serviço são preservados.`}
          rotuloConfirmar="Sim, excluir"
          perigo
          onConfirmar={() => {
            const uso = servicoEmUso(excluindo.nome, agendamentos, lancamentos)
            if (uso.emUso) {
              throw new Error(
                `“${excluindo.nome}” já aparece em ${uso.agendamentos} agendamento(s) e ${uso.lancamentos} lançamento(oes) do caixa — não é possível excluí-lo. Use “Inativar” para deixar de oferecê-lo em novos agendamentos.`,
              )
            }
            remover(excluindo.id)
            setExcluindo(null)
          }}
          onFechar={() => setExcluindo(null)}
        />
      )}
    </div>
  )
}
