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
  marcarSincronizacao,
  salvarJSON,
  ultimaSincronizacao,
} from '@/lib/persistencia'
import { supabase } from '@/lib/supabase'
import { useCaixa } from '@/modules/caixa/store'
import {
  gravarAgendamento,
  gravarBloqueio,
  gravarExpediente,
  importarAgendamentos,
  importarBloqueios,
  lerExpediente,
  listarAgendamentos,
  listarBloqueios,
  removerAgendamento,
  removerBloqueio as removerBloqueioRemoto,
} from '@/services/supabase/agenda'
import {
  carregarAgendamentos,
  carregarBloqueios,
  carregarExpediente,
  salvarAgendamentos,
  salvarBloqueios,
  salvarExpedienteJSON,
  CHAVE_BLOQUEIOS,
  CHAVE_EXPEDIENTE,
  CHAVE_STORAGE as CHAVE_AGENDAMENTOS,
} from './persistencia'
import {
  duracaoBase,
  validarBloqueio,
  validarExpediente,
  validarProposta,
} from './regras'
import type {
  Agendamento,
  Bloqueio,
  EdicaoAgendamentoInput,
  Expediente,
  NovoAgendamentoInput,
  NovoBloqueioInput,
  StatusAgendamento,
} from './types'

type AgendaContexto = {
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  expediente: Expediente
  /** Cria validando expediente, almoço, bloqueios e conflito (lança erro) */
  adicionar: (input: NovoAgendamentoInput) => Agendamento
  mudarStatus: (id: string, status: StatusAgendamento) => void
  remover: (id: string) => void
  porData: (dataISO: string) => Agendamento[]
  /**
   * Move o agendamento para nova data/horário/profissional mantendo o id,
   * o status e registrando a remarcação no histórico (lança erro se ocupado).
   */
  remarcar: (
    id: string,
    novo: { data: string; horario: string; profissional: string },
  ) => Agendamento
  /** Persiste o expediente validando os horários (lança erro) */
  salvarExpediente: (entrada: Expediente) => void
  /**
   * Edita cliente, telefone, serviço e observação mantendo id, status,
   * data/horário/profissional (mover é remarcação). Revalida conflito com a
   * nova duração e bloqueia quando o agendamento já foi pago (lança erro).
   */
  editar: (id: string, entrada: EdicaoAgendamentoInput) => Agendamento
  criarBloqueio: (entrada: NovoBloqueioInput) => Bloqueio
  removerBloqueio: (id: string) => void
  /** Propaga renomeações de cadastro para os agendamentos existentes */
  renomearProfissional: (antigo: string, novo: string) => void
  renomearServico: (antigo: string, novo: string) => void
  renomearCliente: (antigo: string, novo: string) => void
}

const Contexto = createContext<AgendaContexto | null>(null)

// Tombstones de remoção: a exclusão precisa sobreviver ao F5 — sem elas a
// próxima carga devolveria os registros pela lista do servidor.
const CHAVE_REMOVIDOS_AGENDAMENTOS =
  'studio-audax:agenda:agendamentos:removidos:v1'
const CHAVE_REMOVIDOS_BLOQUEIOS = 'studio-audax:agenda:bloqueios:removidos:v1'

function ehListaIds(valor: unknown): boolean {
  return Array.isArray(valor) && valor.every((id) => typeof id === 'string')
}

function gravarRemovidos(chave: string, ids: Set<string>): void {
  salvarJSON(chave, Array.from(ids))
}

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function ordenar(lista: Agendamento[]): Agendamento[] {
  return [...lista].sort((a, b) =>
    `${a.data} ${a.horario}`.localeCompare(`${b.data} ${b.horario}`),
  )
}

function ordenarBloqueios(lista: Bloqueio[]): Bloqueio[] {
  return [...lista].sort((a, b) =>
    `${a.data} ${a.inicio}`.localeCompare(`${b.data} ${b.inicio}`),
  )
}

/** Carimbo de alteração: só a sincronização usa (não é regra de negócio). */
function agora(): string {
  return new Date().toISOString()
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

/** Assinatura do conteúdo (sem carimbos) — a mesma linha que vai ao banco. */
function assinaturaAgendamento(ag: Agendamento): string {
  return estavel({
    id: ag.id,
    cliente: ag.cliente,
    telefone: ag.telefone,
    servico: ag.servico,
    profissional: ag.profissional,
    data: ag.data,
    horario: ag.horario,
    status: ag.status,
    duracao_min: ag.duracaoMin ?? null,
    observacao: ag.observacao,
    remarcacoes: ag.remarcacoes ?? [],
  })
}

function assinaturaBloqueio(b: Bloqueio): string {
  return estavel({
    id: b.id,
    profissional: b.profissional,
    data: b.data,
    data_fim: b.dataFim ?? null,
    inicio: b.inicio,
    fim: b.fim,
    tipo: b.tipo,
    motivo: b.motivo,
  })
}

function carimbo(): string {
  return agora().replace(/[:.]/g, '-')
}

/** Snapshot do que será substituído; false = não gravou (nada muda). */
function criarSnapshot(chave: string, perdedores: unknown[]): boolean {
  const prefixo = `${chave}:backup:`
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

type Registro = { id: string }

type Integracao<T extends Registro> = {
  rotulo: string
  chave: string
  locais: T[]
  remotos: T[]
  assinatura: (registro: T) => string
  /** Em divergência, quem vence é o mais recente por `atualizadoEm` */
  maisRecente: (a: T, b: T) => boolean
  /** instante que define pendência legítima para esta lista */
  carimbo: (registro: T) => string
  importar: (lista: T[]) => Promise<number>
  ordenar: (lista: T[]) => T[]
}

/**
 * União por id + reenvio das pendências. Reenvio é `upsert` pelo mesmo id:
 * a agenda enviada três vezes continua sendo a mesma agenda. Em divergência
 * vence o registro mais recente por `atualizadoEm` (mesma regra de produtos e
 * serviços); o perdedor vai para o snapshot.
 *
 * Registro local ausente no servidor só é reenviado quando é pendência
 * legítima — carimbo posterior à última sincronização concluída desta lista.
 * O resto é resquício (apagado no banco): sai da lista, fica no snapshot e
 * NUNCA é reenviado.
 */
async function integrar<T extends Registro>({
  rotulo,
  chave,
  locais,
  remotos,
  assinatura,
  maisRecente,
  carimbo: carimboDe,
  importar,
  ordenar: ordenarLista,
}: Integracao<T>): Promise<T[]> {
  const marcaAnterior = ultimaSincronizacao(chave)
  const remotoPorId = new Map(remotos.map((registro) => [registro.id, registro]))
  const porId = new Map<string, T>()
  const ordem: string[] = []
  const enviar: T[] = []
  const perdedores: T[] = []
  const descartados: T[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      const pendente =
        marcaAnterior !== null && carimboDe(local) > marcaAnterior
      if (pendente) {
        porId.set(local.id, local)
        ordem.push(local.id)
        enviar.push(local)
      } else {
        descartados.push(local)
      }
      continue
    }
    porId.set(local.id, remoto)
    ordem.push(local.id)
    if (assinatura(local) === assinatura(remoto)) continue
    if (maisRecente(local, remoto)) {
      perdedores.push(remoto)
      porId.set(local.id, local)
      enviar.push(local)
    } else {
      perdedores.push(local)
    }
  }
  for (const remoto of remotos) {
    if (porId.has(remoto.id)) continue
    porId.set(remoto.id, remoto)
    ordem.push(remoto.id)
  }

  const precisaSnapshot = perdedores.length > 0 || descartados.length > 0
  const snapshotOk =
    !precisaSnapshot || criarSnapshot(chave, [...descartados, ...perdedores])

  if (perdedores.length > 0 && !snapshotOk) {
    const divergentes = new Set(perdedores.map((registro) => registro.id))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(enviar[i].id)) enviar.splice(i, 1)
    }
    console.warn(
      `[agenda] snapshot indisponível — divergências de ${rotulo} mantidas sem envio.`,
    )
  }

  if (descartados.length > 0) {
    if (snapshotOk) {
      console.warn(
        `[agenda] ${descartados.length} registro(s) local(is) ausente(s) no Supabase (${rotulo}): descartado(s) como resquício e preservado(s) em snapshot.`,
      )
    } else {
      for (const registro of descartados) {
        if (porId.has(registro.id)) continue
        porId.set(registro.id, registro)
        ordem.push(registro.id)
      }
      console.warn(
        `[agenda] snapshot indisponível — resquícios de ${rotulo} mantidos na lista e sem envio.`,
      )
    }
  }

  let envioCompleto = true
  if (enviar.length > 0) {
    try {
      const enviados = await importar(enviar)
      if (enviados < enviar.length) {
        envioCompleto = false
        console.warn(
          `[agenda] envio incompleto de ${rotulo}: ${enviados} de ${enviar.length} — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      envioCompleto = false
      console.warn(`[agenda] falha ao enviar ${rotulo} para o Supabase.`, erro)
    }
  }

  if (envioCompleto && snapshotOk) marcarSincronizacao(chave)

  return ordenarLista(
    ordem
      .map((id) => porId.get(id))
      .filter((registro): registro is T => registro !== undefined),
  )
}

/**
 * Junta a lista oficial com o que a tela fez durante a carga: mudança da sessão
 * vence, registro criado no meio da carga não some e remoção da sessão é
 * respeitada. Quem não está na base e não foi alterado nesta sessão é resquício
 * (apagado no Supabase) e não volta para a lista.
 */
function fundir<T extends Registro>(
  base: T[],
  atual: T[],
  alterados: Set<string>,
  removidos: Set<string>,
  ordenarLista: (lista: T[]) => T[],
): T[] {
  const porId = new Map(base.map((registro) => [registro.id, registro]))
  const ordem = base.map((registro) => registro.id)
  for (const registro of atual) {
    if (removidos.has(registro.id)) continue
    if (alterados.has(registro.id)) {
      if (!porId.has(registro.id)) ordem.push(registro.id)
      porId.set(registro.id, registro)
    }
  }
  for (const id of removidos) {
    porId.delete(id)
    const posicao = ordem.indexOf(id)
    if (posicao >= 0) ordem.splice(posicao, 1)
  }
  return ordenarLista(
    ordem
      .map((id) => porId.get(id))
      .filter((registro): registro is T => registro !== undefined),
  )
}

type AgendaSupabase = {
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  expediente: Expediente
  /** Carimbo do expediente lido do servidor (base do LWW) */
  expedienteAtualizadoEm: string | null
}

/**
 * Integração completa da Agenda. Falha de leitura em qualquer parte derruba a
 * integração inteira: nada é aplicado pela metade e nada é reenviado — o
 * estado local fica intacto.
 */
async function integrarAgenda(
  agendamentosLocais: Agendamento[],
  bloqueiosLocais: Bloqueio[],
  expedienteLocal: Expediente,
  expedienteLocalAtualizadoEm: string | null,
  instalacaoNova: boolean,
): Promise<AgendaSupabase> {
  const [agendamentosRemotos, bloqueiosRemotos, expedienteRemoto] =
    await Promise.all([
      listarAgendamentos(),
      listarBloqueios(),
      lerExpediente(),
    ])

  if (instalacaoNova && agendamentosRemotos.length > 0) {
    return {
      agendamentos: ordenar(agendamentosRemotos),
      bloqueios: ordenarBloqueios(bloqueiosRemotos),
      expediente: expedienteRemoto?.expediente ?? expedienteLocal,
      expedienteAtualizadoEm: expedienteRemoto?.atualizadoEm ?? null,
    }
  }

  const [agendamentos, bloqueios] = await Promise.all([
    integrar<Agendamento>({
      rotulo: 'agendamentos',
      chave: CHAVE_AGENDAMENTOS,
      locais: agendamentosLocais,
      remotos: agendamentosRemotos,
      assinatura: assinaturaAgendamento,
      maisRecente: (local, remoto) =>
        (local.atualizadoEm ?? local.criadoEm) >
        (remoto.atualizadoEm ?? remoto.criadoEm),
      carimbo: (agendamento) => agendamento.atualizadoEm ?? agendamento.criadoEm,
      importar: importarAgendamentos,
      ordenar,
    }),
    integrar<Bloqueio>({
      rotulo: 'bloqueios',
      chave: CHAVE_BLOQUEIOS,
      locais: bloqueiosLocais,
      remotos: bloqueiosRemotos,
      assinatura: assinaturaBloqueio,
      maisRecente: (local, remoto) =>
        (local.atualizadoEm ?? local.criadoEm) >
        (remoto.atualizadoEm ?? remoto.criadoEm),
      carimbo: (bloqueio) => bloqueio.atualizadoEm ?? bloqueio.criadoEm,
      importar: importarBloqueios,
      ordenar: ordenarBloqueios,
    }),
  ])

  // Expediente: objeto único, resolvido pelo carimbo mais recente
  let expediente = expedienteLocal
  let expedienteAtualizadoEm = expedienteLocalAtualizadoEm
  if (expedienteRemoto) {
    const localVence = expedienteVence(
      expedienteLocalAtualizadoEm,
      expedienteRemoto.atualizadoEm,
    )
    if (localVence) {
      try {
        const gravado = await gravarExpediente(
          expedienteLocal,
          expedienteLocalAtualizadoEm ?? agora(),
        )
        if (!gravado) throw new Error('Falha ao gravar o expediente.')
        expedienteAtualizadoEm = expedienteLocalAtualizadoEm ?? agora()
      } catch (erro) {
        console.warn(
          '[agenda] falha ao enviar o expediente para o Supabase.',
          erro,
        )
      }
    } else {
      if (
        !criarSnapshot(CHAVE_EXPEDIENTE, [
          { ...expedienteLocal, atualizadoEm: expedienteLocalAtualizadoEm },
        ])
      ) {
        console.warn(
          '[agenda] snapshot indisponível — expediente mantido sem envio.',
        )
      } else {
        expediente = expedienteRemoto.expediente
        expedienteAtualizadoEm = expedienteRemoto.atualizadoEm
      }
    }
  } else if (instalacaoNova === false) {
    // servidor ainda não tem expediente: grava o local (primeira sincronização)
    try {
      const gravado = await gravarExpediente(
        expedienteLocal,
        expedienteLocalAtualizadoEm ?? agora(),
      )
      if (!gravado) throw new Error('Falha ao gravar o expediente.')
      expedienteAtualizadoEm = expedienteLocalAtualizadoEm ?? agora()
    } catch (erro) {
      console.warn(
        '[agenda] falha ao enviar o expediente para o Supabase.',
        erro,
      )
    }
  }

  return { agendamentos, bloqueios, expediente, expedienteAtualizadoEm }
}

/**
 * Expediente: vence o carimbo mais recente. Sem carimbo local (expediente
 * nunca sincronizado) o que já está no servidor é a fonte oficial — o valor
 * local é só o padrão do app, ainda não confirmado.
 */
function expedienteVence(localEm: string | null, remotoEm: string): boolean {
  if (!localEm) return false
  return localEm > remotoEm
}

/** Integração em andamento compartilhada (StrictMode executa o efeito 2x). */
let promessaIntegracao: Promise<AgendaSupabase> | null = null

/**
 * Consulta o jaPago do CaixaProvider (pagamento não estornado do agendamento).
 * Na app o AgendaProvider fica dentro do CaixaProvider; quando montado isolado,
 * sem CaixaProvider por fora, a trava de pagamento fica desligada.
 */
function useJaPago(): (agendamentoId: string) => boolean {
  let jaPago: ((agendamentoId: string) => boolean) | undefined
  try {
    const caixa = useCaixa()
    jaPago = (id) => Boolean(caixa.jaPago(id))
  } catch {
    jaPago = undefined
  }
  return useCallback((id) => Boolean(jaPago?.(id)), [jaPago])
}

export function AgendaProvider({ children }: { children: ReactNode }) {
  const jaPago = useJaPago()
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>(() =>
    carregarAgendamentos(),
  )
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>(() =>
    carregarBloqueios(),
  )
  const [expediente, setExpediente] = useState<Expediente>(() =>
    carregarExpediente(),
  )
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null
  const [instalacaoNova] = useState(
    () =>
      carregarJSON<unknown>(CHAVE_AGENDAMENTOS, null, Array.isArray) === null &&
      carregarJSON<unknown>(CHAVE_BLOQUEIOS, null, Array.isArray) === null,
  )
  const alteradosAgendamentos = useRef<Set<string>>(new Set())
  // Tombstone carregado do storage: exclusões feitas em sessões anteriores
  // seguem protegidas. Em instalação nova ele não vale (apagaria registro
  // do servidor sem relação com esta máquina).
  const removidosAgendamentos = useRef<Set<string>>(
    new Set(
      instalacaoNova
        ? []
        : carregarJSON<string[]>(CHAVE_REMOVIDOS_AGENDAMENTOS, [], ehListaIds),
    ),
  )
  const alteradosBloqueios = useRef<Set<string>>(new Set())
  const removidosBloqueios = useRef<Set<string>>(
    new Set(
      instalacaoNova
        ? []
        : carregarJSON<string[]>(CHAVE_REMOVIDOS_BLOQUEIOS, [], ehListaIds),
    ),
  )
  const agendamentosLocais = useRef<Agendamento[]>(agendamentos)
  const bloqueiosLocais = useRef<Bloqueio[]>(bloqueios)
  const expedienteLocal = useRef<Expediente>(expediente)
  const expedienteCarimbo = useRef<string | null>(null)

  useEffect(() => {
    agendamentosLocais.current = agendamentos
  }, [agendamentos])
  useEffect(() => {
    bloqueiosLocais.current = bloqueios
  }, [bloqueios])
  useEffect(() => {
    expedienteLocal.current = expediente
  }, [expediente])

  // Instalação nova: tombstone gravado por outra instalação não vale aqui.
  useEffect(() => {
    if (!instalacaoNova) return
    if (
      carregarJSON<unknown>(CHAVE_REMOVIDOS_AGENDAMENTOS, null, ehListaIds) !==
      null
    ) {
      gravarRemovidos(CHAVE_REMOVIDOS_AGENDAMENTOS, new Set())
    }
    if (
      carregarJSON<unknown>(CHAVE_REMOVIDOS_BLOQUEIOS, null, ehListaIds) !==
      null
    ) {
      gravarRemovidos(CHAVE_REMOVIDOS_BLOQUEIOS, new Set())
    }
  }, [instalacaoNova])

  // O Supabase é a fonte oficial da agenda, mas o estado local nunca é
  // substituído: a integração une os dois lados, reenvia as pendências e o
  // resultado é mesclado com o que a tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarAgenda(
        agendamentosLocais.current,
        bloqueiosLocais.current,
        expedienteLocal.current,
        expedienteCarimbo.current,
        instalacaoNova,
      )
    }
    promessaIntegracao
      .then((base) => {
        if (!vivo) return
        setAgendamentos((atual) =>
          fundir(
            base.agendamentos,
            atual,
            alteradosAgendamentos.current,
            removidosAgendamentos.current,
            ordenar,
          ),
        )
        setBloqueios((atual) =>
          fundir(
            base.bloqueios,
            atual,
            alteradosBloqueios.current,
            removidosBloqueios.current,
            ordenarBloqueios,
          ),
        )
        setExpediente((atual) =>
          base.expedienteAtualizadoEm === null
            ? atual
            : base.expediente,
        )
        expedienteCarimbo.current = base.expedienteAtualizadoEm

        // Tombstones sincronizados com a lista oficial: id que sumiu é
        // descartado; id que ainda aparece (remoção que não chegou a
        // valer) é apagado de novo — idempotente — e segue protegido
        // nesta máquina.
        const oficiaisAgendamentos = new Set(
          base.agendamentos.map((ag) => ag.id),
        )
        let agendamentoMudou = false
        for (const id of Array.from(removidosAgendamentos.current)) {
          if (oficiaisAgendamentos.has(id)) {
            void removerAgendamento(id).catch(() =>
              avisarFalhaSincronizacao(CHAVE_AGENDAMENTOS),
            )
            continue
          }
          removidosAgendamentos.current.delete(id)
          agendamentoMudou = true
        }
        if (agendamentoMudou) {
          gravarRemovidos(
            CHAVE_REMOVIDOS_AGENDAMENTOS,
            removidosAgendamentos.current,
          )
        }

        const oficiaisBloqueios = new Set(base.bloqueios.map((b) => b.id))
        let bloqueioMudou = false
        for (const id of Array.from(removidosBloqueios.current)) {
          if (oficiaisBloqueios.has(id)) {
            void removerBloqueioRemoto(id).catch(() =>
              avisarFalhaSincronizacao(CHAVE_BLOQUEIOS),
            )
            continue
          }
          removidosBloqueios.current.delete(id)
          bloqueioMudou = true
        }
        if (bloqueioMudou) {
          gravarRemovidos(
            CHAVE_REMOVIDOS_BLOQUEIOS,
            removidosBloqueios.current,
          )
        }
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém a agenda local intacta e não
        // reenvia nada (evita sobrescrever dado do servidor)
        if (vivo) {
          console.warn(
            '[agenda] Supabase indisponível — seguindo com os dados locais.',
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
    return (
      alteradosAgendamentos.current.size > 0 ||
      removidosAgendamentos.current.size > 0 ||
      alteradosBloqueios.current.size > 0 ||
      removidosBloqueios.current.size > 0
    )
  }, [temSupabase, sincronizado])

  useEffect(() => {
    if (!podeGravar()) return
    salvarAgendamentos(agendamentos)
  }, [agendamentos, podeGravar])

  useEffect(() => {
    if (!podeGravar()) return
    salvarBloqueios(bloqueios)
  }, [bloqueios, podeGravar])

  useEffect(() => {
    if (!podeGravar()) return
    salvarExpedienteJSON(expediente)
  }, [expediente, podeGravar])

  /** Escrita remota em segundo plano: o local já foi atualizado antes. */
  const sincronizar = useCallback(
    (chave: string, operacao: () => Promise<unknown>) => {
      if (!temSupabase) return
      void operacao().catch(() => {
        avisarFalhaSincronizacao(chave)
      })
    },
    [temSupabase],
  )

  /**
   * Aplica a transformação no agendamento e envia ao servidor o MESMO
   * registro resultante. A transformação roda dentro do updater, então duas
   * operações no mesmo lote (duplo clique) se combinam em vez de se
   * sobrescrever — e o registro enviado é o já combinado.
   */
  const aEnviar = useRef<Agendamento[]>([])

  const atualizarAgendamento = useCallback(
    (id: string, transformar: (ag: Agendamento) => Agendamento) => {
      const base = agendamentosLocais.current.find((ag) => ag.id === id)
      setAgendamentos((atual) => {
        const proximos = ordenar(
          atual.map((ag) => (ag.id === id ? transformar(ag) : ag)),
        )
        const registro = proximos.find((ag) => ag.id === id)
        if (registro) aEnviar.current = [registro]
        return proximos
      })
      alteradosAgendamentos.current.add(id)
      return base ? transformar(base) : undefined
    },
    [],
  )

  // Envio fora do updater: o registro enviado e o ja combinado, entao duas
  // operacoes no mesmo lote enviam o resultado final (nunca o intermediario).
  useEffect(() => {
    if (!temSupabase) return
    const registros = aEnviar.current
    if (registros.length === 0) return
    aEnviar.current = []
    for (const registro of registros) {
      sincronizar(CHAVE_AGENDAMENTOS, () => gravarAgendamento(registro))
    }
  }, [agendamentos, temSupabase, sincronizar])

  const adicionar = useCallback(
    (input: NovoAgendamentoInput) => {
      const duracaoMin = input.duracaoMin ?? duracaoBase(input.servico)
      const resultado = validarProposta({
        agendamentos,
        bloqueios,
        expediente,
        data: input.data,
        horario: input.horario,
        profissional: input.profissional,
        duracaoMin,
      })
      if (!resultado.ok) throw new Error(resultado.erro)

      const criadoEm = agora()
      const novo: Agendamento = {
        id: gerarId(),
        cliente: input.cliente.trim(),
        telefone: input.telefone.trim(),
        servico: input.servico,
        profissional: input.profissional,
        data: input.data,
        horario: input.horario,
        status: 'confirmado',
        observacao: input.observacao.trim(),
        criadoEm,
        atualizadoEm: criadoEm,
        duracaoMin,
      }
      alteradosAgendamentos.current.add(novo.id)
      setAgendamentos((atual) => ordenar([...atual, novo]))
      sincronizar(CHAVE_AGENDAMENTOS, () => gravarAgendamento(novo))
      return novo
    },
    [agendamentos, bloqueios, expediente, sincronizar],
  )

  const mudarStatus = useCallback(
    (id: string, status: StatusAgendamento) => {
      if (status === 'cancelado' && jaPago(id)) {
        throw new Error(
          'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de cancelar.',
        )
      }
      // não consulta a lista aqui: o registro pode ter sido criado no mesmo
      // lote (a transformação abaixo roda sobre o estado atual)
      const em = agora()
      atualizarAgendamento(id, (ag) => ({ ...ag, status, atualizadoEm: em }))
    },
    [jaPago, atualizarAgendamento],
  )

  const remover = useCallback(
    (id: string) => {
      if (jaPago(id)) {
        throw new Error(
          'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de excluir.',
        )
      }
      removidosAgendamentos.current.add(id)
      alteradosAgendamentos.current.delete(id)
      // Exclusão persistida: sem o tombstone o próximo F5 devolveria o
      // registro pela lista do servidor (remoção remota pendente).
      gravarRemovidos(CHAVE_REMOVIDOS_AGENDAMENTOS, removidosAgendamentos.current)
      setAgendamentos((atual) => atual.filter((ag) => ag.id !== id))
      sincronizar(CHAVE_AGENDAMENTOS, () => removerAgendamento(id))
    },
    [jaPago, sincronizar],
  )

  const remarcar = useCallback(
    (id: string, novo: { data: string; horario: string; profissional: string }) => {
      const ag = agendamentos.find((a) => a.id === id)
      if (!ag) throw new Error('Agendamento não encontrado.')
      const igual =
        ag.data === novo.data &&
        ag.horario === novo.horario &&
        ag.profissional === novo.profissional
      if (igual) return ag

      const duracaoMin = ag.duracaoMin ?? duracaoBase(ag.servico)
      const resultado = validarProposta({
        agendamentos,
        bloqueios,
        expediente,
        data: novo.data,
        horario: novo.horario,
        profissional: novo.profissional,
        duracaoMin,
        ignorarId: id,
      })
      if (!resultado.ok) throw new Error(resultado.erro)

      const em = agora()
      // a remarcação registra o estado anterior do registro que está na lista
      const registrado = atualizarAgendamento(id, (a) => ({
        ...a,
        data: novo.data,
        horario: novo.horario,
        profissional: novo.profissional,
        atualizadoEm: em,
        remarcacoes: [
          ...(a.remarcacoes ?? []),
          {
            de: {
              data: a.data,
              horario: a.horario,
              profissional: a.profissional,
            },
            em,
          },
        ],
      }))
      if (registrado) return registrado
      return { ...ag, ...novo }
    },
    [agendamentos, bloqueios, expediente, atualizarAgendamento],
  )

  const editar = useCallback(
    (id: string, entrada: EdicaoAgendamentoInput) => {
      const ag = agendamentos.find((a) => a.id === id)
      if (!ag) throw new Error('Agendamento não encontrado.')
      if (jaPago(id)) {
        throw new Error(
          'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de editar.',
        )
      }
      const cliente = entrada.cliente.trim()
      if (cliente.length < 2) {
        throw new Error('Informe o nome do cliente.')
      }
      if (!entrada.servico) {
        throw new Error('Cadastre um serviço no módulo Serviços antes de editar.')
      }
      const servicoMudou = entrada.servico !== ag.servico
      const duracaoMin = servicoMudou
        ? entrada.duracaoMin ?? duracaoBase(entrada.servico)
        : (ag.duracaoMin ?? duracaoBase(entrada.servico))
      const resultado = validarProposta({
        agendamentos,
        bloqueios,
        expediente,
        data: ag.data,
        horario: ag.horario,
        profissional: ag.profissional,
        duracaoMin,
        ignorarId: id,
      })
      if (!resultado.ok) throw new Error(resultado.erro)

      const editado = atualizarAgendamento(id, (a) => ({
        ...a,
        cliente,
        telefone: entrada.telefone.trim(),
        servico: entrada.servico,
        observacao: entrada.observacao.trim(),
        duracaoMin,
        atualizadoEm: agora(),
      }))
      // a transformação não devolve nada só se o registro sumiu no meio do lote
      return editado ?? { ...ag, cliente, telefone: entrada.telefone.trim(), servico: entrada.servico, observacao: entrada.observacao.trim(), duracaoMin }
    },
    [agendamentos, bloqueios, expediente, jaPago, atualizarAgendamento],
  )

  const salvarExpediente = useCallback(
    (entrada: Expediente) => {
      const erro = validarExpediente(entrada)
      if (erro) throw new Error(erro)
      const carimboAtual = agora()
      setExpediente(entrada)
      if (temSupabase) {
        expedienteCarimbo.current = carimboAtual
        sincronizar(CHAVE_EXPEDIENTE, () =>
          gravarExpediente(entrada, carimboAtual),
        )
      }
    },
    [temSupabase, sincronizar],
  )

  const criarBloqueio = useCallback(
    (entrada: NovoBloqueioInput) => {
      const erro = validarBloqueio(entrada, bloqueios)
      if (erro) throw new Error(erro)
      const profissional = entrada.profissional.trim()
      const motivo = entrada.motivo.trim()
      const criadoEm = agora()
      const novo: Bloqueio = {
        id: gerarId(),
        profissional,
        data: entrada.data,
        dataFim: entrada.dataFim || undefined,
        inicio: entrada.inicio,
        fim: entrada.fim,
        tipo: entrada.tipo,
        motivo,
        criadoEm,
        atualizadoEm: criadoEm,
      }
      alteradosBloqueios.current.add(novo.id)
      setBloqueios((atual) => ordenarBloqueios([...atual, novo]))
      sincronizar(CHAVE_BLOQUEIOS, () => gravarBloqueio(novo))
      return novo
    },
    [bloqueios, sincronizar],
  )

  const removerBloqueio = useCallback(
    (id: string) => {
      removidosBloqueios.current.add(id)
      alteradosBloqueios.current.delete(id)
      // Exclusão persistida: sem o tombstone o próximo F5 devolveria o
      // registro pela lista do servidor (remoção remota pendente).
      gravarRemovidos(CHAVE_REMOVIDOS_BLOQUEIOS, removidosBloqueios.current)
      setBloqueios((atual) => atual.filter((b) => b.id !== id))
      sincronizar(CHAVE_BLOQUEIOS, () => removerBloqueioRemoto(id))
    },
    [sincronizar],
  )

  // Propagação casa por chave normalizada (mesma regra do dedupe do
  // cadastro): dado legado com caixa/acentos diferentes não engancha.
  // O estado continua por updater funcional (duas renomeações no mesmo lote
  // se combinam) e o envio leva só os registros tocados, por upsert.
  const renomearProfissional = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      const em = agora()
      const mudarAgendamento = (atual: Agendamento[]) =>
        atual.map((ag) =>
          normalizarTexto(ag.profissional) === chave
            ? { ...ag, profissional: destino, atualizadoEm: em }
            : ag,
        )
      const mudarBloqueio = (atual: Bloqueio[]) =>
        atual.map((b) =>
          normalizarTexto(b.profissional) === chave
            ? { ...b, profissional: destino, atualizadoEm: em }
            : b,
        )
      const agendamentosMudados = mudarAgendamento(agendamentosLocais.current).filter(
        (ag, indice) => ag !== agendamentosLocais.current[indice],
      )
      const bloqueiosMudados = mudarBloqueio(bloqueiosLocais.current).filter(
        (b, indice) => b !== bloqueiosLocais.current[indice],
      )
      if (agendamentosMudados.length === 0 && bloqueiosMudados.length === 0) return
      for (const ag of agendamentosMudados) alteradosAgendamentos.current.add(ag.id)
      for (const b of bloqueiosMudados) alteradosBloqueios.current.add(b.id)
      setAgendamentos((atual) => mudarAgendamento(atual))
      setBloqueios((atual) => mudarBloqueio(atual))
      if (agendamentosMudados.length > 0) {
        sincronizar(CHAVE_AGENDAMENTOS, () => importarAgendamentos(agendamentosMudados))
      }
      if (bloqueiosMudados.length > 0) {
        sincronizar(CHAVE_BLOQUEIOS, () => importarBloqueios(bloqueiosMudados))
      }
    },
    [sincronizar],
  )

  const renomearServico = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      const em = agora()
      const mudar = (atual: Agendamento[]) =>
        atual.map((ag) =>
          normalizarTexto(ag.servico) === chave
            ? { ...ag, servico: destino, atualizadoEm: em }
            : ag,
        )
      const mudados = mudar(agendamentosLocais.current).filter(
        (ag, indice) => ag !== agendamentosLocais.current[indice],
      )
      if (mudados.length === 0) return
      for (const ag of mudados) alteradosAgendamentos.current.add(ag.id)
      setAgendamentos((atual) => mudar(atual))
      sincronizar(CHAVE_AGENDAMENTOS, () => importarAgendamentos(mudados))
    },
    [sincronizar],
  )

  const renomearCliente = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      const em = agora()
      const mudar = (atual: Agendamento[]) =>
        atual.map((ag) =>
          normalizarTexto(ag.cliente) === chave
            ? { ...ag, cliente: destino, atualizadoEm: em }
            : ag,
        )
      const mudados = mudar(agendamentosLocais.current).filter(
        (ag, indice) => ag !== agendamentosLocais.current[indice],
      )
      if (mudados.length === 0) return
      for (const ag of mudados) alteradosAgendamentos.current.add(ag.id)
      setAgendamentos((atual) => mudar(atual))
      sincronizar(CHAVE_AGENDAMENTOS, () => importarAgendamentos(mudados))
    },
    [sincronizar],
  )

  const porData = useCallback(
    (dataISO: string) =>
      agendamentos
        .filter((ag) => ag.data === dataISO && ag.status !== 'cancelado')
        .sort((a, b) => a.horario.localeCompare(b.horario)),
    [agendamentos],
  )

  const valor = useMemo(
    () => ({
      agendamentos,
      bloqueios,
      expediente,
      adicionar,
      mudarStatus,
      remover,
      porData,
      remarcar,
      editar,
      salvarExpediente,
      criarBloqueio,
      removerBloqueio,
      renomearProfissional,
      renomearServico,
      renomearCliente,
    }),
    [
      agendamentos,
      bloqueios,
      expediente,
      adicionar,
      mudarStatus,
      remover,
      porData,
      remarcar,
      editar,
      salvarExpediente,
      criarBloqueio,
      removerBloqueio,
      renomearProfissional,
      renomearServico,
      renomearCliente,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAgenda(): AgendaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAgenda deve ser usado dentro de AgendaProvider')
  return ctx
}
