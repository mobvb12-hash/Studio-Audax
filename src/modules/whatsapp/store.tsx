import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { ProvedorEnvio } from './provedor'
import {
  TEMPLATES_ORDEM,
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
  const template =
    bruto.template && TEMPLATES_ORDEM.includes(bruto.template)
      ? bruto.template
      : ('confirmacao' as IdTemplate)
  const status: StatusMensagem =
    bruto.status === 'enviada' || bruto.status === 'falhou'
      ? bruto.status
      : 'pendente'
  const origem: OrigemMensagem = bruto.origem === 'ia' ? 'ia' : 'crm'
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
}

const Contexto = createContext<WhatsContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function carregar(): MensagemWhats[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as Partial<MensagemWhats>[]
    return Array.isArray(lista) ? lista.map(normalizarMensagem) : []
  } catch {
    return []
  }
}

function ordenar(lista: MensagemWhats[]): MensagemWhats[] {
  return [...lista].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export function WhatsProvider({ children }: { children: ReactNode }) {
  const [mensagens, setMensagens] = useState<MensagemWhats[]>(() => carregar())
  const [provedor, setProvedor] = useState<ProvedorEnvio | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(mensagens))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [mensagens])

  const criar = useCallback((input: NovaMensagemInput) => {
    const clienteId = input.clienteId.trim()
    const texto = input.texto.trim()
    if (!clienteId) {
      throw new Error('Selecione um cliente para criar a mensagem.')
    }
    if (!input.template || !TEMPLATES_ORDEM.includes(input.template)) {
      throw new Error('Template de mensagem inválido.')
    }
    if (texto.length < 3) {
      throw new Error('A mensagem precisa de um texto.')
    }
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
  }, [])

  const enviar = useCallback(
    async (id: string) => {
      const alvo = mensagens.find((m) => m.id === id)
      if (!alvo) {
        throw new Error('Mensagem não encontrada.')
      }
      // Sem provedor configurado: NÃO tenta enviar e nada muda no estado.
      if (!provedor) {
        throw new Error(ERRO_SEM_INTEGRACAO)
      }
      const resultado = await provedor.enviar(alvo)
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
    [mensagens, provedor],
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

  const valor = useMemo(
    () => ({
      mensagens,
      integracaoAtiva: provedor !== null,
      criar,
      enviar,
      registrarEnvioManual,
      registrarFalha,
      configurarProvedor,
      mensagensDoCliente,
    }),
    [
      mensagens,
      provedor,
      criar,
      enviar,
      registrarEnvioManual,
      registrarFalha,
      configurarProvedor,
      mensagensDoCliente,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useWhats(): WhatsContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useWhats deve ser usado dentro de WhatsProvider')
  return ctx
}
