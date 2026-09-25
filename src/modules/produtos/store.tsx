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

function validar(nome: string, preco: number): void {
  if (nome.trim().length < 2) throw new Error('Informe o nome do produto.')
  if (!Number.isFinite(preco) || preco <= 0) {
    throw new Error('O preço deve ser maior que zero.')
  }
}

function carregar(): Produto[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as Produto[]
    return Array.isArray(lista) ? lista : []
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
      validar(nome, input.preco)
      if (produtos.some((p) => normalizar(p.nome) === normalizar(nome))) {
        throw new Error('Já existe um produto com este nome.')
      }
      const agora = new Date().toISOString()
      const novo: Produto = {
        id: gerarId(),
        nome,
        preco: Math.round(input.preco * 100) / 100,
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
      validar(nome, input.preco)
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

  const porId = useCallback(
    (id: string) => produtos.find((p) => p.id === id),
    [produtos],
  )

  const valor = useMemo(
    () => ({ produtos, adicionar, atualizar, alternarAtivo, porId }),
    [produtos, adicionar, atualizar, alternarAtivo, porId],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useProdutos(): ProdutosContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useProdutos deve ser usado dentro de ProdutosProvider')
  return ctx
}
