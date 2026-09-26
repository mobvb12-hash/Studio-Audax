import { useMemo, useState } from 'react'
import ConfirmarModal from '@/components/ConfirmarModal'
import CrmClienteModal from '@/components/CrmClienteModal'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useClientes } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'
import { diasEntre, proximoAgendamento } from '@/modules/crm/regras'
import { useWhats } from '@/modules/whatsapp/store'
import { dadosDoAgendamento, textoTemplate } from '@/modules/whatsapp/templates'
import {
  ORIGEM_ROTULO,
  STATUS_ROTULO,
  TEMPLATES_CENTRAL,
  TEMPLATES_ROTULO,
  type IdTemplate,
  type MensagemWhats,
  type StatusMensagem,
} from '@/modules/whatsapp/types'

type Filtro = StatusMensagem | 'todos'

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'pendente', rotulo: 'Pendentes' },
  { id: 'enviada', rotulo: 'Enviadas' },
  { id: 'falhou', rotulo: 'Falharam' },
]

function corStatus(status: StatusMensagem): string {
  if (status === 'enviada')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'falhou') return 'border-red-300 bg-red-50 text-red-700'
  return 'border-amber-300 bg-amber-50 text-amber-800'
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

function norm(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Central de mensagens WhatsApp — lista tudo o que foi preparado (pendente,
 * enviada ou falhou), filtra por cliente e prepara novas mensagens com
 * templates oficiais. Sem provedor configurado nada é enviado: a estrutura
 * fica pronta para a futura API oficial do WhatsApp Business.
 */
export default function Whats() {
  const { clientes } = useClientes()
  const { agendamentos } = useAgenda()
  const {
    mensagens,
    integracaoAtiva,
    criar,
    enviar,
    registrarEnvioManual,
    registrarFalha,
  } = useWhats()

  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [template, setTemplate] = useState<IdTemplate>('retorno')
  const [erroComp, setErroComp] = useState('')
  const [avisoComp, setAvisoComp] = useState('')
  const [erroEnvio, setErroEnvio] = useState('')
  const [falhando, setFalhando] = useState<MensagemWhats | null>(null)
  const [clienteDo, setClienteDo] = useState<Cliente | null>(null)

  const hoje = useMemo(() => hojeISO(), [])

  const kpis = useMemo(
    () => [
      { rotulo: 'Total de mensagens', valor: String(mensagens.length) },
      {
        rotulo: 'Mensagens pendentes',
        valor: String(mensagens.filter((m) => m.status === 'pendente').length),
      },
      {
        rotulo: 'Mensagens enviadas',
        valor: String(mensagens.filter((m) => m.status === 'enviada').length),
      },
      {
        rotulo: 'Com falha',
        valor: String(mensagens.filter((m) => m.status === 'falhou').length),
      },
    ],
    [mensagens],
  )

  const filtradas = useMemo(() => {
    const chave = norm(busca)
    return mensagens.filter((m) => {
      if (filtro !== 'todos' && m.status !== filtro) return false
      if (chave && !norm(m.cliente).includes(chave)) return false
      return true
    })
  }, [mensagens, filtro, busca])

  /** Último atendimento concluído do cliente (dados reais da agenda). */
  function ultimoConcluido(nome: string): { data: string; horario: string } | null {
    const chave = norm(nome)
    const meus = agendamentos
      .filter((ag) => norm(ag.cliente) === chave && ag.status === 'concluido')
      .sort((a, b) =>
        a.data === b.data
          ? b.horario.localeCompare(a.horario)
          : a.data < b.data
            ? 1
            : -1,
      )
    return meus[0] ?? null
  }

  function criarMensagem() {
    setErroComp('')
    setAvisoComp('')
    try {
      const cliente = clientes.find((c) => c.id === clienteId)
      if (!cliente) {
        throw new Error('Selecione um cliente para criar a mensagem.')
      }
      let texto: string
      let agendamentoId: string | undefined
      if (template === 'confirmacao' || template === 'lembrete') {
        const futuro = proximoAgendamento(agendamentos, cliente.nome, hoje)
        if (!futuro) {
          throw new Error(
            'Este cliente não tem agendamento futuro para este template.',
          )
        }
        texto = textoTemplate(template, dadosDoAgendamento(futuro))
        agendamentoId = futuro.id
      } else if (template === 'reativacao') {
        const ultimo = ultimoConcluido(cliente.nome)
        if (!ultimo) {
          throw new Error('Este cliente nunca foi atendido.')
        }
        texto = textoTemplate('reativacao', {
          nome: cliente.nome,
          ultimoAtendimento: ultimo.data,
          diasSemAtendimento: diasEntre(ultimo.data, hoje),
        })
      } else {
        texto = textoTemplate('retorno', { nome: cliente.nome })
      }
      const idsAntes = new Set(mensagens.map((m) => m.id))
      const nova = criar({
        clienteId: cliente.id,
        cliente: cliente.nome,
        template,
        texto,
        origem: 'crm',
        agendamentoId,
      })
      setAvisoComp(
        idsAntes.has(nova.id)
          ? 'Mensagem idêntica já estava pendente — nada foi duplicado.'
          : 'Mensagem pendente criada. Ela só sai do sistema com integração oficial.',
      )
    } catch (e) {
      setErroComp(e instanceof Error ? e.message : 'Não foi possível criar.')
    }
  }

  async function tentarEnviar(m: MensagemWhats) {
    setErroEnvio('')
    try {
      await enviar(m.id)
    } catch (e) {
      setErroEnvio(
        e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.',
      )
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            WhatsApp
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] text-[#4A4436]">
            Central de mensagens: prepare novas mensagens, acompanhe o que está
            pendente ou enviado e abra o histórico de cada cliente. Tudo é salvo
            automaticamente.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
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

      <p className="mt-3 rounded-lg border border-[#E5DCC3] bg-[#FAF6EB] px-3 py-2.5 text-[13px] text-[#4A4436]">
        Estrutura pronta para a API oficial do WhatsApp Business: configure um
        provedor oficial para habilitar o envio real. Sem integração, as
        mensagens ficam registradas como pendentes.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.rotulo}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
              {kpi.rotulo}
            </p>
            <p className="mt-1 text-lg leading-none font-bold text-[#8A6A14]">
              {kpi.valor}
            </p>
          </div>
        ))}
      </div>

      {/* Preparar nova mensagem com templates oficiais */}
      <div className="mt-5 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <h2 className="text-sm font-bold text-[#1C1A15]">Nova mensagem</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-[12px] font-medium text-[#4A4436]">
            Cliente
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]"
            >
              <option value="">Selecione…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[12px] font-medium text-[#4A4436]">
            Modelo
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as IdTemplate)}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]"
            >
              {TEMPLATES_CENTRAL.map((id) => (
                <option key={id} value={id}>
                  {TEMPLATES_ROTULO[id]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={criarMensagem}
            className="rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Criar mensagem pendente
          </button>
        </div>
        {erroComp && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erroComp}
          </p>
        )}
        {avisoComp && (
          <p className="mt-3 rounded-lg bg-[#E9F5E4] px-3 py-2 text-[13px] text-[#3F6B33]">
            {avisoComp}
          </p>
        )}
      </div>

      {/* Filtros e busca */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === f.id
                  ? 'border-[#8A6A14] bg-[#E9DDC0] text-[#1C1A15]'
                  : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:bg-[#F3ECDA]'
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] font-medium text-[#4A4436]">
          Buscar cliente
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome do cliente"
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]"
          />
        </label>
      </div>

      {erroEnvio && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {erroEnvio}
        </p>
      )}

      {/* Lista de mensagens */}
      <div className="mt-3">
        {filtradas.length === 0 ? (
          <p className="text-sm text-[#A99E85]">
            {mensagens.length === 0
              ? 'Nenhuma mensagem registrada. Use os templates acima, o CRM ou as Automações.'
              : 'Nenhuma mensagem com este filtro.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtradas.map((m) => {
              const ag = m.agendamentoId
                ? agendamentos.find((a) => a.id === m.agendamentoId)
                : undefined
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${corStatus(
                        m.status,
                      )}`}
                    >
                      {STATUS_ROTULO[m.status]}
                    </span>
                    <p className="text-sm font-bold text-[#1C1A15]">
                      {m.cliente}
                    </p>
                    <span className="text-[11px] font-medium text-[#8A8171]">
                      {TEMPLATES_ROTULO[m.template]} · {ORIGEM_ROTULO[m.origem]}{' '}
                      · {formatarISO(m.criadoEm)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#4A4436]">{m.texto}</p>
                  {ag && (
                    <p className="mt-1 text-[12px] text-[#8A6A14]">
                      Agendamento · {formatarDataLonga(ag.data)} às {ag.horario}
                    </p>
                  )}
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
                    <button
                      type="button"
                      aria-label={`Histórico de ${m.cliente}`}
                      onClick={() => {
                        const cliente = clientes.find((c) => c.id === m.clienteId)
                        if (cliente) setClienteDo(cliente)
                      }}
                      className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
                    >
                      Ver histórico
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {clienteDo && (
        <CrmClienteModal
          cliente={clienteDo}
          onFechar={() => setClienteDo(null)}
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
  )
}
