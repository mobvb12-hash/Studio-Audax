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
import { SERVICOS as SEED } from '@/modules/agenda/catalogo'
import { validarServico } from './regras'
import type { NovoServicoInput, Servico } from './types'
import { supabase } from '@/lib/supabase'
import {
  listarServicos,
  criarServico,
  atualizarServico,
  alternarAtivoServico,
  removerServico,
  importarServicos,
} from '@/services/supabase/servicos'

const CHAVE_STORAGE = 'studio-audax:servicos:v1'
// Tombstone de serviço removido: a remoção precisa sobreviver ao F5 — sem
// ele a próxima carga devolveria o registro pela lista do servidor.
const CHAVE_REMOVIDOS = 'studio-audax:servicos:removidos:v1'

function ehListaIds(valor: unknown): boolean {
  return Array.isArray(valor) && valor.every((id) => typeof id === 'string')
}

function gravarRemovidos(ids: Set<string>): void {
  salvarJSON(CHAVE_REMOVIDOS, Array.from(ids))
}

type ServicosContexto = {
  servicos: Servico[]
  adicionar: (input: NovoServicoInput) => Promise<Servico>
  atualizar: (id: string, input: NovoServicoInput) => Promise<void>
  alternarAtivo: (id: string) => Promise<void>
  remover: (id: string) => Promise<void>
  porId: (id: string) => Servico | undefined
}

const Contexto = createContext<ServicosContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Servico[]): Servico[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Migração: registros antigos ganham categoria vazia e ativo: true. */
function migrar(bruto: Partial<Servico>): Servico | null {
  if (!bruto.id || !bruto.nome) return null
  const criadoEm = bruto.criadoEm ?? new Date().toISOString()
  return {
    id: bruto.id,
    nome: bruto.nome,
    preco: typeof bruto.preco === 'number' ? bruto.preco : 0,
    duracaoMin: typeof bruto.duracaoMin === 'number' ? bruto.duracaoMin : 30,
    categoria: typeof bruto.categoria === 'string' ? bruto.categoria : '',
    ativo: typeof bruto.ativo === 'boolean' ? bruto.ativo : true,
    criadoEm,
    atualizadoEm: bruto.atualizadoEm ?? criadoEm,
  }
}

function carregar(): Servico[] {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do seed.
  const bruto = carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray)
  if (Array.isArray(bruto)) {
    // lista salva (mesmo vazia) é preservada — o seed só entra em
    // instalação nova ou storage corrompido
    const migrada = (bruto as Partial<Servico>[])
      .map(migrar)
      .filter((s): s is Servico => s !== null)
    return ordenar(migrada)
  }
  const agora = new Date().toISOString()
  return ordenar(
    SEED.map((s) => ({
      id: `srv-${s.nome.toLowerCase().replace(/\s+/g, '-')}`,
      nome: s.nome,
      preco: s.preco,
      duracaoMin: s.duracaoMin,
      categoria: '',
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    })),
  )
}

/**
 * Assinatura do conteúdo (sem timestamps) — diferença de horário de
 * gravação não é conflito; o desempate é feito por `atualizadoEm`.
 */
function assinatura(s: Servico): string {
  return JSON.stringify([
    s.id,
    s.nome,
    s.preco,
    s.duracaoMin,
    s.categoria,
    s.ativo,
  ])
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function chavesBackup(prefixo: string): string[] {
  const chaves: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i)
    if (chave?.startsWith(prefixo)) chaves.push(chave)
  }
  return chaves.sort()
}

/**
 * Snapshot das versões que serão substituídas, antes de qualquer escrita.
 * Mantém só as 3 cópias mais recentes; false = não gravou (nada muda).
 */
function criarSnapshot(perdedores: Servico[]): boolean {
  const chave = `${CHAVE_STORAGE}:backup:${carimbo()}`
  try {
    localStorage.setItem(chave, JSON.stringify(perdedores))
    if (localStorage.getItem(chave) === null) return false
    const antigas = chavesBackup(`${CHAVE_STORAGE}:backup:`)
    antigas
      .slice(0, Math.max(0, antigas.length - 3))
      .forEach((chaveAntiga) => localStorage.removeItem(chaveAntiga))
    return true
  } catch {
    return false
  }
}

/**
 * Junta a lista oficial (integração) com o que aconteceu na tela durante a
 * carga: mudança da sessão vence, registro criado no meio da carga não some
 * e remoção da sessão é respeitada. Em instalação nova o seed do template
 * não acompanha a lista — só o que a sessão alterou tem esse direito.
 */
function fundir(
  base: Servico[],
  atual: Servico[],
  alterados: Set<string>,
  removidos: Set<string>,
  instalacaoNova: boolean,
): Servico[] {
  const porId = new Map(base.map((s) => [s.id, s]))
  for (const servico of atual) {
    if (removidos.has(servico.id)) continue
    if (alterados.has(servico.id)) {
      porId.set(servico.id, servico)
      continue
    }
    if (!instalacaoNova && !porId.has(servico.id)) porId.set(servico.id, servico)
  }
  for (const id of removidos) porId.delete(id)
  return ordenar([...porId.values()])
}

/**
 * Leitura remota + envio das pendências locais + união por id. Nenhum
 * cadastro é descartado: o que só existe de um lado entra na lista final.
 * Em divergência vence o registro mais recente por `atualizadoEm` (mesma
 * regra da migração de Clientes) e o perdedor fica no snapshot.
 */
async function integrarComRemoto(
  locais: Servico[],
  instalacaoNova: boolean,
): Promise<Servico[]> {
  const remotos = await listarServicos()
  // Instalação nova (nenhuma lista local gravada): o seed do template não
  // é enviado nem entra em conflito — o que já existe no Supabase é a fonte
  if (instalacaoNova && remotos.length > 0) return ordenar(remotos)
  const remotoPorId = new Map(remotos.map((s) => [s.id, s]))
  const basePorId = new Map(remotos.map((s) => [s.id, s]))
  const enviar: Servico[] = []
  const perdedores: Servico[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      basePorId.set(local.id, local)
      enviar.push(local)
      continue
    }
    if (assinatura(local) === assinatura(remoto)) continue
    if ((local.atualizadoEm || '') > (remoto.atualizadoEm || '')) {
      perdedores.push(remoto)
      basePorId.set(local.id, local)
      enviar.push(local)
    } else {
      // remoto mais recente: mantém a versão oficial, a local fica no snapshot
      perdedores.push(local)
      basePorId.set(local.id, remoto)
    }
  }

  if (perdedores.length > 0 && !criarSnapshot(perdedores)) {
    // sem snapshot nada é sobrescrito: a versão local segue visível e as
    // divergências continuam pendentes até a próxima carga
    const divergentes = new Set(perdedores.map((s) => s.id))
    for (const local of locais) {
      if (divergentes.has(local.id)) basePorId.set(local.id, local)
    }
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(enviar[i].id)) enviar.splice(i, 1)
    }
    console.warn(
      '[servicos] snapshot indisponível — divergências mantidas sem envio.',
    )
  }

  if (enviar.length > 0) {
    try {
      const enviados = await importarServicos(enviar)
      if (enviados < enviar.length) {
        console.warn(
          `[servicos] envio incompleto: ${enviados} de ${enviar.length} registros — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      console.warn('[servicos] falha ao enviar pendências para o Supabase.', erro)
    }
  }
  return ordenar([...basePorId.values()])
}

/**
 * Integração em andamento compartilhada: o StrictMode (React) executa o
 * efeito duas vezes em desenvolvimento e uma única ida ao Supabase deve
 * acontecer.
 */
let promessaIntegracao: Promise<Servico[]> | null = null

export function ServicosProvider({ children }: { children: ReactNode }) {
  const [servicos, setServicos] = useState<Servico[]>(() => carregar())
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null
  // nenhuma lista local gravada nesta máquina = só existe o seed do template
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
  const listaLocal = useRef<Servico[]>(servicos)

  useEffect(() => {
    listaLocal.current = servicos
  }, [servicos])

  // Instalação nova: tombstone gravado por outra instalação não vale aqui.
  useEffect(() => {
    if (!instalacaoNova) return
    if (carregarJSON<unknown>(CHAVE_REMOVIDOS, null, ehListaIds) === null) return
    gravarRemovidos(new Set())
  }, [instalacaoNova])

  // Supabase é a fonte oficial, mas a lista local nunca é substituída:
  // a integração une os dois lados, reenvia as pendências locais e o
  // resultado é mesclado com o que a tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarComRemoto(listaLocal.current, instalacaoNova)
    }
    promessaIntegracao
      .then((base) => {
        if (vivo) {
          setServicos((atual) =>
            fundir(
              base,
              atual,
              alterados.current,
              removidos.current,
              instalacaoNova,
            ),
          )

          // Tombstone sincronizado com a lista oficial: id que sumiu é
          // descartado; id que ainda aparece (remoção que não chegou a
          // valer) é apagado de novo — idempotente — e segue protegido
          // nesta máquina.
          const idsOficiais = new Set(base.map((s) => s.id))
          let tombstoneMudou = false
          for (const id of Array.from(removidos.current)) {
            if (idsOficiais.has(id)) {
              void removerServico(id).catch(() =>
                avisarFalhaSincronizacao(CHAVE_STORAGE),
              )
              continue
            }
            removidos.current.delete(id)
            tombstoneMudou = true
          }
          if (tombstoneMudou) gravarRemovidos(removidos.current)
        }
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém o fallback local intacto
        if (vivo) {
          console.warn(
            '[servicos] Supabase indisponível — seguindo com os dados locais.',
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

  // Grava local quando está sem Supabase, quando já integrou ou quando
  // existe alteração feita nesta sessão (nada que o usuário fez se perde).
  useEffect(() => {
    const temPendencia =
      alterados.current.size > 0 || removidos.current.size > 0
    if (temSupabase && !sincronizado && !temPendencia) return
    salvarJSON(CHAVE_STORAGE, servicos)
  }, [servicos, temSupabase, sincronizado])

  const adicionar = useCallback(
    async (input: NovoServicoInput) => {
      const nome = input.nome.trim()
      const categoria = input.categoria?.trim() ?? ''
      const erro = validarServico({ ...input, nome, categoria })
      if (erro) throw new Error(erro)
      if (servicos.some((s) => normalizarTexto(s.nome) === normalizarTexto(nome))) {
        throw new Error('Já existe um serviço com este nome.')
      }
      const agora = new Date().toISOString()
      const novo: Servico = {
        id: gerarId(),
        nome,
        preco: input.preco,
        duracaoMin: input.duracaoMin,
        categoria,
        ativo: true,
        criadoEm: agora,
        atualizadoEm: agora,
      }
      alterados.current.add(novo.id)
      setServicos((atual) => ordenar([...atual, novo]))
      if (temSupabase) {
        try {
          await criarServico(novo)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
      return novo
    },
    [servicos, temSupabase],
  )

  const atualizar = useCallback(
    async (id: string, input: NovoServicoInput) => {
      const nome = input.nome.trim()
      const categoria = input.categoria?.trim() ?? ''
      const erro = validarServico({ ...input, nome, categoria })
      if (erro) throw new Error(erro)
      if (
        servicos.some(
          (s) => s.id !== id && normalizarTexto(s.nome) === normalizarTexto(nome),
        )
      ) {
        throw new Error('Já existe um serviço com este nome.')
      }
      alterados.current.add(id)
      setServicos((atual) =>
        ordenar(
          atual.map((s) =>
            s.id === id
              ? {
                  ...s,
                  nome,
                  preco: input.preco,
                  duracaoMin: input.duracaoMin,
                  categoria,
                  atualizadoEm: new Date().toISOString(),
                }
              : s,
          ),
        ),
      )
      if (temSupabase) {
        try {
          await atualizarServico(id, input)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
    },
    [servicos, temSupabase],
  )

  /** Inativar/reativar nunca apaga o serviço nem o histórico dele. */
  const alternarAtivo = useCallback(
    async (id: string) => {
      const alvo = servicos.find((s) => s.id === id)
      if (!alvo) return
      const novoAtivo = !alvo.ativo
      alterados.current.add(id)
      setServicos((atual) =>
        atual.map((s) =>
          s.id === id
            ? { ...s, ativo: novoAtivo, atualizadoEm: new Date().toISOString() }
            : s,
        ),
      )
      if (temSupabase) {
        try {
          await alternarAtivoServico(id, novoAtivo)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
    },
    [servicos, temSupabase],
  )

  const remover = useCallback(
    async (id: string) => {
      removidos.current.add(id)
      alterados.current.delete(id)
      // Exclusão persistida: sem o tombstone o próximo F5 devolveria o
      // registro pela lista do servidor (remoção remota pendente).
      gravarRemovidos(removidos.current)
      setServicos((atual) => atual.filter((s) => s.id !== id))
      if (temSupabase) {
        try {
          await removerServico(id)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
    },
    [temSupabase],
  )

  const porId = useCallback(
    (id: string) => servicos.find((s) => s.id === id),
    [servicos],
  )

  const valor = useMemo(
    () => ({ servicos, adicionar, atualizar, alternarAtivo, remover, porId }),
    [servicos, adicionar, atualizar, alternarAtivo, remover, porId],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useServicos(): ServicosContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useServicos deve ser usado dentro de ServicosProvider')
  return ctx
}
