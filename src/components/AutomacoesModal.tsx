import { useMemo, useState } from 'react'
import { useAgenda } from '@/modules/agenda/store'
import {
  gerarAutomacoes,
  semTratadas,
} from '@/modules/automacoes/regras'
import { useAutomacoes } from '@/modules/automacoes/store'
import {
  AUTOMACOES_ROTULO,
  type SugestaoAutomacao,
} from '@/modules/automacoes/types'
import { useCaixa } from '@/modules/caixa/store'
import { useClientes } from '@/modules/clientes/store'
import { useClube } from '@/modules/clube/store'
import { useEspera } from '@/modules/espera/store'
import { useWhats } from '@/modules/whatsapp/store'

type Props = {
  onFechar: () => void
}

/**
 * Automações — gatilhos reais (agenda, Clube, aniversários, inatividade e
 * fila) com trava anti-duplicação. Preparar cria uma mensagem PENDENTE;
 * nada é enviado automaticamente.
 */
export default function AutomacoesModal({ onFechar }: Props) {
  const { clientes } = useClientes()
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  const { assinaturas } = useClube()
  const { pedidos } = useEspera()
  const { mensagens, criar } = useWhats()
  const { tratadas, marcarTratada } = useAutomacoes()
  const [erro, setErro] = useState('')

  const sugestoes = useMemo(
    () =>
      semTratadas(
        gerarAutomacoes({
          agendamentos,
          clientes,
          lancamentos,
          assinaturas,
          pedidos,
          mensagens,
        }),
        tratadas,
      ),
    [
      agendamentos,
      clientes,
      lancamentos,
      assinaturas,
      pedidos,
      mensagens,
      tratadas,
    ],
  )

  const preparadas = useMemo(
    () => mensagens.filter((m) => m.origem === 'automacao').length,
    [mensagens],
  )

  function preparar(sugestao: SugestaoAutomacao) {
    setErro('')
    try {
      criar({
        clienteId: sugestao.clienteId,
        cliente: sugestao.cliente,
        template: sugestao.template,
        texto: sugestao.texto,
        origem: 'automacao',
        agendamentoId: sugestao.agendamentoId,
      })
      marcarTratada(sugestao.chave)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível preparar.')
    }
  }

  const kpis = [
    { rotulo: 'Prontas agora', valor: String(sugestoes.length) },
    { rotulo: 'Preparadas', valor: String(preparadas) },
    { rotulo: 'Tratadas', valor: String(tratadas.length) },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">Automações</h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Nada é enviado automaticamente: cada preparo cria uma mensagem
              PENDENTE para você revisar. Ignorar marca a automação como
              tratada e ela não volta a aparecer.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-md border border-[#E5DCC3] bg-white px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-[#E5DCC3] rounded-lg border border-[#E5DCC3] bg-white">
          {kpis.map((kpi) => (
            <div key={kpi.rotulo} className="px-3 py-2.5">
              <p className="text-[11px] font-medium tracking-[0.12em] text-[#8A8171] uppercase">
                {kpi.rotulo}
              </p>
              <p className="mt-1 text-lg leading-none font-bold text-[#8A6A14]">
                {kpi.valor}
              </p>
            </div>
          ))}
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-4 border-t border-[#E5DCC3] pt-4">
          <h3 className="text-sm font-bold text-[#1C1A15]">
            Sugestões prontas
          </h3>
          {sugestoes.length === 0 ? (
            <p className="mt-2 text-sm text-[#A99E85]">
              Nenhuma automação pronta. Os avisos aparecem aqui quando um
              gatilho real (agendamento, cancelamento, aniversário, Clube ou
              fila) é encontrado nos dados.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {sugestoes.map((sugestao) => (
                <li
                  key={sugestao.chave}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#F3ECDA] bg-[#F3ECDA] px-2.5 py-0.5 text-[11px] font-semibold text-[#8A6A14]">
                        {AUTOMACOES_ROTULO[sugestao.tipo]}
                      </span>
                      <p className="text-sm font-bold text-[#1C1A15]">
                        {sugestao.cliente}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => preparar(sugestao)}
                        className="rounded-lg bg-[#8A6A14] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#6F550F]"
                      >
                        Preparar mensagem
                      </button>
                      <button
                        type="button"
                        onClick={() => marcarTratada(sugestao.chave)}
                        className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 rounded-md bg-[#FDFBF3] px-2.5 py-2 text-[13px] text-[#4A4436]">
                    {sugestao.texto}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
