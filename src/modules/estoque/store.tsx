import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
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
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as MovimentacaoEstoque[]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function EstoqueProvider({ children }: { children: ReactNode }) {
  const { porId, aplicarEstoque, produtos } = useProdutos()
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>(() =>
    carregar(),
  )

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(movimentacoes))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
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
      const antes = produto.estoque
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
      aplicarEstoque(produto.id, depois)
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
      const antes = produto.estoque
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
      aplicarEstoque(produto.id, depois)
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
        if (produto.estoque < qtd) {
          throw new Error(
            `Estoque insuficiente para "${produto.nome}": disponível ${produto.estoque}, solicitado ${qtd}.`,
          )
        }
      }

      const novas: MovimentacaoEstoque[] = []
      const jaBaixado = new Map<string, number>()
      for (const { produto, item } of resolvidos) {
        const baixado = jaBaixado.get(produto.id) ?? 0
        const antes = produto.estoque - baixado
        const depois = antes - item.quantidade
        jaBaixado.set(produto.id, baixado + item.quantidade)
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
        aplicarEstoque(produto.id, depois)
      }
      setMovimentacoes((atual) => [...atual, ...novas])
      return novas
    },
    [resolverProduto, aplicarEstoque],
  )

  const reverterVenda = useCallback(
    (venda: {
      id: string
      itens?: ItemVendaEstoque[]
      produto?: string
      quantidade?: number
    }): MovimentacaoEstoque[] => {
      const jaRevertido = movimentacoes.some(
        (m) => m.tipo === 'estorno' && m.vendaId === venda.id,
      )
      if (jaRevertido) return []
      const houveSaida = movimentacoes.some(
        (m) => m.tipo === 'venda' && m.vendaId === venda.id,
      )
      // Venda anterior ao controle de estoque nunca baixou — nada a devolver
      if (!houveSaida) return []

      const itens: ItemVendaEstoque[] =
        venda.itens && venda.itens.length > 0
          ? venda.itens
          : venda.produto && venda.quantidade
            ? [{ produto: venda.produto, quantidade: venda.quantidade }]
            : []

      const novas: MovimentacaoEstoque[] = []
      for (const item of itens) {
        const produto = resolverProduto(item)
        const antes = produto.estoque
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
        aplicarEstoque(produto.id, depois)
      }
      if (novas.length > 0) {
        setMovimentacoes((atual) => [...atual, ...novas])
      }
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
