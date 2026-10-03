import { useEffect, useState } from 'react'
import {
  cancelarAgendamentoPainel,
  listarMeusAgendamentos,
  remarcarAgendamentoPainel,
} from '@/services/supabase/painel'
import type { AgendamentoPainel } from '@/services/supabase/painel'
import { horariosPublicos } from '@/services/supabase/agendaPublica'
import { hojeISO } from '@/modules/agenda/catalogo'
import { CAMPO_FORM as campo } from '@/lib/apresentacao'
import ConfirmarModal from '@/components/ConfirmarModal'
import { formatarDataBR, separarAgendamentos } from '../dashboard'
import { navegarPainel } from '../regras'
import CartaoAgendamento from './CartaoAgendamento'

type Estado = { fase: 'carregando' } | { fase: 'erro'; mensagem: string }

type AcoesProps = {
  agendamento: AgendamentoPainel
  aoRemarcar: () => void
  aoCancelar: () => void
}

function BotoesAcao({ agendamento, aoRemarcar, aoCancelar }: AcoesProps) {
  return (
    <div className="mt-1.5 flex gap-2">
      <button
        type="button"
        onClick={aoRemarcar}
        className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-[13px] font-medium text-noir-700 hover:border-gold-700"
      >
        Remarcar
      </button>
      <button
        type="button"
        onClick={aoCancelar}
        className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-[13px] font-medium text-red-700 hover:border-red-300"
      >
        Cancelar
      </button>
      <span className="self-center text-[12px] text-noir-400">
        {agendamento.status === 'pendente'
          ? 'aguardando confirmação'
          : 'confirmado'}
      </span>
    </div>
  )
}

type RemarcacaoProps = {
  agendamento: AgendamentoPainel
  onErro: (mensagem: string) => void
  aoConcluir: () => void
}

/**
 * Fluxo de remarcação do cliente: nova data → horários livres da MESMA
 * Agenda (duração total da linha) → confirma pela RPC oficial. O
 * profissional continua o da linha.
 */
function PainelRemarcacao({
  agendamento,
  onErro,
  aoConcluir,
}: RemarcacaoProps) {
  const [data, setData] = useState('')
  const [horario, setHorario] = useState('')
  const [horarios, setHorarios] = useState<string[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const duracao = agendamento.duracaoMin ?? 30

  useEffect(() => {
    // sem data não há o que carregar — o reset da lista acontece no
    // onChange do campo (setState síncrono no effect é proibido)
    if (!data) return
    let vivo = true
    horariosPublicos(data, agendamento.profissional, duracao)
      .then((lista) => {
        if (vivo) setHorarios(lista)
      })
      .catch((e: unknown) => {
        if (vivo) {
          onErro(
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar os horários.',
          )
        }
      })
      .finally(() => {
        if (vivo) setCarregandoHorarios(false)
      })
    return () => {
      vivo = false
    }
  }, [data, agendamento.profissional, duracao, onErro])

  function escolherData(valor: string) {
    setData(valor)
    setHorario('')
    setHorarios([])
    setCarregandoHorarios(valor !== '')
  }

  async function confirmar() {
    if (enviando || !data || !horario) return
    setEnviando(true)
    try {
      const resultado = await remarcarAgendamentoPainel(
        agendamento.id,
        data,
        horario,
      )
      if (!resultado.ok) {
        onErro(resultado.erro)
        if (/ocupado|conflito/i.test(resultado.erro)) {
          try {
            setHorarios(
              await horariosPublicos(data, agendamento.profissional, duracao),
            )
          } catch {
            // a mensagem do servidor já foi exibida
          }
        }
        return
      }
      aoConcluir()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-cream-300 bg-cream-50/60 p-4">
      <p className="text-[13px] font-semibold text-noir-900">
        Remarcar {agendamento.servico}
      </p>
      <p className="mt-0.5 text-[12px] text-noir-500">
        Atual: {formatarDataBR(agendamento.data)} · {agendamento.horario} ·{' '}
        {agendamento.profissional}
      </p>
      <label className="mt-3 block text-[13px] font-medium text-noir-700" htmlFor="rem-data">
        Nova data
      </label>
      <input
        id="rem-data"
        type="date"
        className={`${campo} mt-1`}
        min={hojeISO()}
        value={data}
        onChange={(e) => escolherData(e.target.value)}
      />
      {data && (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-noir-700">
            Novo horário
          </p>
          {carregandoHorarios ? (
            <p className="mt-1 text-xs text-noir-500">
              Verificando horários…
            </p>
          ) : horarios.length === 0 ? (
            <p className="mt-1 rounded-lg border border-dashed border-gold-300 bg-white px-3 py-2 text-xs text-noir-400">
              Nenhum horário livre nesta data. Escolha outro dia.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {horarios.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorario(h)}
                  aria-pressed={horario === h}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    horario === h
                      ? 'border-gold-700 bg-gold-700 text-cream-50'
                      : 'border-cream-300 bg-white text-noir-700 hover:bg-gold-200'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={enviando || !horario}
          className="rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-gold-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? 'Remarcando…' : 'Confirmar remarcação'}
        </button>
        <button
          type="button"
          onClick={aoConcluir}
          className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-sm font-medium text-noir-700 hover:bg-gold-200"
        >
          Voltar
        </button>
      </div>
    </div>
  )
}

type SecaoProps = {
  titulo: string
  vazio: string
  itens: AgendamentoPainel[]
}

function Secao({ titulo, vazio, itens }: SecaoProps) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gold-700">
        {titulo}
      </h2>
      {itens.length === 0 ? (
        <p className="mt-2 text-sm text-noir-500">{vazio}</p>
      ) : (
        <div className="mt-2 space-y-3">
          {itens.map((agendamento) => (
            <CartaoAgendamento
              key={agendamento.id}
              agendamento={agendamento}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Aba Agendamentos: lista COMPLETA das linhas próprias (futuros + histórico)
 * com cancelar/remarcar — ações que envolvem as RPCs oficiais da 019/015.
 */
export default function PainelAgendamentos() {
  // null = carregado (mesmo padrão do dashboard: estado só de carga/erro)
  const [estado, setEstado] = useState<Estado | null>({ fase: 'carregando' })
  const [agendamentos, setAgendamentos] = useState<AgendamentoPainel[]>([])
  // Clique em "Tentar de novo" muda a tentativa e o effect recarrega.
  const [tentativa, setTentativa] = useState(0)

  const [confirmandoCancelar, setConfirmandoCancelar] =
    useState<AgendamentoPainel | null>(null)
  const [remarcandoId, setRemarcandoId] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState('')
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    let vivo = true
    listarMeusAgendamentos()
      .then((lista) => {
        if (!vivo) return
        setAgendamentos(lista)
        setEstado(null)
      })
      .catch((erro: unknown) => {
        if (!vivo) return
        setEstado({
          fase: 'erro',
          mensagem:
            erro instanceof Error && erro.message
              ? erro.message
              : 'Não foi possível carregar seus agendamentos.',
        })
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  function recarregar() {
    setErroAcao('')
    setRemarcandoId(null)
    setTentativa((atual) => atual + 1)
  }

  async function confirmarCancelamento() {
    const alvo = confirmandoCancelar
    if (!alvo || processando) return
    setProcessando(true)
    try {
      const resultado = await cancelarAgendamentoPainel(alvo.id)
      setConfirmandoCancelar(null)
      if (!resultado.ok) {
        setErroAcao(resultado.erro)
        return
      }
      recarregar()
    } finally {
      setProcessando(false)
    }
  }

  if (estado?.fase === 'erro') {
    return (
      <div className="rounded-xl border border-cream-300 bg-white p-6 text-center">
        <p role="alert" className="text-sm text-red-700">
          {estado.mensagem}
        </p>
        <button
          type="button"
          onClick={() => setTentativa((atual) => atual + 1)}
          className="mt-4 rounded-lg border border-cream-300 px-4 py-2 text-sm font-medium text-noir-700 hover:border-gold-700"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (estado === null) {
    const hoje = hojeISO()
    const { proximos, historico } = separarAgendamentos(agendamentos, hoje)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold text-noir-900">
            Meus agendamentos
          </h1>
          <button
            type="button"
            onClick={() => navegarPainel('agendar')}
            className="rounded-lg bg-gold-700 px-3 py-2 text-[13px] font-semibold text-cream-50 hover:bg-gold-800"
          >
            Agendar
          </button>
        </div>

        {erroAcao && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {erroAcao}
          </p>
        )}

        {proximos.length === 0 && historico.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cream-300 bg-white p-6 text-center">
            <p className="text-sm text-noir-500">
              Você ainda não tem um agendamento marcado.
            </p>
            <button
              type="button"
              onClick={() => navegarPainel('agendar')}
              className="mt-4 rounded-lg bg-gold-700 px-4 py-2 text-sm font-semibold text-cream-50 hover:bg-gold-800"
            >
              Agendar horário
            </button>
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gold-700">
                Próximos
              </h2>
              {proximos.length === 0 ? (
                <p className="mt-2 text-sm text-noir-500">
                  Nenhum horário marcado para os próximos dias.
                </p>
              ) : (
                <div className="mt-2 space-y-4">
                  {proximos.map((agendamento) => (
                    <div key={agendamento.id}>
                      <CartaoAgendamento agendamento={agendamento} />
                      <BotoesAcao
                        agendamento={agendamento}
                        aoRemarcar={() => {
                          setErroAcao('')
                          setRemarcandoId(
                            remarcandoId === agendamento.id
                              ? null
                              : agendamento.id,
                          )
                        }}
                        aoCancelar={() => {
                          setErroAcao('')
                          setConfirmandoCancelar(agendamento)
                        }}
                      />
                      {remarcandoId === agendamento.id && (
                        <PainelRemarcacao
                          agendamento={agendamento}
                          onErro={setErroAcao}
                          aoConcluir={recarregar}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Secao
              titulo="Histórico"
              vazio="Ainda não há atendimentos no seu histórico."
              itens={historico}
            />
          </>
        )}

        {confirmandoCancelar && (
          <ConfirmarModal
            titulo="Cancelar agendamento"
            texto={`${confirmandoCancelar.servico} em ${formatarDataBR(confirmandoCancelar.data)} · ${confirmandoCancelar.horario}. O horário volta a ficar livre para outras pessoas.`}
            rotuloConfirmar="Cancelar agendamento"
            perigo
            onConfirmar={() => void confirmarCancelamento()}
            onFechar={() => setConfirmandoCancelar(null)}
          />
        )}
      </div>
    )
  }

  return (
    <p className="py-10 text-center text-sm text-noir-500">
      Carregando seus agendamentos…
    </p>
  )
}
