import { useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import NovoAgendamentoModal from '@/components/NovoAgendamentoModal'
import {
  formatarDataCurta,
  formatarDataLonga,
  hojeISO,
} from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useClube } from '@/modules/clube/store'
import { montarPerfis, proximaDataSugerida, proximoAgendamento } from '@/modules/crm/regras'
import { useCrm } from '@/modules/crm/store'
import {
  SEGMENTOS_ROTULO,
  TIPOS_INTERACAO,
  TIPOS_INTERACAO_ROTULO,
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
import { formatarBRL } from '@/lib/moeda'

type Props = {
  cliente: Cliente
  onFechar: () => void
}

function corSegmento(segmento: string): string {
  switch (segmento) {
    case 'novo':
      return 'border-sky-300 bg-sky-50 text-sky-700'
    case 'ativo':
      return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
    case 'recorrente':
      return 'border-amber-300 bg-amber-100 text-amber-900'
    case 'sem_retorno':
      return 'border-orange-300 bg-orange-50 text-orange-800'
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700'
  }
}

function corStatus(status: MensagemWhats['status']): string {
  if (status === 'enviada')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'falhou')
    return 'border-red-300 bg-red-50 text-red-700'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

function formatarISO(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CrmClienteModal({ cliente, onFechar }: Props) {
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  const { assinaturaDoCliente } = useClube()
  const { interacoesDoCliente, adicionarInteracao } = useCrm()
  const {
    mensagensDoCliente,
    criar,
    enviar,
    registrarEnvioManual,
    registrarFalha,
    integracaoAtiva,
  } = useWhats()

  const [tipo, setTipo] = useState('nota')
  const [texto, setTexto] = useState('')
  const [erroNota, setErroNota] = useState('')
  const [erroWhats, setErroWhats] = useState('')
  const [falhando, setFalhando] = useState<MensagemWhats | null>(null)
  const [agendar, setAgendar] = useState(false)

  const hoje = useMemo(() => hojeISO(), [])
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

  function salvarNota() {
    setErroNota('')
    try {
      adicionarInteracao({
        clienteId: cliente.id,
        tipo: tipo as 'nota' | 'ligacao' | 'presencial',
        texto,
      })
      setTexto('')
    } catch (e) {
      setErroNota(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  function disponivel(id: IdTemplate): boolean {
    if (id === 'confirmacao' || id === 'lembrete') return Boolean(futuro)
    if (id === 'pos_atendimento') return Boolean(ultimoConcluido)
    return Boolean(perfil?.ultimoAtendimento)
  }

  function criarDeTemplate(id: IdTemplate) {
    setErroWhats('')
    try {
      let dados
      if (id === 'confirmacao' || id === 'lembrete') {
        if (!futuro) {
          throw new Error(
            'Este cliente não tem agendamento futuro para este template.',
          )
        }
        dados = dadosDoAgendamento(futuro)
      } else if (id === 'pos_atendimento') {
        if (!ultimoConcluido) {
          throw new Error(
            'Este cliente não tem atendimento concluído para este template.',
          )
        }
        dados = dadosDoAgendamento(ultimoConcluido)
      } else {
        if (!perfil?.ultimoAtendimento) {
          throw new Error('Este cliente nunca foi atendido.')
        }
        dados = {
          nome: cliente.nome,
          ultimoAtendimento: perfil.ultimoAtendimento,
          diasSemAtendimento: perfil.diasDesdeUltimo ?? 0,
        }
      }
      criar({
        clienteId: cliente.id,
        cliente: cliente.nome,
        template: id,
        texto: textoTemplate(id, dados),
        origem: 'crm',
        agendamentoId:
          (id === 'confirmacao' || id === 'lembrete') && futuro
            ? futuro.id
            : undefined,
      })
    } catch (e) {
      setErroWhats(e instanceof Error ? e.message : 'Não foi possível criar.')
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
            <h2 className="text-lg font-bold text-[#1C1A15]">
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
                <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs text-[#4A4436]">
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
                <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs text-[#4A4436]">
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
            className="rounded-md border border-[#E5DCC3] bg-white px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
          >
            ×
          </button>
        </div>

        {/* Resumo do comportamento (derivado de agenda/caixa — sem cópia de dados) */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Último atendimento
            </p>
            <p className="mt-1 text-sm font-bold text-[#1C1A15]">
              {perfil.ultimoAtendimento
                ? formatarDataLonga(perfil.ultimoAtendimento)
                : 'Nunca'}
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Frequência
            </p>
            <p className="mt-1 text-sm font-bold text-[#1C1A15]">
              {perfil.frequenciaDias
                ? `a cada ${perfil.frequenciaDias} dia(s)`
                : 'Sem histórico suficiente'}
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Total gasto
            </p>
            <p className="mt-1 text-sm font-bold text-[#1C1A15]">
              {formatarBRL(perfil.totalGasto)}
            </p>
          </div>
          <div className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2">
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Atendimentos
            </p>
            <p className="mt-1 text-sm font-bold text-[#1C1A15]">
              {perfil.totalAtendimentos}
              {perfil.profissionalPreferido
                ? ` · ${perfil.profissionalPreferido}`
                : ''}
            </p>
          </div>
        </div>

        {perfil.servicos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Serviços usados:
            </span>
            {perfil.servicos.map((s) => (
              <span
                key={s.nome}
                className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-0.5 text-xs font-medium text-[#8A6A14]"
              >
                {s.nome} ({s.qtd})
              </span>
            ))}
          </div>
        )}

        {perfil.produtos.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              Produtos comprados:
            </span>
            {perfil.produtos.map((p) => (
              <span
                key={p.nome}
                className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-0.5 text-xs text-[#4A4436]"
              >
                {p.nome} ({p.qtd})
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAgendar(true)}
            className="rounded-lg bg-[#8A6A14] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Agendar
          </button>
        </div>

        {/* Interações / notas */}
        <div className="mt-5 border-t border-[#E5DCC3] pt-4">
          <h3 className="text-sm font-bold text-[#1C1A15]">
            Interações e notas
          </h3>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="crm-tipo">
              Tipo de interação
            </label>
            <select
              id="crm-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
            >
              {TIPOS_INTERACAO.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_INTERACAO_ROTULO[t]}
                </option>
              ))}
            </select>
            <div className="flex-1">
              <label className="sr-only" htmlFor="crm-nota">
                Nova interação
              </label>
              <textarea
                id="crm-nota"
                rows={2}
                placeholder="Ex.: cliente pediu para lembrar por WhatsApp..."
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
              />
            </div>
            <button
              type="button"
              onClick={salvarNota}
              className="h-fit rounded-lg border border-[#8A6A14] bg-white px-3 py-2 text-sm font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
            >
              Salvar interação
            </button>
          </div>
          {erroNota && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {erroNota}
            </p>
          )}
          {interacoes.length === 0 ? (
            <p className="mt-3 text-sm text-[#A99E85]">
              Nenhuma interação registrada ainda.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {interacoes.map((i) => (
                <li
                  key={i.id}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2"
                >
                  <p className="text-[11px] font-semibold text-[#8A6A14]">
                    {TIPOS_INTERACAO_ROTULO[i.tipo]} · {formatarISO(i.criadoEm)}
                  </p>
                  <p className="mt-0.5 text-sm text-[#4A4436]">{i.texto}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* WhatsApp — mensagens preparadas, nunca enviadas sozinhas */}
        <div className="mt-5 border-t border-[#E5DCC3] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#1C1A15]">
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
                className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-[#4A4436] hover:border-[#8A6A14] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rotulo(id)}
              </button>
            ))}
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
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${corStatus(
                        m.status,
                      )}`}
                    >
                      {STATUS_ROTULO[m.status]}
                    </span>
                    <span className="text-[11px] font-medium text-[#8A8171]">
                      {TEMPLATES_ROTULO[m.template]} · {ORIGEM_ROTULO[m.origem]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#4A4436]">{m.texto}</p>
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
                      className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
                    >
                      Marcar enviada
                    </button>
                    <button
                      type="button"
                      onClick={() => setFalhando(m)}
                      className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
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
