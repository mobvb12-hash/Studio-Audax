import { useEffect, useRef, useState } from 'react'
import { useAgenda } from '@/modules/agenda/store'
import type { Agendamento } from '@/modules/agenda/types'
import { useCaixa } from '@/modules/caixa/store'
import { FORMAS_PAGAMENTO, FORMAS_ROTULO } from '@/modules/caixa/types'
import type { FormaPagamento } from '@/modules/caixa/types'
import { useClientes } from '@/modules/clientes/store'
import { useEstoque } from '@/modules/estoque/store'
import { useProdutos } from '@/modules/produtos/store'
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
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function PagamentoModal({ agendamento, onFechar }: Props) {
  const { registrarPagamento, registrarVenda, diaFechado } = useCaixa()
  const { mudarStatus } = useAgenda()
  const { servicos } = useServicos()
  const { clientes } = useClientes()
  const { produtos } = useProdutos()
  const { saidaPorVenda } = useEstoque()

  const preco = servicos.find((s) => s.nome === agendamento.servico)?.preco ?? 0
  const clienteId = clientes.find(
    (c) => normalizarTexto(c.nome) === normalizarTexto(agendamento.cliente),
  )?.id

  const [valor, setValor] = useState(() => String(preco).replace('.', ','))
  const [desconto, setDesconto] = useState('0')
  const [forma, setForma] = useState<FormaPagamento>('dinheiro')
  const [observacao, setObservacao] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [produtoSel, setProdutoSel] = useState('')
  const [qtdTexto, setQtdTexto] = useState('1')
  /** Desconto digitado no fechamento — nunca automático, decisão do operador. */
  const [descontoProdutosTexto, setDescontoProdutosTexto] = useState('0')
  const salvandoRef = useRef(false)
  const [erro, setErro] = useState(() =>
    diaFechado(agendamento.data)
      ? `O caixa de ${agendamento.data} está fechado. Reabra o caixa (com motivo) para registrar.`
      : '',
  )

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.'))
  const descontoNum = Number(desconto.replace(/\./g, '').replace(',', '.')) || 0
  const liquido = Number.isFinite(valorNum - descontoNum)
    ? Math.max(0, valorNum - descontoNum)
    : 0

  // Produtos vendidos junto com o atendimento. O preço vem da tabela e o
  // desconto é sempre informado no fechamento — nenhuma regra automática.
  const produtosVendaveis = produtos.filter((p) => p.ativo && p.estoque > 0)
  const totalProdutos = carrinho.reduce(
    (soma, i) => soma + i.quantidade * i.preco,
    0,
  )
  const descontoProdutosNum = parseMoeda(descontoProdutosTexto) || 0
  const descontoProdutosValido =
    Number.isFinite(descontoProdutosNum) &&
    descontoProdutosNum >= 0 &&
    descontoProdutosNum <= totalProdutos
  // Sem produtos no carrinho o desconto digitado não tem efeito algum
  const descontoProdutosAplicado = carrinho.length > 0 ? descontoProdutosNum : 0
  const total = Math.max(
    0,
    Math.round((liquido + totalProdutos - descontoProdutosAplicado) * 100) /
      100,
  )

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
    if (!Number.isInteger(q) || q < 1) {
      setErro('Quantidade deve ser um número inteiro maior que zero.')
      return
    }
    const existente = carrinho.find((i) => i.produtoId === prod.id)
    const soma = (existente?.quantidade ?? 0) + q
    if (soma > prod.estoque) {
      setErro(
        existente
          ? `Estoque insuficiente para "${prod.nome}": disponível ${prod.estoque}, no carrinho ${existente.quantidade} + ${q}.`
          : `Estoque insuficiente para "${prod.nome}": disponível ${prod.estoque}, solicitado ${q}.`,
      )
      return
    }
    setCarrinho((atual) => {
      if (atual.some((i) => i.produtoId === prod.id)) {
        return atual.map((i) =>
          i.produtoId === prod.id ? { ...i, quantidade: i.quantidade + q } : i,
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
    if (descontoNum > valorNum) {
      setErro('O desconto não pode ser maior que o valor do serviço.')
      return
    }
    // Desconto digitado no fechamento: válido apenas entre 0 e o total dos produtos
    if (carrinho.length > 0 && !descontoProdutosValido) {
      setErro(
        `Desconto dos produtos inválido: informe um valor entre 0 e ${formatarBRL(totalProdutos)}.`,
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
    let pagamentoFeito = false
    try {
      registrarPagamento({
        agendamentoId: agendamento.id,
        data: agendamento.data,
        hora: agendamento.horario,
        cliente: agendamento.cliente,
        clienteId,
        profissional: agendamento.profissional,
        servico: agendamento.servico,
        valor: valorNum,
        desconto: descontoNum,
        formaPagamento: forma,
        statusAgendamento: agendamento.status,
        observacao,
      })
      pagamentoFeito = true
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
          desconto: descontoProdutosNum,
          formaPagamento: forma,
          cliente: agendamento.cliente,
          clienteId,
          profissional: agendamento.profissional,
        })
        // Baixa de estoque — idempotente por venda, atômica por venda
        saidaPorVenda(venda.id, venda.data, venda.itens ?? [])
      }
      mudarStatus(agendamento.id, 'concluido')
      onFechar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível registrar.'
      setErro(
        pagamentoFeito
          ? `Atendimento recebido, mas os produtos não puderam ser concluídos: ${msg}`
          : msg,
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
        className="w-full max-w-lg rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase">
              Registrar pagamento
            </p>
            <h2 className="mt-1 text-lg font-bold text-[#1C1A15]">
              {agendamento.cliente}
            </h2>
            <p className="text-[13px] text-[#8A8171]">
              {agendamento.servico} · {agendamento.profissional} ·{' '}
              {agendamento.horario}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="pag-valor">
              Valor do serviço (R$) *
            </label>
            <input
              id="pag-valor"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 70,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="pag-desconto">
              Desconto (R$)
            </label>
            <input
              id="pag-desconto"
              className={campo}
              inputMode="decimal"
              placeholder="0"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>
          <div>
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
          <div className="flex flex-col justify-end">
            <span className={rotulo}>Total a receber</span>
            <div className="rounded-lg border border-[#E5DCC3] bg-[#F3ECDA] px-3 py-2 text-sm font-bold text-[#8A6A14]">
              {formatarBRL(total)}
            </div>
            <p className="mt-1 text-[11px] text-[#8A8171]">
              Serviço {formatarBRL(liquido)}
              {totalProdutos > 0 && ` + produtos ${formatarBRL(totalProdutos)}`}
              {descontoProdutosAplicado !== 0 &&
                ` − desconto ${formatarBRL(descontoProdutosAplicado)}`}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="pag-obs">
              Observação
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

        <div className="mt-4 border-t border-[#EFE7D3] pt-4">
          <p className={rotulo}>Produtos vendidos junto (opcional)</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
              className="shrink-0 rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
            >
              Adicionar
            </button>
          </div>

          {carrinho.length > 0 ? (
            <ul className="mt-3 divide-y divide-[#EFE7D3] rounded-lg border border-[#E5DCC3] bg-[#FAF6EB]/60">
              {carrinho.map((i) => (
                <li
                  key={i.produtoId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-[#1C1A15]">
                    {i.quantidade}× {i.produto}{' '}
                    <span className="text-[#8A8171]">
                      · {formatarBRL(i.preco)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold text-[#4A4436]">
                      {formatarBRL(i.quantidade * i.preco)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${i.produto}`}
                      onClick={() => removerItem(i.produtoId)}
                      className="rounded px-1.5 text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-3 py-2 text-center text-xs text-[#A99E85]">
              Nenhum produto neste fechamento.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="sm:w-56">
              <label className={rotulo} htmlFor="pag-desconto-produtos">
                Desconto nos produtos (R$)
              </label>
              <input
                id="pag-desconto-produtos"
                className={campo}
                inputMode="decimal"
                placeholder="0"
                value={descontoProdutosTexto}
                onChange={(e) => setDescontoProdutosTexto(e.target.value)}
              />
            </div>
            <p className="text-sm text-[#4A4436]">
              Produtos{' '}
              <span className="font-semibold text-[#1C1A15]">
                {formatarBRL(totalProdutos)}
              </span>
              {descontoProdutosAplicado !== 0 && (
                <span className="ml-2 font-semibold text-[#6B8E5A]">
                  − {formatarBRL(descontoProdutosAplicado)}
                </span>
              )}
            </p>
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
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
          >
            Receber {formatarBRL(total)}
          </button>
        </div>
      </div>
    </div>
  )
}
