import { useRef, useState } from 'react'
import { hojeISO } from '@/modules/agenda/catalogo'
import HistoricoVendas from '@/modules/caixa/components/HistoricoVendas'
import ResumoPagamento from '@/modules/caixa/components/ResumoPagamento'
import SelecaoCarrinho, {
  type ItemCarrinho,
} from '@/modules/caixa/components/SelecaoCarrinho'
import { useCaixa } from '@/modules/caixa/store'
import { type FormaPagamento } from '@/modules/caixa/types'
import { useClientes } from '@/modules/clientes/store'
import { useComissoes } from '@/modules/comissoes/store'
import {
  assinaturaVigente,
  valorDescontoAssinante,
} from '@/modules/clube/regras'
import { useClube } from '@/modules/clube/store'
import { useEstoque } from '@/modules/estoque/store'
import { validarQuantidadeEstoque } from '@/modules/estoque/validacao'
import { useProdutos } from '@/modules/produtos/store'
import { useProfissionais } from '@/modules/profissionais/store'
import { formatarBRL, parseMoeda } from '@/lib/moeda'
import { chipClasse } from '@/lib/apresentacao'

type AbaPdv = 'venda' | 'historico'

export default function PDV() {
  const { lancamentos, registrarVenda, desfazerLancamento, diaFechado } =
    useCaixa()
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
    // Validação contra o estoque atual (nunca negativo, nunca acima do disponível)
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
    let vendaId = ''
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
        // §5.3 — produção casa por id quando o cadastro existe
        profissionalId:
          profissionais.find((p) => p.nome === profissional)?.id,
      })
      vendaId = venda.id
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
      // A baixa de estoque falhou depois da gravação no caixa: desfaz a
      // receita recém-criada para não deixar venda sem baixa (e o retry
      // não duplica). O carrinho fica intacto para nova tentativa.
      if (vendaId) desfazerLancamento(vendaId)
      setErro(e instanceof Error ? e.message : 'Não foi possível finalizar a venda.')
    } finally {
      finalizandoRef.current = false
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#121110]">
            PDV
          </h1>
          <p className="mt-2 text-[13px] text-[#3A352C]">
            Venda rápida de produtos no balcão · entra no Caixa do dia
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={chipClasse(aba === 'venda')}
            onClick={() => setAba('venda')}
          >
            Nova venda
          </button>
          <button
            type="button"
            className={chipClasse(aba === 'historico')}
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
            <SelecaoCarrinho
              produtos={produtosVendaveis}
              produtoSel={produtoSel}
              aoProduto={setProdutoSel}
              qtdTexto={qtdTexto}
              aoQtd={setQtdTexto}
              carrinho={carrinho}
              aoAdicionar={adicionarAoCarrinho}
              aoDefinirQuantidade={definirQuantidade}
              aoAlterarQuantidade={alterarQuantidade}
              aoRemover={removerItem}
            />
            <ResumoPagamento
              subtotal={subtotal}
              descontoAssinante={descontoAssinante}
              descontoTexto={descontoTexto}
              aoDesconto={(texto) => {
                setDescontoTexto(texto)
                setSucesso('')
              }}
              total={total}
              clientes={clientes}
              clienteId={clienteId}
              aoCliente={setClienteId}
              assinatura={assinatura}
              assinanteVigente={assinanteVigente}
              hoje={hoje}
              profissionais={profissionaisAtivos}
              profissional={profissional}
              aoProfissional={setProfissional}
              forma={forma}
              aoForma={setForma}
              erro={erro}
              sucesso={sucesso}
              caixaFechado={caixaFechado}
              temItens={carrinho.length > 0}
              aoFinalizar={finalizar}
            />
          </div>
        </>
      )}

      {aba === 'historico' && <HistoricoVendas vendas={vendas} />}
    </div>
  )
}
