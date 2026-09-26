// Lista de Espera — estado local + localStorage. A fila é separada da
// Agenda: nenhum pedido vira agendamento sozinho e nenhum WhatsApp é
// enviado daqui (confirmação/lembrete ficam para a Fase 8).
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
import { validarPedido } from './regras'
import type {
  NovoPedidoInput,
  PedidoEspera,
  StatusEspera,
} from './types'

const CHAVE = 'studio-audax:espera:v1'

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function montarPedido(
  input: NovoPedidoInput,
  extras: Partial<Pick<PedidoEspera, 'id' | 'status' | 'criadoEm' | 'encerradoEm'>>,
): PedidoEspera {
  return {
    id: extras.id ?? gerarId(),
    clienteId: input.clienteId.trim(),
    cliente: input.cliente.trim(),
    telefone: input.telefone.trim(),
    servico: input.servico.trim(),
    profissional: (input.profissional ?? '').trim(),
    periodo: input.periodo ?? 'qualquer',
    dataPreferida: input.dataPreferida ?? '',
    observacao: (input.observacao ?? '').trim(),
    status: extras.status ?? 'aguardando',
    criadoEm: extras.criadoEm ?? new Date().toISOString(),
    ...(extras.encerradoEm ? { encerradoEm: extras.encerradoEm } : {}),
  }
}

type EsperaContexto = {
  pedidos: PedidoEspera[]
  /** Valida e trava duplicidade (mesmo cliente já aguardando) */
  adicionar: (input: NovoPedidoInput) => PedidoEspera
  editar: (id: string, input: NovoPedidoInput) => void
  /** Encerra o pedido (atendido/cancelado) — só de quem está aguardando */
  mudarStatus: (
    id: string,
    status: Exclude<StatusEspera, 'aguardando'>,
  ) => void
  remover: (id: string) => void
  renomearCliente: (antigo: string, novo: string) => void
  renomearProfissional: (antigo: string, novo: string) => void
  renomearServico: (antigo: string, novo: string) => void
}

const Contexto = createContext<EsperaContexto | null>(null)

/** Estado vazio compartilhado (provider ausente em testes/árvores avulsas). */
const VAZIO: EsperaContexto = {
  pedidos: [],
  adicionar: () => {
    throw new Error('useEspera precisa do EsperaProvider.')
  },
  editar: () => {},
  mudarStatus: () => {},
  remover: () => {},
  renomearCliente: () => {},
  renomearProfissional: () => {},
  renomearServico: () => {},
}

export function EsperaProvider({ children }: { children: ReactNode }) {
  const [pedidos, setPedidos] = useState<PedidoEspera[]>(() =>
    carregarJSON<PedidoEspera[]>(CHAVE, [], Array.isArray),
  )

  useEffect(() => {
    salvarJSON(CHAVE, pedidos)
  }, [pedidos])

  // Validações acontecem ANTES do set: o updater do React pode rodar em
  // outro momento e um throw lá dentro não seria pego pelo chamador.
  const adicionar = useCallback(
    (input: NovoPedidoInput) => {
      validarPedido(input)
      const clienteId = input.clienteId.trim()
      const duplicado = pedidos.some(
        (p) => p.clienteId === clienteId && p.status === 'aguardando',
      )
      if (duplicado) {
        throw new Error('Este cliente já está na lista de espera.')
      }
      const pedido = montarPedido(input, {})
      setPedidos((atual) => [...atual, pedido])
      return pedido
    },
    [pedidos],
  )

  const editar = useCallback(
    (id: string, input: NovoPedidoInput) => {
      validarPedido(input)
      const existente = pedidos.find((p) => p.id === id)
      if (!existente) {
        throw new Error('Pedido da lista de espera não encontrado.')
      }
      const clienteId = input.clienteId.trim()
      const duplicado = pedidos.some(
        (p) =>
          p.id !== id && p.clienteId === clienteId && p.status === 'aguardando',
      )
      if (duplicado) {
        throw new Error('Este cliente já está na lista de espera.')
      }
      const atualizado = montarPedido(input, {
        id,
        status: existente.status,
        criadoEm: existente.criadoEm,
        encerradoEm: existente.encerradoEm,
      })
      setPedidos((atual) => atual.map((p) => (p.id === id ? atualizado : p)))
    },
    [pedidos],
  )

  const mudarStatus = useCallback(
    (id: string, status: Exclude<StatusEspera, 'aguardando'>) => {
      if (status !== 'atendido' && status !== 'cancelado')
        throw new Error('Status inválido para a lista de espera.')
      const existente = pedidos.find((p) => p.id === id)
      if (!existente) {
        throw new Error('Pedido da lista de espera não encontrado.')
      }
      if (existente.status !== 'aguardando') {
        throw new Error('Este pedido já foi encerrado.')
      }
      setPedidos((atual) =>
        atual.map((p) =>
          p.id === id
            ? { ...p, status, encerradoEm: new Date().toISOString() }
            : p,
        )
      )
    },
    [pedidos],
  )

  const remover = useCallback((id: string) => {
    setPedidos((atual) => atual.filter((p) => p.id !== id))
  }, [])

  const renomearCliente = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setPedidos((atual) =>
      atual.map((p) => (p.cliente === antigo ? { ...p, cliente: destino } : p)),
    )
  }, [])

  const renomearProfissional = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setPedidos((atual) =>
      atual.map((p) =>
        p.profissional === antigo ? { ...p, profissional: destino } : p,
      ),
    )
  }, [])

  const renomearServico = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setPedidos((atual) =>
      atual.map((p) => (p.servico === antigo ? { ...p, servico: destino } : p)),
    )
  }, [])

  const valor = useMemo(
    () => ({
      pedidos,
      adicionar,
      editar,
      mudarStatus,
      remover,
      renomearCliente,
      renomearProfissional,
      renomearServico,
    }),
    [
      pedidos,
      adicionar,
      editar,
      mudarStatus,
      remover,
      renomearCliente,
      renomearProfissional,
      renomearServico,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEspera(): EsperaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useEspera deve ser usado dentro de EsperaProvider')
  return ctx
}

/**
 * useEspera tolerante a árvore sem provider (Dashboard e renomeações
 * em páginas testadas avulsas): devolve estado vazio em vez de erro.
 */
export function useEsperaOpcional(): EsperaContexto {
  return useContext(Contexto) ?? VAZIO
}
