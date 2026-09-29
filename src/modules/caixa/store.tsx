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
import {
  FORMAS_PAGAMENTO,
  type EventoAuditoria,
  type Fechamento,
  type FormaPagamento,
  type Lancamento,
  type NovaDespesaInput,
  type NovaReceitaClubeInput,
  type NovaVendaInput,
  type NovoPagamentoInput,
  type NovaVendaProdutoInput,
  type ResumoFechamento,
} from './types'
import { supabase } from '@/lib/supabase'
import {
  atualizarFechamento,
  atualizarLancamento,
  criarEventoAuditoria,
  criarFechamento,
  criarLancamento,
  importarAuditoria,
  importarFechamentos,
  importarLancamentos,
  listarAuditoria,
  listarFechamentos,
  listarLancamentos,
  linhaAuditoria,
  linhaFechamento,
  linhaLancamento,
  removerLancamento,
} from '@/services/supabase/caixa'

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_FECHAMENTOS = 'studio-audax:caixa:fechamentos:v1'
const CHAVE_AUDITORIA = 'studio-audax:caixa:auditoria:v1'
// Tombstone de lançamento removido: a remoção precisa sobreviver ao F5 —
// sem ele a próxima carga devolve o registro pela lista do servidor.
const CHAVE_REMOVIDOS = 'studio-audax:caixa:removidos:v1'

function ehListaIds(valor: unknown): boolean {
  return Array.isArray(valor) && valor.every((id) => typeof id === 'string')
}

function gravarRemovidos(ids: Set<string>): void {
  salvarJSON(CHAVE_REMOVIDOS, Array.from(ids))
}

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function formaVazia(): Record<FormaPagamento, number> {
  return {
    dinheiro: 0,
    pix: 0,
    cartao_credito: 0,
    cartao_debito: 0,
    outro: 0,
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

function agoraHora(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

export type CaixaContexto = {
  lancamentos: Lancamento[]
  fechamentos: Fechamento[]
  auditoria: EventoAuditoria[]
  diaFechado: (data: string) => boolean
  fechamentoAtivo: (data: string) => Fechamento | undefined
  lancamentosDoDia: (data: string) => Lancamento[]
  resumoDoDia: (data: string) => ResumoFechamento
  jaPago: (agendamentoId: string) => Lancamento | undefined
  registrarPagamento: (input: NovoPagamentoInput) => Lancamento
  venderProduto: (input: NovaVendaProdutoInput) => Lancamento
  /** Venda do PDV: vários produtos → UMA única movimentação no Caixa */
  registrarVenda: (input: NovaVendaInput) => Lancamento
  /** Recebimento de assinatura do Audax Club (origem "clube") */
  registrarReceitaClube: (input: NovaReceitaClubeInput) => Lancamento
  adicionarDespesa: (input: NovaDespesaInput) => Lancamento
  estornar: (id: string) => void
  /**
   * Compensação de uma venda/atendimento cujo passo seguinte falhou (baixa
   * de estoque, status): remove o lançamento recém-criado pelo id exato
   * para a operação não ficar parcial (caixa gravado sem estoque).
   */
  desfazerLancamento: (lancamentoId: string) => void
  fecharCaixa: (data: string) => Fechamento
  reabrirCaixa: (data: string, motivo: string) => void
  /** Propaga renomeações de cadastro para os lançamentos existentes */
  renomearProfissional: (antigo: string, novo: string) => void
  renomearServico: (antigo: string, novo: string) => void
  renomearCliente: (antigo: string, novo: string) => void
  renomearProduto: (antigo: string, novo: string) => void
}

const Contexto = createContext<CaixaContexto | null>(null)

/** Estado vazio compartilhado (provider ausente em testes/árvores avulsas). */
const VAZIO: CaixaContexto = {
  lancamentos: [],
  fechamentos: [],
  auditoria: [],
  diaFechado: () => false,
  fechamentoAtivo: () => undefined,
  lancamentosDoDia: () => [],
  resumoDoDia: () => ({
    receitasAtendimentos: 0,
    receitasProdutos: 0,
    receitasClube: 0,
    totalRecebido: 0,
    descontos: 0,
    despesas: 0,
    liquido: 0,
    porForma: formaVazia(),
    porProfissional: [],
    qtdAtendimentos: 0,
    qtdProdutos: 0,
  }),
  jaPago: () => undefined,
  registrarPagamento: () => {
    throw new Error('useCaixa precisa do CaixaProvider.')
  },
  venderProduto: () => {
    throw new Error('useCaixa precisa do CaixaProvider.')
  },
  registrarVenda: () => {
    throw new Error('useCaixa precisa do CaixaProvider.')
  },
  registrarReceitaClube: () => {
    throw new Error('useCaixa precisa do CaixaProvider.')
  },
  adicionarDespesa: () => {
    throw new Error('useCaixa precisa do CaixaProvider.')
  },
  estornar: () => {},
  desfazerLancamento: () => {},
  fecharCaixa: () => {
    throw new Error('useCaixa precisa do CaixaProvider.')
  },
  reabrirCaixa: () => {},
  renomearProfissional: () => {},
  renomearServico: () => {},
  renomearCliente: () => {},
  renomearProduto: () => {},
}

/**
 * Forma mínima de um lançamento: campos essenciais para nunca vazar
 * NaN nos resumos/relatórios nem estouro no estorno. Um item fora da
 * forma invalida a lista inteira — o original fica em `<chave>:corrompido`.
 */
function ehLancamento(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false
  const l = valor as Partial<Lancamento>
  return (
    typeof l.id === 'string' &&
    (l.tipo === 'receita' || l.tipo === 'despesa') &&
    typeof l.data === 'string' &&
    typeof l.valorLiquido === 'number' &&
    Number.isFinite(l.valorLiquido)
  )
}

function ehListaDeLancamentos(valor: unknown): boolean {
  return Array.isArray(valor) && valor.every(ehLancamento)
}

// ---------------------------------------------------------------------------
// Integração com o Supabase (mesmo padrão de Clientes/Profissionais/Serviços)
// ---------------------------------------------------------------------------

type Registro = { id: string }

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

/** Assinatura do conteúdo: usa a MESMA linha que vai para o banco, então a
 * comparação local × remota é a comparação de linhas, sem falso conflito. */
function assinaturaLancamento(l: Lancamento): string {
  return estavel(linhaLancamento(l))
}

function assinaturaFechamento(f: Fechamento): string {
  return estavel(linhaFechamento(f))
}

function assinaturaAuditoria(a: EventoAuditoria): string {
  return estavel(linhaAuditoria(a))
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * Snapshot das versões que serão substituídas, antes de qualquer escrita.
 * Mantém as 3 cópias mais recentes; false = não gravou (nada é sobrescrito).
 */
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

type Integracao<T extends Registro> = {
  rotulo: string
  chave: string
  locais: T[]
  remotos: T[]
  assinatura: (registro: T) => string
  importar: (lista: T[]) => Promise<number>
}

/**
 * União por id + reenvio das pendências locais. Nenhum registro é
 * descartado: o que só existe de um lado entra na lista final. Em divergência
 * vale o estado que a tela está usando (é dele que sai o resumo do dia) e a
 * versão remota substituída fica no snapshot. O reenvio é `upsert` por `id`,
 * então repetir não duplica lançamento, fechamento nem evento.
 */
async function integrar<T extends Registro>({
  rotulo,
  chave,
  locais,
  remotos,
  assinatura,
  importar,
}: Integracao<T>): Promise<T[]> {
  const remotoPorId = new Map(remotos.map((registro) => [registro.id, registro]))
  const porId = new Map<string, T>()
  const ordem: string[] = []
  const enviar: T[] = []
  const perdedores: T[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      porId.set(local.id, local)
      ordem.push(local.id)
      enviar.push(local)
      continue
    }
    porId.set(local.id, remoto)
    ordem.push(local.id)
    if (assinatura(local) === assinatura(remoto)) continue
    perdedores.push(remoto)
    porId.set(local.id, local)
    enviar.push(local)
  }
  // o que só existe no servidor (outro aparelho) entra no fim, já em ordem
  // cronológica (a consulta ordena por criado_em/fechado_em)
  for (const remoto of remotos) {
    if (porId.has(remoto.id)) continue
    porId.set(remoto.id, remoto)
    ordem.push(remoto.id)
  }

  if (perdedores.length > 0 && !criarSnapshot(chave, perdedores)) {
    const divergentes = new Set(perdedores.map((registro) => registro.id))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(enviar[i].id)) enviar.splice(i, 1)
    }
    console.warn(
      `[caixa] snapshot indisponível — divergências de ${rotulo} mantidas sem envio.`,
    )
  }

  if (enviar.length > 0) {
    try {
      const enviados = await importar(enviar)
      if (enviados < enviar.length) {
        console.warn(
          `[caixa] envio incompleto de ${rotulo}: ${enviados} de ${enviar.length} — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      console.warn(`[caixa] falha ao enviar ${rotulo} para o Supabase.`, erro)
    }
  }

  return ordem
    .map((id) => porId.get(id))
    .filter((registro): registro is T => registro !== undefined)
}

/**
 * Junta a lista oficial (integração) com o que aconteceu na tela durante a
 * carga: mudança da sessão vence, registro criado no meio da carga não some e
 * remoção da sessão é respeitada. Em instalação nova só o que a sessão
 * alterou acompanha a lista.
 */
function fundir<T extends Registro>(
  base: T[],
  atual: T[],
  alterados: Set<string>,
  removidos: Set<string>,
  instalacaoNova: boolean,
): T[] {
  const porId = new Map(base.map((registro) => [registro.id, registro]))
  const ordem = base.map((registro) => registro.id)
  for (const registro of atual) {
    if (removidos.has(registro.id)) continue
    if (alterados.has(registro.id)) {
      if (!porId.has(registro.id)) ordem.push(registro.id)
      porId.set(registro.id, registro)
      continue
    }
    if (porId.has(registro.id)) continue // base já tem a versão oficial
    if (instalacaoNova) continue
    ordem.push(registro.id)
    porId.set(registro.id, registro)
  }
  for (const id of removidos) {
    porId.delete(id)
    const posicao = ordem.indexOf(id)
    if (posicao >= 0) ordem.splice(posicao, 1)
  }
  return ordem
    .map((id) => porId.get(id))
    .filter((registro): registro is T => registro !== undefined)
}

type CaixaSupabase = {
  lancamentos: Lancamento[]
  fechamentos: Fechamento[]
  auditoria: EventoAuditoria[]
}

/**
 * Integração completa do Caixa. Uma falha de leitura em qualquer das três
 * listas derruba a integração inteira (nada é aplicado pela metade e nada é
 * reenviado) e o provider segue com o estado local.
 */
async function integrarCaixa(
  lancamentosLocais: Lancamento[],
  fechamentosLocais: Fechamento[],
  auditoriaLocal: EventoAuditoria[],
  instalacaoNova: boolean,
): Promise<CaixaSupabase> {
  const lancamentosRemotos = await listarLancamentos()
  if (instalacaoNova && lancamentosRemotos.length > 0) {
    // instalação nova (nada salvo aqui): o que já existe no servidor é a fonte
    const [fechamentos, auditoria] = await Promise.all([
      listarFechamentos(),
      listarAuditoria(),
    ])
    return { lancamentos: lancamentosRemotos, fechamentos, auditoria }
  }
  const [fechamentosRemotos, auditoriaRemota] = await Promise.all([
    listarFechamentos(),
    listarAuditoria(),
  ])
  const [lancamentos, fechamentos, auditoria] = await Promise.all([
    integrar<Lancamento>({
      rotulo: 'lançamentos',
      chave: CHAVE_LANCAMENTOS,
      locais: lancamentosLocais,
      remotos: lancamentosRemotos,
      assinatura: assinaturaLancamento,
      importar: importarLancamentos,
    }),
    integrar<Fechamento>({
      rotulo: 'fechamentos',
      chave: CHAVE_FECHAMENTOS,
      locais: fechamentosLocais,
      remotos: fechamentosRemotos,
      assinatura: assinaturaFechamento,
      importar: importarFechamentos,
    }),
    integrar<EventoAuditoria>({
      rotulo: 'auditoria',
      chave: CHAVE_AUDITORIA,
      locais: auditoriaLocal,
      remotos: auditoriaRemota,
      assinatura: assinaturaAuditoria,
      importar: importarAuditoria,
    }),
  ])
  return { lancamentos, fechamentos, auditoria }
}

/**
 * Integração em andamento compartilhada: o StrictMode (React) executa o
 * efeito duas vezes em desenvolvimento e uma única ida ao Supabase deve
 * acontecer.
 */
let promessaIntegracao: Promise<CaixaSupabase> | null = null

export function CaixaProvider({ children }: { children: ReactNode }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() =>
    carregarJSON<Lancamento[]>(CHAVE_LANCAMENTOS, [], ehListaDeLancamentos),
  )
  const [fechamentos, setFechamentos] = useState<Fechamento[]>(() =>
    carregarJSON<Fechamento[]>(CHAVE_FECHAMENTOS, [], Array.isArray),
  )
  const [auditoria, setAuditoria] = useState<EventoAuditoria[]>(() =>
    carregarJSON<EventoAuditoria[]>(CHAVE_AUDITORIA, [], Array.isArray),
  )
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null
  // nenhuma das três listas gravada nesta máquina = instalação nova
  const [instalacaoNova] = useState(
    () =>
      carregarJSON<unknown>(CHAVE_LANCAMENTOS, null, ehListaDeLancamentos) ===
        null &&
      carregarJSON<unknown>(CHAVE_FECHAMENTOS, null, Array.isArray) === null &&
      carregarJSON<unknown>(CHAVE_AUDITORIA, null, Array.isArray) === null,
  )
  const alteradosLancamentos = useRef<Set<string>>(new Set())
  const removidosLancamentos = useRef<Set<string>>(
    new Set(
      instalacaoNova
        ? []
        : carregarJSON<string[]>(CHAVE_REMOVIDOS, [], ehListaIds),
    ),
  )
  const alteradosFechamentos = useRef<Set<string>>(new Set())
  const alteradosAuditoria = useRef<Set<string>>(new Set())
  const lancamentosLocais = useRef<Lancamento[]>(lancamentos)
  const fechamentosLocais = useRef<Fechamento[]>(fechamentos)
  const auditoriaLocal = useRef<EventoAuditoria[]>(auditoria)

  useEffect(() => {
    lancamentosLocais.current = lancamentos
  }, [lancamentos])
  useEffect(() => {
    fechamentosLocais.current = fechamentos
  }, [fechamentos])
  useEffect(() => {
    auditoriaLocal.current = auditoria
  }, [auditoria])

  // Instalação nova: tombstone gravado por outra instalação não vale aqui —
  // ele apagaria registro do servidor sem relação com esta máquina.
  useEffect(() => {
    if (!instalacaoNova) return
    if (carregarJSON<unknown>(CHAVE_REMOVIDOS, null, ehListaIds) === null) return
    gravarRemovidos(new Set())
  }, [instalacaoNova])

  // Supabase é a fonte oficial do Caixa, mas o local nunca é substituído: a
  // integração une os dois lados, reenvia as pendências e o resultado é
  // mesclado com o que a tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarCaixa(
        lancamentosLocais.current,
        fechamentosLocais.current,
        auditoriaLocal.current,
        instalacaoNova,
      )
    }
    promessaIntegracao
      .then((base) => {
        if (!vivo) return
        setLancamentos((atual) =>
          fundir(
            base.lancamentos,
            atual,
            alteradosLancamentos.current,
            removidosLancamentos.current,
            instalacaoNova,
          ),
        )
        setFechamentos((atual) =>
          fundir(
            base.fechamentos,
            atual,
            alteradosFechamentos.current,
            new Set<string>(),
            instalacaoNova,
          ),
        )
        setAuditoria((atual) =>
          fundir(
            base.auditoria,
            atual,
            alteradosAuditoria.current,
            new Set<string>(),
            instalacaoNova,
          ),
        )

        // Tombstone sincronizado com o servidor: o que já não existe lá é
        // descartado; o que ainda aparece (remoção que não chegou a valer) é
        // apagado de novo — idempotente — e segue protegido nesta máquina.
        const idsRemotos = new Set(base.lancamentos.map((l) => l.id))
        let tombstoneMudou = false
        for (const id of Array.from(removidosLancamentos.current)) {
          if (idsRemotos.has(id)) {
            void removerLancamento(id).catch(() =>
              avisarFalhaSincronizacao(CHAVE_LANCAMENTOS),
            )
            continue
          }
          removidosLancamentos.current.delete(id)
          tombstoneMudou = true
        }
        if (tombstoneMudou) gravarRemovidos(removidosLancamentos.current)
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém o caixa local intacto e não
        // reenvia nada (evita sobrescrever dado do servidor)
        if (vivo) {
          console.warn(
            '[caixa] Supabase indisponível — seguindo com os dados locais.',
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

  // Lido só dentro dos efeitos: a pendência mora em refs (lê-la no render
  // quebraria a regra de refs do React).
  const podeGravar = useCallback(() => {
    if (!temSupabase) return true
    if (sincronizado) return true
    return (
      alteradosLancamentos.current.size > 0 ||
      removidosLancamentos.current.size > 0 ||
      alteradosFechamentos.current.size > 0 ||
      alteradosAuditoria.current.size > 0
    )
  }, [temSupabase, sincronizado])

  // Grava local quando está sem Supabase, quando já integrou ou quando
  // existe alteração feita nesta sessão (nada que o usuário fez se perde).
  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_LANCAMENTOS, lancamentos)
  }, [lancamentos, podeGravar])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_FECHAMENTOS, fechamentos)
  }, [fechamentos, podeGravar])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_AUDITORIA, auditoria)
  }, [auditoria, podeGravar])

  /**
   * Escrita remota em segundo plano: o local já foi atualizado antes, então a
   * falha só precisa ser informada. Estado local e pendência seguem salvos e a
   * próxima carga reenvia.
   */
  const sincronizar = useCallback(
    (chave: string, operacao: () => Promise<unknown>) => {
      if (!temSupabase) return
      void operacao().catch(() => {
        avisarFalhaSincronizacao(chave)
      })
    },
    [temSupabase],
  )

  /** grava um lançamento novo e agenda o envio pelo mesmo id */
  const registrarLancamento = useCallback(
    (novo: Lancamento) => {
      alteradosLancamentos.current.add(novo.id)
      setLancamentos((atual) => [...atual, novo])
      sincronizar(CHAVE_LANCAMENTOS, () => criarLancamento(novo))
      return novo
    },
    [sincronizar],
  )

  /**
   * Renomeação em lote: o estado continua sendo atualizado por updater
   * funcional (duas renomeações no mesmo lote se combinam), enquanto o envio
   * leva os registros tocados por `upsert` — nenhum lançamento novo é criado
   * e nenhum valor é contado duas vezes.
   */
  const propagarLancamentos = useCallback(
    (transformar: (lista: Lancamento[]) => Lancamento[]) => {
      const atuais = lancamentosLocais.current
      const mudados = transformar(atuais).filter(
        (registro, indice) => registro !== atuais[indice],
      )
      if (mudados.length === 0) return
      for (const registro of mudados) {
        alteradosLancamentos.current.add(registro.id)
      }
      setLancamentos((atual) => transformar(atual))
      sincronizar(CHAVE_LANCAMENTOS, () => importarLancamentos(mudados))
    },
    [sincronizar],
  )

  const fechamentoAtivo = useCallback(
    (data: string) =>
      fechamentos.find((f) => f.data === data && !f.reaberto),
    [fechamentos],
  )

  const diaFechado = useCallback(
    (data: string) => fechamentos.some((f) => f.data === data && !f.reaberto),
    [fechamentos],
  )

  const lancamentosDoDia = useCallback(
    (data: string) => lancamentos.filter((l) => l.data === data),
    [lancamentos],
  )

  const resumoDoDia = useCallback(
    (data: string): ResumoFechamento => {
      const doDia = lancamentos.filter((l) => l.data === data && !l.estornado)
      const porForma = formaVazia()
      const profissionais = new Map<string, { valor: number; qtd: number }>()

      let receitasAtendimentos = 0
      let receitasProdutos = 0
      let receitasClube = 0
      let descontos = 0
      let despesas = 0
      let qtdAtendimentos = 0
      let qtdProdutos = 0

      for (const l of doDia) {
        if (l.tipo === 'despesa') {
          despesas += l.valorLiquido
          continue
        }
        descontos += l.desconto
        porForma[l.formaPagamento] += l.valorLiquido
        if (l.origem === 'atendimento') {
          receitasAtendimentos += l.valorLiquido
          qtdAtendimentos += 1
        } else if (l.origem === 'produto') {
          receitasProdutos += l.valorLiquido
          qtdProdutos += 1
        } else if (l.origem === 'clube') {
          receitasClube += l.valorLiquido
        }
        if (l.profissional) {
          const atual = profissionais.get(l.profissional) ?? {
            valor: 0,
            qtd: 0,
          }
          atual.valor += l.valorLiquido
          atual.qtd += 1
          profissionais.set(l.profissional, atual)
        }
      }

      const totalRecebido = receitasAtendimentos + receitasProdutos + receitasClube
      return {
        receitasAtendimentos: arredondar(receitasAtendimentos),
        receitasProdutos: arredondar(receitasProdutos),
        receitasClube: arredondar(receitasClube),
        totalRecebido: arredondar(totalRecebido),
        descontos: arredondar(descontos),
        despesas: arredondar(despesas),
        liquido: arredondar(totalRecebido - despesas),
        porForma: Object.fromEntries(
          Object.entries(porForma).map(([k, v]) => [k, arredondar(v)]),
        ) as Record<FormaPagamento, number>,
        porProfissional: [...profissionais.entries()]
          .map(([nome, info]) => ({
            nome,
            valor: arredondar(info.valor),
            qtd: info.qtd,
          }))
          .sort((a, b) => b.valor - a.valor),
        qtdAtendimentos,
        qtdProdutos,
      }
    },
    [lancamentos],
  )

  const jaPago = useCallback(
    (agendamentoId: string) =>
      lancamentos.find(
        (l) =>
          l.agendamentoId === agendamentoId &&
          l.origem === 'atendimento' &&
          !l.estornado,
      ),
    [lancamentos],
  )

  const bloquearSeFechado = useCallback(
    (data: string) => {
      if (diaFechado(data)) {
        throw new Error(
          `O caixa de ${data} está fechado. Reabra o caixa (com motivo) para lançar. `,
        )
      }
    },
    [diaFechado],
  )

  const registrarPagamento = useCallback(
    (input: NovoPagamentoInput): Lancamento => {
      if (!input.agendamentoId) {
        throw new Error('Atendimento sem identificação.')
      }
      if (input.statusAgendamento === 'cancelado') {
        throw new Error('Agendamento cancelado não gera receita.')
      }
      if (input.statusAgendamento === 'nao_compareceu') {
        throw new Error(
          'Cliente não compareceu — não é possível lançar receita.',
        )
      }
      if (jaPago(input.agendamentoId)) {
        throw new Error('Este atendimento já foi pago. Não é permitido duplicar.')
      }
      if (!Number.isFinite(input.valor) || input.valor <= 0) {
        throw new Error('Valor inválido.')
      }
      if (!Number.isFinite(input.desconto) || input.desconto < 0) {
        throw new Error('Desconto inválido.')
      }
      if (input.desconto > input.valor) {
        throw new Error('O desconto não pode ser maior que o valor do serviço.')
      }
      if (!FORMAS_PAGAMENTO.includes(input.formaPagamento)) {
        throw new Error('Selecione a forma de pagamento.')
      }
      bloquearSeFechado(input.data)

      const valorLiquido = arredondar(input.valor - input.desconto)
      const novo: Lancamento = {
        id: gerarId(),
        tipo: 'receita',
        origem: 'atendimento',
        data: input.data,
        hora: input.hora,
        descricao: `${input.servico} — ${input.cliente}`,
        valor: arredondar(input.valor),
        desconto: arredondar(input.desconto),
        valorLiquido,
        formaPagamento: input.formaPagamento,
        cliente: input.cliente,
        clienteId: input.clienteId,
        profissional: input.profissional,
        servico: input.servico,
        agendamentoId: input.agendamentoId,
        observacao: input.observacao?.trim() || undefined,
        criadoEm: new Date().toISOString(),
      }
      return registrarLancamento(novo)
    },
    [jaPago, bloquearSeFechado, registrarLancamento],
  )

  const venderProduto = useCallback(
    (input: NovaVendaProdutoInput): Lancamento => {
      if (!input.produto.trim()) throw new Error('Informe o produto.')
      if (!Number.isInteger(input.quantidade) || input.quantidade < 1) {
        throw new Error('Quantidade deve ser um número inteiro maior que zero.')
      }
      if (!Number.isFinite(input.preco) || input.preco <= 0) {
        throw new Error('O preço deve ser maior que zero.')
      }
      const bruto = input.quantidade * input.preco
      if (!Number.isFinite(input.desconto) || input.desconto < 0) {
        throw new Error('Desconto inválido.')
      }
      if (input.desconto > bruto) {
        throw new Error('O desconto não pode ser maior que o total da venda.')
      }
      if (!FORMAS_PAGAMENTO.includes(input.formaPagamento)) {
        throw new Error('Selecione a forma de pagamento.')
      }
      bloquearSeFechado(input.data)

      const novo: Lancamento = {
        id: gerarId(),
        tipo: 'receita',
        origem: 'produto',
        data: input.data,
        hora: agoraHora(),
        descricao: `${input.quantidade}× ${input.produto.trim()}`,
        valor: arredondar(bruto),
        desconto: arredondar(input.desconto),
        valorLiquido: arredondar(bruto - input.desconto),
        formaPagamento: input.formaPagamento,
        profissional: input.profissional?.trim() || undefined,
        produto: input.produto.trim(),
        quantidade: input.quantidade,
        observacao: input.observacao?.trim() || undefined,
        criadoEm: new Date().toISOString(),
      }
      return registrarLancamento(novo)
    },
    [bloquearSeFechado, registrarLancamento],
  )

  const registrarVenda = useCallback(
    (input: NovaVendaInput): Lancamento => {
      if (!input.itens || input.itens.length === 0) {
        throw new Error('Adicione pelo menos um produto ao carrinho.')
      }
      let bruto = 0
      let qtdTotal = 0
      const nomes: string[] = []
      for (const item of input.itens) {
        const nome = item.produto.trim()
        if (!nome) throw new Error('Produto sem nome no carrinho.')
        if (!Number.isInteger(item.quantidade) || item.quantidade < 1) {
          throw new Error(`Quantidade inválida para "${nome}".`)
        }
        if (!Number.isFinite(item.preco) || item.preco <= 0) {
          throw new Error(`O preço de "${nome}" deve ser maior que zero.`)
        }
        bruto += item.quantidade * item.preco
        qtdTotal += item.quantidade
        nomes.push(nome)
      }
      bruto = arredondar(bruto)
      if (!Number.isFinite(input.desconto) || input.desconto < 0) {
        throw new Error('Desconto inválido.')
      }
      if (input.desconto > bruto) {
        throw new Error('O desconto não pode ser maior que o total da venda.')
      }
      if (!FORMAS_PAGAMENTO.includes(input.formaPagamento)) {
        throw new Error('Selecione a forma de pagamento.')
      }
      bloquearSeFechado(input.data)

      const descricao = input.itens
        .map((i) => `${i.quantidade}× ${i.produto.trim()}`)
        .join(', ')
      const novo: Lancamento = {
        id: gerarId(),
        tipo: 'receita',
        origem: 'produto',
        data: input.data,
        hora: agoraHora(),
        descricao,
        valor: bruto,
        desconto: arredondar(input.desconto),
        valorLiquido: arredondar(bruto - input.desconto),
        formaPagamento: input.formaPagamento,
        cliente: input.cliente?.trim() || undefined,
        clienteId: input.clienteId,
        profissional: input.profissional?.trim() || undefined,
        produto: nomes.join(', '),
        quantidade: qtdTotal,
        itens: input.itens.map((i) => ({
          produtoId: i.produtoId,
          produto: i.produto.trim(),
          quantidade: i.quantidade,
          preco: arredondar(i.preco),
        })),
        observacao: input.observacao?.trim() || undefined,
        criadoEm: new Date().toISOString(),
      }
      return registrarLancamento(novo)
    },
    [bloquearSeFechado, registrarLancamento],
  )

  /**
   * Compensação: quando um passo posterior à gravação falha (baixa de
   * estoque no PDV/venda, status na agenda), desfaz o lançamento criado —
   * a operação inteira volta ao estado anterior em vez de ficar parcial.
   */
  const desfazerLancamento = useCallback(
    (lancamentoId: string): void => {
      if (!lancamentoId) return
      removidosLancamentos.current.add(lancamentoId)
      gravarRemovidos(removidosLancamentos.current)
      setLancamentos((atual) => atual.filter((l) => l.id !== lancamentoId))
      sincronizar(CHAVE_LANCAMENTOS, () => removerLancamento(lancamentoId))
    },
    [sincronizar],
  )

  const registrarReceitaClube = useCallback(
    (input: NovaReceitaClubeInput): Lancamento => {
      if (!input.descricao.trim()) throw new Error('Informe a descrição.')
      if (!Number.isFinite(input.valor) || input.valor <= 0) {
        throw new Error('O valor do pagamento deve ser maior que zero.')
      }
      if (!FORMAS_PAGAMENTO.includes(input.formaPagamento)) {
        throw new Error('Selecione a forma de pagamento.')
      }
      bloquearSeFechado(input.data)

      const novo: Lancamento = {
        id: gerarId(),
        tipo: 'receita',
        origem: 'clube',
        data: input.data,
        hora: agoraHora(),
        descricao: input.descricao.trim(),
        valor: arredondar(input.valor),
        desconto: 0,
        valorLiquido: arredondar(input.valor),
        formaPagamento: input.formaPagamento,
        cliente: input.cliente?.trim() || undefined,
        clienteId: input.clienteId,
        assinaturaId: input.assinaturaId,
        observacao: input.observacao?.trim() || undefined,
        criadoEm: new Date().toISOString(),
      }
      return registrarLancamento(novo)
    },
    [bloquearSeFechado, registrarLancamento],
  )

  const adicionarDespesa = useCallback(
    (input: NovaDespesaInput): Lancamento => {
      if (!input.descricao.trim()) throw new Error('Informe a descrição.')
      if (!Number.isFinite(input.valor) || input.valor <= 0) {
        throw new Error('O valor da despesa deve ser maior que zero.')
      }
      if (!FORMAS_PAGAMENTO.includes(input.formaPagamento)) {
        throw new Error('Selecione a forma de pagamento.')
      }
      bloquearSeFechado(input.data)

      const novo: Lancamento = {
        id: gerarId(),
        tipo: 'despesa',
        origem: 'despesa',
        data: input.data,
        hora: agoraHora(),
        descricao: input.descricao.trim(),
        valor: arredondar(input.valor),
        desconto: 0,
        valorLiquido: arredondar(input.valor),
        formaPagamento: input.formaPagamento,
        categoria: input.categoria,
        observacao: input.observacao?.trim() || undefined,
        criadoEm: new Date().toISOString(),
      }
      return registrarLancamento(novo)
    },
    [bloquearSeFechado, registrarLancamento],
  )

  const estornar = useCallback(
    (id: string) => {
      const alvo = lancamentos.find((l) => l.id === id)
      if (!alvo) throw new Error('Lançamento não encontrado.')
      if (alvo.estornado) throw new Error('Este lançamento já foi estornado.')
      bloquearSeFechado(alvo.data)

      const estornadoEm = new Date().toISOString()
      const evento: EventoAuditoria = {
        id: gerarId(),
        acao: 'estorno',
        data: alvo.data,
        descricao: `${alvo.origem === 'despesa' ? 'Despesa' : 'Receita'}: ${alvo.descricao} — R$ ${alvo.valorLiquido.toFixed(2)}`,
        criadoEm: estornadoEm,
      }
      const estornado: Lancamento = { ...alvo, estornado: true, estornadoEm }
      alteradosLancamentos.current.add(id)
      alteradosAuditoria.current.add(evento.id)
      setLancamentos((atual) =>
        atual.map((l) => (l.id === id ? estornado : l)),
      )
      setAuditoria((atual) => [...atual, evento])
      // estorno e evento de auditoria vão juntos; se o primeiro falhar, a
      // integração da próxima carga reenvia os dois (upsert por id)
      sincronizar(CHAVE_LANCAMENTOS, async () => {
        await atualizarLancamento(id, estornado)
        await criarEventoAuditoria(evento)
      })
    },
    [lancamentos, bloquearSeFechado, sincronizar],
  )

  const fecharCaixa = useCallback(
    (data: string): Fechamento => {
      if (diaFechado(data)) {
        throw new Error(`O caixa de ${data} já está fechado.`)
      }
      const resumo = resumoDoDia(data)
      const fechamento: Fechamento = {
        id: gerarId(),
        data,
        fechadoEm: new Date().toISOString(),
        resumo,
      }
      alteradosFechamentos.current.add(fechamento.id)
      setFechamentos((atual) => [...atual, fechamento])
      sincronizar(CHAVE_FECHAMENTOS, () => criarFechamento(fechamento))
      return fechamento
    },
    [diaFechado, resumoDoDia, sincronizar],
  )

  const reabrirCaixa = useCallback(
    (data: string, motivo: string) => {
      const ativo = fechamentos.find((f) => f.data === data && !f.reaberto)
      if (!ativo) throw new Error(`Não há caixa fechado em ${data}.`)
      if (motivo.trim().length < 3) {
        throw new Error('Informe o motivo da reabertura (mín. 3 letras).')
      }
      const reabertoEm = new Date().toISOString()
      const reabertura: Fechamento = {
        ...ativo,
        reaberto: { em: reabertoEm, motivo: motivo.trim() },
      }
      const evento: EventoAuditoria = {
        id: gerarId(),
        acao: 'reabertura',
        data,
        descricao: `Caixa de ${data} reaberto`,
        motivo: motivo.trim(),
        criadoEm: reabertoEm,
      }
      alteradosFechamentos.current.add(ativo.id)
      alteradosAuditoria.current.add(evento.id)
      setFechamentos((atual) =>
        atual.map((f) => (f.id === ativo.id ? reabertura : f)),
      )
      setAuditoria((atual) => [...atual, evento])
      sincronizar(CHAVE_FECHAMENTOS, async () => {
        await atualizarFechamento(ativo.id, reabertura)
        await criarEventoAuditoria(evento)
      })
    },
    [fechamentos, sincronizar],
  )

  // Propagação compara por chave normalizada (mesma regra do dedupe do
  // cadastro): dado legado com caixa/acentos diferentes não engancha.
  const renomearProfissional = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      propagarLancamentos((atual) =>
        atual.map((l) =>
          normalizarTexto(l.profissional ?? '') === chave
            ? { ...l, profissional: destino }
            : l,
        ),
      )
    },
    [propagarLancamentos],
  )

  const renomearServico = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      propagarLancamentos((atual) =>
        atual.map((l) =>
          normalizarTexto(l.servico ?? '') === chave
            ? { ...l, servico: destino }
            : l,
        ),
      )
    },
    [propagarLancamentos],
  )

  const renomearCliente = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      propagarLancamentos((atual) =>
        atual.map((l) =>
          normalizarTexto(l.cliente ?? '') === chave
            ? { ...l, cliente: destino }
            : l,
        ),
      )
    },
    [propagarLancamentos],
  )

  // Produto renomeado: atualiza a venda avulsa (campo `produto`) e o
  // nome exibido em cada item do PDV — o `produtoId` dos itens não muda,
  // então estoque e relatórios continuam vinculados.
  const renomearProduto = useCallback(
    (antigo: string, novo: string) => {
      const destino = novo.trim()
      if (!antigo || !destino || antigo === destino) return
      const chave = normalizarTexto(antigo)
      propagarLancamentos((atual) =>
        atual.map((l) => {
          const mudouProduto = normalizarTexto(l.produto ?? '') === chave
          const mudouItens =
            l.itens?.some((i) => normalizarTexto(i.produto) === chave) ?? false
          if (!mudouProduto && !mudouItens) return l
          return {
            ...l,
            produto: mudouProduto ? destino : l.produto,
            itens: mudouItens
              ? l.itens?.map((i) =>
                  normalizarTexto(i.produto) === chave
                    ? { ...i, produto: destino }
                    : i,
                )
              : l.itens,
          }
        }),
      )
    },
    [propagarLancamentos],
  )

  const valor = useMemo(
    () => ({
      lancamentos,
      fechamentos,
      auditoria,
      diaFechado,
      fechamentoAtivo,
      lancamentosDoDia,
      resumoDoDia,
      jaPago,
      registrarPagamento,
      venderProduto,
      registrarVenda,
      desfazerLancamento,
      registrarReceitaClube,
      adicionarDespesa,
      estornar,
      fecharCaixa,
      reabrirCaixa,
      renomearProfissional,
      renomearServico,
      renomearCliente,
      renomearProduto,
    }),
    [
      lancamentos,
      fechamentos,
      auditoria,
      diaFechado,
      fechamentoAtivo,
      lancamentosDoDia,
      resumoDoDia,
      jaPago,
      registrarPagamento,
      venderProduto,
      registrarVenda,
      desfazerLancamento,
      registrarReceitaClube,
      adicionarDespesa,
      estornar,
      fecharCaixa,
      reabrirCaixa,
      renomearProfissional,
      renomearServico,
      renomearCliente,
      renomearProduto,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCaixa(): CaixaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useCaixa deve ser usado dentro de CaixaProvider')
  return ctx
}

/**
 * useCaixa tolerante a árvore sem provider (Produtos e renomeações em
 * páginas testadas avulsas): devolve estado vazio em vez de erro.
 */
export function useCaixaOpcional(): CaixaContexto {
  return useContext(Contexto) ?? VAZIO
}
