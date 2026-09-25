// Audax Club — regras puras de assinatura (sem estado, sem efeitos).
// O status é SEMPRE derivado de `proximoVencimento` + `cancelada`:
// nunca é armazenado, o que impede estados financeiros inconsistentes.
import type {
  AssinaturaClube,
  PagamentoClube,
  StatusAssinatura,
} from './types'

/** Dias de folga antes do vencimento para entrar em "próxima do vencimento" */
export const DIAS_ALERTA_VENCIMENTO = 3
/** Dias após o vencimento em que a assinatura fica "atrasada" (depois: vencida) */
export const DIAS_TOLERANCIA_ATRASO = 7

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

export function dataISOValida(data: string): boolean {
  if (!RE_DATA.test(data)) return false
  const [a, m, d] = data.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(a, m - 1, d))
  return (
    dt.getUTCFullYear() === a &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

/** Soma meses a uma data YYYY-MM-DD, fixando o dia no fim do mês (31/01 +1 = 28/02). */
export function addMonthsISO(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split('-').map(Number)
  const base = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimoDia = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Dias de `deISO` até `ateISO` (positivo = futuro). */
export function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split('-').map(Number)
  const [a2, m2, d2] = ateISO.split('-').map(Number)
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)
  return Math.round(ms / 86_400_000)
}

export function statusAssinatura(
  assinatura: AssinaturaClube,
  hoje: string,
): StatusAssinatura {
  if (assinatura.cancelada) return 'cancelada'
  const dias = diasEntre(hoje, assinatura.proximoVencimento)
  if (dias > DIAS_ALERTA_VENCIMENTO) return 'ativa'
  if (dias >= 0) return 'proxima_vencimento'
  if (dias >= -DIAS_TOLERANCIA_ATRASO) return 'atrasada'
  return 'vencida'
}

/** Vigente = não cancelada e ainda dentro do ciclo pago (ativa ou próxima). */
export function assinaturaVigente(
  assinatura: AssinaturaClube,
  hoje: string,
): boolean {
  if (assinatura.cancelada) return false
  return diasEntre(hoje, assinatura.proximoVencimento) >= 0
}

/** 10% (arredondado em centavos) sobre o subtotal — só para assinantes vigentes. */
export function valorDescontoAssinante(
  subtotal: number,
  vigente: boolean,
): number {
  if (!vigente || !Number.isFinite(subtotal) || subtotal <= 0) return 0
  return Math.min(subtotal, arredondar(subtotal * 0.1))
}

/**
 * Próximo vencimento após um pagamento: mantém a âncora do ciclo quando o
 * pagamento é adiantado; quando o vencimento já passou, reancora na data do
 * pagamento. Sempre resulta em um vencimento futuro.
 */
export function proximoVencimentoAposPagamento(
  vencimentoAtual: string,
  dataPagamento: string,
): string {
  const base = vencimentoAtual >= dataPagamento ? vencimentoAtual : dataPagamento
  return addMonthsISO(base, 1)
}

export type SituacoesClube = {
  /** Vigentes: ativas + próximas do vencimento (direito a benefícios) */
  ativas: number
  proximas: number
  atrasadas: number
  vencidas: number
  canceladas: number
}

export function situacoesAssinaturas(
  assinaturas: AssinaturaClube[],
  hoje: string,
): SituacoesClube {
  const contar = (status: StatusAssinatura) =>
    assinaturas.filter((a) => statusAssinatura(a, hoje) === status).length
  return {
    ativas: assinaturas.filter((a) => assinaturaVigente(a, hoje)).length,
    proximas: contar('proxima_vencimento'),
    atrasadas: contar('atrasada'),
    vencidas: contar('vencida'),
    canceladas: contar('cancelada'),
  }
}

/**
 * Soma dos pagamentos do mês (YYYY-MM). Pagamentos com lançamento estornado
 * no Caixa ficam fora — assim "Pago no mês" bate com a Receita do mês.
 */
export function pagamentosNoMes(
  pagamentos: PagamentoClube[],
  mesISO: string,
  estornados: Set<string>,
): number {
  return arredondar(
    pagamentos
      .filter(
        (p) =>
          p.data.startsWith(mesISO) &&
          (!p.caixaLancamentoId || !estornados.has(p.caixaLancamentoId)),
      )
      .reduce((soma, p) => soma + p.valor, 0),
  )
}

export const STATUS_ROTULO: Record<StatusAssinatura, string> = {
  ativa: 'Ativa',
  proxima_vencimento: 'Próxima do vencimento',
  atrasada: 'Atrasada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
}

export function statusClasse(status: StatusAssinatura): string {
  if (status === 'ativa')
    return 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
  if (status === 'proxima_vencimento')
    return 'border-amber-300 bg-amber-100 text-amber-900'
  if (status === 'atrasada')
    return 'border-orange-300 bg-orange-50 text-orange-700'
  if (status === 'vencida') return 'border-red-200 bg-red-50 text-red-600'
  return 'border-slate-300 bg-slate-100 text-slate-600'
}
