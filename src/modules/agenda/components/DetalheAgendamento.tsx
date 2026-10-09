import { useContext, useEffect, useState } from 'react'
import VerFechamentoModal from '@/components/VerFechamentoModal'
import { ContextoAuth } from '@/modules/auth/contexto'
import { useAuthPermissao } from '@/modules/auth/useAuthPermissao'
import { formatarDataCurta } from '@/modules/agenda/catalogo'
import { estiloBadge } from '@/modules/agenda/presentacao'
import { somaMinutos } from '@/modules/agenda/regras'
import {
  STATUS_ROTULO,
  type Agendamento,
  type StatusAgendamento,
} from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'

export default function DetalheAgendamento({
  ag,
  duracaoDo,
  mudarStatus,
  remover,
  pago,
  onPagar,
  onRemarcar,
  onEditar,
  onFechar,
}: {
  ag: Agendamento
  duracaoDo: (servico: string) => number
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
  pago: boolean
  onPagar: () => void
  onRemarcar: () => void
  onEditar: () => void
  onFechar: () => void
}) {
  const duracao = duracaoDo(ag.servico)
  const bloqueado = ag.status === 'cancelado' || ag.status === 'nao_compareceu'
  const emAberto = ag.status === 'pendente' || ag.status === 'confirmado'
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [verFechamento, setVerFechamento] = useState(false)
  // Fechamento (ativo ou estornado) existe? Libera "Ver Fechamento" também
  // no ramo em aberto — depois de uma reabertura o histórico continua
  // acessível e a conta aparece como estornado/reaberto.
  const { possuiFechamento } = useCaixa()
  // Excluir agendamento é DELETE no RLS (042: agendamentos_delete →
  // `agenda:cancelar`; 014: admin/gerente). Sem sessão de auth (testes/
  // render isolado) não há papel a consultar — mantém o comportamento.
  const auth = useContext(ContextoAuth)
  const { pode } = useAuthPermissao()
  const podeExcluir = auth === null || pode('agenda:cancelar')
  const temHistorico = possuiFechamento(ag.id)
  const remarcacoes = ag.remarcacoes ?? []
  const ultimaRemarcacao = remarcacoes[remarcacoes.length - 1]

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      // Com o Ver Fechamento aberto, o Escape fecha só ele
      if (verFechamento) return
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar, verFechamento])

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
              {ag.profissional}
            </p>
            <h2 className="text-lg font-bold text-[#121110]">{ag.cliente}</h2>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${estiloBadge(ag.status)}`}
          >
            {STATUS_ROTULO[ag.status]}
          </span>
        </div>

        <dl className="mt-4 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-[#7C7469]">Horário</dt>
            <dd className="font-medium text-[#121110]">
              {ag.horario} – {somaMinutos(ag.horario, duracao)} ({duracao} min)
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[#7C7469]">Serviço</dt>
            <dd className="text-right font-medium text-[#121110]">
              {ag.servico}
            </dd>
          </div>
          {ag.telefone && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#7C7469]">Telefone</dt>
              <dd className="font-medium text-[#121110]">{ag.telefone}</dd>
            </div>
          )}
          {ag.observacao && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#7C7469]">Obs.</dt>
              <dd className="text-right font-medium text-[#121110]">
                {ag.observacao}
              </dd>
            </div>
          )}
          {ultimaRemarcacao && (
            <div className="flex justify-between gap-3">
              <dt className="text-[#7C7469]">Remarcado</dt>
              <dd className="text-right font-medium text-[#121110]">
                {remarcacoes.length}× — antes{' '}
                {formatarDataCurta(ultimaRemarcacao.de.data)} às{' '}
                {ultimaRemarcacao.de.horario} ({ultimaRemarcacao.de.profissional}
                )
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-[#7C7469]">Recebimento</dt>
            <dd
              className={`font-semibold ${pago ? 'text-[#3F6B33]' : 'text-[#8A6A14]'}`}
            >
              {pago ? 'Pago' : 'Em aberto'}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {pago ? (
            <>
              <span className="rounded-lg border border-[#BFE0B2] bg-[#E9F5E4] px-3 py-2 text-xs font-semibold text-[#3F6B33]">
                Pagamento registrado — opções liberadas apenas no Caixa
              </span>
              <button
                type="button"
                onClick={() => setVerFechamento(true)}
                className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
              >
                Ver Fechamento
              </button>
            </>
          ) : (
            <>
              {ag.status === 'pendente' && (
                <button
                  type="button"
                  onClick={() => {
                    mudarStatus(ag.id, 'confirmado')
                    onFechar()
                  }}
                  className="rounded-lg bg-[#C9A24A] px-3 py-2 text-xs font-semibold text-[#121110] hover:bg-[#A8842C]"
                >
                  Confirmar
                </button>
              )}
              {!bloqueado && (
                <button
                  type="button"
                  onClick={onPagar}
                  className="rounded-lg bg-[#5FA83E] px-3 py-2 text-xs font-semibold text-[#121110] hover:bg-[#549531]"
                >
                  {ag.status === 'concluido'
                    ? 'Fechar conta'
                    : 'Finalizar atendimento'}
                </button>
              )}
              {!pago && temHistorico && (
                <>
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Conta em correção — fechamento anterior no histórico
                  </span>
                  <button
                    type="button"
                    onClick={() => setVerFechamento(true)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                  >
                    Ver Fechamento
                  </button>
                </>
              )}
              {emAberto && (
                <button
                  type="button"
                  onClick={onRemarcar}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
                >
                  Remarcar
                </button>
              )}
              {!confirmandoExclusao && (
                <button
                  type="button"
                  onClick={onEditar}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                >
                  Editar
                </button>
              )}
              {emAberto && (
                <button
                  type="button"
                  onClick={() => {
                    mudarStatus(ag.id, 'concluido')
                    onFechar()
                  }}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium hover:bg-[#F3ECDA]"
                >
                  Concluir
                </button>
              )}
              {emAberto && (
                <button
                  type="button"
                  onClick={() => {
                    mudarStatus(ag.id, 'nao_compareceu')
                    onFechar()
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Não compareceu
                </button>
              )}
              {emAberto && (
                <button
                  type="button"
                  onClick={() => {
                    mudarStatus(ag.id, 'cancelado')
                    onFechar()
                  }}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Cancelar
                </button>
              )}
              {podeExcluir && !pago && !confirmandoExclusao && (
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(true)}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Excluir
                </button>
              )}
              {podeExcluir && !pago && confirmandoExclusao && (
                <>
                  <span className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Excluir este agendamento? Esta ação não pode ser desfeita.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      remover(ag.id)
                      onFechar()
                    }}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Sim, excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(false)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Voltar
                  </button>
                </>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onFechar}
          className="mt-4 w-full rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
        >
          Fechar
        </button>
      </div>
    </div>

    {verFechamento && (
      <VerFechamentoModal
        agendamento={ag}
        onFechar={() => setVerFechamento(false)}
      />
    )}
    </>
  )
}
