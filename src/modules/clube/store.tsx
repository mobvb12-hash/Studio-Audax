// Audax Club — assinaturas + pagamentos (localStorage + espelho no Supabase).
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
import {
  avisarFalhaSincronizacao,
  carregarJSON,
  salvarJSON,
} from '@/lib/persistencia'
import { normalizarTexto } from '@/lib/moeda'
import { supabase } from '@/lib/supabase'
import { hojeISO } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@/modules/caixa/types'
import {
  gravarAssinatura,
  gravarPagamento,
  importarAssinaturas,
  importarPagamentos,
  listarAssinaturas,
  listarPagamentos,
} from '@/services/supabase/clube'
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
 * atual (duplo clique) ou pelo histórico gravado. Pagamento cujo
 * lançamento no caixa foi estornado NÃO cobre o ciclo (o dinheiro
 * voltou — a cobrança pode ser feita de novo). Pagamentos legados sem
 * `vencimentoCoberto` ou sem lançamento vinculado não bloqueiam nada.
 */
function cicloJaPago(
  pagamentos: PagamentoClube[],
  pendenciasDoLote: Set<string> | null,
  assinaturaId: string,
  vencimento: string,
  estornados: ReadonlySet<string>,
): boolean {
  const chave = `${assinaturaId}:${vencimento}`
  if (pendenciasDoLote?.has(chave)) return true
  return pagamentos.some(
    (p) =>
      p.assinaturaId === assinaturaId &&
      p.vencimentoCoberto === vencimento &&
      (!p.caixaLancamentoId || !estornados.has(p.caixaLancamentoId)),
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

// ---------------------------------------------------------------------------
// Integração com o Supabase (mesmo padrão de Caixa/Agenda/Comissões)
// ---------------------------------------------------------------------------

/** JSON com chaves ordenadas: o `jsonb` do Postgres não preserva a ordem. */
function estavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(estavel).join(',')}]`
  if (valor && typeof valor === 'object') {
    const objeto = valor as Record<string, unknown>
    return `{${Object.keys(objeto)
      .sort()
      .map((chave) => `${JSON.stringify(chave)}:${estavel(objeto[chave])}`)
      .join(',')}}`
  }
  return JSON.stringify(valor) ?? 'null'
}

function assinaturaAssinatura(a: AssinaturaClube): string {
  return estavel({
    id: a.id,
    cliente_id: a.clienteId || null,
    cliente: a.cliente,
    plano: a.plano,
    valor_mensal: a.valorMensal,
    data_assinatura: a.dataAssinatura,
    proximo_vencimento: a.proximoVencimento,
    cancelada: a.cancelada,
    cancelada_em: a.canceladaEm ?? null,
    motivo_cancelamento: a.motivoCancelamento ?? null,
  })
}

function assinaturaPagamento(p: PagamentoClube): string {
  return estavel({
    id: p.id,
    assinatura_id: p.assinaturaId || null,
    cliente_id: p.clienteId || null,
    data: p.data,
    valor: p.valor,
    forma_pagamento: p.formaPagamento,
    caixa_lancamento_id: p.caixaLancamentoId ?? null,
    vencimento_coberto: p.vencimentoCoberto ?? null,
  })
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Snapshot do que será substituído; false = não gravou (nada muda). */
function criarSnapshot(perdedores: unknown[]): boolean {
  const prefixo = `${CHAVE_CLUBE}:backup:`
  const destino = `${prefixo}${carimbo()}`
  try {
    localStorage.setItem(destino, JSON.stringify(perdedores))
    if (localStorage.getItem(destino) === null) return false
    const antigas: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const existente = localStorage.key(i)
      if (existente?.startsWith(prefixo)) antigas.push(existente)
    }
    antigas.sort()
    antigas
      .slice(0, Math.max(0, antigas.length - 3))
      .forEach((chaveAntiga) => localStorage.removeItem(chaveAntiga))
    return true
  } catch {
    return false
  }
}

type Integracao<T> = {
  rotulo: string
  id: (registro: T) => string
  locais: T[]
  remotos: T[]
  assinatura: (registro: T) => string
  /** em divergência, quem tem o carimbo mais novo vence */
  maisRecente: (local: T, remoto: T) => boolean
  importar: (lista: T[]) => Promise<number>
}

/**
 * União por `id` + reenvio das pendências. O reenvio é `upsert` pela mesma
 * chave do app: assinatura ou pagamento enviados três vezes continuam sendo UM
 * registro cada — nenhuma mensalidade entra duas vezes. Em divergência vence o
 * carimbo mais recente e o perdedor vai para o snapshot.
 */
async function integrar<T>({
  rotulo,
  id,
  locais,
  remotos,
  assinatura,
  maisRecente,
  importar,
}: Integracao<T>): Promise<T[]> {
  const remotoPorId = new Map(remotos.map((registro) => [id(registro), registro]))
  const porId = new Map<string, T>()
  const ordem: string[] = []
  const enviar: T[] = []
  const perdedores: T[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(id(local))
    if (!remoto) {
      porId.set(id(local), local)
      ordem.push(id(local))
      enviar.push(local)
      continue
    }
    porId.set(id(local), remoto)
    ordem.push(id(local))
    if (assinatura(local) === assinatura(remoto)) continue
    if (maisRecente(local, remoto)) {
      perdedores.push(remoto)
      porId.set(id(local), local)
      enviar.push(local)
    } else {
      perdedores.push(local)
    }
  }
  for (const remoto of remotos) {
    if (porId.has(id(remoto))) continue
    porId.set(id(remoto), remoto)
    ordem.push(id(remoto))
  }

  if (perdedores.length > 0 && !criarSnapshot(perdedores)) {
    const divergentes = new Set(perdedores.map((registro) => id(registro)))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(id(enviar[i]))) enviar.splice(i, 1)
    }
    console.warn(
      `[clube] snapshot indisponível — divergências de ${rotulo} mantidas sem envio.`,
    )
  }

  if (enviar.length > 0) {
    try {
      const enviados = await importar(enviar)
      if (enviados < enviar.length) {
        console.warn(
          `[clube] envio incompleto de ${rotulo}: ${enviados} de ${enviar.length} — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      console.warn(`[clube] falha ao enviar ${rotulo} para o Supabase.`, erro)
    }
  }

  return ordem
    .map((chave) => porId.get(chave))
    .filter((registro): registro is T => registro !== undefined)
}

/**
 * Junta a lista oficial com o que a tela fez durante a carga: mudança da
 * sessão vence, registro criado no meio da carga não some. Em instalação nova
 * só o que a sessão alterou acompanha a lista.
 */
function fundir<T>(
  base: T[],
  atual: T[],
  alterados: Set<string>,
  instalacaoNova: boolean,
  id: (registro: T) => string,
): T[] {
  const porId = new Map(base.map((registro) => [id(registro), registro]))
  const ordem = base.map((registro) => id(registro))
  for (const registro of atual) {
    if (alterados.has(id(registro))) {
      if (!porId.has(id(registro))) ordem.push(id(registro))
      porId.set(id(registro), registro)
      continue
    }
    if (porId.has(id(registro))) continue
    if (instalacaoNova) continue
    ordem.push(id(registro))
    porId.set(id(registro), registro)
  }
  return ordem
    .map((chave) => porId.get(chave))
    .filter((registro): registro is T => registro !== undefined)
}

type ClubeSupabase = {
  assinaturas: AssinaturaClube[]
  pagamentos: PagamentoClube[]
}

/**
 * Integração completa do clube. Falha de leitura em qualquer parte derruba a
 * integração inteira: nada é aplicado pela metade e nada é reenviado — o
 * estado local fica intacto.
 */
async function integrarClube(
  assinaturasLocais: AssinaturaClube[],
  pagamentosLocais: PagamentoClube[],
  instalacaoNova: boolean,
): Promise<ClubeSupabase> {
  const [assinaturasRemotas, pagamentosRemotos] = await Promise.all([
    listarAssinaturas(),
    listarPagamentos(),
  ])

  // instalação nova (nada neste dispositivo): o servidor é a verdade e o que
  // a tela criou durante a carga é re-aplicado pelo `fundir`
  if (
    instalacaoNova &&
    (assinaturasRemotas.length > 0 || pagamentosRemotos.length > 0)
  ) {
    return { assinaturas: assinaturasRemotas, pagamentos: pagamentosRemotos }
  }

  const [assinaturas, pagamentos] = await Promise.all([
    integrar<AssinaturaClube>({
      rotulo: 'assinaturas',
      id: (a) => a.id,
      locais: assinaturasLocais,
      remotos: assinaturasRemotas,
      assinatura: assinaturaAssinatura,
      // registro antigo (sem carimbo) não rebaixa a versão do servidor
      maisRecente: (local, remoto) =>
        (local.atualizadoEm ?? '') > (remoto.atualizadoEm ?? ''),
      importar: importarAssinaturas,
    }),
    integrar<PagamentoClube>({
      rotulo: 'pagamentos',
      id: (p) => p.id,
      locais: pagamentosLocais,
      remotos: pagamentosRemotos,
      assinatura: assinaturaPagamento,
      // histórico: o registro mais novo (maior criadoEm) vence
      maisRecente: (local, remoto) => local.criadoEm > remoto.criadoEm,
      importar: importarPagamentos,
    }),
  ])

  return { assinaturas, pagamentos }
}

/** Integração em andamento compartilhada (StrictMode executa o efeito 2x). */
let promessaIntegracao: Promise<ClubeSupabase> | null = null

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
  const { registrarReceitaClube, lancamentos } = useCaixa()
  const [estado, setEstado] = useState<EstadoClube>(carregarEstado)
  const temSupabase = supabase() !== null
  const [sincronizado, setSincronizado] = useState(false)
  const [instalacaoNova] = useState(
    () => carregarJSON<unknown>(CHAVE_CLUBE, null, ehEstadoClube) === null,
  )
  const alteradosAssinaturas = useRef<Set<string>>(new Set())
  const alteradosPagamentos = useRef<Set<string>>(new Set())
  const estadoLocal = useRef<EstadoClube>(estado)

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
    estadoLocal.current = estado
  }, [estado])

  // O Supabase é a fonte oficial do clube, mas o estado local nunca é
  // substituído: a integração une os dois lados, reenvia as pendências e o
  // resultado é mesclado com o que a tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarClube(
        estadoLocal.current.assinaturas,
        estadoLocal.current.pagamentos,
        instalacaoNova,
      )
    }
    promessaIntegracao
      .then((base) => {
        if (!vivo) return
        setEstado((atual) => ({
          assinaturas: fundir(
            base.assinaturas,
            atual.assinaturas,
            alteradosAssinaturas.current,
            instalacaoNova,
            (a) => a.id,
          ),
          pagamentos: fundir(
            base.pagamentos,
            atual.pagamentos,
            alteradosPagamentos.current,
            instalacaoNova,
            (p) => p.id,
          ),
        }))
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém o clube local intacto e não
        // reenvia nada (evita sobrescrever dado do servidor)
        if (vivo) {
          console.warn(
            '[clube] Supabase indisponível — seguindo com os dados locais.',
            erro,
          )
        }
      })
      .finally(() => {
        promessaIntegracao = null
        if (vivo) setSincronizado(true)
      })
    return () => {
      vivo = false
    }
  }, [temSupabase, instalacaoNova])

  /**
   * Só trava a persistência local quando existe risco real de sobrescrever
   * dado do servidor: sem Supabase, ou antes da carga com nada pendente.
   */
  const podeGravar = useCallback(() => {
    if (!temSupabase) return true
    if (sincronizado) return true
    return (
      alteradosAssinaturas.current.size > 0 ||
      alteradosPagamentos.current.size > 0
    )
  }, [temSupabase, sincronizado])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_CLUBE, estado)
  }, [estado, podeGravar])

  /** Escrita remota em segundo plano: o local já foi atualizado antes. */
  const sincronizar = useCallback(
    (chave: string, operacao: () => Promise<unknown>) => {
      if (!temSupabase) return
      void operacao().catch(() => {
        avisarFalhaSincronizacao(chave)
      })
    },
    [temSupabase],
  )

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
      nova.atualizadoEm = nova.criadoEm
      alteradosAssinaturas.current.add(nova.id)
      setEstado((atual) => ({ ...atual, assinaturas: [...atual.assinaturas, nova] }))
      sincronizar(CHAVE_CLUBE, () => gravarAssinatura(nova))
      return nova
    },
    [podeAssinar, sincronizar],
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
        atualizadoEm: new Date().toISOString(),
      }
      alteradosAssinaturas.current.add(assinaturaId)
      setEstado((atual) => ({
        ...atual,
        assinaturas: atual.assinaturas.map((a) =>
          a.id === assinaturaId ? atualizada : a,
        ),
      }))
      sincronizar(CHAVE_CLUBE, () => gravarAssinatura(atualizada))
      return atualizada
    },
    [estado.assinaturas, podeAssinar, sincronizar],
  )

  const cancelar = useCallback(
    (assinaturaId: string, motivo?: string) => {
      const alvo = estado.assinaturas.find((a) => a.id === assinaturaId)
      if (!alvo) throw new Error('Assinatura não encontrada.')
      if (alvo.cancelada) throw new Error('Esta assinatura já foi cancelada.')
      // cancelar não apaga nada: assinatura, vencimento e histórico de
      // pagamentos permanecem, só o estado de cancelamento é acrescentado
      const cancelada: AssinaturaClube = {
        ...alvo,
        cancelada: true,
        canceladaEm: hojeISO(),
        motivoCancelamento: motivo?.trim() || undefined,
        atualizadoEm: new Date().toISOString(),
      }
      alteradosAssinaturas.current.add(assinaturaId)
      setEstado((atual) => ({
        ...atual,
        assinaturas: atual.assinaturas.map((a) =>
          a.id === assinaturaId ? cancelada : a,
        ),
      }))
      sincronizar(CHAVE_CLUBE, () => gravarAssinatura(cancelada))
    },
    [estado.assinaturas, sincronizar],
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
      // lote (pendência) quanto pelo histórico já gravado (pagamentos com
      // lançamento estornado ficam de fora: o ciclo não está coberto).
      if (
        cicloJaPago(
          estado.pagamentos,
          ciclosPagos.current,
          ass.id,
          ass.proximoVencimento,
          new Set(lancamentos.filter((l) => l.estornado).map((l) => l.id)),
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
        atualizadoEm: new Date().toISOString(),
      }
      alteradosAssinaturas.current.add(ass.id)
      alteradosPagamentos.current.add(pagamento.id)
      setEstado((atual) => ({
        assinaturas: atual.assinaturas.map((a) =>
          a.id === ass.id ? atualizada : a,
        ),
        pagamentos: [...atual.pagamentos, pagamento],
      }))
      // mesma chave do app: se o envio falhar, o reenvio da próxima carga é o
      // MESMO registro — o pagamento não vira uma segunda mensalidade
      sincronizar(CHAVE_CLUBE, () => gravarAssinatura(atualizada))
      sincronizar(CHAVE_CLUBE, () => gravarPagamento(pagamento))
      return { assinatura: atualizada, pagamento }
    },
    [estado.assinaturas, estado.pagamentos, registrarReceitaClube, lancamentos, sincronizar],
  )

  const renomearCliente = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      // Propagação casa por chave normalizada (mesma regra do dedupe do
      // cadastro): dado legado com caixa/acentos diferentes não engancha.
      const chave = normalizarTexto(antigo)
      const em = new Date().toISOString()
      const mudar = (atual: AssinaturaClube[]) =>
        atual.map((a) =>
          normalizarTexto(a.cliente) === chave
            ? { ...a, cliente: destino, atualizadoEm: em }
            : a,
        )
      const mudadas = mudar(estadoLocal.current.assinaturas).filter(
        (a, indice) => a !== estadoLocal.current.assinaturas[indice],
      )
      if (mudadas.length === 0) return
      for (const a of mudadas) alteradosAssinaturas.current.add(a.id)
      setEstado((atual) => ({ ...atual, assinaturas: mudar(atual.assinaturas) }))
      sincronizar(CHAVE_CLUBE, () => importarAssinaturas(mudadas))
    },
    [sincronizar],
  )

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
