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
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
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
}

const Contexto = createContext<EstoqueContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function agoraHora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
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

export function EstoqueProvider({ children }: { children: ReactNode }) {
  const { porId, aplicarEstoque, produtos } = useProdutos()
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>(() =>
    carregar(),
  )

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
    salvarJSON(CHAVE_STORAGE, movimentacoes)
  }, [movimentacoes])

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
      setMovimentacoes((atual) => [...atual, nova])
      return nova
    },
    [],
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
      setMovimentacoes((atual) => [...atual, nova])
      return nova
    },
    [porId, aplicarEstoque],
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
      setMovimentacoes((atual) => [...atual, nova])
      return nova
    },
    [porId, aplicarEstoque],
  )

  const resolverProduto = useCallback(
    (item: ItemVendaEstoque): Produto => {
      if (item.produtoId) {
        const por = porId(item.produtoId)
        if (por) return por
      }
      if (item.produto) {
        const chave = normalizar(item.produto)
        const alvo = produtos.find((p) => normalizar(p.nome) === chave)
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

      registrarSaida(pendencias.current, vendaId)
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
      setMovimentacoes((atual) => [...atual, ...novas])
      return novas
    },
    [movimentacoes, resolverProduto, aplicarEstoque],
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

      registrarEstorno(pendencias.current, venda.id)
      const novas: MovimentacaoEstoque[] = []
      for (const item of itens) {
        const produto = resolverProduto(item)
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
            custoUnitario: produto.custo,
            data: new Date().toISOString().slice(0, 10),
            origem: 'estorno',
            vendaId: venda.id,
          }),
        )
        aplicarSaldo(pendencias.current, produto.id, depois, aplicarEstoque)
      }
      setMovimentacoes((atual) => [...atual, ...novas])
      return novas
    },
    [movimentacoes, resolverProduto, aplicarEstoque],
  )

  const movimentacoesDoProduto = useCallback(
    (produtoId: string) =>
      movimentacoes.filter((m) => m.produtoId === produtoId),
    [movimentacoes],
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
    }),
    [
      movimentacoes,
      registrarInicial,
      entrada,
      ajuste,
      saidaPorVenda,
      reverterVenda,
      movimentacoesDoProduto,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEstoque(): EstoqueContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useEstoque deve ser usado dentro de EstoqueProvider')
  return ctx
}
