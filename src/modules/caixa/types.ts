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

/**
 * Linha de serviço de uma conta — uma conta pode ter vários serviços além do
 * serviço do agendamento (ex.: cliente reabriu a conta para lançar um serviço
 * que faltou). O lançamento continua sendo UM (nunca duplica receita); este
 * array guarda apenas o detalhamento das linhas.
 */
export type ItemServico = {
  servicoId?: string
  servico: string
  /** valor bruto digitado para ESTA linha (sem desconto) */
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
  /**
   * Vínculo seguro do profissional para comissão: o id do cadastro evita que
   * rename/caixa-acentos quebrem o match de produção. Ausente em dado antigo —
   * a produção cai no nome normalizado como sempre.
   */
  profissionalId?: string
  servico?: string
  /** Detalhe das linhas de serviço da conta (1..N linhas, um lançamento) */
  servicos?: ItemServico[]
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
  acao: 'estorno' | 'reabertura' | 'vinculo'
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
  /** id do cadastro do profissional (comissão segura contra rename) */
  profissionalId?: string
  /**
   * Linhas de serviço da conta. A primeira é o serviço do agendamento (ou o
   * valor digitado); as demais são serviços adicionais lançados na mesma
   * conta. Quando ausente, o lançamento usa apenas `servico`/`valor`.
   */
  servicos?: ItemServico[]
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
  profissionalId?: string
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
  profissionalId?: string
  observacao?: string
  /**
   * Vínculo opcional com o atendimento (fechamento de conta). Permite que a
   * reabertura da conta devolva a baixa de estoque destas vendas — venda
   * avulsa (PDV) não informa e continua sem vínculo.
   */
  agendamentoId?: string
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
