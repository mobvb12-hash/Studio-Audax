// Audax Club — assinaturas + pagamentos (localStorage, mesmo padrão do projeto).
// Dependências: CaixaProvider (pagamento gera lançamento de receita "clube").
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { carregarJSON, salvarJSON } from '@/lib/persistencia'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@/modules/caixa/types'
import {
  addMonthsISO,
  dataISOValida,
  proximoVencimentoAposPagamento,
} from './regras'
import {
  ehPlanoClube,
  PLANOS_ROTULO,
  type AssinaturaClube,
  type PagamentoClube,
} from './types'

const CHAVE_CLUBE = 'studio-audax:clube:v1'

type EstadoClube = {
  assinaturas: AssinaturaClube[]
  pagamentos: PagamentoClube[]
}

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ehEstadoClube(valor: unknown): boolean {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/**
 * A cobrança do ciclo (vencimento) já foi paga: pela pendência do lote
 * atual (duplo clique) ou pelo histórico gravado. Pagamentos legados sem
 * `vencimentoCoberto` não bloqueiam nada.
 */
function cicloJaPago(
  pagamentos: PagamentoClube[],
  pendenciasDoLote: Set<string> | null,
  assinaturaId: string,
  vencimento: string,
): boolean {
  const chave = `${assinaturaId}:${vencimento}`
  if (pendenciasDoLote?.has(chave)) return true
  return pagamentos.some(
    (p) => p.assinaturaId === assinaturaId && p.vencimentoCoberto === vencimento,
  )
}

function carregarEstado(): EstadoClube {
  const parcial = carregarJSON<Partial<EstadoClube>>(
    CHAVE_CLUBE,
    {},
    ehEstadoClube,
  )
  return {
    assinaturas: Array.isArray(parcial.assinaturas) ? parcial.assinaturas : [],
    pagamentos: Array.isArray(parcial.pagamentos) ? parcial.pagamentos : [],
  }
}

export type NovaAssinaturaInput = {
  clienteId: string
  cliente: string
  plano: string
  valorMensal: number
  /** YYYY-MM-DD */
  dataAssinatura: string
}

export type PagamentoAssinaturaInput = {
  assinaturaId: string
  /** YYYY-MM-DD do pagamento */
  data: string
  valor: number
  formaPagamento: FormaPagamento
}

export type AtualizarAssinaturaInput = {
  clienteId?: string
  cliente?: string
  /** string para passar direto da UI; validada com ehPlanoClube */
  plano?: string
  valorMensal?: number
}

export type ResultadoPagamento = {
  assinatura: AssinaturaClube
  pagamento: PagamentoClube
}

export type ClubeContexto = {
  assinaturas: AssinaturaClube[]
  pagamentos: PagamentoClube[]
  /** Assinatura não cancelada do cliente (a em andamento) */
  assinaturaDoCliente: (clienteId: string) => AssinaturaClube | undefined
  /** Cliente ainda não tem assinatura em andamento */
  podeAssinar: (clienteId: string) => boolean
  pagamentosDaAssinatura: (assinaturaId: string) => PagamentoClube[]
  /** Nova assinatura — recusa duplicidade (1 assinatura não cancelada por cliente) */
  assinar: (input: NovaAssinaturaInput) => AssinaturaClube
  /**
   * Edita dados cadastrais da assinatura (cliente, plano, mensalidade).
   * Datas e histórico nunca mudam por aqui: vencimento é gerido por
   * criação, pagamentos e cancelamento.
   */
  atualizar: (
    assinaturaId: string,
    input: AtualizarAssinaturaInput,
  ) => AssinaturaClube
  /** Cancela sem apagar: assinatura e pagamentos permanecem no histórico */
  cancelar: (assinaturaId: string, motivo?: string) => void
  /** Registro de pagamento que renova o ciclo (+1 mês) e entra no Caixa */
  registrarPagamento: (input: PagamentoAssinaturaInput) => ResultadoPagamento
  /** Propaga a renomeacao do cadastro para as assinaturas do cliente */
  renomearCliente: (antigo: string, novo: string) => void
}

const Contexto = createContext<ClubeContexto | null>(null)

export function ClubeProvider({ children }: { children: ReactNode }) {
  const { registrarReceitaClube } = useCaixa()
  const [estado, setEstado] = useState<EstadoClube>(carregarEstado)

  /**
   * Cobranças pagas no lote de estado atual (duplo clique/submit): duas
   * chamadas antes do re-render enxergam o mesmo snapshot, então registramos
   * aqui o que já foi coberto para nunca duplicar o mesmo ciclo.
   */
  const ciclosPagos = useRef<Set<string> | null>(null)

  useEffect(() => {
    // Estado já reflete as cobranças: volta ao histórico gravado.
    ciclosPagos.current = null
  }, [estado])

  useEffect(() => {
    salvarJSON(CHAVE_CLUBE, estado)
  }, [estado])

  const assinaturaDoCliente = useCallback(
    (clienteId: string) =>
      estado.assinaturas.find((a) => a.clienteId === clienteId && !a.cancelada),
    [estado.assinaturas],
  )

  const podeAssinar = useCallback(
    (clienteId: string) =>
      Boolean(clienteId) &&
      !estado.assinaturas.some((a) => a.clienteId === clienteId && !a.cancelada),
    [estado.assinaturas],
  )

  const pagamentosDaAssinatura = useCallback(
    (assinaturaId: string) =>
      estado.pagamentos
        .filter((p) => p.assinaturaId === assinaturaId)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [estado.pagamentos],
  )

  const assinar = useCallback(
    (input: NovaAssinaturaInput): AssinaturaClube => {
      const clienteId = input.clienteId.trim()
      const cliente = input.cliente.trim()
      if (!clienteId) throw new Error('Selecione o cliente.')
      if (!cliente) throw new Error('Cliente sem identificação.')
      if (!ehPlanoClube(input.plano)) throw new Error('Selecione o plano.')
      if (!Number.isFinite(input.valorMensal) || input.valorMensal <= 0) {
        throw new Error('O valor da mensalidade deve ser maior que zero.')
      }
      if (!dataISOValida(input.dataAssinatura)) {
        throw new Error('Informe a data de assinatura válida (AAAA-MM-DD).')
      }
      if (!podeAssinar(clienteId)) {
        throw new Error(
          'Este cliente já tem uma assinatura em andamento. Cancele a anterior antes de criar outra.',
        )
      }

      const nova: AssinaturaClube = {
        id: gerarId(),
        clienteId,
        cliente,
        plano: input.plano as AssinaturaClube['plano'],
        valorMensal: Math.round(input.valorMensal * 100) / 100,
        dataAssinatura: input.dataAssinatura,
        proximoVencimento: addMonthsISO(input.dataAssinatura, 1),
        cancelada: false,
        criadoEm: new Date().toISOString(),
      }
      setEstado((atual) => ({ ...atual, assinaturas: [...atual.assinaturas, nova] }))
      return nova
    },
    [podeAssinar],
  )

  const atualizar = useCallback(
    (assinaturaId: string, input: AtualizarAssinaturaInput): AssinaturaClube => {
      const alvo = estado.assinaturas.find((a) => a.id === assinaturaId)
      if (!alvo) throw new Error('Assinatura não encontrada.')
      if (alvo.cancelada) {
        throw new Error('Assinatura cancelada não pode ser editada.')
      }
      const plano = input.plano ?? alvo.plano
      if (!ehPlanoClube(plano)) throw new Error('Selecione o plano.')
      const valorMensal = input.valorMensal ?? alvo.valorMensal
      if (!Number.isFinite(valorMensal) || valorMensal <= 0) {
        throw new Error('O valor da mensalidade deve ser maior que zero.')
      }
      const clienteId = (input.clienteId ?? alvo.clienteId).trim()
      const cliente = (input.cliente ?? alvo.cliente).trim()
      if (!clienteId) throw new Error('Selecione o cliente.')
      if (!cliente) throw new Error('Cliente sem identificação.')
      if (clienteId !== alvo.clienteId && !podeAssinar(clienteId)) {
        throw new Error(
          'Este cliente já tem uma assinatura em andamento. Cancele a anterior antes de criar outra.',
        )
      }

      const atualizada: AssinaturaClube = {
        ...alvo,
        clienteId,
        cliente,
        plano: plano as AssinaturaClube['plano'],
        valorMensal: Math.round(valorMensal * 100) / 100,
      }
      setEstado((atual) => ({
        ...atual,
        assinaturas: atual.assinaturas.map((a) =>
          a.id === assinaturaId ? atualizada : a,
        ),
      }))
      return atualizada
    },
    [estado.assinaturas, podeAssinar],
  )

  const cancelar = useCallback(
    (assinaturaId: string, motivo?: string) => {
      const alvo = estado.assinaturas.find((a) => a.id === assinaturaId)
      if (!alvo) throw new Error('Assinatura não encontrada.')
      if (alvo.cancelada) throw new Error('Esta assinatura já foi cancelada.')
      setEstado((atual) => ({
        ...atual,
        assinaturas: atual.assinaturas.map((a) =>
          a.id === assinaturaId
            ? {
                ...a,
                cancelada: true,
                canceladaEm: hojeISO(),
                motivoCancelamento: motivo?.trim() || undefined,
              }
            : a,
        ),
      }))
    },
    [estado.assinaturas],
  )

  const registrarPagamento = useCallback(
    (input: PagamentoAssinaturaInput): ResultadoPagamento => {
      const ass = estado.assinaturas.find((a) => a.id === input.assinaturaId)
      if (!ass) throw new Error('Assinatura não encontrada.')
      if (ass.cancelada) {
        throw new Error('Assinatura cancelada não recebe pagamentos.')
      }
      if (!Number.isFinite(input.valor) || input.valor <= 0) {
        throw new Error('O valor do pagamento deve ser maior que zero.')
      }
      if (!dataISOValida(input.data)) {
        throw new Error('Informe a data do pagamento válida (AAAA-MM-DD).')
      }
      if (!FORMAS_PAGAMENTO.includes(input.formaPagamento)) {
        throw new Error('Selecione a forma de pagamento.')
      }
      // Cobrança do ciclo atual já paga: recusa duplicidade — tanto no mesmo
      // lote (pendência) quanto pelo histórico já gravado.
      if (
        cicloJaPago(
          estado.pagamentos,
          ciclosPagos.current,
          ass.id,
          ass.proximoVencimento,
        )
      ) {
        throw new Error(
          'Esta cobrança já foi paga. O próximo ciclo só pode ser pago após a renovação.',
        )
      }

      // Caixa primeiro (lançamento do dia) — lança erro de caixa fechado
      // antes de qualquer mudança nas assinaturas.
      const lancamento = registrarReceitaClube({
        data: input.data,
        descricao: `Assinatura ${PLANOS_ROTULO[ass.plano]} — ${ass.cliente}`,
        valor: input.valor,
        formaPagamento: input.formaPagamento,
        cliente: ass.cliente,
        clienteId: ass.clienteId,
        assinaturaId: ass.id,
      })

      const pagamento: PagamentoClube = {
        id: gerarId(),
        assinaturaId: ass.id,
        clienteId: ass.clienteId,
        data: input.data,
        valor: Math.round(input.valor * 100) / 100,
        formaPagamento: input.formaPagamento,
        caixaLancamentoId: lancamento.id,
        vencimentoCoberto: ass.proximoVencimento,
        criadoEm: new Date().toISOString(),
      }
      if (!ciclosPagos.current) ciclosPagos.current = new Set()
      ciclosPagos.current.add(`${ass.id}:${ass.proximoVencimento}`)
      const atualizada: AssinaturaClube = {
        ...ass,
        proximoVencimento: proximoVencimentoAposPagamento(
          ass.proximoVencimento,
          input.data,
        ),
      }
      setEstado((atual) => ({
        assinaturas: atual.assinaturas.map((a) =>
          a.id === ass.id ? atualizada : a,
        ),
        pagamentos: [...atual.pagamentos, pagamento],
      }))
      return { assinatura: atualizada, pagamento }
    },
    [estado.assinaturas, estado.pagamentos, registrarReceitaClube],
  )

  const renomearCliente = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setEstado((atual) => ({
      ...atual,
      assinaturas: atual.assinaturas.map((a) =>
        a.cliente === antigo ? { ...a, cliente: destino } : a,
      ),
    }))
  }, [])

  const valor = useMemo(
    () => ({
      assinaturas: estado.assinaturas,
      pagamentos: estado.pagamentos,
      assinaturaDoCliente,
      podeAssinar,
      pagamentosDaAssinatura,
      assinar,
      atualizar,
      cancelar,
      registrarPagamento,
      renomearCliente,
    }),
    [
      estado.assinaturas,
      estado.pagamentos,
      assinaturaDoCliente,
      podeAssinar,
      pagamentosDaAssinatura,
      assinar,
      atualizar,
      cancelar,
      registrarPagamento,
      renomearCliente,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useClube(): ClubeContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useClube deve ser usado dentro de ClubeProvider')
  return ctx
}
