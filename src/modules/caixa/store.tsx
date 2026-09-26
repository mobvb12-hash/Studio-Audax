import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { carregarJSON, salvarJSON } from '@/lib/persistencia'
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

const CHAVE_LANCAMENTOS = 'studio-audax:caixa:lancamentos:v1'
const CHAVE_FECHAMENTOS = 'studio-audax:caixa:fechamentos:v1'
const CHAVE_AUDITORIA = 'studio-audax:caixa:auditoria:v1'

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
  fecharCaixa: (data: string) => Fechamento
  reabrirCaixa: (data: string, motivo: string) => void
  /** Propaga renomeações de cadastro para os lançamentos existentes */
  renomearProfissional: (antigo: string, novo: string) => void
  renomearServico: (antigo: string, novo: string) => void
  renomearCliente: (antigo: string, novo: string) => void
}

const Contexto = createContext<CaixaContexto | null>(null)

export function CaixaProvider({ children }: { children: ReactNode }) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() =>
    carregarJSON<Lancamento[]>(CHAVE_LANCAMENTOS, [], Array.isArray),
  )
  const [fechamentos, setFechamentos] = useState<Fechamento[]>(() =>
    carregarJSON<Fechamento[]>(CHAVE_FECHAMENTOS, [], Array.isArray),
  )
  const [auditoria, setAuditoria] = useState<EventoAuditoria[]>(() =>
    carregarJSON<EventoAuditoria[]>(CHAVE_AUDITORIA, [], Array.isArray),
  )

  useEffect(() => {
    salvarJSON(CHAVE_LANCAMENTOS, lancamentos)
  }, [lancamentos])

  useEffect(() => {
    salvarJSON(CHAVE_FECHAMENTOS, fechamentos)
  }, [fechamentos])

  useEffect(() => {
    salvarJSON(CHAVE_AUDITORIA, auditoria)
  }, [auditoria])

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
      setLancamentos((atual) => [...atual, novo])
      return novo
    },
    [jaPago, bloquearSeFechado],
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
      setLancamentos((atual) => [...atual, novo])
      return novo
    },
    [bloquearSeFechado],
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
      setLancamentos((atual) => [...atual, novo])
      return novo
    },
    [bloquearSeFechado],
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
      setLancamentos((atual) => [...atual, novo])
      return novo
    },
    [bloquearSeFechado],
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
      setLancamentos((atual) => [...atual, novo])
      return novo
    },
    [bloquearSeFechado],
  )

  const estornar = useCallback(
    (id: string) => {
      const alvo = lancamentos.find((l) => l.id === id)
      if (!alvo) throw new Error('Lançamento não encontrado.')
      if (alvo.estornado) throw new Error('Este lançamento já foi estornado.')
      bloquearSeFechado(alvo.data)

      const evento: EventoAuditoria = {
        id: gerarId(),
        acao: 'estorno',
        data: alvo.data,
        descricao: `${alvo.origem === 'despesa' ? 'Despesa' : 'Receita'}: ${alvo.descricao} — R$ ${alvo.valorLiquido.toFixed(2)}`,
        criadoEm: new Date().toISOString(),
      }
      setLancamentos((atual) =>
        atual.map((l) =>
          l.id === id
            ? { ...l, estornado: true, estornadoEm: new Date().toISOString() }
            : l,
        ),
      )
      setAuditoria((atual) => [...atual, evento])
    },
    [lancamentos, bloquearSeFechado],
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
      setFechamentos((atual) => [...atual, fechamento])
      return fechamento
    },
    [diaFechado, resumoDoDia],
  )

  const reabrirCaixa = useCallback(
    (data: string, motivo: string) => {
      const ativo = fechamentos.find((f) => f.data === data && !f.reaberto)
      if (!ativo) throw new Error(`Não há caixa fechado em ${data}.`)
      if (motivo.trim().length < 3) {
        throw new Error('Informe o motivo da reabertura (mín. 3 letras).')
      }
      const evento: EventoAuditoria = {
        id: gerarId(),
        acao: 'reabertura',
        data,
        descricao: `Caixa de ${data} reaberto`,
        motivo: motivo.trim(),
        criadoEm: new Date().toISOString(),
      }
      setFechamentos((atual) =>
        atual.map((f) =>
          f.id === ativo.id
            ? { ...f, reaberto: { em: new Date().toISOString(), motivo: motivo.trim() } }
            : f,
        ),
      )
      setAuditoria((atual) => [...atual, evento])
    },
    [fechamentos],
  )

  const renomearProfissional = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setLancamentos((atual) =>
      atual.map((l) =>
        l.profissional === antigo ? { ...l, profissional: destino } : l,
      ),
    )
  }, [])

  const renomearServico = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setLancamentos((atual) =>
      atual.map((l) =>
        l.servico === antigo ? { ...l, servico: destino } : l,
      ),
    )
  }, [])

  const renomearCliente = useCallback((antigo: string, novo: string) => {
    const destino = novo.trim()
    if (!antigo || !destino || antigo === destino) return
    setLancamentos((atual) =>
      atual.map((l) =>
        l.cliente === antigo ? { ...l, cliente: destino } : l,
      ),
    )
  }, [])

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
      registrarReceitaClube,
      adicionarDespesa,
      estornar,
      fecharCaixa,
      reabrirCaixa,
      renomearProfissional,
      renomearServico,
      renomearCliente,
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
      registrarReceitaClube,
      adicionarDespesa,
      estornar,
      fecharCaixa,
      reabrirCaixa,
      renomearProfissional,
      renomearServico,
      renomearCliente,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useCaixa(): CaixaContexto {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useCaixa deve ser usado dentro de CaixaProvider')
  return ctx
}
