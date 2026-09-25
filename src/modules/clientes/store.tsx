import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Cliente, NovoClienteInput } from './types'

const CHAVE_STORAGE = 'studio-audax:clientes:v1'

type ClientesContexto = {
  clientes: Cliente[]
  adicionar: (input: NovoClienteInput) => Cliente
  atualizar: (id: string, input: NovoClienteInput) => void
  remover: (id: string) => void
  porId: (id: string) => Cliente | undefined
  porNome: (nome: string) => Cliente | undefined
}

const Contexto = createContext<ClientesContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function ordenar(lista: Cliente[]): Cliente[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function carregar(): Cliente[] {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE)
    if (!bruto) return []
    const lista = JSON.parse(bruto) as Cliente[]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

export function ClientesProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>(() => carregar())

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(clientes))
    } catch {
      // armazenamento indisponível: mantém só em memória
    }
  }, [clientes])

  const adicionar = useCallback((input: NovoClienteInput) => {
    const agora = new Date().toISOString()
    const novo: Cliente = {
      id: gerarId(),
      nome: input.nome.trim(),
      telefone: input.telefone.trim(),
      email: input.email.trim(),
      observacao: input.observacao.trim(),
      criadoEm: agora,
      atualizadoEm: agora,
    }
    setClientes((atual) => ordenar([...atual, novo]))
    return novo
  }, [])

  const atualizar = useCallback((id: string, input: NovoClienteInput) => {
    setClientes((atual) =>
      ordenar(
        atual.map((c) =>
          c.id === id
            ? {
                ...c,
                nome: input.nome.trim(),
                telefone: input.telefone.trim(),
                email: input.email.trim(),
                observacao: input.observacao.trim(),
                atualizadoEm: new Date().toISOString(),
              }
            : c,
        ),
      ),
    )
  }, [])

  const remover = useCallback((id: string) => {
    setClientes((atual) => atual.filter((c) => c.id !== id))
  }, [])

  const porId = useCallback(
    (id: string) => clientes.find((c) => c.id === id),
    [clientes],
  )

  const porNome = useCallback(
    (nome: string) =>
      clientes.find((c) => normalizar(c.nome) === normalizar(nome)),
    [clientes],
  )

  const valor = useMemo(
    () => ({ clientes, adicionar, atualizar, remover, porId, porNome }),
    [clientes, adicionar, atualizar, remover, porId, porNome],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useClientes(): ClientesContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error('useClientes deve ser usado dentro de ClientesProvider')
  return ctx
}
