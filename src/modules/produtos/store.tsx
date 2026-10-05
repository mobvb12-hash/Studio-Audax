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
  criarProduto,
  importarProdutos,
  listarProdutos,
} from '@/services/supabase/produtos'
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
  /** Aplica custo de referência — usado apenas pelo módulo Estoque (entrada). */
  aplicarCusto: (id: string, custo: number) => void
}

const Contexto = createContext<ProdutosContexto | null>(null)

function gerarId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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
  // JSON inválido é preservado em `<chave>:corrompido` com aviso visível
  // (carregarJSON) e aqui caímos no fallback vazio — nada é apagado às cegas.
  const lista = carregarJSON<Partial<Produto>[]>(CHAVE_STORAGE, [], Array.isArray)
  const migrada = lista
    .map(normalizarProduto)
    .filter((p): p is Produto => p !== null)
  return ordenar(migrada)
}

// ---------------------------------------------------------------------------
// Integração com o Supabase (mesmo padrão de Clientes/Profissionais/Serviços/Caixa)
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

/** Assinatura do conteúdo (sem carimbos): a linha que vai para o banco. */
function assinatura(p: Produto): string {
  return estavel({
    id: p.id,
    nome: p.nome,
    preco: p.preco,
    custo: p.custo,
    estoque: p.estoque,
    estoque_minimo: p.estoqueMinimo,
    categoria: p.categoria,
    foto: p.foto,
    ativo: p.ativo,
  })
}

function carimbo(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * Snapshot das versões que serão substituídas, antes de qualquer escrita.
 * Mantém as 3 cópias mais recentes; false = não gravou (nada é sobrescrito).
 */
function criarSnapshot(perdedores: Produto[]): boolean {
  const prefixo = `${CHAVE_STORAGE}:backup:`
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

/**
 * União por id + reenvio das pendências. O Supabase é a fonte oficial: um
 * registro local ausente no servidor só é enviado quando é pendência
 * legítima — carimbo (`atualizadoEm`/`criadoEm`) posterior à última
 * sincronização concluída. O resto é resquício (apagado no banco): sai da
 * lista, fica no snapshot e NUNCA é reenviado. Em divergência vence o registro
 * mais recente por `atualizadoEm` (mesma regra de serviços) — o saldo de
 * estoque entra nessa comparação porque `aplicarEstoque` carimba o produto. O
 * perdedor vai para o snapshot e o reenvio é `upsert` por `id`, então repetir
 * não duplica produto.
 */
async function integrarProdutos(
  locais: Produto[],
  instalacaoNova: boolean,
): Promise<Produto[]> {
  const remotos = await listarProdutos()
  if (instalacaoNova && remotos.length > 0) {
    // instalação nova: o que já existe no servidor é a fonte
    return ordenar(remotos)
  }
  const marcaAnterior = ultimaSincronizacao(CHAVE_STORAGE)
  const remotoPorId = new Map(remotos.map((p) => [p.id, p]))
  const porId = new Map<string, Produto>()
  const ordem: string[] = []
  const enviar: Produto[] = []
  const perdedores: Produto[] = []
  const descartados: Produto[] = []

  for (const local of locais) {
    const remoto = remotoPorId.get(local.id)
    if (!remoto) {
      const pendente =
        marcaAnterior !== null &&
        (local.atualizadoEm || local.criadoEm || '') > marcaAnterior
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
    if ((local.atualizadoEm || '') > (remoto.atualizadoEm || '')) {
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
  const snapshotOk = !precisaSnapshot || criarSnapshot([...descartados, ...perdedores])

  if (perdedores.length > 0 && !snapshotOk) {
    const divergentes = new Set(perdedores.map((p) => p.id))
    for (let i = enviar.length - 1; i >= 0; i--) {
      if (divergentes.has(enviar[i].id)) enviar.splice(i, 1)
    }
    console.warn(
      '[produtos] snapshot indisponível — divergências mantidas sem envio.',
    )
  }

  if (descartados.length > 0) {
    if (snapshotOk) {
      console.warn(
        `[produtos] ${descartados.length} registro(s) local(is) ausente(s) no Supabase: descartado(s) como resquício e preservado(s) em snapshot.`,
      )
    } else {
      // sem snapshot o resquício não pode sumir daqui: segue na lista, mas
      // nunca vai para o Supabase e a marca não avança.
      for (const produto of descartados) {
        if (porId.has(produto.id)) continue
        porId.set(produto.id, produto)
        ordem.push(produto.id)
      }
      console.warn(
        '[produtos] snapshot indisponível — resquícios mantidos na lista e sem envio.',
      )
    }
  }

  let envioCompleto = true
  if (enviar.length > 0) {
    try {
      const enviados = await importarProdutos(enviar)
      if (enviados < enviar.length) {
        envioCompleto = false
        console.warn(
          `[produtos] envio incompleto: ${enviados} de ${enviar.length} — as pendências seguem para a próxima carga.`,
        )
      }
    } catch (erro) {
      envioCompleto = false
      console.warn('[produtos] falha ao enviar pendências para o Supabase.', erro)
    }
  }

  if (envioCompleto && snapshotOk) marcarSincronizacao(CHAVE_STORAGE)

  return ordenar(
    ordem
      .map((id) => porId.get(id))
      .filter((p): p is Produto => p !== undefined),
  )
}

/**
 * Junta a lista oficial com o que aconteceu na tela durante a carga: mudança
 * da sessão vence, registro criado no meio da carga não some. Quem não está na
 * base e não foi alterado nesta sessão é resquício (apagado no Supabase) e não
 * volta para a lista.
 */
function fundir(
  base: Produto[],
  atual: Produto[],
  alterados: Set<string>,
): Produto[] {
  const porId = new Map(base.map((p) => [p.id, p]))
  const ordem = base.map((p) => p.id)
  for (const produto of atual) {
    if (!alterados.has(produto.id)) continue
    if (!porId.has(produto.id)) ordem.push(produto.id)
    porId.set(produto.id, produto)
  }
  return ordenar(
    ordem
      .map((id) => porId.get(id))
      .filter((p): p is Produto => p !== undefined),
  )
}

/** Integração em andamento compartilhada (StrictMode executa o efeito 2x). */
let promessaIntegracao: Promise<Produto[]> | null = null

export function ProdutosProvider({ children }: { children: ReactNode }) {
  const [produtos, setProdutos] = useState<Produto[]>(() => carregar())
  const [sincronizado, setSincronizado] = useState(false)

  const temSupabase = supabase() !== null
  const [instalacaoNova] = useState(
    () => carregarJSON<unknown>(CHAVE_STORAGE, null, Array.isArray) === null,
  )
  const alterados = useRef<Set<string>>(new Set())
  const listaLocal = useRef<Produto[]>(produtos)

  useEffect(() => {
    listaLocal.current = produtos
  }, [produtos])

  // Supabase é a fonte oficial, mas a lista local nunca é substituída: a
  // integração une os dois lados, reenvia as pendências e o resultado é
  // mesclado com o que a tela fez durante a carga.
  useEffect(() => {
    if (!temSupabase) return
    let vivo = true
    if (!promessaIntegracao) {
      promessaIntegracao = integrarProdutos(listaLocal.current, instalacaoNova)
    }
    promessaIntegracao
      .then((base) => {
        if (vivo) {
          setProdutos((atual) => fundir(base, atual, alterados.current))
        }
      })
      .catch((erro) => {
        // leitura remota indisponível: mantém o cadastro local intacto e
        // não reenvia nada (evita sobrescrever dado do servidor)
        if (vivo) {
          console.warn(
            '[produtos] Supabase indisponível — seguindo com os dados locais.',
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
    return alterados.current.size > 0
  }, [temSupabase, sincronizado])

  useEffect(() => {
    if (!podeGravar()) return
    salvarJSON(CHAVE_STORAGE, produtos)
  }, [produtos, podeGravar])

  /** Escrita remota em segundo plano: o local já foi atualizado antes. */
  const sincronizar = useCallback(
    (operacao: () => Promise<unknown>) => {
      if (!temSupabase) return
      void operacao().catch(() => {
        avisarFalhaSincronizacao(CHAVE_STORAGE)
      })
    },
    [temSupabase],
  )

  const adicionar = useCallback(
    (input: NovoProdutoInput): Produto => {
      const nome = input.nome.trim()
      const preco = input.preco
      const custo = input.custo ?? 0
      const estoque = input.estoque ?? 0
      const minimo = input.estoqueMinimo ?? 0
      validar(nome, preco, custo, estoque, minimo)
      if (produtos.some((p) => normalizarTexto(p.nome) === normalizarTexto(nome))) {
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
      alterados.current.add(novo.id)
      setProdutos((atual) => ordenar([...atual, novo]))
      sincronizar(() => criarProduto(novo))
      return novo
    },
    [produtos, sincronizar],
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
          (p) => p.id !== id && normalizarTexto(p.nome) === normalizarTexto(nome),
        )
      ) {
        throw new Error('Já existe um produto com este nome.')
      }
      const existente = produtos.find((p) => p.id === id)
      if (!existente) return
      const atualizado: Produto = {
        ...existente,
        nome,
        preco: Math.round(input.preco * 100) / 100,
        custo: Math.round(custo * 100) / 100,
        estoqueMinimo: minimo,
        categoria: input.categoria?.trim() ?? existente.categoria,
        foto: input.foto?.trim() ?? existente.foto,
        ativo: input.ativo ?? existente.ativo,
        atualizadoEm: new Date().toISOString(),
      }
      alterados.current.add(id)
      setProdutos((atual) =>
        ordenar(
          atual.map((p) => (p.id === id ? atualizado : p)),
        ),
      )
      sincronizar(() => criarProduto(atualizado))
    },
    [produtos, sincronizar],
  )

  const alternarAtivo = useCallback(
    (id: string) => {
      const alvo = produtos.find((p) => p.id === id)
      if (!alvo) return
      const atualizado: Produto = {
        ...alvo,
        ativo: !alvo.ativo,
        atualizadoEm: new Date().toISOString(),
      }
      alterados.current.add(id)
      setProdutos((atual) =>
        atual.map((p) => (p.id === id ? atualizado : p)),
      )
      sincronizar(() => criarProduto(atualizado))
    },
    [produtos, sincronizar],
  )

  /**
   * Aplica novo valor de estoque — usado apenas pelo módulo Estoque (com
   * histórico). Grava o saldo absoluto, então reenviar a mesma aplicação é
   * idempotente: o saldo não muda duas vezes.
   *
   * `anterior` é o valor que o chamador acabou de aplicar no mesmo lote de
   * estado (antes do re-render). Sem essa referência, uma devolução que
   * retorna ao saldo original seria comparada com o closure antigo e
   * descartada como "já aplicada".
   */
  const aplicarEstoque = useCallback(
    (id: string, estoque: number, anterior?: number) => {
      if (!inteiroNaoNegativo(estoque)) {
        throw new Error('Estoque inválido.')
      }
      const alvo = produtos.find((p) => p.id === id)
      if (!alvo) return
      if ((anterior ?? alvo.estoque) === estoque) return
      const atualizado: Produto = {
        ...alvo,
        estoque,
        atualizadoEm: new Date().toISOString(),
      }
      alterados.current.add(id)
      setProdutos((atual) =>
        atual.map((p) => (p.id === id ? atualizado : p)),
      )
      sincronizar(() => criarProduto(atualizado))
    },
    [produtos, sincronizar],
  )

  const porId = useCallback(
    (id: string) => produtos.find((p) => p.id === id),
    [produtos],
  )

  /**
   * Aplica o custo de referência do produto — usado pelo módulo Estoque
   * quando uma entrada traz custo novo (o CMV da venda usa `produto.custo`).
   * Valor absoluto, então reenviar é idempotente; custo zero não
   * sobrescreve (entrada registrada sem custo de compra).
   */
  const aplicarCusto = useCallback(
    (id: string, custo: number) => {
      if (!Number.isFinite(custo) || custo <= 0) return
      const alvo = produtos.find((p) => p.id === id)
      if (!alvo) return
      const arredondado = Math.round(custo * 100) / 100
      if (alvo.custo === arredondado) return
      // monta a partir de `atual` (e não do closure): no mesmo lote de
      // estado a entrada já aplicou o saldo, e um objeto montado do lado
      // de fora devolveria o estoque antigo por cima
      let enviado: Produto | null = null
      setProdutos((atual) =>
        atual.map((p) => {
          if (p.id !== id || p.custo === arredondado) return p
          enviado = {
            ...p,
            custo: arredondado,
            atualizadoEm: new Date().toISOString(),
          }
          return enviado
        }),
      )
      if (!enviado) return
      const paraEnviar = enviado
      alterados.current.add(id)
      sincronizar(() => criarProduto(paraEnviar))
    },
    [produtos, sincronizar],
  )

  const valor = useMemo(
    () => ({ produtos, adicionar, atualizar, alternarAtivo, porId, aplicarEstoque, aplicarCusto }),
    [produtos, adicionar, atualizar, alternarAtivo, porId, aplicarEstoque, aplicarCusto],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useProdutos(): ProdutosContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useProdutos deve ser usado dentro de ProdutosProvider')
  return ctx
}
