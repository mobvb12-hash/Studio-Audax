import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { useEffect, useRef, useState } from 'react'
import ClienteFormModal from '@/components/ClienteFormModal'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import type { FormaPagamento, ItemServico, Lancamento } from '@/modules/caixa/types'
import { useClientes } from '@/modules/clientes/store'
import { useEstoque } from '@/modules/estoque/store'
import { validarQuantidadeEstoque } from '@/modules/estoque/validacao'
import { useProdutos } from '@/modules/produtos/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { useServicos } from '@/modules/servicos/store'
import { formatarBRL, normalizarTexto, parseMoeda } from '@/lib/moeda'

type Props = {
  agendamento: Agendamento
  onFechar: () => void
}

/** Produto escolhido para entrar no mesmo fechamento do atendimento. */
type ItemCarrinho = {
  produtoId: string
  produto: string
  quantidade: number
  preco: number
  /** estoque disponível no momento em que o item entrou no carrinho */
  estoque: number
  /** desconto digitado para ESTE item — sempre decisão do operador */
  descTexto: string
}

/** Serviço adicional cobrado na mesma conta (§4 — multi-serviço). */
type ItemAdicional = {
  chave: number
  servicoId: string
  servico: string
  valorTexto: string
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

export default function PagamentoModal({ agendamento, onFechar }: Props) {
  const {
    registrarPagamento,
    registrarVenda,
    desfazerLancamento,
    renomearCliente,
    diaFechado,
  } = useCaixa()
  const { mudarStatus, renomearCliente: renomearNaAgenda } = useAgenda()
  const { servicos } = useServicos()
  const { clientes } = useClientes()
  const { produtos } = useProdutos()
  const { profissionais } = useProfissionais()
  const { saidaPorVenda, reverterVenda } = useEstoque()

  const preco = servicos.find((s) => s.nome === agendamento.servico)?.preco ?? 0
  const servicoPrincipal = servicos.find((s) => s.nome === agendamento.servico)
  const cliente = clientes.find(
    (c) => normalizarTexto(c.nome) === normalizarTexto(agendamento.cliente),
  )
  // Comissão casa por id quando o cadastro existe (§5.3) — rename nunca
  // quebra a produção; sem cadastro, fica só o nome.
  const profissionalId = profissionais.find(
    (p) => normalizarTexto(p.nome) === normalizarTexto(agendamento.profissional),
  )?.id

  const [valor, setValor] = useState(() => String(preco).replace('.', ','))
  const [desconto, setDesconto] = useState('0')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [observacao, setObservacao] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [produtoSel, setProdutoSel] = useState('')
  const [qtdTexto, setQtdTexto] = useState('1')
  /** Serviços adicionais da mesma conta (o principal fica no campo "valor"). */
  const [extras, setExtras] = useState<ItemAdicional[]>([])
  const [servicoSel, setServicoSel] = useState('')
  const proximaChaveRef = useRef(1)
  /** Entrega do cliente: vazio = pagou o total exato (cálculo automático). */
  const [recebidoTexto, setRecebidoTexto] = useState('')
  /** Valor extra entregue ao profissional — fica fora da receita/comissão. */
  const [gorjetaTexto, setGorjetaTexto] = useState('')
  /** Saldo em aberto só entra como dívida se o operador confirmar. */
  const [dividaOk, setDividaOk] = useState(false)
  const [editandoCliente, setEditandoCliente] = useState(false)
  const salvandoRef = useRef(false)
  const [erro, setErro] = useState(() =>
    diaFechado(agendamento.data)
      ? `O caixa de ${agendamento.data} está fechado. Reabra o caixa (com motivo) para registrar.`
      : '',
  )

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Dentro da edição do cliente o Escape fecha só a edição
      if (editandoCliente) return
      onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar, editandoCliente])

  // --- Valores dos serviços ------------------------------------------------
  const valorNum = parseMoeda(valor)
  const servicoBruto = Number.isFinite(valorNum) && valorNum > 0 ? valorNum : 0
  const extrasBruto = extras.reduce((soma, x) => {
    const n = parseMoeda(x.valorTexto)
    return soma + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
  /** Bruto de TODOS os serviços da conta — é o teto do desconto global (§4). */
  const servicoBrutoTotal = arredondar(servicoBruto + extrasBruto)
  const descontoNum = parseMoeda(desconto) || 0
  const descontoServ = Math.min(
    Number.isFinite(descontoNum) && descontoNum > 0 ? descontoNum : 0,
    servicoBrutoTotal,
  )
  const servicoLiquido = arredondar(Math.max(0, servicoBruto - descontoServ))

  // --- Itens (produtos) ----------------------------------------------------
  const produtosVendaveis = produtos.filter((p) => p.ativo && p.estoque > 0)
  const totalProdutos = carrinho.reduce(
    (soma, i) => soma + i.quantidade * i.preco,
    0,
  )
  const descontoProdutos = carrinho.reduce((soma, i) => {
    const d = parseMoeda(i.descTexto) || 0
    return soma + (Number.isFinite(d) && d > 0 ? d : 0)
  }, 0)
  const apagarDoItem = (i: ItemCarrinho) =>
    arredondar(Math.max(0, i.quantidade * i.preco - descontoDe(i)))

  function descontoDe(item: ItemCarrinho): number {
    const d = parseMoeda(item.descTexto) || 0
    return Number.isFinite(d) && d > 0 ? d : 0
  }

  // --- Totais da conta -----------------------------------------------------
  const subtotal = arredondar(servicoBrutoTotal + totalProdutos)
  const descontoTotal = arredondar(descontoServ + descontoProdutos)
  const total = arredondar(Math.max(0, subtotal - descontoTotal))

  // --- Recebimento (Total / Recebido / Falta / Troco) -----------------------
  const recebidoNum = recebidoTexto.trim() === '' ? total : parseMoeda(recebidoTexto)
  const recebido = Number.isFinite(recebidoNum) && recebidoNum >= 0 ? recebidoNum : total
  const gorjetaNum = parseMoeda(gorjetaTexto) || 0
  const gorjeta = Number.isFinite(gorjetaNum) && gorjetaNum > 0 ? gorjetaNum : 0
  const troco = arredondar(Math.max(0, recebido - total - gorjeta))
  const falta = arredondar(Math.max(0, total - (recebido - gorjeta)))

  function adicionarAoCarrinho() {
    setErro('')
    const prod = produtos.find((p) => p.id === produtoSel)
    if (!prod) {
      setErro('Selecione um produto.')
      return
    }
    if (!prod.ativo) {
      setErro('Produto inativo — não é possível vender.')
      return
    }
    if (!(prod.preco > 0)) {
      setErro('O preço do produto deve ser maior que zero.')
      return
    }
    if (prod.estoque <= 0) {
      setErro(`"${prod.nome}" está sem estoque — não é possível vender.`)
      return
    }
    const q = Number(qtdTexto)
    const existente = carrinho.find((i) => i.produtoId === prod.id)
    const erroEstoque = validarQuantidadeEstoque(
      q,
      prod.nome,
      prod.estoque,
      existente?.quantidade ?? 0,
    )
    if (erroEstoque) {
      setErro(erroEstoque)
      return
    }
    setCarrinho((atual) => {
      if (atual.some((i) => i.produtoId === prod.id)) {
        return atual.map((i) =>
          i.produtoId === prod.id
            ? { ...i, quantidade: i.quantidade + q }
            : i,
        )
      }
      return [
        ...atual,
        {
          produtoId: prod.id,
          produto: prod.nome,
          quantidade: q,
          preco: prod.preco,
          estoque: prod.estoque,
          descTexto: '0',
        },
      ]
    })
    setProdutoSel('')
    setQtdTexto('1')
  }

  function removerItem(produtoId: string) {
    setCarrinho((atual) => atual.filter((i) => i.produtoId !== produtoId))
    setErro('')
  }

  function definirDescontoItem(produtoId: string, texto: string) {
    setCarrinho((atual) =>
      atual.map((i) =>
        i.produtoId === produtoId ? { ...i, descTexto: texto } : i,
      ),
    )
    setErro('')
  }

  // --- Serviços adicionais (mesma conta) ------------------------------------
  function adicionarServico() {
    setErro('')
    const s = servicos.find((x) => x.id === servicoSel)
    if (!s) {
      setErro('Selecione um serviço.')
      return
    }
    if (!s.ativo) {
      setErro('Serviço inativo — não é possível cobrar.')
      return
    }
    if (!Number.isFinite(s.preco) || s.preco < 0) {
      setErro(`Preço do serviço "${s.nome}" inválido.`)
      return
    }
    setExtras((atual) => [
      ...atual,
      {
        chave: proximaChaveRef.current++,
        servicoId: s.id,
        servico: s.nome,
        valorTexto: String(s.preco).replace('.', ','),
      },
    ])
    setServicoSel('')
  }

  function removerServicoExtra(chave: number) {
    setExtras((atual) => atual.filter((x) => x.chave !== chave))
    setErro('')
  }

  function definirValorExtra(chave: number, texto: string) {
    setExtras((atual) =>
      atual.map((x) => (x.chave === chave ? { ...x, valorTexto: texto } : x)),
    )
    setErro('')
  }

  function salvar() {
    if (salvandoRef.current) return
    if (diaFechado(agendamento.data)) {
      setErro(
        `O caixa de ${agendamento.data} está fechado. Reabra o caixa para lançar.`,
      )
      return
    }
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setErro('Informe um valor válido (ex.: 70 ou 70,00).')
      return
    }
    if (!Number.isFinite(descontoNum) || descontoNum < 0) {
      setErro('Informe um desconto válido (ou 0).')
      return
    }
    if (descontoNum > servicoBrutoTotal) {
      setErro('O desconto não pode ser maior que o valor dos serviços.')
      return
    }
    // Valor de cada serviço adicional: só aceita número ≥ 0
    for (const x of extras) {
      const n = parseMoeda(x.valorTexto)
      if (!Number.isFinite(n) || n < 0) {
        setErro(
          `Valor do serviço "${x.servico}" inválido: informe um número (ex.: 70 ou 70,00).`,
        )
        return
      }
    }
    // Desconto de cada item: válido apenas entre 0 e o total do próprio item
    for (const item of carrinho) {
      const bruto = item.quantidade * item.preco
      const d = descontoDe(item)
      const digitado = parseMoeda(item.descTexto)
      if (!Number.isFinite(digitado) || digitado < 0 || d > bruto) {
        setErro(
          `Desconto de "${item.produto}" inválido: informe um valor entre 0 e ${formatarBRL(bruto)}.`,
        )
        return
      }
    }
    // Recebimento: só valida quando o operador digitou alguma coisa
    if (recebidoTexto.trim() !== '' && !Number.isFinite(parseMoeda(recebidoTexto))) {
      setErro('Informe um valor recebido válido (ex.: 100 ou 100,00).')
      return
    }
    if (recebidoTexto.trim() !== '' && parseMoeda(recebidoTexto) < 0) {
      setErro('O valor recebido não pode ser negativo.')
      return
    }
    if (gorjetaTexto.trim() !== '' && (!Number.isFinite(gorjetaNum) || gorjetaNum < 0)) {
      setErro('Informe uma gorjeta válida (ou 0).')
      return
    }
    if (gorjeta > 0 && recebido < total + gorjeta) {
      setErro(
        `Gorjeta de ${formatarBRL(gorjeta)} exige recebido cobrindo o total + gorjeta (${formatarBRL(total + gorjeta)}).`,
      )
      return
    }
    if (falta > 0 && !dividaOk) {
      setErro(
        `Restam ${formatarBRL(falta)} em aberto. Marque "Registrar o restante como dívida" ou ajuste o recebido.`,
      )
      return
    }
    // Estoque de TODOS os itens validado antes de qualquer lançamento
    for (const item of carrinho) {
      const prod = produtos.find((p) => p.id === item.produtoId)
      if (!prod) {
        setErro(`Produto "${item.produto}" não encontrado. Nada foi lançado.`)
        return
      }
      if (prod.estoque < item.quantidade) {
        setErro(
          `Estoque insuficiente para "${prod.nome}": disponível ${prod.estoque}, solicitado ${item.quantidade}. Nada foi lançado.`,
        )
        return
      }
    }
    salvandoRef.current = true
    let pagamentoId = ''
    let vendaId = ''
    /** Guarda a venda criada para poder devolver a baixa no rollback. */
    let vendaCriada: Lancamento | undefined
    try {
      // §4 — multi-serviço: UM lançamento por conta, com os serviços detalhados
      const servicosDaConta: ItemServico[] = [
        {
          servicoId: servicoPrincipal?.id,
          servico: agendamento.servico,
          preco: arredondar(servicoBruto),
        },
        ...extras.map((x) => ({
          servicoId: x.servicoId,
          servico: x.servico,
          preco: arredondar(parseMoeda(x.valorTexto) || 0),
        })),
      ]
      const pagamento = registrarPagamento({
        agendamentoId: agendamento.id,
        data: agendamento.data,
        hora: agendamento.horario,
        cliente: agendamento.cliente,
        clienteId: cliente?.id,
        profissional: agendamento.profissional,
        profissionalId,
        servico: servicosDaConta.map((s) => s.servico).join(' + '),
        servicos: servicosDaConta,
        valor: servicoBrutoTotal,
        desconto: descontoNum,
        formaPagamento: forma,
        statusAgendamento: agendamento.status,
        observacao,
        recebido: arredondar(recebido),
        ...(troco > 0 && { troco }),
        ...(falta > 0 && { falta: arredondar(falta) }),
        ...(gorjeta > 0 && { gorjeta: arredondar(gorjeta) }),
      })
      pagamentoId = pagamento.id
      if (carrinho.length > 0) {
        // Receita de produto separada da receita de atendimento
        const venda = registrarVenda({
          data: agendamento.data,
          itens: carrinho.map((i) => ({
            produtoId: i.produtoId,
            produto: i.produto,
            quantidade: i.quantidade,
            preco: i.preco,
          })),
          desconto: descontoProdutos,
          formaPagamento: forma,
          cliente: agendamento.cliente,
          clienteId: cliente?.id,
          profissional: agendamento.profissional,
          profissionalId,
          // Vínculo com a conta: permite que a reabertura devolva esta baixa
          agendamentoId: agendamento.id,
        })
        vendaId = venda.id
        vendaCriada = venda
        // Baixa de estoque — idempotente por venda, atômica por venda
        saidaPorVenda(venda.id, venda.data, venda.itens ?? [])
      }
      mudarStatus(agendamento.id, 'concluido')
      onFechar()
    } catch (e) {
      // Rollback total: desfaz o que já foi gravado (pagamento e/ou venda
      // de produtos) para a operação não ficar parcial — sem estado em
      // meio termo, o usuário pode tentar de novo livremente.
      //
      // A baixa de estoque pode já ter acontecido quando a falha vem DEPOIS
      // dela (mudarStatus/onFechar). Nesse caso o estoque é devolvido antes
      // de remover os lançamentos, senão ficaria saldo menor sem venda e o
      // retry baixaria de novo. `reverterVenda` é idempotente e não faz nada
      // quando não houve baixa, então o caminho de falha ANTES da baixa
      // continua intocado.
      const erroOriginal =
        e instanceof Error ? e.message : 'Não foi possível registrar.'
      let erroDaReversao = ''
      if (vendaCriada) {
        try {
          reverterVenda(vendaCriada)
        } catch (reversao) {
          erroDaReversao =
            reversao instanceof Error ? reversao.message : 'erro desconhecido'
        }
      }
      if (vendaId) desfazerLancamento(vendaId)
      if (pagamentoId) desfazerLancamento(pagamentoId)
      setErro(
        erroDaReversao
          ? `${erroOriginal} Não foi possível devolver o estoque automaticamente: ${erroDaReversao}.`
          : erroOriginal,
      )
    } finally {
      salvandoRef.current = false
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#7C7469] uppercase">
              Fechar conta
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#121110]">
              {agendamento.cliente}
            </h2>
            <p className="text-[13px] text-[#7C7469]">
              {agendamento.telefone ? `${agendamento.telefone} · ` : ''}
              {agendamento.profissional} · {agendamento.horario}
            </p>
            <p className="text-[13px] text-[#7C7469]">
              {agendamento.servico} · {agendamento.data}
            </p>
            {cliente && (
              <button
                type="button"
                onClick={() => setEditandoCliente(true)}
                className="mt-2 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
              >
                Editar cliente
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#7C7469] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 border-t border-[#EFE7D3] pt-4">
          <p className={rotulo}>Itens da conta</p>
          <div className="mt-2 overflow-hidden rounded-lg border border-[#E5DCC3]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF6EB] text-[11px] tracking-wide text-[#7C7469] uppercase">
                  <th className="px-2 py-1.5 text-left font-semibold">Item</th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    Preço
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    Desconto
                  </th>
                  <th className="px-2 py-1.5 text-right font-semibold">
                    A pagar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE7D3]">
                <tr>
                  <td className="px-2 py-2 text-[#121110]">
                    Serviço · {agendamento.servico}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      id="pag-valor"
                      aria-label="Valor do serviço (R$) *"
                      className={`${campo} w-24 text-right`}
                      inputMode="decimal"
                      placeholder="70,00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      id="pag-desconto"
                      aria-label="Desconto (R$)"
                      className={`${campo} w-20 text-right`}
                      inputMode="decimal"
                      placeholder="0"
                      value={desconto}
                      onChange={(e) => setDesconto(e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-[#121110]">
                    {formatarBRL(servicoLiquido)}
                  </td>
                </tr>
                {extras.map((x) => {
                  const bruto = parseMoeda(x.valorTexto)
                  const brutoValido =
                    Number.isFinite(bruto) && bruto > 0 ? bruto : 0
                  return (
                    <tr key={x.chave}>
                      <td className="px-2 py-2 text-[#121110]">
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">
                            Serviço · {x.servico}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remover serviço ${x.servico}`}
                            onClick={() => removerServicoExtra(x.chave)}
                            className="shrink-0 rounded px-1.5 text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          aria-label={`Valor de ${x.servico} (R$)`}
                          className={`${campo} w-24 text-right`}
                          inputMode="decimal"
                          placeholder="70,00"
                          value={x.valorTexto}
                          onChange={(e) =>
                            definirValorExtra(x.chave, e.target.value)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-[#A99E85]">
                        —
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-[#121110]">
                        {formatarBRL(brutoValido)}
                      </td>
                    </tr>
                  )
                })}
                {carrinho.map((i) => (
                  <tr key={i.produtoId}>
                    <td className="px-2 py-2 text-[#121110]">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {i.quantidade}× {i.produto}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remover ${i.produto}`}
                          onClick={() => removerItem(i.produtoId)}
                          className="shrink-0 rounded px-1.5 text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-[#3A352C]">
                      {formatarBRL(i.quantidade * i.preco)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        aria-label={`Desconto em ${i.produto} (R$)`}
                        className={`${campo} w-20 text-right`}
                        inputMode="decimal"
                        placeholder="0"
                        value={i.descTexto}
                        onChange={(e) =>
                          definirDescontoItem(i.produtoId, e.target.value)
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-[#121110]">
                      {formatarBRL(apagarDoItem(i))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E5DCC3] bg-[#FAF6EB]/60 text-xs">
                  <td className="px-2 py-1.5 text-[#7C7469]" colSpan={1}>
                    Subtotal
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-[#3A352C]">
                    {formatarBRL(subtotal)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-[#6B8E5A]">
                    − {formatarBRL(descontoTotal)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-[#8A6A14]">
                    {formatarBRL(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {carrinho.length === 0 && (
            <p className="mt-2 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-3 py-2 text-center text-xs text-[#A99E85]">
              Nenhum produto neste fechamento.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={rotulo} htmlFor="pag-servico-adicional">
                Serviço adicional
              </label>
              <select
                id="pag-servico-adicional"
                className={campo}
                value={servicoSel}
                onChange={(e) => setServicoSel(e.target.value)}
              >
                <option value="">Selecione um serviço...</option>
                {servicos
                  .filter((s) => s.ativo)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome} · {formatarBRL(s.preco)}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              onClick={adicionarServico}
              className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
            >
              Incluir serviço
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={rotulo} htmlFor="pag-produto">
                Produto
              </label>
              <select
                id="pag-produto"
                className={campo}
                value={produtoSel}
                onChange={(e) => setProdutoSel(e.target.value)}
              >
                <option value="">Selecione um produto...</option>
                {produtosVendaveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {formatarBRL(p.preco)} · estoque {p.estoque}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-24">
              <label className={rotulo} htmlFor="pag-qtd">
                Quantidade
              </label>
              <input
                id="pag-qtd"
                className={campo}
                inputMode="numeric"
                value={qtdTexto}
                onChange={(e) => setQtdTexto(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={adicionarAoCarrinho}
              className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
            >
              Adicionar
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-[#EFE7D3] pt-4">
          <p className={rotulo}>Pagamento</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={rotulo} htmlFor="pag-forma">
                Forma de pagamento *
              </label>
              <select
                id="pag-forma"
                className={campo}
                value={forma}
                onChange={(e) => setForma(e.target.value as FormaPagamento)}
              >
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {FORMAS_ROTULO[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="pag-recebido">
                Recebido (R$)
              </label>
              <input
                id="pag-recebido"
                className={campo}
                inputMode="decimal"
                placeholder="Em branco = total"
                value={recebidoTexto}
                onChange={(e) => {
                  setRecebidoTexto(e.target.value)
                  setErro('')
                }}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="pag-gorjeta">
                Gorjeta (R$)
              </label>
              <input
                id="pag-gorjeta"
                className={campo}
                inputMode="decimal"
                placeholder="0"
                value={gorjetaTexto}
                onChange={(e) => {
                  setGorjetaTexto(e.target.value)
                  setErro('')
                }}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-[#E5DCC3] bg-[#F3ECDA] px-2 py-1.5">
              <p className="text-[10px] tracking-wide text-[#7C7469] uppercase">
                Total
              </p>
              <p className="text-sm font-bold text-[#8A6A14]">
                {formatarBRL(total)}
              </p>
            </div>
            <div className="rounded-lg border border-[#E5DCC3] bg-white px-2 py-1.5">
              <p className="text-[10px] tracking-wide text-[#7C7469] uppercase">
                Recebido
              </p>
              <p className="text-sm font-bold text-[#121110]">
                {formatarBRL(recebido)}
              </p>
            </div>
            <div
              className={`rounded-lg border px-2 py-1.5 ${
                falta > 0
                  ? 'border-red-200 bg-red-50'
                  : 'border-[#E5DCC3] bg-white'
              }`}
            >
              <p className="text-[10px] tracking-wide text-[#7C7469] uppercase">
                Falta
              </p>
              <p
                className={`text-sm font-bold ${falta > 0 ? 'text-red-700' : 'text-[#121110]'}`}
              >
                {formatarBRL(falta)}
              </p>
            </div>
            <div className="rounded-lg border border-[#E5DCC3] bg-white px-2 py-1.5">
              <p className="text-[10px] tracking-wide text-[#7C7469] uppercase">
                Troco
              </p>
              <p className="text-sm font-bold text-[#121110]">
                {formatarBRL(troco)}
              </p>
            </div>
          </div>

          {falta > 0 && (
            <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <input
                type="checkbox"
                id="pag-divida"
                checked={dividaOk}
                onChange={(e) => setDividaOk(e.target.checked)}
                className="mt-0.5"
              />
              Registrar o restante como dívida ({formatarBRL(falta)})
            </label>
          )}

          <div className="mt-3">
            <label className={rotulo} htmlFor="pag-obs">
              Comentário sobre o fechamento
            </label>
            <input
              id="pag-obs"
              className={campo}
              placeholder="Opcional"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        {erro && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#3A352C] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className="rounded-lg bg-[#C9A24A] px-4 py-2 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
          >
            Fechar Conta {formatarBRL(total)}
          </button>
        </div>

        {editandoCliente && cliente && (
          <ClienteFormModal
            cliente={cliente}
            aoRenomear={(antigo, novo) => {
              renomearNaAgenda(antigo, novo)
              renomearCliente(antigo, novo)
            }}
            onFechar={() => setEditandoCliente(false)}
          />
        )}
      </div>
    </div>
  )
}
