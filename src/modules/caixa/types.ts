// Caixa — tipos (sem backend: estado local + localStorage)
import type { StatusAgendamento } from '@/modules/agenda/types'

export type FormaPagamento =
  | 'dinheiro'
  | 'pix'
  | 'cartao_credito'
  | 'cartao_debito'
  | 'outro'

export type TipoLancamento = 'receita' | 'despesa'
export type OrigemLancamento = 'atendimento' | 'produto' | 'despesa'

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
  produto?: string
  quantidade?: number
  /** Itens detalhados (vendas do PDV com vários produtos) */
  itens?: ItemVenda[]
  categoria?: string
  observacao?: string
  criadoEm: string
  estornado?: boolean
  estornadoEm?: string
}

export type ResumoFechamento = {
  receitasAtendimentos: number
  receitasProdutos: number
  totalRecebido: number
  descontos: number
  despesas: number
  liquido: number
  porForma: Record<FormaPagamento, number>
  porProfissional: { nome: string; valor: number; qtd: number }[]
  qtdAtendimentos: number
  qtdProdutos: number
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
  'cartao_credito',
  'cartao_debito',
  'outro',
]

export const FORMAS_ROTULO: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão crédito',
  cartao_debito: 'Cartão débito',
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
