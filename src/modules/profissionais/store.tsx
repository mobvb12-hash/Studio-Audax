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
import { PROFISSIONAIS as SEED } from '@/modules/agenda/catalogo'
import { validarProfissional } from './regras'
import type { NovoProfissionalInput, Profissional } from './types'
import { supabase } from '@/lib/supabase'
import {
  listarProfissionais,
  criarProfissional,
  atualizarProfissional,
  alternarAtivoProfissional,
  removerProfissional,
  importarProfissionais,
} from '@/services/supabase/profissionais'

const CHAVE_STORAGE = 'studio-audax:profissionais:v1'
// Tombstone de profissional removido: a remoção precisa sobreviver ao F5 —
// sem ele a próxima carga devolve o registro pela lista do servidor.
const CHAVE_REMOVIDOS = 'studio-audax:profissionais:removidos:v1'

function ehListaIds(valor: unknown): boolean {
  return Array.isArray(valor) && valor.every((id) => typeof id === 'string')
}

function gravarRemovidos(ids: Set<string>): void {
  salvarJSON(CHAVE_REMOVIDOS, Array.from(ids))
}

type ProfissionaisContexto = {
  profissionais: Profissional[]
  adicionar: (input: NovoProfissionalInput) => Promise<Profissional>
  atualizar: (id: string, input: NovoProfissionalInput) => Promise<void>
  alternarAtivo: (id: string) => Promise<void>
  remover: (id: string) => Promise<void>
  porId: (id: string) => Profissional | undefined
}

const Contexto = createContext<ProfissionaisContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Profissional[]): Profissional[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Garante campos novos em registros antigos (telefone/email/foto/ativo). */
function normalizar(partial: Partial<Profissional>): Profissional | null {
  if (!partial.id || !partial.nome) return null
  return {
    id: partial.id,
    nome: partial.nome,
    telefone: partial.telefone ?? '',
    email: partial.email ?? '',
    foto: partial.foto ?? '',
    ativo: typeof partial.ativo === 'boolean' ? partial.ativo : true,
    criadoEm: partial.criadoEm ?? new Date().toISOString(),
    whatsappNotificacao: partial.whatsappNotificacao ?? '',
    notificarAgendamentos: partial.notificarAgendamentos !== false,
  }
}

function nomeChave(texto: string): string {
  return normalizarTexto(texto)
}

/** Id legível gerado para o seed da instalação nova */
function idSeed(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `prof-${slug}`
}

/**
 * Placeholders do template antigo renomeados para a equipe real.
 * Só age sobre o registro intacto (mesmo id + mesmo nome); qualquer
 * personalização do usuário é preservada como está.
 */
const PLACEHOLDERS = [
  { id: 'prof-audax', antigo: 'Audax', novo: 'Cleiton Silva' },
  { id: 'prof-diego', antigo: 'Diego', novo: 'Ítalo Santos' },
] as const

function migrarPlaceholder(
  p: Profissional,
  nomesExistentes: Set<string>,
): Profissional {
  const ph = PLACEHOLDERS.find((x) => x.id === p.id && x.antigo === p.nome)
  if (!ph) return p
  // Já existe cadastro com o nome de destino (ex.: o "Cleiton Silva" criado
  // pelo usuário antes desta migração): preserva o registro existente e
  // mantém o placeholder intacto — renomear criaria um segundo cadastro
  // igual. Decisão estável a cada carga (idempotente).
  if (nomesExistentes.has(nomeChave(ph.novo))) return p
  return { ...p, nome: ph.novo }
}

function carregar(): Profissional[] {
  // JSON inválido ou com forma inesperada: cópia original preservada em
  // `<chave>:corrompido` (com aviso visível) antes do seed.
  const bruto = carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray)
  if (Array.isArray(bruto)) {
    // lista salva (mesmo vazia) é preservada — o seed só entra em
    // instalação nova ou storage corrompido
    const registros = (bruto as Partial<Profissional>[])
      .map(normalizar)
      .filter((p): p is Profissional => p !== null)
    const nomesExistentes = new Set(registros.map((p) => nomeChave(p.nome)))
    return ordenar(registros.map((p) => migrarPlaceholder(p, nomesExistentes)))
  }
  const agora = new Date().toISOString()
  return SEED.map((nome) => ({
    id: idSeed(nome),
    nome,
    telefone: '',
    email: '',
    foto: '',
    ativo: true,
    criadoEm: agora,
    whatsappNotificacao: '',
    notificarAgendamentos: true,
  }))
}

/**
 * Assinatura do conteúdo (sem timestamps) — diferença de horário de gravação
 * não é conflito: `profissionais` não tem coluna de edição no Supabase (C3).
 */
function assinatura(p: Profissional): string {
  return JSON.stringify([
    p.id,
    p.nome,
    p.telefone,
    p.email,
    p.foto,
    p.ativo,
    p.whatsappNotificacao,
    p.notificarAgendamentos,
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
function criarSnapshot(perdedores: Profissional[]): boolean {
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
  base: Profissional[],
  atual: Profissional[],
  alterados: Set<string>,
  removidos: Set<string>,
  instalacaoNova: boolean,
): Profissional[] {
  const porId = new Map(base.map((p) => [p.id, p]))
  for (const prof of atual) {
    if (removidos.has(prof.id)) continue
    if (alterados.has(prof.id)) {
      porId.set(prof.id, prof)
      continue
    }
    if (!instalacaoNova && !porId.has(prof.id)) porId.set(prof.id, prof)
  }
  for (const id of removidos) porId.delete(id)
  return ordenar([...porId.values()])
}

/**
 * Leitura remota + envio das pendências locais + união por id. Nenhum
 * cadastro é descartado: o que só existe de um lado entra na lista final.
 * Em divergência o registro local vence (a sessão é o que está na tela e a
 * escrita é write-through) e a versão remota substituída fica no snapshot.
 */
async function integrarComRemoto(
  locais: Profissional[],
  instalacaoNova: boolean,
): Promise<Profissional[]> {
  const remotos = await listarProfissionais()
  // Instalação nova (nenhuma lista local gravada): o seed do template não
  // é enviado nem entra em conflito — o que já existe no Supabase é a fonte
  if (instalacaoNova && remotos.length > 0) return ordenar(remotos)
  const remotoPorId = new Map(remotos.map((p) => [p.id, p]))
  const basePorId = new Map(remotos.map((p) => [p.id, p]))
  const enviar: Profissional[] = []
  const perdedores: Profissional[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      basePorId.set(local.id, local)
      enviar.push(local)
      continue
    }
    if (assinatura(local) === assinatura(remoto)) continue
    perdedores.push(remoto)
    basePorId.set(local.id, local)
    enviar.push(local)
  }

  if (perdedores.length > 0 && !criarSnapshot(perdedores)) {
    // sem snapshot nada é sobrescrito: a versão local segue visível e as
    // divergências continuam pendentes até a próxima carga
    const divergentes = new Set(perdedores.map((p) => p.id))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(enviar[i].id)) enviar.splice(i, 1)
    }
    console.warn(
      '[profissionais] snapshot indisponível — divergências mantidas sem envio.',
    )
  }

  if (enviar.length > 0) {
    try {
      const enviados = await importarProfissionais(enviar)
      if (enviados < enviar.length) {
        console.warn(
          `[profissionais] envio incompleto: ${enviados} de ${enviar.length} registros — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      console.warn(
        '[profissionais] falha ao enviar pendências para o Supabase.',
        erro,
      )
    }
  }
  return ordenar([...basePorId.values()])
}

/**
 * Integração em andamento compartilhada: o StrictMode (React) executa o
 * efeito duas vezes em desenvolvimento e uma única ida ao Supabase deve
 * acontecer.
 */
let promessaIntegracao: Promise<Profissional[]> | null = null

export function ProfissionaisProvider({ children }: { children: ReactNode }) {
  const [profissionais, setProfissionais] = useState<Profissional[]>(() =>
    carregar(),
  )
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
  const listaLocal = useRef<Profissional[]>(profissionais)

  useEffect(() => {
    listaLocal.current = profissionais
  }, [profissionais])

  // Instalação nova: tombstone gravado por outra instalação não vale aqui.
  useEffect(() => {
    if (!instalacaoNova) return
    if (carregarJSON<unknown>(CHAVE_REMOVIDOS, null, ehListaIds) === null)
      return
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
          setProfissionais((atual) =>
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
          const idsOficiais = new Set(base.map((p) => p.id))
          let tombstoneMudou = false
          for (const id of Array.from(removidos.current)) {
            if (idsOficiais.has(id)) {
              void removerProfissional(id).catch(() =>
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
            '[profissionais] Supabase indisponível — seguindo com os dados locais.',
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
    salvarJSON(CHAVE_STORAGE, profissionais)
  }, [profissionais, temSupabase, sincronizado])

  const adicionar = useCallback(
    async (input: NovoProfissionalInput) => {
      const nome = input.nome.trim()
      const erro = validarProfissional({
        nome,
        telefone: input.telefone,
        email: input.email,
      })
      if (erro) throw new Error(erro)
      if (
        profissionais.some((p) => nomeChave(p.nome) === nomeChave(nome))
      ) {
        throw new Error('Já existe um profissional com este nome.')
      }
      const novo: Profissional = {
        id: gerarId(),
        nome,
        telefone: input.telefone.trim(),
        email: input.email.trim(),
        foto: input.foto,
        ativo: true,
        criadoEm: new Date().toISOString(),
        whatsappNotificacao: input.whatsappNotificacao?.trim() ?? '',
        notificarAgendamentos: input.notificarAgendamentos !== false,
      }
      alterados.current.add(novo.id)
      setProfissionais((atual) => ordenar([...atual, novo]))
      if (temSupabase) {
        try {
          await criarProfissional(novo)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
      return novo
    },
    [profissionais, temSupabase],
  )

  const atualizar = useCallback(
    async (id: string, input: NovoProfissionalInput) => {
      const nome = input.nome.trim()
      const erro = validarProfissional({
        nome,
        telefone: input.telefone,
        email: input.email,
      })
      if (erro) throw new Error(erro)
      if (
        profissionais.some(
          (p) => p.id !== id && nomeChave(p.nome) === nomeChave(nome),
        )
      ) {
        throw new Error('Já existe um profissional com este nome.')
      }
      alterados.current.add(id)
      setProfissionais((atual) =>
        ordenar(
          atual.map((p) =>
            p.id === id
              ? {
                  ...p,
                  nome,
                  telefone: input.telefone.trim(),
                  email: input.email.trim(),
                  foto: input.foto,
                  whatsappNotificacao: input.whatsappNotificacao?.trim() ?? '',
                  notificarAgendamentos: input.notificarAgendamentos !== false,
                }
              : p,
          ),
        ),
      )
      if (temSupabase) {
        try {
          await atualizarProfissional(id, input)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
    },
    [profissionais, temSupabase],
  )

  /** Inativar/reativar nunca apaga o profissional nem o histórico dele. */
  const alternarAtivo = useCallback(
    async (id: string) => {
      const alvo = profissionais.find((p) => p.id === id)
      if (!alvo) return
      const novoAtivo = !alvo.ativo
      alterados.current.add(id)
      setProfissionais((atual) =>
        atual.map((p) => (p.id === id ? { ...p, ativo: novoAtivo } : p)),
      )
      if (temSupabase) {
        try {
          await alternarAtivoProfissional(id, novoAtivo)
        } catch {
          // o estado local e a pendência (C2) já garantiram o dado; o aviso
          // impede que a tela trate a operação como confirmada no servidor
          avisarFalhaSincronizacao(CHAVE_STORAGE)
        }
      }
    },
    [profissionais, temSupabase],
  )

  const remover = useCallback(
    async (id: string) => {
      removidos.current.add(id)
      alterados.current.delete(id)
      // Exclusão persistida: sem o tombstone o próximo F5 devolveria o
      // registro pela lista do servidor (remoção remota pendente).
      gravarRemovidos(removidos.current)
      setProfissionais((atual) => atual.filter((p) => p.id !== id))
      if (temSupabase) {
        try {
          await removerProfissional(id)
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
    (id: string) => profissionais.find((p) => p.id === id),
    [profissionais],
  )

  const valor = useMemo(
    () => ({
      profissionais,
      adicionar,
      atualizar,
      alternarAtivo,
      remover,
      porId,
    }),
    [profissionais, adicionar, atualizar, alternarAtivo, remover, porId],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useProfissionais(): ProfissionaisContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error(
      'useProfissionais deve ser usado dentro de ProfissionaisProvider',
    )
  return ctx
}
