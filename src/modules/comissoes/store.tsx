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
  marcarSincronizacao,
  salvarJSON,
  ultimaSincronizacao,
} from '@/lib/persistencia'
import { normalizarTexto } from '@/lib/moeda'
import { supabase } from '@/lib/supabase'
import {
  gravarConfig,
  gravarEvento,
  gravarFechamento,
  importarAuditoria,
  importarConfigs,
  importarFechamentos,
  listarAuditoria,
  listarConfigs,
  listarFechamentos,
} from '@/services/supabase/comissoes'
import { PERCENTUAL_PADRAO } from './types'
import type {
  ConfigComissao,
  EventoAuditoriaComissao,
  FecharComissaoInput,
  FechamentoComissao,
  NovaConfigInput,
  Periodo,
} from './types'

const CHAVE_CONFIGS = 'studio-audax:comissoes:configs:v1'
const CHAVE_FECHAMENTOS = 'studio-audax:comissoes:fechamentos:v1'
const CHAVE_AUDITORIA = 'studio-audax:comissoes:auditoria:v1'

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Integração com o Supabase (mesmo padrão de Agenda/Caixa)
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

function assinaturaConfig(c: ConfigComissao): string {
  return estavel({
    profissional_id: c.profissionalId,
    percentual: c.percentual,
    ativo: c.ativo,
  })
}

function assinaturaFechamento(f: FechamentoComissao): string {
  return estavel({
    id: f.id,
    profissional_id: f.profissionalId || null,
    profissional_nome: f.profissionalNome,
    periodo_inicio: f.periodo.inicio,
    periodo_fim: f.periodo.fim,
    qtd_atendimentos: f.qtdAtendimentos,
    producao: f.producao,
    percentual: f.percentual,
    comissao: f.comissao,
    fechado_em: f.fechadoEm,
    reaberto: f.reaberto ?? null,
  })
}

function assinaturaEvento(a: EventoAuditoriaComissao): string {
  return estavel({
    id: a.id,
    profissional_id: a.profissionalId || null,
    profissional_nome: a.profissionalNome,
    acao: a.acao,
    periodo_inicio: a.periodo.inicio,
    periodo_fim: a.periodo.fim,
    descricao: a.descricao,
    motivo: a.motivo ?? null,
  })
}

/**
 * Carimbo de alteração de um fechamento: o registro é imutável depois de
 * fechado, então o carimbo é o próprio `fechado_em` — ou, quando existe, a
 * data da reabertura ou da renomeação do profissional, sempre posteriores.
 * Nenhum campo novo é necessário.
 */
function carimboFechamento(f: FechamentoComissao): string {
  return f.atualizadoEm ?? f.reaberto?.em ?? f.fechadoEm
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
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
      const existente = localStorage.key(i)
      if (existente?.startsWith(prefixo)) antigas.push(existente)
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

type Integracao<T> = {
  rotulo: string
  chave: string
  /** chave de identidade no app (profissionalId na config, id nos demais) */
  id: (registro: T) => string
  locais: T[]
  remotos: T[]
  assinatura: (registro: T) => string
  /** em divergência, quem tem o carimbo mais novo vence */
  maisRecente: (local: T, remoto: T) => boolean
  /** instante que define pendência legítima para esta lista */
  carimbo: (registro: T) => string
  importar: (lista: T[]) => Promise<number>
}

/**
 * União por chave + reenvio das pendências. Reenvio é `upsert` pela mesma
 * chave do app: um fechamento enviado três vezes continua sendo UM
 * fechamento (a comissão não é duplicada). Em divergência vence o carimbo mais
 * recente e o perdedor vai para o snapshot.
 *
 * Registro local ausente no servidor só é reenviado quando é pendência
 * legítima — carimbo posterior à última sincronização concluída desta lista.
 * O resto é resquício (apagado no banco): sai da lista, fica no snapshot e
 * NUNCA é reenviado.
 */
async function integrar<T>({
  rotulo,
  chave,
  id,
  locais,
  remotos,
  assinatura,
  maisRecente,
  carimbo: carimboDe,
  importar,
}: Integracao<T>): Promise<T[]> {
  const marcaAnterior = ultimaSincronizacao(chave)
  const remotoPorId = new Map(remotos.map((registro) => [id(registro), registro]))
  const porId = new Map<string, T>()
  const ordem: string[] = []
  const enviar: T[] = []
  const perdedores: T[] = []
  const descartados: T[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(id(local))
    if (!remoto) {
      const pendente =
        marcaAnterior !== null && carimboDe(local) > marcaAnterior
      if (pendente) {
        porId.set(id(local), local)
        ordem.push(id(local))
        enviar.push(local)
      } else {
        descartados.push(local)
      }
      continue
    }
    porId.set(id(local), remoto)
    ordem.push(id(local))
    if (assinatura(local) === assinatura(remoto)) continue
    if (maisRecente(local, remoto)) {
      perdedores.push(remoto)
      porId.set(id(local), local)
      enviar.push(local)
    } else {
      perdedores.push(local)
    }
  }
  for (const remoto of remotos) {
    if (porId.has(id(remoto))) continue
    porId.set(id(remoto), remoto)
    ordem.push(id(remoto))
  }

  const precisaSnapshot = perdedores.length > 0 || descartados.length > 0
  const snapshotOk =
    !precisaSnapshot || criarSnapshot(chave, [...descartados, ...perdedores])

  if (perdedores.length > 0 && !snapshotOk) {
    const divergentes = new Set(perdedores.map((registro) => id(registro)))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(id(enviar[i]))) enviar.splice(i, 1)
    }
    console.warn(
      `[comissoes] snapshot indisponível — divergências de ${rotulo} mantidas sem envio.`,
    )
  }

  if (descartados.length > 0) {
    if (snapshotOk) {
      console.warn(
        `[comissoes] ${descartados.length} registro(s) local(is) ausente(s) no Supabase (${rotulo}): descartado(s) como resquício e preservado(s) em snapshot.`,
      )
    } else {
      for (const registro of descartados) {
        if (porId.has(id(registro))) continue
        porId.set(id(registro), registro)
        ordem.push(id(registro))
      }
      console.warn(
        `[comissoes] snapshot indisponível — resquícios de ${rotulo} mantidos na lista e sem envio.`,
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
          `[comissoes] envio incompleto de ${rotulo}: ${enviados} de ${enviar.length} — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      envioCompleto = false
      console.warn(
        `[comissoes] falha ao enviar ${rotulo} para o Supabase.`,
        erro,
      )
    }
  }

  if (envioCompleto && snapshotOk) marcarSincronizacao(chave)

  return ordem
    .map((chave) => porId.get(chave))
    .filter((registro): registro is T => registro !== undefined)
}

/**
 * Junta a lista oficial com o que a tela fez durante a carga: mudança da
 * sessão vence, registro criado no meio da carga não some. Quem não está na
 * base e não foi alterado nesta sessão é resquício (apagado no Supabase) e não
 * volta para a lista.
 */
function fundir<T>(
  base: T[],
  atual: T[],
  alterados: Set<string>,
  id: (registro: T) => string,
): T[] {
  const porId = new Map(base.map((registro) => [id(registro), registro]))
  const ordem = base.map((registro) => id(registro))
  for (const registro of atual) {
    if (!alterados.has(id(registro))) continue
    if (!porId.has(id(registro))) ordem.push(id(registro))
    porId.set(id(registro), registro)
  }
  return ordem
    .map((chave) => porId.get(chave))
    .filter((registro): registro is T => registro !== undefined)
}

type ComissoesSupabase = {
  configs: ConfigComissao[]
  fechamentos: FechamentoComissao[]
  auditoria: EventoAuditoriaComissao[]
}

/**
 * Integração completa das comissões. Falha de leitura em qualquer parte
 * derruba a integração inteira: nada é aplicado pela metade e nada é reenviado
 * — o estado local fica intacto.
 */
async function integrarComissoes(
  configsLocais: ConfigComissao[],
  fechamentosLocais: FechamentoComissao[],
  auditoriaLocal: EventoAuditoriaComissao[],
  instalacaoNova: boolean,
): Promise<ComissoesSupabase> {
  const [configsRemotas, fechamentosRemotos, auditoriaRemota] =
    await Promise.all([listarConfigs(), listarFechamentos(), listarAuditoria()])

  // instalação nova (nada neste dispositivo): o servidor é a verdade e o
  // que a tela criou durante a carga é re-aplicado pelo `fundir`
  if (
    instalacaoNova &&
    (configsRemotas.length > 0 ||
      fechamentosRemotos.length > 0 ||
      auditoriaRemota.length > 0)
  ) {
    return {
      configs: configsRemotas,
      fechamentos: fechamentosRemotos,
      auditoria: auditoriaRemota,
    }
  }

  const [configs, fechamentos, auditoria] = await Promise.all([
    integrar<ConfigComissao>({
      rotulo: 'configurações',
      chave: CHAVE_CONFIGS,
      id: (c) => c.profissionalId,
      locais: configsLocais,
      remotos: configsRemotas,
      assinatura: assinaturaConfig,
      // registro antigo (sem carimbo) não rebaixa a versão do servidor
      maisRecente: (local, remoto) =>
        (local.atualizadoEm ?? '') > (remoto.atualizadoEm ?? ''),
      carimbo: (config) => config.atualizadoEm ?? '',
      importar: importarConfigs,
    }),
    integrar<FechamentoComissao>({
      rotulo: 'fechamentos',
      chave: CHAVE_FECHAMENTOS,
      id: (f) => f.id,
      locais: fechamentosLocais,
      remotos: fechamentosRemotos,
      assinatura: assinaturaFechamento,
      maisRecente: (local, remoto) =>
        carimboFechamento(local) > carimboFechamento(remoto),
      carimbo: carimboFechamento,
      importar: importarFechamentos,
    }),
    integrar<EventoAuditoriaComissao>({
      rotulo: 'auditoria',
      chave: CHAVE_AUDITORIA,
      id: (a) => a.id,
      locais: auditoriaLocal,
      remotos: auditoriaRemota,
      assinatura: assinaturaEvento,
      // trilha histórica: o evento mais novo (maior criadoEm) vence
      maisRecente: (local, remoto) => local.criadoEm > remoto.criadoEm,
      carimbo: (evento) => evento.criadoEm,
      importar: importarAuditoria,
    }),
  ])

  return { configs, fechamentos, auditoria }
}

/** Integração em andamento compartilhada (StrictMode executa o efeito 2x). */
let promessaIntegracao: Promise<ComissoesSupabase> | null = null

export type ComissoesContexto = {
  configs: ConfigComissao[]
  fechamentos: FechamentoComissao[]
  auditoria: EventoAuditoriaComissao[]
  configDe: (profissionalId: string) => ConfigComissao
  salvarConfig: (profissionalId: string, input: NovaConfigInput) => void
  fechamentoAtivo: (
    profissionalId: string,
    periodo: Periodo,
  ) => FechamentoComissao | undefined
  fecharComissao: (input: FecharComissaoInput) => FechamentoComissao
  reabrirComissao: (fechamentoId: string, motivo: string) => void
  /** Propaga a renomeação de profissional aos rótulos dos fechamentos */
  renomearProfissional: (antigo: string, novo: string) => void
}

const Contexto = createContext<ComissoesContexto | null>(null)

/** Estado vazio compartilhado (provider ausente em testes/árvores avulsas). */
const VAZIO: ComissoesContexto = {
  configs: [],
  fechamentos: [],
  auditoria: [],
  configDe: (profissionalId) => ({
    profissionalId,
    percentual: PERCENTUAL_PADRAO,
    ativo: true,
  }),
  salvarConfig: () => {
    throw new Error('useComissoes precisa do ComissoesProvider.')
  },
  fechamentoAtivo: () => undefined,
  fecharComissao: () => {
    throw new Error('useComissoes precisa do ComissoesProvider.')
  },
  reabrirComissao: () => {
    throw new Error('useComissoes precisa do ComissoesProvider.')
  },
  renomearProfissional: () => {},
}

export function ComissoesProvider({ children }: { children: ReactNode }) {
  const temSupabase = supabase() !== null
  const [sincronizado, setSincronizado] = useState(false)
  const [configs, setConfigs] = useState<ConfigComissao[]>(() =>
    carregarJSON<ConfigComissao[]>(CHAVE_CONFIGS, [], Array.isArray),
  )
  const [fechamentos, setFechamentos] = useState<FechamentoComissao[]>(() =>
    carregarJSON<FechamentoComissao[]>(CHAVE_FECHAMENTOS, [], Array.isArray),
  )
  const [auditoria, setAuditoria] = useState<EventoAuditoriaComissao[]>(() =>
    carregarJSON<EventoAuditoriaComissao[]>(CHAVE_AUDITORIA, [], Array.isArray),
  )
  const [instalacaoNova] = useState(
    () =>
      carregarJSON<unknown>(CHAVE_CONFIGS, null, Array.isArray) === null &&
      carregarJSON<unknown>(CHAVE_FECHAMENTOS, null, Array.isArray) === null &&
      carregarJSON<unknown>(CHAVE_AUDITORIA, null, Array.isArray) === null,
  )
  const alteradosConfigs = useRef<Set<string>>(new Set())
  const alteradosFechamentos = useRef<Set<string>>(new Set())
  const alteradosAuditoria = useRef<Set<string>>(new Set())
  const configsLocais = useRef<ConfigComissao[]>(configs)
  const fechamentosLocais = useRef<FechamentoComissao[]>(fechamentos)
  const auditoriaLocal = useRef<EventoAuditoriaComissao[]>(auditoria)

  useEffect(() => {
    configsLocais.current = configs
  }, [configs])
  useEffect(() => {
    fechamentosLocais.current = fechamentos
  }, [fechamentos])
  useEffect(() => {
    auditoriaLocal.current = auditoria
  }, [auditoria])

  // O Supabase é a fonte oficial das comissões, mas o estado local nunca é
  // substituído: a integração une os dois lados, reenvia as pendências e o
  // resultado é mesclado com o que a tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarComissoes(
        configsLocais.current,
        fechamentosLocais.current,
        auditoriaLocal.current,
        instalacaoNova,
      )
    }
    promessaIntegracao
      .then((base) => {
        if (!vivo) return
        setConfigs((atual) =>
          fundir(
            base.configs,
            atual,
            alteradosConfigs.current,
            (c) => c.profissionalId,
          ),
        )
        setFechamentos((atual) =>
          fundir(
            base.fechamentos,
            atual,
            alteradosFechamentos.current,
            (f) => f.id,
          ),
        )
        setAuditoria((atual) =>
          fundir(
            base.auditoria,
            atual,
            alteradosAuditoria.current,
            (a) => a.id,
          ),
        )
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém as comissões locais intactas e
        // não reenvia nada (evita sobrescrever dado do servidor)
        if (vivo) {
          console.warn(
            '[comissoes] Supabase indisponível — seguindo com os dados locais.',
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

  /**
   * Só trava a persistência local quando existe risco real de sobrescrever
   * dado do servidor: sem Supabase, ou antes da carga com nada pendente.
   */
  const podeGravar = useCallback(() => {
    if (!temSupabase) return true
    if (sincronizado) return true
    return (
      alteradosConfigs.current.size > 0 ||
      alteradosFechamentos.current.size > 0 ||
      alteradosAuditoria.current.size > 0
    )
  }, [temSupabase, sincronizado])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_CONFIGS, configs)
  }, [configs, podeGravar])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_FECHAMENTOS, fechamentos)
  }, [fechamentos, podeGravar])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_AUDITORIA, auditoria)
  }, [auditoria, podeGravar])

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

  const configDe = useCallback(
    (profissionalId: string): ConfigComissao =>
      configs.find((c) => c.profissionalId === profissionalId) ?? {
        profissionalId,
        percentual: PERCENTUAL_PADRAO,
        ativo: true,
      },
    [configs],
  )

  const salvarConfig = useCallback(
    (profissionalId: string, input: NovaConfigInput) => {
      if (!profissionalId) throw new Error('Profissional sem identificação.')
      if (!Number.isFinite(input.percentual) || input.percentual < 0) {
        throw new Error('Percentual inválido (mínimo 0).')
      }
      if (input.percentual > 100) {
        throw new Error('O percentual não pode ser maior que 100%.')
      }
      // o carimbo entra sempre junto do valor: é o que decide qual versão
      // prevalece se dois dispositivos mexerem no mesmo profissional
      const config: ConfigComissao = {
        profissionalId,
        percentual: input.percentual,
        ativo: input.ativo,
        atualizadoEm: new Date().toISOString(),
      }
      alteradosConfigs.current.add(profissionalId)
      setConfigs((atual) => {
        const existente = atual.find(
          (c) => c.profissionalId === profissionalId,
        )
        if (existente) {
          return atual.map((c) =>
            c.profissionalId === profissionalId ? config : c,
          )
        }
        return [...atual, config]
      })
      sincronizar(CHAVE_CONFIGS, () => gravarConfig(config))
    },
    [sincronizar],
  )

  const fechamentoAtivo = useCallback(
    (profissionalId: string, periodo: Periodo) =>
      fechamentos.find(
        (f) =>
          f.profissionalId === profissionalId &&
          f.periodo.inicio === periodo.inicio &&
          f.periodo.fim === periodo.fim &&
          !f.reaberto,
      ),
    [fechamentos],
  )

  const fecharComissao = useCallback(
    (input: FecharComissaoInput): FechamentoComissao => {
      if (!input.profissionalId) throw new Error('Profissional sem identificação.')
      if (!input.periodo.inicio || !input.periodo.fim) {
        throw new Error('Período inválido.')
      }
      if (input.periodo.inicio > input.periodo.fim) {
        throw new Error('O início do período não pode ser depois do fim.')
      }
      if (fechamentoAtivo(input.profissionalId, input.periodo)) {
        throw new Error(
          'Já existe comissão fechada para este profissional neste período.',
        )
      }
      // Fechamentos sobrepagos: períodos que se cruzam pagariam a mesma
      // produção duas vezes (a comissão é calculada sobre os lançamentos
      // do intervalo, então intervalos comuns duplicam pagamento).
      const sobreposto = fechamentos.find(
        (f) =>
          f.profissionalId === input.profissionalId &&
          !f.reaberto &&
          f.periodo.inicio <= input.periodo.fim &&
          f.periodo.fim >= input.periodo.inicio,
      )
      if (sobreposto) {
        throw new Error(
          `Já existe comissão fechada de ${sobreposto.periodo.inicio} a ${sobreposto.periodo.fim} para este profissional — o período pedido se sobrepõe e pagaria a mesma produção duas vezes.`,
        )
      }
      if (!Number.isFinite(input.producao) || input.producao < 0) {
        throw new Error('Produção inválida.')
      }
      if (
        !Number.isFinite(input.percentual) ||
        input.percentual < 0 ||
        input.percentual > 100
      ) {
        throw new Error('Percentual inválido.')
      }
      if (!Number.isFinite(input.comissao) || input.comissao < 0) {
        throw new Error('Comissão inválida (não pode ser negativa).')
      }

      const agora = new Date().toISOString()
      const fechamento: FechamentoComissao = {
        id: gerarId(),
        profissionalId: input.profissionalId,
        profissionalNome: input.profissionalNome,
        periodo: { ...input.periodo },
        qtdAtendimentos: input.qtdAtendimentos,
        producao: input.producao,
        percentual: input.percentual,
        comissao: input.comissao,
        fechadoEm: agora,
      }
      const evento: EventoAuditoriaComissao = {
        id: gerarId(),
        acao: 'fechamento',
        profissionalId: input.profissionalId,
        profissionalNome: input.profissionalNome,
        periodo: { ...input.periodo },
        descricao: `Comissão de ${input.profissionalNome} fechada em ${formatarDatas(agora)} — ${input.comissao.toFixed(2).replace('.', ',')}`,
        criadoEm: agora,
      }
      setFechamentos((atual) => [...atual, fechamento])
      setAuditoria((atual) => [...atual, evento])
      alteradosFechamentos.current.add(fechamento.id)
      alteradosAuditoria.current.add(evento.id)
      // mesmo registro nos dois lados: o reenvio é upsert pelo mesmo id, então
      // uma falha na hora de enviar não vira comissão duplicada
      sincronizar(CHAVE_FECHAMENTOS, () => gravarFechamento(fechamento))
      sincronizar(CHAVE_AUDITORIA, () => gravarEvento(evento))
      return fechamento
    },
    [fechamentoAtivo, fechamentos, sincronizar],
  )

  const reabrirComissao = useCallback(
    (fechamentoId: string, motivo: string) => {
      const alvo = fechamentos.find((f) => f.id === fechamentoId)
      if (!alvo) throw new Error('Fechamento não encontrado.')
      if (alvo.reaberto) throw new Error('Esta comissão já foi reaberta.')
      if (motivo.trim().length < 3) {
        throw new Error('Informe o motivo da reabertura (mín. 3 letras).')
      }
      const agora = new Date().toISOString()
      const evento: EventoAuditoriaComissao = {
        id: gerarId(),
        acao: 'reabertura',
        profissionalId: alvo.profissionalId,
        profissionalNome: alvo.profissionalNome,
        periodo: { ...alvo.periodo },
        descricao: `Comissão de ${alvo.profissionalNome} (${alvo.periodo.inicio} a ${alvo.periodo.fim}) reaberta`,
        motivo: motivo.trim(),
        criadoEm: agora,
      }
      const reaberto: { em: string; motivo: string } = {
        em: agora,
        motivo: motivo.trim(),
      }
      // o fechamento original não muda em produção/percentual/comissão: só a
      // reabertura é acrescentada, e o carimbo registra a alteração
      const alvoAtualizado: FechamentoComissao = { ...alvo, reaberto, atualizadoEm: agora }
      setFechamentos((atual) =>
        atual.map((f) => (f.id === fechamentoId ? alvoAtualizado : f)),
      )
      setAuditoria((atual) => [...atual, evento])
      alteradosFechamentos.current.add(fechamentoId)
      alteradosAuditoria.current.add(evento.id)
      sincronizar(CHAVE_FECHAMENTOS, () => gravarFechamento(alvoAtualizado))
      sincronizar(CHAVE_AUDITORIA, () => gravarEvento(evento))
    },
    [fechamentos, sincronizar],
  )

  // Propaga renomeação ao rótulo dos fechamentos (o mesmo que Caixa e
  // Agenda fazem com o histórico). A auditoria é trilha histórica e não
  // é reescrita; configs são indexados por profissionalId e não mudam.
  const renomearProfissional = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      // Propagação casa por chave normalizada (mesma regra do dedupe do
      // cadastro): dado legado com caixa/acentos diferentes não engancha.
      const chave = normalizarTexto(antigo)
      const em = new Date().toISOString()
      const mudar = (atual: FechamentoComissao[]) =>
        atual.map((f) =>
          normalizarTexto(f.profissionalNome) === chave
            ? { ...f, profissionalNome: destino, atualizadoEm: em }
            : f,
        )
      const mudados = mudar(fechamentosLocais.current).filter(
        (f, indice) => f !== fechamentosLocais.current[indice],
      )
      if (mudados.length === 0) return
      for (const f of mudados) alteradosFechamentos.current.add(f.id)
      setFechamentos(mudar)
      sincronizar(CHAVE_FECHAMENTOS, () => importarFechamentos(mudados))
    },
    [sincronizar],
  )

  const valor = useMemo(
    () => ({
      configs,
      fechamentos,
      auditoria,
      configDe,
      salvarConfig,
      fechamentoAtivo,
      fecharComissao,
      reabrirComissao,
      renomearProfissional,
    }),
    [
      configs,
      fechamentos,
      auditoria,
      configDe,
      salvarConfig,
      fechamentoAtivo,
      fecharComissao,
      reabrirComissao,
      renomearProfissional,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

function formatarDatas(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function useComissoes(): ComissoesContexto {
  const ctx = useContext(Contexto)
  if (!ctx)
    throw new Error('useComissoes deve ser usado dentro de ComissoesProvider')
  return ctx
}

/**
 * useComissoes tolerante a árvore sem provider (Profissionais e
 * renomeações em páginas testadas avulsas): devolve estado vazio em
 * vez de erro.
 */
export function useComissoesOpcional(): ComissoesContexto {
  return useContext(Contexto) ?? VAZIO
}
