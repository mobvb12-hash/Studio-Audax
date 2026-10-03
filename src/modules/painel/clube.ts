// ============================================================================
// Clube visto pelo CLIENTE — apresentação, não regra.
//
// A REGRA é a do servidor e do módulo `clube/regras` (a mesma que resolve o
// benefício no atendimento). Aqui só existe uma TRADUÇÃO para as quatro
// palavras que o dono pediu para o cliente ler:
//
//   ATIVO      → assinatura vigente (ativa ou próxima do vencimento)
//   EM ATRASO  → pagamento pendente: não libera benefício
//   CANCELADO  → plano cancelado: não libera benefício
//   EXPIRADO   → ciclo pago acabou: não libera benefício
//
// O "libera benefício" NÃO é decidido aqui: vem de `assinaturaVigente`, que é
// literalmente a condição que o backend aplica. Se o servidor mudar a regra,
// este arquivo é o único lugar que precisa acompanhar — e os testes travam os
// dois lados juntos.
//
// Os BENEFÍCIOS também não são digitados: vêm da configuração oficial
// (`clube_beneficios_publicos`, migration 034), que é a mesma chave que o
// `audax_clube_beneficio` lê no atendimento.
// ============================================================================
import { assinaturaVigente, statusAssinatura } from '@/modules/clube/regras'
import type { AssinaturaClube, StatusAssinatura } from '@/modules/clube/types'

/** As quatro palavras que o cliente entende. */
export type StatusParaCliente = 'ativo' | 'em_atraso' | 'cancelado' | 'expirado'

export const STATUS_CLIENTE_ROTULO: Record<StatusParaCliente, string> = {
  ativo: 'Ativo',
  em_atraso: 'Em atraso',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
}

/**
 * Traduz o status interno para o cliente.
 *
 * `proxima_vencimento` é ATIVO de propósito: o dia do vencimento ainda está
 * pago, e é assim que o backend trata (o benefício só morre DEPOIS do
 * vencimento). Juntar os dois aqui é o que mantém a tela e o atendimento
 * dizendo a mesma coisa.
 */
export function statusParaCliente(status: StatusAssinatura): StatusParaCliente {
  if (status === 'cancelada') return 'cancelado'
  if (status === 'ativa' || status === 'proxima_vencimento') return 'ativo'
  if (status === 'atrasada') return 'em_atraso'
  return 'expirado'
}

/** O status derivado do próprio cadastro, sem o cliente precisar saber. */
export function statusDoCliente(
  assinatura: AssinaturaClube,
  hoje: string,
): StatusParaCliente {
  return statusParaCliente(statusAssinatura(assinatura, hoje))
}

/**
 * O cliente pode usar o benefício agora?
 *
 * Delegado a `assinaturaVigente` — a mesma função que o app usa ao atender.
 * Um cliente atrasado, cancelado ou expirado continua sendo cliente
 * cadastrado e continua podendo marcar atendimento avulso; o que ele não pode
 * é usar o benefício do plano.
 */
export function beneficioLiberado(assinatura: AssinaturaClube, hoje: string): boolean {
  return assinaturaVigente(assinatura, hoje)
}

/** Aviso do que o status significa para o cliente — em português claro. */
export function avisoDoStatus(status: StatusParaCliente): string {
  if (status === 'ativo') {
    return 'Seu plano está ativo. Os benefícios abaixo podem ser usados durante a vigência.'
  }
  if (status === 'em_atraso') {
    return 'Há um pagamento pendente. O benefício do plano fica bloqueado até a regularização — você pode continuar marcando horário normalmente.'
  }
  if (status === 'cancelado') {
    return 'Este plano foi cancelado e não libera mais benefício. Você continua sendo cliente do Studio Audax e pode marcar atendimentos avulsos.'
  }
  return 'A vigência do plano acabou e o benefício não está disponível. Fale com a equipe para renovar.'
}

/* ------------------------------------------------------------------ */
/* Benefícios: a mesma configuração oficial que o atendimento lê         */
/* ------------------------------------------------------------------ */

/** Projeção de `configuracoes_sistema.clube` (migration 034/035). */
export type BeneficiosPublicos = {
  /** Categorias cobertas por plano — ilimitado dentro da vigência. */
  coberturas: Record<string, string[]>
  /** Frações: 0.10 = 10%. */
  desconto: { quimicos: number; produtos: number }
  /** Rótulos dos planos, quando a casa configurou texto próprio. */
  rotulos: Record<string, string>
  /**
   * Texto oficial de benefício por plano — é o MESMO `clube.beneficios` que a
   * IA já lia. Quando a casa escreve a lista de benefits, a tela mostra a
   * palavra dela em vez de remontar a frase a partir das coberturas.
   */
  textos: Record<string, string[]>
}

const BENEFICIOS_VAZIOS: BeneficiosPublicos = {
  coberturas: {},
  desconto: { quimicos: 0, produtos: 0 },
  rotulos: {},
  textos: {},
}

/** Nomes de categoria que o dono costuma usar, por plano — NÃO é fallback. */

function listaDeTexto(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function fracao(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0
  return n
}

function percent(fracaoValor: number): string {
  return `${Math.round(fracaoValor * 100)}%`
}

/**
 * Enumera em português: "cabelo", "cabelo e barba", "cabelo, barba e sobrancelha".
 * Sem isto a tela lê "cabelo e barba e sobrancelha" — que é exatamente o tipo
 * de texto que faz o cliente desconfiar da tela.
 */
function listaEmTexto(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/** Normaliza o JSON do banco em algo em que a tela possa confiar. */
export function normalizarBeneficios(bruto: unknown): BeneficiosPublicos {
  if (!bruto || typeof bruto !== 'object') return BENEFICIOS_VAZIOS
  const obj = bruto as Record<string, unknown>
  const coberturasBrutas =
    obj.coberturas && typeof obj.coberturas === 'object'
      ? (obj.coberturas as Record<string, unknown>)
      : {}
  const coberturas: Record<string, string[]> = {}
  for (const [plano, valor] of Object.entries(coberturasBrutas)) {
    const lista = listaDeTexto(valor)
    if (lista.length > 0) coberturas[plano] = lista
  }
  const descontoBruto =
    obj.desconto && typeof obj.desconto === 'object'
      ? (obj.desconto as Record<string, unknown>)
      : {}
  const rotulosBrutos =
    obj.rotulos && typeof obj.rotulos === 'object'
      ? (obj.rotulos as Record<string, unknown>)
      : {}
  const rotulos: Record<string, string> = {}
  for (const [plano, valor] of Object.entries(rotulosBrutos)) {
    if (typeof valor === 'string' && valor.trim() !== '') rotulos[plano] = valor
  }
  // O texto oficial vem em `textos` (o `clube.beneficios` da casa), e não de
  // `rotulos` — as duas coisas moram no mesmo objeto no banco.
  const textosBrutos =
    obj.textos && typeof obj.textos === 'object'
      ? (obj.textos as Record<string, unknown>)
      : {}
  const textos: Record<string, string[]> = {}
  for (const [plano, valor] of Object.entries(textosBrutos)) {
    const lista = listaDeTexto(valor)
    if (lista.length > 0) textos[plano] = lista
  }
  return {
    coberturas,
    desconto: {
      quimicos: fracao(descontoBruto.quimicos),
      produtos: fracao(descontoBruto.produtos),
    },
    rotulos,
    textos,
  }
}

/** O rótulo do plano: o que a casa chamou dele, senão o nome do módulo. */
export function rotuloDoPlano(
  plano: string,
  beneficios?: BeneficiosPublicos | null,
): string {
  const oficial = beneficios?.rotulos?.[plano]
  if (oficial) return oficial
  return rotuloPadrao(plano)
}

function rotuloPadrao(plano: string): string {
  if (plano === 'cabelo') return 'Audax Corte'
  if (plano === 'barba') return 'Audax Barba'
  if (plano === 'cabelo_barba') return 'Audax Corte + Barba'
  return 'Audax Club'
}

/**
 * A lista de benefícios que o cliente lê.
 *
 * Prioridade:
 *   1. o TEXTO OFICIAL da casa (`clube.beneficios`, o mesmo que a IA lê) —
 *      é a palavra do dono, e é o que evita "cabelo, barba e cabelo e barba
 *      ilimitados" na tela quando a cobertura do plano combinado inclui o
 *      serviço combo;
 *   2. senão, a derivação das coberturas e dos descontos do config.
 *
 * Em nenhum dos dois casos a tela decide direito do cliente: `liberado` vem da
 * regra do servidor.
 */
export function beneficiosDoPlano(
  plano: string,
  beneficios: BeneficiosPublicos | null | undefined,
): string[] {
  const oficiais = beneficios?.textos?.[plano]
  if (oficiais && oficiais.length > 0) return oficiais

  const lista: string[] = []
  /*
   * SEM fallback de categoria. Se a configuração não chegou, a tela não
   * inventa cobertura: mostra o aviso "fal com a equipe". Uma lista escrita no
   * código passaria a mentir no dia em que o dono mudasse as coberturas — e é
   * a regra que o `audax_clube_beneficio` aplica no atendimento.
   */
  const categorias = beneficios?.coberturas?.[plano] ?? []
  if (categorias.length > 0) {
    const listaFormatada = categorias.map((categoria) => categoria.toLowerCase())
    lista.push(
      `${listaEmTexto(listaFormatada)} ${listaFormatada.length === 1 ? 'ilimitado' : 'ilimitados'} durante a vigência`,
    )
  }
  const quimicos = beneficios?.desconto.quimicos ?? 0
  if (quimicos > 0) lista.push(`${percent(quimicos)} em procedimentos químicos`)
  const produtos = beneficios?.desconto.produtos ?? 0
  if (produtos > 0) lista.push(`${percent(produtos)} em produtos`)
  return lista
}
