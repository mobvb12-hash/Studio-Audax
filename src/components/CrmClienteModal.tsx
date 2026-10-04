import { useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import {
  formatarDataCurta,
  hojeISO,
} from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { useClube } from '@/modules/clube/store'
import HistoricoCliente from '@/modules/crm/components/HistoricoCliente'
import InteracoesBloco from '@/modules/crm/components/InteracoesBloco'
import ResumoComportamento from '@/modules/crm/components/ResumoComportamento'
import {
  corSegmento,
  corStatusMensagem,
} from '@/modules/crm/presentacao'
import {
  montarHistorico,
  montarPerfis,
  proximaDataSugerida,
  proximoAgendamento,
} from '@/modules/crm/regras'
import { useCrm } from '@/modules/crm/store'
import { personalizarTexto } from '@/modules/ia/regras'
import {
  SEGMENTOS_ROTULO,
} from '@/modules/crm/types'
import type { Cliente } from '@/modules/clientes/types'
import { useWhats } from '@/modules/whatsapp/store'
import { dadosDoAgendamento, textoTemplate } from '@/modules/whatsapp/templates'
import {
  TEMPLATES_ORDEM,
  TEMPLATES_ROTULO,
  ORIGEM_ROTULO,
  STATUS_ROTULO,
  type IdTemplate,
  type MensagemWhats,
} from '@/modules/whatsapp/types'

type Props = {
  cliente: Cliente
  onFechar: () => void
}

export default function CrmClienteModal({ cliente, onFechar }: Props) {
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  const { assinaturaDoCliente } = useClube()
  const { interacoesDoCliente } = useCrm()
  const {
    mensagensDoCliente,
    criar,
    enviar,
    registrarEnvioManual,
    registrarFalha,
    integracaoAtiva,
  } = useWhats()

  const [falhando, setFalhando] = useState<MensagemWhats | null>(null)
  const [erroWhats, setErroWhats] = useState('')
  const [agendar, setAgendar] = useState(false)
  const [iaTemplate, setIaTemplate] = useState<IdTemplate>('confirmacao')
  const [iaRascunho, setIaRascunho] = useState<{
    texto: string
    agendamentoId?: string
  } | null>(null)
  const [erroIa, setErroIa] = useState('')

  // Recalculado a cada render: uma sessão que cruza a meia-noite não
  // pode continuar exibindo o "hoje" do dia anterior.
  const hoje = hojeISO()
  const perfil = useMemo(
    () => montarPerfis([cliente], agendamentos, lancamentos, hoje)[0],
    [cliente, agendamentos, lancamentos, hoje],
  )
  const interacoes = useMemo(
    () => interacoesDoCliente(cliente.id),
    [interacoesDoCliente, cliente.id],
  )
  const mensagens = useMemo(
    () => mensagensDoCliente(cliente.id),
    [mensagensDoCliente, cliente.id],
  )
  const futuro = useMemo(
    () => proximoAgendamento(agendamentos, cliente.nome, hoje),
    [agendamentos, cliente.nome, hoje],
  )
  const historico = useMemo(
    () =>
      montarHistorico(cliente, {
        agendamentos,
        lancamentos,
        interacoes,
        mensagens,
      }),
    [cliente, agendamentos, lancamentos, interacoes, mensagens],
  )
  const ultimoConcluido = useMemo(() => {
    const meus = agendamentos
      .filter(
        (ag) =>
          ag.cliente.trim().toLowerCase() === cliente.nome.trim().toLowerCase() &&
          ag.status === 'concluido',
      )
      .sort((a, b) => (a.data === b.data ? 0 : a.data < b.data ? 1 : -1))
    return meus[0] ?? null
  }, [agendamentos, cliente.nome])

  const assinatura = assinaturaDoCliente(cliente.id)

  function disponivel(id: IdTemplate): boolean {
    if (id === 'confirmacao' || id === 'lembrete') return Boolean(futuro)
    if (id === 'pos_atendimento') return Boolean(ultimoConcluido)
    return Boolean(perfil?.ultimoAtendimento)
  }

  /** Monta o texto oficial do template a partir dos dados reais do cliente. */
  function montarTemplate(
    id: IdTemplate,
  ): { texto: string; agendamento?: Agendamento | null } {
    if (id === 'confirmacao' || id === 'lembrete') {
      if (!futuro) {
        throw new Error(
          'Este cliente não tem agendamento futuro para este template.',
        )
      }
      return { texto: textoTemplate(id, dadosDoAgendamento(futuro)), agendamento: futuro }
    }
    if (id === 'pos_atendimento') {
      if (!ultimoConcluido) {
        throw new Error(
          'Este cliente não tem atendimento concluído para este template.',
        )
      }
      return {
        texto: textoTemplate(id, dadosDoAgendamento(ultimoConcluido)),
        agendamento: null,
      }
    }
    if (!perfil?.ultimoAtendimento) {
      throw new Error('Este cliente nunca foi atendido.')
    }
    return {
      texto: textoTemplate(id, {
        nome: cliente.nome,
        ultimoAtendimento: perfil.ultimoAtendimento,
        diasSemAtendimento: perfil.diasDesdeUltimo ?? 0,
      }),
      agendamento: null,
    }
  }

  function criarDeTemplate(id: IdTemplate) {
    setErroWhats('')
    try {
      const { texto: textoGerado, agendamento } = montarTemplate(id)
      criar({
        clienteId: cliente.id,
        cliente: cliente.nome,
        template: id,
        texto: textoGerado,
        origem: 'crm',
        agendamentoId: agendamento?.id,
      })
    } catch (e) {
      setErroWhats(e instanceof Error ? e.message : 'Não foi possível criar.')
    }
  }

  /** Assistente de texto da IA: gera um rascunho personalizado (sem criar). */
  function sugerirComIa() {
    setErroIa('')
    try {
      const { texto: base, agendamento } = montarTemplate(templateIa)
      setIaRascunho({
        texto: personalizarTexto(base, perfil, agendamento),
        agendamentoId: agendamento?.id,
      })
    } catch (e) {
      setIaRascunho(null)
      setErroIa(e instanceof Error ? e.message : 'Não foi possível gerar.')
    }
  }

  /** Cria o rascunho da IA como mensagem PENDENTE (nunca envia). */
  function criarIaRascunho() {
    setErroIa('')
    if (!iaRascunho) return
    try {
      criar({
        clienteId: cliente.id,
        cliente: cliente.nome,
        template: templateIa,
        texto: iaRascunho.texto,
        origem: 'ia',
        agendamentoId: iaRascunho.agendamentoId,
      })
      setIaRascunho(null)
    } catch (e) {
      setErroIa(e instanceof Error ? e.message : 'Não foi possível criar.')
    }
  }

  async function tentarEnviar(mensagem: MensagemWhats) {
    setErroWhats('')
    try {
      await enviar(mensagem.id)
    } catch (e) {
      setErroWhats(e instanceof Error ? e.message : 'Não foi possível enviar.')
    }
  }

  const rotulo = (id: IdTemplate) => TEMPLATES_ROTULO[id]

  /** Modelos usáveis pelo assistente de IA (mesma trava dos botões). */
  const disponiveis = TEMPLATES_ORDEM.filter(disponivel)
  const templateIa: IdTemplate = disponiveis.includes(iaTemplate)
    ? iaTemplate
    : (disponiveis[0] ?? 'confirmacao')

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
            <h2 className="text-lg font-bold text-[#121110]">
              {cliente.nome}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${corSegmento(
                  perfil.segmento,
                )}`}
              >
                {SEGMENTOS_ROTULO[perfil.segmento]}
              </span>
              {assinatura && (
                <span className="rounded-full border border-[#BFE0B2] bg-[#E9F5E4] px-2.5 py-0.5 text-xs font-semibold text-[#3F6B33]">
                  Assinante Audax Club
                </span>
              )}
              {cliente.telefone && (
                <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs text-[#3A352C]">
                  {cliente.telefone}
                </span>
              )}
              {cliente.nascimento && (
                <span className="rounded-full border border-pink-300 bg-pink-50 px-2.5 py-0.5 text-xs font-semibold text-pink-700">
                  Aniversário {cliente.nascimento.slice(8, 10)}/
                  {cliente.nascimento.slice(5, 7)}
                </span>
              )}
              {proximaDataSugerida(
                perfil.ultimoAtendimento,
                perfil.frequenciaDias,
              ) && (
                <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs text-[#3A352C]">
                  Sugestão de retorno:{' '}
                  {formatarDataCurta(
                    proximaDataSugerida(
                      perfil.ultimoAtendimento,
                      perfil.frequenciaDias,
                    )!,
                  )}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-md border border-[#E5DCC3] bg-white px-2 py-1 text-lg text-[#7C7469] hover:bg-[#F3ECDA]"
          >
            ×
          </button>
        </div>

        <ResumoComportamento perfil={perfil} futuro={futuro} />

        <HistoricoCliente historico={historico} />

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAgendar(true)}
            className="rounded-lg bg-[#C9A24A] px-3 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
          >
            Agendar
          </button>
        </div>

        <InteracoesBloco clienteId={cliente.id} interacoes={interacoes} />

        {/* WhatsApp — mensagens preparadas, nunca enviadas sozinhas */}
        <div className="mt-5 border-t border-[#E5DCC3] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#121110]">
              WhatsApp do cliente
            </h3>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                integracaoAtiva
                  ? 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                  : 'border-slate-300 bg-slate-100 text-slate-700'
              }`}
            >
              {integracaoAtiva
                ? 'Integração ativa'
                : 'Sem integração — nada é enviado'}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {TEMPLATES_ORDEM.map((id) => (
              <button
                key={id}
                type="button"
                disabled={!disponivel(id)}
                onClick={() => criarDeTemplate(id)}
                className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-[#3A352C] hover:border-[#8A6A14] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rotulo(id)}
              </button>
            ))}
          </div>

          {/* Assistente de texto da IA — rascunho revisado pelo humano */}
          <div className="mt-3 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB] px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-bold text-[#121110]">
                Sugestão com IA
              </p>
              <span className="text-[11px] text-[#7C7469]">
                Texto gerado do perfil real — nada é enviado
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="ia-template">
                Modelo da mensagem
              </label>
              <select
                id="ia-template"
                className="flex-1 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs text-[#3A352C] outline-none focus:border-[#8A6A14]"
                value={templateIa}
                disabled={disponiveis.length === 0}
                onChange={(e) => setIaTemplate(e.target.value as IdTemplate)}
              >
                {disponiveis.map((id) => (
                  <option key={id} value={id}>
                    {rotulo(id)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={sugerirComIa}
                disabled={disponiveis.length === 0}
                className="rounded-lg bg-[#C9A24A] px-3 py-1.5 text-xs font-semibold text-[#121110] hover:bg-[#A8842C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sugerir com IA
              </button>
            </div>
            {erroIa && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {erroIa}
              </p>
            )}
            {iaRascunho && (
              <div className="mt-2 rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
                <p className="text-sm text-[#3A352C]">{iaRascunho.texto}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={criarIaRascunho}
                    className="rounded-lg bg-[#C9A24A] px-2.5 py-1 text-xs font-semibold text-[#121110] hover:bg-[#A8842C]"
                  >
                    Criar mensagem pendente
                  </button>
                  <button
                    type="button"
                    onClick={() => setIaRascunho(null)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>

          {erroWhats && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {erroWhats}
            </p>
          )}

          {mensagens.length === 0 ? (
            <p className="mt-3 text-sm text-[#A99E85]">
              Nenhuma mensagem preparada. Use os templates acima — elas ficam
              pendentes até o envio manual ou por integração oficial.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {mensagens.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${corStatusMensagem(
                        m.status,
                      )}`}
                    >
                      {STATUS_ROTULO[m.status]}
                    </span>
                    <span className="text-[11px] font-medium text-[#7C7469]">
                      {TEMPLATES_ROTULO[m.template]} · {ORIGEM_ROTULO[m.origem]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#3A352C]">{m.texto}</p>
                  {m.motivoFalha && (
                    <p className="mt-1 text-[12px] text-red-700">
                      {m.motivoFalha}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => tentarEnviar(m)}
                      className="rounded-lg border border-[#8A6A14] bg-white px-2.5 py-1 text-xs font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
                    >
                      Enviar
                    </button>
                    <button
                      type="button"
                      onClick={() => registrarEnvioManual(m.id)}
                      className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                    >
                      Marcar enviada
                    </button>
                    <button
                      type="button"
                      onClick={() => setFalhando(m)}
                      className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
                    >
                      Registrar falha
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {agendar && (
          <NovoAgendamentoModal
            clienteInicial={cliente.nome}
            onFechar={() => setAgendar(false)}
          />
        )}

        {falhando && (
          <ConfirmarModal
            titulo="Registrar falha no envio"
            texto="Informe o motivo da falha desta mensagem."
            rotuloConfirmar="Registrar"
            motivoObrigatorio
            rotuloMotivo="Motivo"
            onConfirmar={(motivo) => {
              registrarFalha(falhando.id, motivo ?? '')
              setFalhando(null)
            }}
            onFechar={() => setFalhando(null)}
          />
        )}
      </div>
    </div>
  )
}
