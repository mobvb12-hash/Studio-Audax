import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { NovoProdutoInput, Produto } from './types'

const CHAVE_STORAGE = 'studio-audax:produtos:v1'

type ProdutosContexto = {
  produtos: Produto[]
  adicionar: (input: NovoProdutoInput) => Produto
  atualizar: (id: string, input: NovoProdutoInput) => void
  alternarAtivo: (id: string) => void
  porId: (id: string) => Produto | undefined
  /** Aplica novo valor de estoque — usado apenas pelo módulo Estoque (com histórico). */
  aplicarEstoque: (id: string, estoque: number) => void
}

const Contexto = createContext<ProdutosContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function ordenar(lista: Produto[]): Produto[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function inteiroNaoNegativo(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 0
}

function validar(nome: string, preco: number, custo: number, estoque: number, minimo: number): void {
  if (nome.trim().length < 2) throw new Error('Informe o nome do produto.')
  if (!Number.isFinite(preco) || preco <= 0) {
    throw new Error('O preço deve ser maior que zero.')
  }
  if (!Number.isFinite(custo) || custo < 0) {
    throw new Error('O custo deve ser maior ou igual a zero.')
  }
  if (!inteiroNaoNegativo(estoque)) {
    throw new Error('O estoque deve ser um número inteiro maior ou igual a zero.')
  }
  if (!inteiroNaoNegativo(minimo)) {
    throw new Error('O estoque mínimo deve ser um número inteiro maior ou igual a zero.')
  }
}

/**
 * Migração automática de produtos da FASE 3 (sem estoque/custo/categoria):
 * recebe valores padrão seguros — estoque 0, mínimo 0, custo 0.
 * Nenhuma quantidade existente é inventada.
 */
function normalizarProduto(bruto: Partial<Produto>): Produto | null {
  if (!bruto || typeof bruto !== 'object') return null
  const id = typeof bruto.id === 'string' ? bruto.id : ''
  const nome = typeof bruto.nome === 'string' ? bruto.nome : ''
  if (!id || !nome.trim()) return null
  return {
    id,
    nome,
    preco: Number.isFinite(bruto.preco) ? Number(bruto.preco) : 0,
    custo: Number.isFinite(bruto.custo) ? Math.max(0, Number(bruto.custo)) : 0,
    estoque: Number.isFinite(bruto.estoque)
      ? Math.max(0, Math.trunc(Number(bruto.estoque)))
      : 0,
    estoqueMinimo: Number.isFinite(bruto.estoqueMinimo)
      ? Math.max(0, Math.trunc(Number(bruto.estoqueMinimo)))
      : 0,
    categoria: typeof bruto.categoria === 'string' ? bruto.categoria : '',
    foto: typeof bruto.foto === 'string' ? bruto.foto : '',
    ativo: typeof bruto.ativo === 'boolean' ? bruto.ativo : true,
    criadoEm: typeof bruto.criadoEm === 'string' ? bruto.criadoEm : new Date().toISOString(),
    atualizadoEm: typeof bruto.atualizadoEm === 'string' ? bruto.atualizadoEm : new Date().toISOString(),
  }
}

function carregar(): Produto[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as Partial<Produto>[]
    if (!Array.isArray(lista)) return []
    const migrada = lista
      .map(normalizarProduto)
      .filter((p): p is Produto => p !== null)
    return ordenar(migrada)
  } catch {
    return []
  }
}

export function ProdutosProvider({ children }: { children: ReactNode }) {
  const [produtos, setProdutos] = useState<Produto[]>(() => carregar())

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(produtos))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [produtos])

  const adicionar = useCallback(
    (input: NovoProdutoInput): Produto => {
      const nome = input.nome.trim()
      const preco = input.preco
      const custo = input.custo ?? 0
      const estoque = input.estoque ?? 0
      const minimo = input.estoqueMinimo ?? 0
      validar(nome, preco, custo, estoque, minimo)
      if (produtos.some((p) => normalizar(p.nome) === normalizar(nome))) {
        throw new Error('Já existe um produto com este nome.')
      }
      const agora = new Date().toISOString()
      const novo: Produto = {
        id: gerarId(),
        nome,
        preco: Math.round(preco * 100) / 100,
        custo: Math.round(custo * 100) / 100,
        estoque,
        estoqueMinimo: minimo,
        categoria: input.categoria?.trim() ?? '',
        foto: input.foto?.trim() ?? '',
        ativo: input.ativo ?? true,
        criadoEm: agora,
        atualizadoEm: agora,
      }
      setProdutos((atual) => ordenar([...atual, novo]))
      return novo
    },
    [produtos],
  )

  const atualizar = useCallback(
    (id: string, input: NovoProdutoInput) => {
      const nome = input.nome.trim()
      const custo = input.custo ?? 0
      const minimo = input.estoqueMinimo ?? 0
      if (nome.length < 2) throw new Error('Informe o nome do produto.')
      if (!Number.isFinite(input.preco) || input.preco <= 0) {
        throw new Error('O preço deve ser maior que zero.')
      }
      if (!Number.isFinite(custo) || custo < 0) {
        throw new Error('O custo deve ser maior ou igual a zero.')
      }
      if (!inteiroNaoNegativo(minimo)) {
        throw new Error('O estoque mínimo deve ser um número inteiro maior ou igual a zero.')
      }
      if (
        produtos.some(
          (p) => p.id !== id && normalizar(p.nome) === normalizar(nome),
        )
      ) {
        throw new Error('Já existe um produto com este nome.')
      }
      setProdutos((atual) =>
        ordenar(
          atual.map((p) =>
            p.id === id
              ? {
                  ...p,
                  nome,
                  preco: Math.round(input.preco * 100) / 100,
                  custo: Math.round(custo * 100) / 100,
                  estoqueMinimo: minimo,
                  categoria: input.categoria?.trim() ?? p.categoria,
                  foto: input.foto?.trim() ?? p.foto,
                  ativo: input.ativo ?? p.ativo,
                  atualizadoEm: new Date().toISOString(),
                }
              : p,
          ),
        ),
      )
    },
    [produtos],
  )

  const alternarAtivo = useCallback((id: string) => {
    setProdutos((atual) =>
      atual.map((p) =>
        p.id === id
          ? { ...p, ativo: !p.ativo, atualizadoEm: new Date().toISOString() }
          : p,
      ),
    )
  }, [])

  const aplicarEstoque = useCallback(
    (id: string, estoque: number) => {
      if (!inteiroNaoNegativo(estoque)) {
        throw new Error('Estoque inválido.')
      }
      setProdutos((atual) =>
        atual.map((p) =>
          p.id === id
            ? { ...p, estoque, atualizadoEm: new Date().toISOString() }
            : p,
        ),
      )
    },
    [],
  )

  const porId = useCallback(
    (id: string) => produtos.find((p) => p.id === id),
    [produtos],
  )

  const valor = useMemo(
    () => ({ produtos, adicionar, atualizar, alternarAtivo, porId, aplicarEstoque }),
    [produtos, adicionar, atualizar, alternarAtivo, porId, aplicarEstoque],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useProdutos(): ProdutosContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useProdutos deve ser usado dentro de ProdutosProvider')
  return ctx
}
