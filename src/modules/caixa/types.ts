// Caixa — tipos (sem backend: estado local + localStorage)
import type { StatusAgendamento } from '@/modules/agenda/types'

export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'pix_integrado'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'transferencia'
  | 'pre_pago'
  | 'outro'

export type TipoLancamento = 'receita' | 'despesa'
export type OrigemLancamento = 'atendimento' | 'produto' | 'clube' | 'despesa'

/** Item de uma venda do PDV (vários produtos = um único lançamento) */
export type ItemVenda = {
  produtoId?: string
  produto: string
  quantidade: number
  preco: number
}

export type Lancamento = {
  id: string
  tipo: TipoLancamento
  origem: OrigemLancamento
  /** Dia do caixa (YYYY-MM-DD) */
  data: string
  /** Horário de referência (HH:MM) */
  hora: string
  descricao: string
  /** Valor bruto */
  valor: number
  /** Desconto aplicado (0 em despesas) */
  desconto: number
  /** valor - desconto (receitas) ou valor (despesas) */
  valorLiquido: number
  formaPagamento: FormaPagamento
  cliente?: string
  clienteId?: string
  profissional?: string
  servico?: string
  /** Liga o recebimento ao agendamento — impede pagamento duplicado */
  agendamentoId?: string
  /** Liga o recebimento à assinatura do Audax Club */
  assinaturaId?: string
  produto?: string
  quantidade?: number
  /** Itens detalhados (vendas do PDV com vários produtos) */
  itens?: ItemVenda[]
  categoria?: string
  observacao?: string
  /**
   * Fechamento de conta (opcionais — só quando o operador informa o recebimento):
   * `recebido` = total entregue pelo cliente, `troco` = devolvido,
   * `falta` = saldo em aberto (dívida) e `gorjeta` = valor extra, que NÃO
   * entra em valor/desconto/valorLiquido (não muda receita nem comissão).
   */
  recebido?: number
  troco?: number
  falta?: number
  gorjeta?: number
  criadoEm: string
  estornado?: boolean
  estornadoEm?: string
}

export type ResumoFechamento = {
  receitasAtendimentos: number
  receitasProdutos: number
  receitasClube: number
  totalRecebido: number
  descontos: number
  despesas: number
  liquido: number
  porForma: Record<FormaPagamento, number>
  porProfissional: { nome: string; valor: number; qtd: number }[]
  qtdAtendimentos: number
  qtdProdutos: number
  /** Gorjetas registradas no dia — informativa, fora da receita/comissão */
  gorjetas?: number
  /** Saldos em aberto (dívidas) fechados no dia — ainda não recebidos */
  dividas?: number
}

export type Fechamento = {
  id: string
  data: string
  fechadoEm: string
  resumo: ResumoFechamento
  reaberto?: { em: string; motivo: string }
}

export type EventoAuditoria = {
  id: string
  acao: 'estorno' | 'reabertura'
  /** Dia do caixa afetado */
  data: string
  descricao: string
  motivo?: string
  criadoEm: string
}

export type NovoPagamentoInput = {
  agendamentoId: string
  data: string
  hora: string
  cliente: string
  clienteId?: string
  profissional: string
  servico: string
  valor: number
  desconto: number
  formaPagamento: FormaPagamento
  /** Status atual do agendamento — cancelado/não compareceu não geram receita */
  statusAgendamento: StatusAgendamento
  observacao?: string
  /** Total entregue pelo cliente no fechamento (opcional) */
  recebido?: number
  /** Troco devolvido (opcional) */
  troco?: number
  /** Saldo em aberto deixado como dívida (opcional) */
  falta?: number
  /** Gorjeta registrada no fechamento — não altera receita nem comissão */
  gorjeta?: number
}

export type NovaVendaProdutoInput = {
  data: string
  produto: string
  quantidade: number
  preco: number
  desconto: number
  formaPagamento: FormaPagamento
  profissional?: string
  observacao?: string
}

/** Venda do PDV — vários produtos, um único lançamento no Caixa */
export type NovaVendaInput = {
  data: string
  itens: ItemVenda[]
  desconto: number
  formaPagamento: FormaPagamento
  cliente?: string
  clienteId?: string
  profissional?: string
  observacao?: string
}

/** Recebimento de assinatura do Audax Club (pagamento/renovação) */
export type NovaReceitaClubeInput = {
  data: string
  descricao: string
  valor: number
  formaPagamento: FormaPagamento
  cliente?: string
  clienteId?: string
  assinaturaId?: string
  observacao?: string
}

export type NovaDespesaInput = {
  data: string
  descricao: string
  categoria: string
  valor: number
  formaPagamento: FormaPagamento
  observacao?: string
}

export const FORMAS_PAGAMENTO: FormaPagamento[] = [
  'dinheiro',
  'pix',
  'pix_integrado',
  'cartao_credito',
  'cartao_debito',
  'transferencia',
  'pre_pago',
  'outro',
]

export const FORMAS_ROTULO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  pix_integrado: 'PIX integrado',
  cartao_credito: 'Cartão crédito',
  cartao_debito: 'Cartão débito',
  transferencia: 'Transferência',
  pre_pago: 'Pré-pago',
  outro: 'Outros',
}

export const CATEGORIAS_DESPESA = [
  'Aluguel',
  'Energia / água',
  'Produtos de higiene',
  'Salários',
  'Impostos',
  'Manutenção',
  'Marketing',
  'Outros',
]
