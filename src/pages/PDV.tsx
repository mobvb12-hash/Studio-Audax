import { useRef, useState } from 'react'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useCaixa } from '@/modules/caixa/store'
import {
  FORMAS_PAGAMENTO,
  FORMAS_ROTULO,
  type FormaPagamento,
} from '@/modules/caixa/types'
import { useClientes } from '@/modules/clientes/store'
import { useComissoes } from '@/modules/comissoes/store'
import {
  assinaturaVigente,
  statusAssinatura,
  STATUS_ROTULO,
  valorDescontoAssinante,
} from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import { useEstoque } from '@/modules/estoque/store'
import { useProdutos } from '@/modules/produtos/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { formatarBRL, parseMoeda } from '@/lib/moeda'

type AbaPdv = 'venda' | 'historico'

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

function abaClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

export default function PDV() {
  const { lancamentos, registrarVenda, diaFechado } = useCaixa()
  const { produtos } = useProdutos()
  const { saidaPorVenda } = useEstoque()
  const { clientes } = useClientes()
  const { profissionais } = useProfissionais()
  const { configDe } = useComissoes()
  const { assinaturaDoCliente } = useClube()

  const [aba, setAba] = useState<AbaPdv>('venda')
  const [produtoSel, setProdutoSel] = useState('')
  const [qtdTexto, setQtdTexto] = useState('1')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [descontoTexto, setDescontoTexto] = useState('0')
  const [clienteId, setClienteId] = useState('')
  const [profissional, setProfissional] = useState('')
  const [forma, setForma] = useState<FormaPagamento | ''>('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const finalizandoRef = useRef(false)

  const hoje = hojeISO()
  const caixaFechado = diaFechado(hoje)
  // PDV só vende o que existe: ativo e com estoque
  const produtosVendaveis = produtos.filter((p) => p.ativo && p.estoque > 0)
  // Profissional precisa estar ativo no cadastro E na configuração de comissão
  const profissionaisAtivos = profissionais.filter(
    (p) => p.ativo && configDe(p.id).ativo,
  )

  const subtotal = carrinho.reduce(
    (soma, i) => soma + i.quantidade * i.preco,
    0,
  )
  // Assinante vigente do Audax Club: 10% automáticos sobre o subtotal
  const assinatura = clienteId ? assinaturaDoCliente(clienteId) : undefined
  const assinanteVigente = Boolean(
    assinatura && assinaturaVigente(assinatura, hoje),
  )
  const descontoAssinante = valorDescontoAssinante(subtotal, assinanteVigente)
  const descontoNum = parseMoeda(descontoTexto) || 0
  const limiteDesconto = Math.max(0, subtotal - descontoAssinante)
  const descontoValido =
    Number.isFinite(descontoNum) && descontoNum >= 0 && descontoNum <= limiteDesconto
  const total = Math.max(
    0,
    Math.round((subtotal - descontoAssinante - descontoNum) * 100) / 100,
  )

  const vendas = lancamentos
    .filter((l) => l.origem === 'produto')
    .sort((a, b) => `${b.data} ${b.hora}`.localeCompare(`${a.data} ${a.hora}`))

  function adicionarAoCarrinho() {
    setSucesso('')
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
    // Validação contra o estoque atual (nunca negativo, nunca acima do disponível)
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
    setErro('')
    setQtdTexto('1')
  }

  function definirQuantidade(produtoId: string, texto: string) {
    const q = Number(texto)
    if (!Number.isInteger(q) || q < 1) {
      setErro('Quantidade deve ser um número inteiro maior que zero.')
      return
    }
    const item = carrinho.find((i) => i.produtoId === produtoId)
    if (item && q > item.estoque) {
      setErro(
        `Estoque insuficiente para "${item.produto}": disponível ${item.estoque}, solicitado ${q}.`,
      )
      return
    }
    setCarrinho((atual) =>
      atual.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: q } : i)),
    )
    setErro('')
  }

  function alterarQuantidade(produtoId: string, delta: number) {
    const item = carrinho.find((i) => i.produtoId === produtoId)
    if (!item) return
    definirQuantidade(produtoId, String(item.quantidade + delta))
  }

  function removerItem(produtoId: string) {
    setCarrinho((atual) => atual.filter((i) => i.produtoId !== produtoId))
    setErro('')
  }

  function finalizar() {
    if (finalizandoRef.current) return
    setSucesso('')
    if (carrinho.length === 0) {
      setErro('Adicione pelo menos um produto ao carrinho.')
      return
    }
    if (!descontoValido) {
      setErro(
        descontoNum < 0
          ? 'Desconto inválido.'
          : 'O desconto não pode ser maior que o total da venda.',
      )
      return
    }
    if (!forma) {
      setErro('Selecione a forma de pagamento.')
      return
    }
    if (caixaFechado) {
      setErro('O caixa de hoje está fechado. Reabra o caixa para registrar vendas.')
      return
    }
    // Validação de estoque de TODOS os itens — atômico, antes de qualquer efeito
    for (const item of carrinho) {
      const prod = produtos.find((p) => p.id === item.produtoId)
      if (!prod) {
        setErro(`Produto "${item.produto}" não encontrado.`)
        return
      }
      if (prod.estoque < item.quantidade) {
        setErro(
          `Estoque insuficiente para "${prod.nome}": disponível ${prod.estoque}, solicitado ${item.quantidade}. Nenhuma venda foi registrada.`,
        )
        return
      }
    }
    const cliente = clientes.find((c) => c.id === clienteId)
    const descontoTotal = Math.round((descontoAssinante + descontoNum) * 100) / 100
    finalizandoRef.current = true
    try {
      const venda = registrarVenda({
        data: hoje,
        itens: carrinho.map((i) => ({
          produtoId: i.produtoId,
          produto: i.produto,
          quantidade: i.quantidade,
          preco: i.preco,
        })),
        desconto: descontoTotal,
        formaPagamento: forma,
        cliente: cliente?.nome,
        clienteId: cliente?.id,
        profissional: profissional || undefined,
      })
      // Baixa automática de estoque — uma movimentação por produto da venda
      saidaPorVenda(venda.id, venda.data, venda.itens ?? [])
      setCarrinho([])
      setDescontoTexto('0')
      setClienteId('')
      setProfissional('')
      setForma('')
      setProdutoSel('')
      setQtdTexto('1')
      setErro('')
      setSucesso(
        `Venda de ${formatarBRL(venda.valorLiquido)} registrada no caixa e estoque baixado.`,
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível finalizar a venda.')
    } finally {
      finalizandoRef.current = false
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            PDV
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            Venda rápida de produtos no balcão · entra no Caixa do dia
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={abaClasse(aba === 'venda')}
            onClick={() => setAba('venda')}
          >
            Nova venda
          </button>
          <button
            type="button"
            className={abaClasse(aba === 'historico')}
            onClick={() => setAba('historico')}
          >
            Histórico de vendas
          </button>
        </div>
      </div>

      {aba === 'venda' && (
        <>
          {caixaFechado && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              Caixa fechado — não é possível finalizar vendas. Reabra o caixa
              (com motivo) para registrar.
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Seleção de produto + carrinho */}
            <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
              <h2 className="text-[15px] font-bold text-[#1C1A15]">
                Produtos
              </h2>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className={rotulo} htmlFor="pdv-produto">
                    Produto *
                  </label>
                  <select
                    id="pdv-produto"
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
                  <label className={rotulo} htmlFor="pdv-qtd">
                    Quantidade *
                  </label>
                  <input
                    id="pdv-qtd"
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
                  Adicionar ao carrinho
                </button>
              </div>

              <h3 className="mt-5 text-[13px] font-bold text-[#1C1A15]">
                Carrinho
              </h3>
              {carrinho.length === 0 ? (
                <div className="mt-2 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
                  Carrinho vazio.
                </div>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                        <th className="px-2 py-2 font-semibold">Produto</th>
                        <th className="px-2 py-2 text-right font-semibold">
                          Qtd
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">
                          Estoque
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">
                          Unitário
                        </th>
                        <th className="px-2 py-2 text-right font-semibold">
                          Total
                        </th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFE7D3]">
                      {carrinho.map((i) => (
                        <tr key={i.produtoId}>
                          <td className="px-2 py-2 font-medium text-[#1C1A15]">
                            {i.produto}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                aria-label={`Diminuir ${i.produto}`}
                                onClick={() => alterarQuantidade(i.produtoId, -1)}
                                className="h-6 w-6 rounded border border-[#E5DCC3] bg-white text-[#4A4436] hover:bg-[#F3ECDA]"
                              >
                                −
                              </button>
                              <input
                                aria-label={`Quantidade de ${i.produto}`}
                                className="w-12 rounded border border-[#E5DCC3] bg-white px-1 py-0.5 text-right text-sm outline-none focus:border-[#8A6A14]"
                                inputMode="numeric"
                                value={i.quantidade}
                                onChange={(e) =>
                                  definirQuantidade(i.produtoId, e.target.value)
                                }
                              />
                              <button
                                type="button"
                                aria-label={`Aumentar ${i.produto}`}
                                onClick={() => alterarQuantidade(i.produtoId, 1)}
                                className="h-6 w-6 rounded border border-[#E5DCC3] bg-white text-[#4A4436] hover:bg-[#F3ECDA]"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-[#8A8171]">
                            {i.estoque}
                          </td>
                          <td className="px-2 py-2 text-right text-[#4A4436]">
                            {formatarBRL(i.preco)}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold text-[#1C1A15]">
                            {formatarBRL(i.quantidade * i.preco)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              aria-label={`Remover ${i.produto}`}
                              onClick={() => removerItem(i.produtoId)}
                              className="rounded px-1.5 text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Resumo e pagamento */}
            <section className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
              <h2 className="text-[15px] font-bold text-[#1C1A15]">
                Pagamento
              </h2>

              <div className="mt-4 divide-y divide-[#EFE7D3]">
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[#4A4436]">Subtotal</span>
                  <span className="font-semibold text-[#1C1A15]">
                    {formatarBRL(subtotal)}
                  </span>
                </div>
                {descontoAssinante > 0 && (
                  <div className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[#4A4436]">
                      Desconto assinante Audax Club (10%)
                    </span>
                    <span className="font-semibold text-[#6B8E5A]">
                      − {formatarBRL(descontoAssinante)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 py-2 text-sm">
                  <label className="text-[#4A4436]" htmlFor="pdv-desconto">
                    Desconto (R$)
                  </label>
                  <input
                    id="pdv-desconto"
                    className="w-28 rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-right text-sm outline-none focus:border-[#8A6A14]"
                    inputMode="decimal"
                    value={descontoTexto}
                    onChange={(e) => {
                      setDescontoTexto(e.target.value)
                      setSucesso('')
                    }}
                  />
                </div>
                <div className="flex items-center justify-between py-2 text-sm">
                  <span className="font-bold text-[#1C1A15]">
                    Total da venda
                  </span>
                  <span className="text-lg leading-none font-bold text-[#8A6A14]">
                    {formatarBRL(total)}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className={rotulo} htmlFor="pdv-cliente">
                    Cliente (opcional)
                  </label>
                  <select
                    id="pdv-cliente"
                    className={campo}
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                  >
                    <option value="">Sem cliente</option>
                    {clientes
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </select>
                  {assinatura && assinanteVigente && (
                    <p className="mt-1.5 text-xs font-medium text-[#3F6B33]">
                      ✓ Assinante {STATUS_ROTULO[statusAssinatura(assinatura, hoje)]}{' '}
                      — desconto de 10% aplicado.
                    </p>
                  )}
                  {assinatura && !assinanteVigente && (
                    <p className="mt-1.5 text-xs font-medium text-orange-700">
                      Assinatura {STATUS_ROTULO[statusAssinatura(assinatura, hoje)].toLowerCase()}{' '}
                      — sem desconto de assinante.
                    </p>
                  )}
                </div>
                <div>
                  <label className={rotulo} htmlFor="pdv-profissional">
                    Profissional (opcional)
                  </label>
                  <select
                    id="pdv-profissional"
                    className={campo}
                    value={profissional}
                    onChange={(e) => setProfissional(e.target.value)}
                  >
                    <option value="">— Venda na loja —</option>
                    {profissionaisAtivos.map((p) => (
                      <option key={p.id} value={p.nome}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo} htmlFor="pdv-forma">
                    Forma de pagamento *
                  </label>
                  <select
                    id="pdv-forma"
                    className={campo}
                    value={forma}
                    onChange={(e) =>
                      setForma(e.target.value as FormaPagamento | '')
                    }
                  >
                    <option value="">Selecione...</option>
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f} value={f}>
                        {FORMAS_ROTULO[f]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {erro && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
                  {erro}
                </p>
              )}
              {sucesso && (
                <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-700">
                  {sucesso}
                </p>
              )}

              <button
                type="button"
                onClick={finalizar}
                disabled={caixaFechado || carrinho.length === 0}
                className="mt-4 w-full rounded-lg bg-[#8A6A14] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#6F550F] disabled:cursor-not-allowed disabled:bg-[#C9BC94]"
              >
                Finalizar venda
              </button>
            </section>
          </div>
        </>
      )}

      {aba === 'historico' && (
        <section className="mt-4 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-5">
          <h2 className="text-[15px] font-bold text-[#1C1A15]">
            Histórico de vendas
          </h2>
          {vendas.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-8 text-center text-sm text-[#A99E85]">
              Nenhuma venda registrada.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E5DCC3] bg-[#FAF6EB] text-[11px] tracking-[0.1em] text-[#8A8171] uppercase">
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Cliente</th>
                    <th className="px-3 py-2 font-semibold">Profissional</th>
                    <th className="px-3 py-2 font-semibold">Produtos</th>
                    <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Subtotal
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Desconto
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Total
                    </th>
                    <th className="px-3 py-2 font-semibold">Pagamento</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFE7D3]">
                  {vendas.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 text-[#4A4436]">
                        {formatarDataLonga(v.data)} · {v.hora}
                      </td>
                      <td className="px-3 py-2 text-[#1C1A15]">
                        {v.cliente || '—'}
                      </td>
                      <td className="px-3 py-2 text-[#1C1A15]">
                        {v.profissional || '—'}
                      </td>
                      <td className="px-3 py-2 text-[#4A4436]">
                        {v.itens
                          ? v.itens
                              .map((i) => `${i.quantidade}× ${i.produto}`)
                              .join(', ')
                          : v.descricao}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {v.quantidade ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(v.valor)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#4A4436]">
                        {formatarBRL(v.desconto)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-[#1C1A15]">
                        {formatarBRL(v.valorLiquido)}
                      </td>
                      <td className="px-3 py-2 text-[#4A4436]">
                        {FORMAS_ROTULO[v.formaPagamento]}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            v.estornado
                              ? 'border-red-200 bg-red-50 text-red-600'
                              : 'border-[#BFE0B2] bg-[#E9F5E4] text-[#3F6B33]'
                          }`}
                        >
                          {v.estornado ? 'Estornado' : 'Concluída'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
