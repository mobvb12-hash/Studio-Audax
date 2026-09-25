// Audax Club — tipos (sem backend: estado local + localStorage)
import type { FormaPagamento } from '@/modules/caixa/types'

export type PlanoClube = 'cabelo' | 'barba' | 'cabelo_barba'

export type StatusAssinatura =
  | 'ativa'
  | 'proxima_vencimento'
  | 'atrasada'
  | 'vencida'
  | 'cancelada'

export type AssinaturaClube = {
  id: string
  clienteId: string
  cliente: string
  plano: PlanoClube
  /** Mensalidade contratada (snapshot na assinatura — não muda com o tempo) */
  valorMensal: number
  /** YYYY-MM-DD */
  dataAssinatura: string
  /** YYYY-MM-DD — sempre o próximo vencimento do ciclo */
  proximoVencimento: string
  /** Cancelamento preserva a assinatura e todo o histórico */
  cancelada: boolean
  /** YYYY-MM-DD do cancelamento */
  canceladaEm?: string
  motivoCancelamento?: string
  criadoEm: string
}

export type PagamentoClube = {
  id: string
  assinaturaId: string
  clienteId: string
  /** YYYY-MM-DD em que o pagamento foi feito */
  data: string
  valor: number
  formaPagamento: FormaPagamento
  /** Liga o pagamento ao lançamento recebido no Caixa do dia */
  caixaLancamentoId?: string
  criadoEm: string
}

export const PLANOS_CLUBE: { id: PlanoClube; nome: string }[] = [
  { id: 'cabelo', nome: 'Cabelo' },
  { id: 'barba', nome: 'Barba' },
  { id: 'cabelo_barba', nome: 'Cabelo + Barba' },
]

export const PLANOS_ROTULO: Record<PlanoClube, string> = {
  cabelo: 'Cabelo',
  barba: 'Barba',
  cabelo_barba: 'Cabelo + Barba',
}

export function ehPlanoClube(valor: string): valor is PlanoClube {
  return valor === 'cabelo' || valor === 'barba' || valor === 'cabelo_barba'
}

/** Desconto fixo de 10% em produtos para assinantes vigentes */
export const DESCONTO_ASSINANTE = 0.1
