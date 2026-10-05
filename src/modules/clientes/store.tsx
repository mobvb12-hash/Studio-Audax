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
import {
  alternarAtivoCliente,
  atualizarCliente,
  criarCliente,
  removerCliente,
} from '@/services/supabase/clientes'
import {
  CHAVE_STORAGE_CLIENTES,
  migrarClientes,
  type RelatorioMigracaoClientes,
} from './migracao'
import { normalizarCliente, ordenarClientes } from './regras'
import type { Cliente, NovoClienteInput } from './types'
import { digitosDosTelefones } from './types'

const CHAVE_STORAGE = CHAVE_STORAGE_CLIENTES
// Tombstone de cliente removido: a remoção precisa sobreviver ao F5 — sem
// ele a próxima carga devolveria o registro pela lista do servidor.
const CHAVE_REMOVIDOS = 'studio-audax:clientes:removidos:v1'

function ehListaIds(valor: unknown): boolean {
  return Array.isArray(valor) && valor.every((id) => typeof id === 'string')
}

function gravarRemovidos(ids: Set<string>): void {
  salvarJSON(CHAVE_REMOVIDOS, Array.from(ids))
}

type ClientesContexto = {
  clientes: Cliente[]
  adicionar: (input: NovoClienteInput) => Cliente
  atualizar: (id: string, input: NovoClienteInput) => void
  /** Inativa/reativa sem apagar nada: histórico e vínculos permanecem */
  alternarAtivo: (id: string) => void
  remover: (id: string) => void
  porId: (id: string) => Cliente | undefined
  /** Compatibilidade: Agenda/CRM/WhatsApp ainda ligam por nome (sem clienteId) */
  porNome: (nome: string) => Cliente | undefined
}

const Contexto = createContext<ClientesContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Duplicidade pelo telefone: algum número novo (principal ou adicional)
 * já pertence a outro cliente — inclusive como telefone adicional dele.
 */
function conflitoDeTelefone(novos: string[], lista: Cliente[]): boolean {
  if (novos.length === 0) return false
  return lista.some((c) => {
    const doCliente = digitosDosTelefones(c.telefone, c.telefones)
    return novos.some((n) => doCliente.includes(n))
  })
}

function carregar(): Cliente[] {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do fallback.
  const bruto = carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray)
  if (!Array.isArray(bruto)) return []
  return (bruto as Partial<Cliente>[]).map(normalizarCliente)
}

/**
 * Junta a lista oficial (remoto) com o que aconteceu na tela durante a
 * carga: mudança da sessão vence, registro criado no meio da carga não some
 * e remoção da sessão é respeitada. Resquícios descartados pela migração
 * (apagados no Supabase) não voltam para a lista — continuam no backup.
 */
function fundir(
  base: Cliente[],
  atual: Cliente[],
  alterados: Set<string>,
  removidos: Set<string>,
  descartados: Set<string>,
): Cliente[] {
  const porId = new Map(base.map((c) => [c.id, c]))
  for (const cliente of atual) {
    if (removidos.has(cliente.id)) continue
    if (alterados.has(cliente.id)) {
      porId.set(cliente.id, cliente)
      continue
    }
    if (descartados.has(cliente.id)) continue
    if (porId.has(cliente.id)) continue // base já tem a versão oficial
    porId.set(cliente.id, cliente) // inválido/duplicado segue visível
  }
  for (const id of removidos) porId.delete(id)
  return ordenarClientes([...porId.values()])
}

/**
 * Migração em andamento compartilhada: o StrictMode (React) executa o efeito
 * duas vezes em desenvolvimento e uma única ida ao Supabase deve acontecer.
 */
let promessaMigracao: Promise<RelatorioMigracaoClientes> | null = null

export function ClientesProvider({ children }: { children: ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>(() => carregar())
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null
  // nenhuma lista local gravada nesta máquina = só existe a base vazia
  const [instalacaoNova] = useState(
    () => carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray) === null,
  )
  const alterados = useRef<Set<string>>(new Set())
  // Tombstone carregado do storage: exclusões feitas em sessões anteriores
  // seguem protegidas. Em instalação nova ele não vale (apagaria registro
  // do servidor sem relação com esta máquina).
  const removidos = useRef<Set<string>>(
    new Set(
      instalacaoNova
        ? []
        : carregarJSON<string[]>(CHAVE_REMOVIDOS, [], ehListaIds),
    ),
  )
  const listaLocal = useRef<Cliente[]>(clientes)

  useEffect(() => {
    listaLocal.current = clientes
  }, [clientes])

  // Instalação nova: tombstone gravado por outra instalação não vale aqui.
  useEffect(() => {
    if (!instalacaoNova) return
    if (carregarJSON<unknown>(CHAVE_REMOVIDOS, null, ehListaIds) === null) return
    gravarRemovidos(new Set())
  }, [instalacaoNova])

  // Supabase é a fonte oficial: a primeira carga roda a migração local →
  // remoto (com snapshot) e só então o localStorage volta a ser gravado.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaMigracao) {
      promessaMigracao = migrarClientes(listaLocal.current)
    }
    promessaMigracao
      .then((relatorio) => {
        if (!relatorio.ok) {
          console.warn(
            '[clientes] migração para Supabase incompleta — dados locais preservados.',
            relatorio.erros,
          )
        }
        if (vivo) {
          setClientes((atual) =>
            fundir(
              relatorio.clientes,
              atual,
              alterados.current,
              removidos.current,
              new Set(relatorio.descartados),
            ),
          )

          // Tombstone sincronizado com a lista oficial: id que sumiu é
          // descartado; id que ainda aparece (remoção que não chegou a
          // valer) é apagado de novo — idempotente — e segue protegido
          // nesta máquina. Só roda com migração limpa: leitura remota
          // falhou = `relatorio.clientes` é só local, sem valor de base.
          if (relatorio.ok) {
            const idsOficiais = new Set(relatorio.clientes.map((c) => c.id))
            let tombstoneMudou = false
            for (const id of Array.from(removidos.current)) {
              if (idsOficiais.has(id)) {
                void removerCliente(id).catch(() =>
                  avisarFalhaSincronizacao(CHAVE_STORAGE),
                )
                continue
              }
              removidos.current.delete(id)
              tombstoneMudou = true
            }
            if (tombstoneMudou) gravarRemovidos(removidos.current)
          }
        }
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém o fallback local intacto
        if (vivo) {
          console.warn(
            '[clientes] Supabase indisponível — seguindo com os dados locais.',
            erro,
          )
        }
      })
      .finally(() => {
        promessaMigracao = null
        if (vivo) setSincronizado(true)
      })
    return () => {
      vivo = false
    }
  }, [temSupabase])

  // Grava local quando está sem Supabase, quando já sincronizou ou quando
  // existe alteração feita nesta sessão (nada que o usuário fez se perde).
  useEffect(() => {
    const temPendencia =
      alterados.current.size > 0 || removidos.current.size > 0
    if (temSupabase && !sincronizado && !temPendencia) return
    salvarJSON(CHAVE_STORAGE, clientes)
  }, [clientes, temSupabase, sincronizado])

  /**
   * Escrita remota em segundo plano: o local já foi atualizado antes, então a
   * falha só precisa ser informada. O estado local e a pendência (C2) seguem
   * salvos e a próxima carga do módulo reenvia.
   */
  const sincronizar = useCallback(
    (operacao: () => Promise<unknown>) => {
      if (!temSupabase) return
      void operacao().catch(() => {
        // o repositório lança com a mensagem do Supabase; nada foi gravado
        // lá, então a tela avisa em vez de fingir sucesso
        avisarFalhaSincronizacao(CHAVE_STORAGE)
      })
    },
    [temSupabase],
  )

  const adicionar = useCallback(
    (input: NovoClienteInput) => {
      const nome = input.nome.trim()
      if (clientes.some((c) => normalizarTexto(c.nome) === normalizarTexto(nome))) {
        throw new Error('Já existe um cliente com este nome.')
      }
      if (
        conflitoDeTelefone(
          digitosDosTelefones(input.telefone, input.telefones),
          clientes,
        )
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
      alterados.current.add(novo.id)
      setClientes((atual) => ordenarClientes([...atual, novo]))
      sincronizar(() => criarCliente(novo))
      return novo
    },
    [clientes, sincronizar],
  )

  const atualizar = useCallback(
    (id: string, input: NovoClienteInput) => {
      const nome = input.nome.trim()
      if (
        clientes.some(
          (c) => c.id !== id && normalizarTexto(c.nome) === normalizarTexto(nome),
        )
      ) {
        throw new Error('Já existe um cliente com este nome.')
      }
      const existente = clientes.find((c) => c.id === id)
      if (
        conflitoDeTelefone(
          digitosDosTelefones(
            input.telefone,
            input.telefones ?? existente?.telefones,
          ),
          clientes.filter((c) => c.id !== id),
        )
      ) {
        throw new Error('Já existe um cliente com este telefone.')
      }
      if (!existente) return
      const atualizado = normalizarCliente({
        ...existente,
        nome,
        telefone: input.telefone.trim(),
        email: input.email.trim(),
        observacao: input.observacao.trim(),
        genero: input.genero ?? existente?.genero,
        ativo: input.ativo ?? existente?.ativo,
        cpf: input.cpf?.trim() || existente?.cpf,
        cnpj: input.cnpj?.trim() || existente?.cnpj,
        nascimento: input.nascimento || existente?.nascimento,
        etiquetas: input.etiquetas ?? existente?.etiquetas,
        instagram: input.instagram?.trim() || existente?.instagram,
        comoNosConheceu: input.comoNosConheceu || existente?.comoNosConheceu,
        telefones: input.telefones ?? existente?.telefones,
        endereco:
          input.endereco === undefined ? existente?.endereco : input.endereco,
        preferencias: input.preferencias ?? existente?.preferencias,
        id,
        atualizadoEm: new Date().toISOString(),
      })
      alterados.current.add(id)
      setClientes((atual) =>
        ordenarClientes(
          atual.map((c) => (c.id === id ? atualizado : c)),
        ),
      )
      sincronizar(() => atualizarCliente(id, atualizado))
    },
    [clientes, sincronizar],
  )

  const alternarAtivo = useCallback(
    (id: string) => {
      const alvo = clientes.find((c) => c.id === id)
      if (!alvo) return
      const novoAtivo = !alvo.ativo
      const atualizado: Cliente = {
        ...alvo,
        ativo: novoAtivo,
        atualizadoEm: new Date().toISOString(),
      }
      alterados.current.add(id)
      setClientes((atual) =>
        atual.map((c) => (c.id === id ? atualizado : c)),
      )
      sincronizar(() => alternarAtivoCliente(id, novoAtivo))
    },
    [clientes, sincronizar],
  )

  const remover = useCallback(
    (id: string) => {
      removidos.current.add(id)
      alterados.current.delete(id)
      // Exclusão persistida: sem o tombstone o próximo F5 devolveria o
      // registro pela lista do servidor (remoção remota pendente).
      gravarRemovidos(removidos.current)
      setClientes((atual) => atual.filter((c) => c.id !== id))
      sincronizar(() => removerCliente(id))
    },
    [sincronizar],
  )

  const porId = useCallback(
    (id: string) => clientes.find((c) => c.id === id),
    [clientes],
  )

  const porNome = useCallback(
    (nome: string) =>
      clientes.find((c) => normalizarTexto(c.nome) === normalizarTexto(nome)),
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
