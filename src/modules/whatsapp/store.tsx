import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { carregarJSON, salvarJSON } from '@/lib/persistencia'
import { normalizarTexto } from '@/lib/moeda'
import { supabase } from '@/lib/supabase'
import { CHAVE_STORAGE_CLIENTES } from '@/modules/clientes/migracao'
import { normalizarCliente } from '@/modules/clientes/regras'
import type { Cliente } from '@/modules/clientes/types'
import { enviarTextoWhatsApp } from '@/services/evolution'
import type { ProvedorEnvio } from './provedor'
import {
  ehIdTemplate,
  type IdTemplate,
  type MensagemWhats,
  type NovaMensagemInput,
  type OrigemMensagem,
  type StatusMensagem,
} from './types'

const CHAVE_STORAGE = 'studio-audax:whatsapp:v1'

export const ERRO_SEM_INTEGRACAO =
  'Integração com WhatsApp não configurada. Configure um provedor oficial para habilitar o envio.'

/** Preenche campos ausentes (registros antigos) com os padrões atuais. */
function normalizarMensagem(bruto: Partial<MensagemWhats>): MensagemWhats {
  const template = ehIdTemplate(bruto.template)
    ? bruto.template
    : ('confirmacao' as IdTemplate)
  const status: StatusMensagem =
    bruto.status === 'enviada' || bruto.status === 'falhou'
      ? bruto.status
      : 'pendente'
  const origem: OrigemMensagem =
    bruto.origem === 'ia' || bruto.origem === 'automacao'
      ? bruto.origem
      : 'crm'
  return {
    id: bruto.id ?? '',
    clienteId: bruto.clienteId ?? '',
    cliente: bruto.cliente ?? '',
    template,
    texto: bruto.texto ?? '',
    status,
    origem,
    motivoFalha: bruto.motivoFalha,
    criadoEm: bruto.criadoEm ?? new Date().toISOString(),
    enviadoEm: bruto.enviadoEm,
    agendamentoId: bruto.agendamentoId,
  }
}

type WhatsContexto = {
  mensagens: MensagemWhats[]
  /** true somente quando um provedor oficial é configurado */
  integracaoAtiva: boolean
  /** Cria a mensagem como pendente — nunca envia automaticamente */
  criar: (input: NovaMensagemInput) => MensagemWhats
  /** Envia pelo provedor; sem integração configurada lança erro e nada muda */
  enviar: (id: string) => Promise<void>
  /** Registra envio feito manualmente fora do sistema (ex.: WhatsApp Web) */
  registrarEnvioManual: (id: string) => void
  registrarFalha: (id: string, motivo: string) => void
  configurarProvedor: (provedor: ProvedorEnvio | null) => void
  mensagensDoCliente: (clienteId: string) => MensagemWhats[]
  /** Propaga a renomeação de cliente ao rótulo das mensagens */
  renomearCliente: (antigo: string, novo: string) => void
}

const Contexto = createContext<WhatsContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function carregar(): MensagemWhats[] {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do fallback.
  const bruto = carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray)
  if (!Array.isArray(bruto)) return []
  return (bruto as Partial<MensagemWhats>[]).map(normalizarMensagem)
}

function ordenar(lista: MensagemWhats[]): MensagemWhats[] {
  return [...lista].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

/**
 * Telefone do cliente da mensagem, lido do cadastro (mesma chave que o
 * ClientesProvider grava). O WhatsApp store não guarda telefone próprio e
 * nunca inventa um: sem cadastro ou sem número o envio é recusado com motivo.
 */
function telefoneDoCliente(clienteId: string): string {
  const bruto = carregarJSON<unknown>(
    CHAVE_STORAGE_CLIENTES,
    null,
    Array.isArray,
  )
  if (!Array.isArray(bruto)) return ''
  const cliente = (bruto as Partial<Cliente>[])
    .map(normalizarCliente)
    .find((c) => c.id === clienteId)
  return cliente?.telefone.trim() ?? ''
}

/**
 * Provedor padrão: envio de texto pela Evolution API através da Edge Function
 * `whatsapp-enviar` (mesmo contrato `ResultadoEnvio` de provedor.ts).
 */
const provedorEvolution: ProvedorEnvio = {
  nome: 'evolution',
  enviar: async (mensagem) => {
    const telefone = telefoneDoCliente(mensagem.clienteId)
    if (!telefone) {
      return { ok: false, motivo: 'Cliente sem telefone cadastrado.' }
    }
    return enviarTextoWhatsApp(telefone, mensagem.texto)
  },
}

export function WhatsProvider({ children }: { children: ReactNode }) {
  const [mensagens, setMensagens] = useState<MensagemWhats[]>(() => carregar())
  const [provedor, setProvedor] = useState<ProvedorEnvio | null>(null)
  // Provedor efetivo: o que a tela configurou ou o padrão (Evolution), que só
  // existe quando o Supabase está configurado — sem nada, nada sai do sistema.
  const provedorEfetivo = provedor ?? (supabase() ? provedorEvolution : null)

  useEffect(() => {
    salvarJSON(CHAVE_STORAGE, mensagens)
  }, [mensagens])

  const criar = useCallback((input: NovaMensagemInput) => {
    const clienteId = input.clienteId.trim()
    const texto = input.texto.trim()
    if (!clienteId) {
      throw new Error('Selecione um cliente para criar a mensagem.')
    }
    if (!ehIdTemplate(input.template)) {
      throw new Error('Template de mensagem inválido.')
    }
    if (texto.length < 3) {
      throw new Error('A mensagem precisa de um texto.')
    }
    // Anti-duplicação: uma pendente idêntica (mesmo cliente, template,
    // texto e vínculo) é reutilizada — nunca cria duas cópias iguais.
    const existente = mensagens.find(
      (m) =>
        m.clienteId === clienteId &&
        m.template === input.template &&
        m.texto === texto &&
        m.status === 'pendente' &&
        (m.agendamentoId ?? '') === (input.agendamentoId ?? ''),
    )
    if (existente) return existente
    const nova: MensagemWhats = normalizarMensagem({
      id: gerarId(),
      clienteId,
      cliente: input.cliente.trim(),
      template: input.template,
      texto,
      status: 'pendente',
      origem: input.origem ?? 'crm',
      criadoEm: new Date().toISOString(),
      agendamentoId: input.agendamentoId,
    })
    setMensagens((atual) => ordenar([nova, ...atual]))
    return nova
  }, [mensagens])

  const enviar = useCallback(
    async (id: string) => {
      const alvo = mensagens.find((m) => m.id === id)
      if (!alvo) {
        throw new Error('Mensagem não encontrada.')
      }
      // Sem provedor (nem Supabase): NÃO tenta enviar e nada muda no estado.
      if (!provedorEfetivo) {
        throw new Error(ERRO_SEM_INTEGRACAO)
      }
      const resultado = await provedorEfetivo.enviar(alvo)
      setMensagens((atual) =>
        atual.map((m) =>
          m.id === id
            ? resultado.ok
              ? {
                  ...m,
                  status: 'enviada' as const,
                  enviadoEm: new Date().toISOString(),
                  motivoFalha: undefined,
                }
              : {
                  ...m,
                  status: 'falhou' as const,
                  motivoFalha:
                    resultado.motivo?.trim() || 'Falha no envio pelo provedor.',
                }
            : m,
        ),
      )
    },
    [mensagens, provedorEfetivo],
  )

  const registrarEnvioManual = useCallback((id: string) => {
    setMensagens((atual) =>
      atual.map((m) =>
        m.id === id
          ? {
              ...m,
              status: 'enviada' as const,
              enviadoEm: new Date().toISOString(),
              motivoFalha: undefined,
            }
          : m,
      ),
    )
  }, [])

  const registrarFalha = useCallback((id: string, motivo: string) => {
    const texto = motivo.trim()
    if (!texto) {
      throw new Error('Informe o motivo da falha.')
    }
    setMensagens((atual) =>
      atual.map((m) =>
        m.id === id
          ? { ...m, status: 'falhou' as const, motivoFalha: texto }
          : m,
      ),
    )
  }, [])

  const configurarProvedor = useCallback(
    (novo: ProvedorEnvio | null) => setProvedor(novo),
    [],
  )

  const mensagensDoCliente = useCallback(
    (clienteId: string) => mensagens.filter((m) => m.clienteId === clienteId),
    [mensagens],
  )

  const renomearCliente = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    // Propagação casa por chave normalizada (mesma regra do dedupe do
    // cadastro): dado legado com caixa/acentos diferentes não engancha.
    const chave = normalizarTexto(antigo)
    setMensagens((atual) =>
      atual.map((m) =>
        normalizarTexto(m.cliente) === chave ? { ...m, cliente: destino } : m,
      ),
    )
  }, [])

  const valor = useMemo(
    () => ({
      mensagens,
      integracaoAtiva: provedorEfetivo !== null,
      criar,
      enviar,
      registrarEnvioManual,
      registrarFalha,
      configurarProvedor,
      mensagensDoCliente,
      renomearCliente,
    }),
    [
      mensagens,
      provedorEfetivo,
      criar,
      enviar,
      registrarEnvioManual,
      registrarFalha,
      configurarProvedor,
      mensagensDoCliente,
      renomearCliente,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useWhats(): WhatsContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useWhats deve ser usado dentro de WhatsProvider')
  return ctx
}
