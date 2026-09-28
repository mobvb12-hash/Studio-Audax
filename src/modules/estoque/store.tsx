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
import { normalizarTexto } from '@/lib/moeda'
import {
  avisarFalhaSincronizacao,
  carregarJSON,
  salvarJSON,
} from '@/lib/persistencia'
import { supabase } from '@/lib/supabase'
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import {
  gravarMovimentacao,
  importarMovimentacoes,
  listarMovimentacoes,
} from '@/services/supabase/estoque'
import type {
  AjusteEstoqueInput,
  EntradaEstoqueInput,
  ItemVendaEstoque,
  MovimentacaoEstoque,
} from './types'

const CHAVE_STORAGE = 'studio-audax:estoque:movimentacoes:v1'

export type EstoqueContexto = {
  movimentacoes: MovimentacaoEstoque[]
  registrarInicial: (produto: Produto, quantidade: number) => MovimentacaoEstoque
  entrada: (input: EntradaEstoqueInput) => MovimentacaoEstoque
  ajuste: (input: AjusteEstoqueInput) => MovimentacaoEstoque
  /** Baixa automática ao concluir venda no PDV — pré-valida todos os itens (atômico). */
  saidaPorVenda: (
    vendaId: string,
    data: string,
    itens: ItemVendaEstoque[],
  ) => MovimentacaoEstoque[]
  /** Devolve estoque ao estornar venda — idempotente; só se houve saída. */
  reverterVenda: (venda: {
    id: string
    itens?: ItemVendaEstoque[]
    produto?: string
    quantidade?: number
  }) => MovimentacaoEstoque[]
  movimentacoesDoProduto: (produtoId: string) => MovimentacaoEstoque[]
  /** Propaga a renomeação de produto ao rótulo das movimentações */
  renomearProduto: (produtoId: string, novoNome: string) => void
}

const Contexto = createContext<EstoqueContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function agoraHora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function inteiroPositivo(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 1
}

function carregar(): MovimentacaoEstoque[] {
  return carregarJSON<MovimentacaoEstoque[]>(CHAVE_STORAGE, [], Array.isArray)
}

type Pendencias = {
  /** Saldos aplicados no lote atual, antes do re-render */
  saldos: Map<string, number> | null
  /** Vendas cuja baixa já aconteceu no lote atual */
  saidas: Set<string> | null
  /** Vendas já revertidas no lote atual */
  estornos: Set<string> | null
}

/** Saldo real do produto já considerando o aplicado no lote atual. */
function saldoVigente(produto: Produto, pend: Pendencias): number {
  return pend.saldos?.has(produto.id)
    ? pend.saldos.get(produto.id)!
    : produto.estoque
}

/** Grava o saldo no lote pendente e aplica no produto (valor absoluto). */
function aplicarSaldo(
  pend: Pendencias,
  produtoId: string,
  estoque: number,
  aplicar: (id: string, estoque: number) => void,
): void {
  if (!pend.saldos) pend.saldos = new Map()
  pend.saldos.set(produtoId, estoque)
  aplicar(produtoId, estoque)
}

/** A venda já teve baixa: pendente deste lote ou registrada no histórico. */
function jaBaixou(
  vendaId: string,
  pend: Pendencias,
  movimentacoes: MovimentacaoEstoque[],
): boolean {
  if (pend.saidas?.has(vendaId)) return true
  return movimentacoes.some(
    (m) => m.tipo === 'venda' && m.vendaId === vendaId,
  )
}

/** A venda já foi revertida: pendente deste lote ou no histórico. */
function jaRevertida(
  vendaId: string,
  pend: Pendencias,
  movimentacoes: MovimentacaoEstoque[],
): boolean {
  if (pend.estornos?.has(vendaId)) return true
  return movimentacoes.some(
    (m) => m.tipo === 'estorno' && m.vendaId === vendaId,
  )
}

function registrarSaida(pend: Pendencias, vendaId: string): void {
  if (!pend.saidas) pend.saidas = new Set()
  pend.saidas.add(vendaId)
}

function registrarEstorno(pend: Pendencias, vendaId: string): void {
  if (!pend.estornos) pend.estornos = new Set()
  pend.estornos.add(vendaId)
}

/**
 * Custo praticado na venda original do item, para o estorno devolver o
 * mesmo valor e o par venda/estorno fechar no mesmo custo. Sem a
 * movimentação original (venda legada, ou ainda só no lote pendente), cai
 * no custo atual do produto.
 */
function custoDaVenda(
  movimentacoes: MovimentacaoEstoque[],
  vendaId: string,
  produtoId: string,
  atual: number,
): number {
  const original = movimentacoes.find(
    (m) => m.tipo === 'venda' && m.vendaId === vendaId && m.produtoId === produtoId,
  )
  return original ? original.custoUnitario : atual
}

// ---------------------------------------------------------------------------
// Integração com o Supabase (mesmo padrão de Produtos/Caixa)
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

/**
 * Assinatura da movimentação: `quantidade`, saldos e `vendaId` entram, então
 * a comparação local × remota é a comparação de linhas (histórico imutável —
 * só o rótulo do produto pode mudar, e isso também é conteúdo).
 */
function assinatura(m: MovimentacaoEstoque): string {
  return estavel({
    id: m.id,
    produtoId: m.produtoId,
    produto: m.produto,
    tipo: m.tipo,
    quantidade: m.quantidade,
    estoqueAntes: m.estoqueAntes,
    estoqueDepois: m.estoqueDepois,
    custoUnitario: m.custoUnitario,
    fornecedor: m.fornecedor ?? null,
    data: m.data,
    hora: m.hora,
    origem: m.origem,
    vendaId: m.vendaId ?? null,
    motivo: m.motivo ?? null,
    observacao: m.observacao ?? null,
  })
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Snapshot do que será substituído; false = não gravou (nada muda). */
function criarSnapshot(perdedores: MovimentacaoEstoque[]): boolean {
  const prefixo = `${CHAVE_STORAGE}:backup:`
  const destino = `${prefixo}${carimbo()}`
  try {
    localStorage.setItem(destino, JSON.stringify(perdedores))
    if (localStorage.getItem(destino) === null) return false
    const antigas: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i)
      if (chave?.startsWith(prefixo)) antigas.push(chave)
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

/**
 * União por id + reenvio das pendências. O reenvio é `upsert` pelo mesmo id
 * da movimentação: reenviar o histórico (ou a mesma venda) atualiza as
 * linhas e NUNCA cria uma segunda movimentação — é o que garante que uma
 * venda repetida não baixe o estoque duas vezes. Movimentações são histórico
 * imutável, então em divergência (só o rótulo pode mudar) vence o estado da
 * tela e a versão remota vai para o snapshot.
 */
async function integrarMovimentacoes(
  locais: MovimentacaoEstoque[],
  instalacaoNova: boolean,
): Promise<MovimentacaoEstoque[]> {
  const remotos = await listarMovimentacoes()
  if (instalacaoNova && remotos.length > 0) {
    // instalação nova: o histórico do servidor é a fonte
    return [...remotos]
  }
  const remotoPorId = new Map(remotos.map((m) => [m.id, m]))
  const porId = new Map<string, MovimentacaoEstoque>()
  const ordem: string[] = []
  const enviar: MovimentacaoEstoque[] = []
  const perdedores: MovimentacaoEstoque[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      porId.set(local.id, local)
      ordem.push(local.id)
      enviar.push(local)
      continue
    }
    porId.set(local.id, remoto)
    ordem.push(local.id)
    if (assinatura(local) === assinatura(remoto)) continue
    perdedores.push(remoto)
    porId.set(local.id, local)
    enviar.push(local)
  }
  for (const remoto of remotos) {
    if (porId.has(remoto.id)) continue
    porId.set(remoto.id, remoto)
    ordem.push(remoto.id)
  }

  if (perdedores.length > 0 && !criarSnapshot(perdedores)) {
    const divergentes = new Set(perdedores.map((m) => m.id))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(enviar[i].id)) enviar.splice(i, 1)
    }
    console.warn(
      '[estoque] snapshot indisponível — divergências mantidas sem envio.',
    )
  }

  if (enviar.length > 0) {
    try {
      const enviados = await importarMovimentacoes(enviar)
      if (enviados < enviar.length) {
        console.warn(
          `[estoque] envio incompleto: ${enviados} de ${enviar.length} — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      console.warn(
        '[estoque] falha ao enviar pendências para o Supabase.',
        erro,
      )
    }
  }

  return ordem
    .map((id) => porId.get(id))
    .filter((m): m is MovimentacaoEstoque => m !== undefined)
}

/**
 * Junta a lista oficial com o que a tela fez durante a carga: mudança da
 * sessão vence e registro criado no meio da carga não some. Em instalação
 * nova, só o que a sessão criou acompanha a lista.
 */
function fundir(
  base: MovimentacaoEstoque[],
  atual: MovimentacaoEstoque[],
  alterados: Set<string>,
  instalacaoNova: boolean,
): MovimentacaoEstoque[] {
  const porId = new Map(base.map((m) => [m.id, m]))
  const ordem = base.map((m) => m.id)
  for (const movimentacao of atual) {
    if (alterados.has(movimentacao.id)) {
      if (!porId.has(movimentacao.id)) ordem.push(movimentacao.id)
      porId.set(movimentacao.id, movimentacao)
      continue
    }
    if (porId.has(movimentacao.id)) continue
    if (instalacaoNova) continue
    ordem.push(movimentacao.id)
    porId.set(movimentacao.id, movimentacao)
  }
  return ordem
    .map((id) => porId.get(id))
    .filter((m): m is MovimentacaoEstoque => m !== undefined)
}

/** Integração em andamento compartilhada (StrictMode executa o efeito 2x). */
let promessaIntegracao: Promise<MovimentacaoEstoque[]> | null = null

export function EstoqueProvider({ children }: { children: ReactNode }) {
  const { porId, aplicarEstoque, produtos } = useProdutos()
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>(() =>
    carregar(),
  )
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null
  const [instalacaoNova] = useState(
    () => carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray) === null,
  )
  const alterados = useRef<Set<string>>(new Set())
  const listaLocal = useRef<MovimentacaoEstoque[]>(movimentacoes)

  /**
   * Pendências do lote de estado atual: duas chamadas antes do re-render
   * (duplo clique, duplo submit) enxergam o mesmo snapshot, então registramos
   * aqui o que já foi aplicado — saldo vigente, vendas baixadas e vendas
   * revertidas — para validar sobre o valor real e nunca duplicar efeito.
   */
  const pendencias = useRef<Pendencias>({ saldos: null, saidas: null, estornos: null })

  useEffect(() => {
    // Produtos já refletem as aplicações: volta a ler o estado normal.
    pendencias.current.saldos = null
  }, [produtos])

  useEffect(() => {
    // Movimentações já refletem as baixas/estornos: volta ao estado normal.
    pendencias.current.saidas = null
    pendencias.current.estornos = null
  }, [movimentacoes])

  useEffect(() => {
    listaLocal.current = movimentacoes
  }, [movimentacoes])

  // O histórico do estoque tem o Supabase como fonte oficial, mas a lista
  // local nunca é substituída: a integração une os dois lados, reenvia as
  // pendências (upsert por id — não duplica movimentação) e mescla com o que a
  // tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarMovimentacoes(
        listaLocal.current,
        instalacaoNova,
      )
    }
    promessaIntegracao
      .then((base) => {
        if (vivo) {
          setMovimentacoes((atual) =>
            fundir(base, atual, alterados.current, instalacaoNova),
          )
        }
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém o histórico local intacto e
        // não reenvia nada (nada é gravado por cima do servidor)
        if (vivo) {
          console.warn(
            '[estoque] Supabase indisponível — seguindo com os dados locais.',
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

  const podeGravar = useCallback(() => {
    if (!temSupabase) return true
    if (sincronizado) return true
    return alterados.current.size > 0
  }, [temSupabase, sincronizado])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_STORAGE, movimentacoes)
  }, [movimentacoes, podeGravar])

  /**
   * Escrita remota em segundo plano: o local já foi atualizado antes, então a
   * falha só precisa ser informada — o histórico e a pendência seguem salvos e
   * a próxima carga reenvia (upsert por id, sem baixar o estoque de novo).
   */
  const sincronizar = useCallback(
    (operacao: () => Promise<unknown>) => {
      if (!temSupabase) return
      void operacao().catch(() => {
        avisarFalhaSincronizacao(CHAVE_STORAGE)
      })
    },
    [temSupabase],
  )

  /**
   * Grava as movimentações recém-criadas: marca a pendência e envia por
   * `upsert`, então reenviar a mesma lista (ou a mesma venda) continua sendo
   * uma única movimentação efetiva.
   */
  const registrarMovimentacoes = useCallback(
    (novas: MovimentacaoEstoque[]) => {
      for (const movimentacao of novas) {
        alterados.current.add(movimentacao.id)
      }
      setMovimentacoes((atual) => [...atual, ...novas])
      if (novas.length === 1) {
        const unica = novas[0]
        sincronizar(() => gravarMovimentacao(unica))
        return
      }
      sincronizar(() =>
        novas.reduce<Promise<unknown>>(
          (anterior, movimentacao) =>
            anterior.then(() => gravarMovimentacao(movimentacao)),
          Promise.resolve(),
        ),
      )
    },
    [sincronizar],
  )

  function criarMovimentacao(
    base: Omit<MovimentacaoEstoque, 'id' | 'hora' | 'criadoEm'>,
  ): MovimentacaoEstoque {
    return {
      ...base,
      id: gerarId(),
      hora: agoraHora(),
      criadoEm: new Date().toISOString(),
    }
  }

  const registrarInicial = useCallback(
    (produto: Produto, quantidade: number): MovimentacaoEstoque => {
      if (!inteiroPositivo(quantidade)) {
        throw new Error('O estoque inicial deve ser um número inteiro maior que zero.')
      }
      if (produto.estoque < quantidade) {
        throw new Error('Estoque do produto incompatível com o estoque inicial.')
      }
      const antes = produto.estoque - quantidade
      if (antes < 0) throw new Error('Estoque inicial inválido.')
      const nova = criarMovimentacao({
        produtoId: produto.id,
        produto: produto.nome,
        tipo: 'inicial',
        quantidade,
        estoqueAntes: antes,
        estoqueDepois: produto.estoque,
        custoUnitario: produto.custo,
        data: new Date().toISOString().slice(0, 10),
        origem: 'cadastro',
      })
      registrarMovimentacoes([nova])
      return nova
    },
    [registrarMovimentacoes],
  )

  const entrada = useCallback(
    (input: EntradaEstoqueInput): MovimentacaoEstoque => {
      const produto = porId(input.produtoId)
      if (!produto) throw new Error('Produto não encontrado.')
      if (!inteiroPositivo(input.quantidade)) {
        throw new Error('A quantidade deve ser um número inteiro maior que zero.')
      }
      if (!Number.isFinite(input.custoUnitario) || input.custoUnitario < 0) {
        throw new Error('O custo unitário deve ser maior ou igual a zero.')
      }
      if (!input.data) throw new Error('Informe a data da entrada.')
      const antes = saldoVigente(produto, pendencias.current)
      const depois = antes + input.quantidade
      const nova = criarMovimentacao({
        produtoId: produto.id,
        produto: produto.nome,
        tipo: 'entrada',
        quantidade: input.quantidade,
        estoqueAntes: antes,
        estoqueDepois: depois,
        custoUnitario: input.custoUnitario,
        fornecedor: input.fornecedor?.trim() || undefined,
        data: input.data,
        origem: 'manual',
        observacao: input.observacao?.trim() || undefined,
      })
      aplicarSaldo(pendencias.current, produto.id, depois, aplicarEstoque)
      registrarMovimentacoes([nova])
      return nova
    },
    [porId, aplicarEstoque, registrarMovimentacoes],
  )

  const ajuste = useCallback(
    (input: AjusteEstoqueInput): MovimentacaoEstoque => {
      const produto = porId(input.produtoId)
      if (!produto) throw new Error('Produto não encontrado.')
      if (!inteiroPositivo(input.quantidade)) {
        throw new Error('A quantidade deve ser um número inteiro maior que zero.')
      }
      if (!input.motivo) throw new Error('Informe o motivo do ajuste.')
      if (!input.data) throw new Error('Informe a data do ajuste.')
      const antes = saldoVigente(produto, pendencias.current)
      const sinal = input.tipo === 'entrada' ? 1 : -1
      const depois = antes + sinal * input.quantidade
      if (depois < 0) {
        throw new Error(
          `Estoque insuficiente para a saída do ajuste — disponível: ${antes}, solicitado: ${input.quantidade}.`,
        )
      }
      const nova = criarMovimentacao({
        produtoId: produto.id,
        produto: produto.nome,
        tipo: 'ajuste',
        quantidade: sinal * input.quantidade,
        estoqueAntes: antes,
        estoqueDepois: depois,
        custoUnitario: produto.custo,
        data: input.data,
        origem: 'manual',
        motivo: input.motivo,
        observacao: input.observacao?.trim() || undefined,
      })
      aplicarSaldo(pendencias.current, produto.id, depois, aplicarEstoque)
      registrarMovimentacoes([nova])
      return nova
    },
    [porId, aplicarEstoque, registrarMovimentacoes],
  )

  const resolverProduto = useCallback(
    (item: ItemVendaEstoque): Produto => {
      if (item.produtoId) {
        const por = porId(item.produtoId)
        if (por) return por
      }
      if (item.produto) {
        const chave = normalizarTexto(item.produto)
        const alvo = produtos.find((p) => normalizarTexto(p.nome) === chave)
        if (alvo) return alvo
      }
      throw new Error(
        `Produto não encontrado para a movimentação: ${item.produto ?? item.produtoId ?? '?'}`,
      )
    },
    [porId, produtos],
  )

  const saidaPorVenda = useCallback(
    (
      vendaId: string,
      data: string,
      itens: ItemVendaEstoque[],
    ): MovimentacaoEstoque[] => {
      if (!vendaId) throw new Error('Venda sem identificação.')
      // Idempotente: a mesma venda nunca baixa o estoque duas vezes.
      if (jaBaixou(vendaId, pendencias.current, movimentacoes)) return []
      if (!itens || itens.length === 0) {
        throw new Error('Venda sem itens para baixar estoque.')
      }
      // Pré-validação de TODOS os itens — atômico: nada é aplicado se algo faltar.
      // Itens repetidos do mesmo produto são somados antes de comparar.
      const resolvidos = itens.map((item) => {
        const produto = resolverProduto(item)
        if (!inteiroPositivo(item.quantidade)) {
          throw new Error(`Quantidade inválida para "${produto.nome}".`)
        }
        return { produto, item }
      })
      const exigido = new Map<string, number>()
      for (const { produto, item } of resolvidos) {
        exigido.set(produto.id, (exigido.get(produto.id) ?? 0) + item.quantidade)
      }
      for (const [produtoId, qtd] of exigido) {
        const produto = resolvidos.find((r) => r.produto.id === produtoId)!.produto
        const disponivel = saldoVigente(produto, pendencias.current)
        if (disponivel < qtd) {
          throw new Error(
            `Estoque insuficiente para "${produto.nome}": disponível ${disponivel}, solicitado ${qtd}.`,
          )
        }
      }

      // Simulação dos saldos SEM tocar em nada. O laço de aplicação percorre
      // os itens na mesma ordem e vai vendo o saldo já reduzido pelos itens
      // anteriores da própria venda (por isso simula, e não usa o mapa
      // `exigido`), então é aqui que se garante que nenhum `depois` sai
      // fracionário ou negativo. Depois deste ponto a aplicação não lança,
      // e a venda só é marcada como baixada no fim.
      const simulados = new Map<string, number>()
      for (const { produto, item } of resolvidos) {
        const base = simulados.get(produto.id) ?? saldoVigente(produto, pendencias.current)
        const depois = base - item.quantidade
        if (!Number.isInteger(depois) || depois < 0) {
          throw new Error(
            `Estoque inválido ao baixar "${produto.nome}". Nada foi movimentado.`,
          )
        }
        simulados.set(produto.id, depois)
      }

      const novas: MovimentacaoEstoque[] = []
      for (const { produto, item } of resolvidos) {
        // saldoVigente já considera os itens anteriores desta mesma venda
        const antes = saldoVigente(produto, pendencias.current)
        const depois = antes - item.quantidade
        novas.push(
          criarMovimentacao({
            produtoId: produto.id,
            produto: produto.nome,
            tipo: 'venda',
            quantidade: -item.quantidade,
            estoqueAntes: antes,
            estoqueDepois: depois,
            custoUnitario: produto.custo,
            data,
            origem: 'pdv',
            vendaId,
          }),
        )
        aplicarSaldo(pendencias.current, produto.id, depois, aplicarEstoque)
      }
      // Só marca depois de aplicar tudo: se algo lançasse no meio, a venda
      // continuaria "não baixada" e o retry refaria a baixa inteira em vez
      // de deixar o estoque pela metade sem registro.
      registrarSaida(pendencias.current, vendaId)
      registrarMovimentacoes(novas)
      return novas
    },
    [movimentacoes, resolverProduto, aplicarEstoque, registrarMovimentacoes],
  )

  const reverterVenda = useCallback(
    (venda: {
      id: string
      itens?: ItemVendaEstoque[]
      produto?: string
      quantidade?: number
    }): MovimentacaoEstoque[] => {
      const jaRevertido = jaRevertida(venda.id, pendencias.current, movimentacoes)
      if (jaRevertido) return []
      // Venda anterior ao controle de estoque nunca baixou — nada a devolver
      const houveSaida = jaBaixou(venda.id, pendencias.current, movimentacoes)
      if (!houveSaida) return []

      const itens: ItemVendaEstoque[] =
        venda.itens && venda.itens.length > 0
          ? venda.itens
          : venda.produto && venda.quantidade
            ? [{ produto: venda.produto, quantidade: venda.quantidade }]
            : []
      if (itens.length === 0) return []

      // Pré-resolução de TODOS os itens — atômico: a venda só é marcada
      // como estornada (registrarEstorno) depois que cada produto existe
      // e a quantidade é válida; se algo faltar, nada muda e o retry
      // futuro ainda encontra a venda "não revertida".
      const resolvidos = itens.map((item) => {
        const produto = resolverProduto(item)
        if (!inteiroPositivo(item.quantidade)) {
          throw new Error(`Quantidade inválida para "${produto.nome}".`)
        }
        return { produto, item }
      })

      registrarEstorno(pendencias.current, venda.id)
      const novas: MovimentacaoEstoque[] = []
      for (const { produto, item } of resolvidos) {
        const antes = saldoVigente(produto, pendencias.current)
        const depois = antes + item.quantidade
        novas.push(
          criarMovimentacao({
            produtoId: produto.id,
            produto: produto.nome,
            tipo: 'estorno',
            quantidade: item.quantidade,
            estoqueAntes: antes,
            estoqueDepois: depois,
            // devolve pelo custo da venda original: se o custo foi reajustado
            // entre a venda e o estorno, usar o de agora deixaria o par
            // venda/estorno com custos diferentes e o CMV por movimentação
            // inconsistente. Sem a movimentação original, custo atual.
            custoUnitario: custoDaVenda(
              movimentacoes,
              venda.id,
              produto.id,
              produto.custo,
            ),
            data: new Date().toISOString().slice(0, 10),
            origem: 'estorno',
            vendaId: venda.id,
          }),
        )
        aplicarSaldo(pendencias.current, produto.id, depois, aplicarEstoque)
      }
      registrarMovimentacoes(novas)
      return novas
    },
    [movimentacoes, resolverProduto, aplicarEstoque, registrarMovimentacoes],
  )

  const movimentacoesDoProduto = useCallback(
    (produtoId: string) =>
      movimentacoes.filter((m) => m.produtoId === produtoId),
    [movimentacoes],
  )

  // Rótulo da movimentação acompanha o cadastro (o vínculo continua
  // sendo o produtoId — saldo e histórico nunca se perdem no rename).
  // O estado continua por updater funcional (duas renomeações no mesmo lote
  // se combinam) e o envio leva só as movimentações tocadas, por upsert.
  const renomearProduto = useCallback(
    (produtoId: string, novoNome: string) => {
      const destino = novoNome.trim()
      if (!produtoId || !destino) return
      const renomear = (atual: MovimentacaoEstoque[]) =>
        atual.map((m) =>
          m.produtoId === produtoId && m.produto !== destino
            ? { ...m, produto: destino }
            : m,
        )
      const mudados = renomear(listaLocal.current).filter(
        (m, indice) => m !== listaLocal.current[indice],
      )
      if (mudados.length === 0) return
      for (const movimentacao of mudados) {
        alterados.current.add(movimentacao.id)
      }
      setMovimentacoes((atual) => renomear(atual))
      sincronizar(() => importarMovimentacoes(mudados))
    },
    [sincronizar],
  )

  const valor = useMemo(
    () => ({
      movimentacoes,
      registrarInicial,
      entrada,
      ajuste,
      saidaPorVenda,
      reverterVenda,
      movimentacoesDoProduto,
      renomearProduto,
    }),
    [
      movimentacoes,
      registrarInicial,
      entrada,
      ajuste,
      saidaPorVenda,
      reverterVenda,
      movimentacoesDoProduto,
      renomearProduto,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEstoque(): EstoqueContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useEstoque deve ser usado dentro de EstoqueProvider')
  return ctx
}
