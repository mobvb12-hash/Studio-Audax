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
import { preferenciasPadrao } from './types'

const CHAVE_STORAGE = 'studio-audax:clientes:v1'

/** Preenche campos ausentes (registros antigos) com os padrões atuais. */
function normalizarCliente(bruto: Partial<Cliente>): Cliente {
  const agora = new Date().toISOString()
  return {
    id: bruto.id ?? '',
    nome: bruto.nome ?? '',
    telefone: bruto.telefone ?? '',
    email: bruto.email ?? '',
    observacao: bruto.observacao ?? '',
    genero: bruto.genero ?? 'nao_informado',
    cpf: bruto.cpf ?? '',
    cnpj: bruto.cnpj ?? '',
    nascimento: bruto.nascimento ?? '',
    ativo: bruto.ativo ?? true,
    etiquetas: Array.isArray(bruto.etiquetas) ? bruto.etiquetas : [],
    instagram: bruto.instagram ?? '',
    comoNosConheceu: bruto.comoNosConheceu ?? '',
    telefones: Array.isArray(bruto.telefones) ? bruto.telefones : [],
    endereco: bruto.endereco ?? null,
    preferencias: { ...preferenciasPadrao(), ...bruto.preferencias },
    criadoEm: bruto.criadoEm ?? agora,
    atualizadoEm: bruto.atualizadoEm ?? agora,
  }
}

type ClientesContexto = {
  clientes: Cliente[]
  adicionar: (input: NovoClienteInput) => Cliente
  atualizar: (id: string, input: NovoClienteInput) => void
  /** Inativa/reativa sem apagar nada: histórico e vínculos permanecem */
  alternarAtivo: (id: string) => void
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
    const lista = JSON.parse(bruto) as Partial<Cliente>[]
    return Array.isArray(lista) ? lista.map(normalizarCliente) : []
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

  const adicionar = useCallback(
    (input: NovoClienteInput) => {
      const nome = input.nome.trim()
      const digitos = input.telefone.replace(/\D/g, '')
      if (clientes.some((c) => normalizar(c.nome) === normalizar(nome))) {
        throw new Error('Já existe um cliente com este nome.')
      }
      if (
        digitos &&
        clientes.some((c) => c.telefone.replace(/\D/g, '') === digitos)
      ) {
        throw new Error('Já existe um cliente com este telefone.')
      }
      const agora = new Date().toISOString()
      const novo: Cliente = normalizarCliente({
        id: gerarId(),
        nome,
        telefone: input.telefone.trim(),
        email: input.email.trim(),
        observacao: input.observacao.trim(),
        genero: input.genero,
        ativo: input.ativo ?? true,
        cpf: input.cpf?.trim() ?? '',
        cnpj: input.cnpj?.trim() ?? '',
        nascimento: input.nascimento ?? '',
        etiquetas: input.etiquetas,
        instagram: input.instagram?.trim() ?? '',
        comoNosConheceu: input.comoNosConheceu ?? '',
        telefones: input.telefones,
        endereco: input.endereco ?? null,
        preferencias: input.preferencias,
        criadoEm: agora,
        atualizadoEm: agora,
      })
      setClientes((atual) => ordenar([...atual, novo]))
      return novo
    },
    [clientes],
  )

  const atualizar = useCallback(
    (id: string, input: NovoClienteInput) => {
      const nome = input.nome.trim()
      const digitos = input.telefone.replace(/\D/g, '')
      if (
        clientes.some(
          (c) => c.id !== id && normalizar(c.nome) === normalizar(nome),
        )
      ) {
        throw new Error('Já existe um cliente com este nome.')
      }
      if (
        digitos &&
        clientes.some(
          (c) => c.id !== id && c.telefone.replace(/\D/g, '') === digitos,
        )
      ) {
        throw new Error('Já existe um cliente com este telefone.')
      }
      setClientes((atual) =>
        ordenar(
          atual.map((c) =>
            c.id === id
              ? normalizarCliente({
                  ...c,
                  nome,
                  telefone: input.telefone.trim(),
                  email: input.email.trim(),
                  observacao: input.observacao.trim(),
                  genero: input.genero ?? c.genero,
                  ativo: input.ativo ?? c.ativo,
                  cpf: input.cpf?.trim() || c.cpf,
                  cnpj: input.cnpj?.trim() || c.cnpj,
                  nascimento: input.nascimento || c.nascimento,
                  etiquetas: input.etiquetas ?? c.etiquetas,
                  instagram: input.instagram?.trim() || c.instagram,
                  comoNosConheceu: input.comoNosConheceu || c.comoNosConheceu,
                  telefones: input.telefones ?? c.telefones,
                  endereco:
                    input.endereco === undefined ? c.endereco : input.endereco,
                  preferencias: input.preferencias ?? c.preferencias,
                  atualizadoEm: new Date().toISOString(),
                })
              : c,
          ),
        ),
      )
    },
    [clientes],
  )

  const alternarAtivo = useCallback((id: string) => {
    setClientes((atual) =>
      atual.map((c) =>
        c.id === id
          ? { ...c, ativo: !c.ativo, atualizadoEm: new Date().toISOString() }
          : c,
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
    () => ({
      clientes,
      adicionar,
      atualizar,
      alternarAtivo,
      remover,
      porId,
      porNome,
    }),
    [clientes, adicionar, atualizar, alternarAtivo, remover, porId, porNome],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useClientes(): ClientesContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error('useClientes deve ser usado dentro de ClientesProvider')
  return ctx
}
