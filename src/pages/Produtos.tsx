import { useEffect, useMemo, useState } from 'react'
import AjusteEstoqueModal from '@/components/AjusteEstoqueModal'
import EntradaEstoqueModal from '@/components/EntradaEstoqueModal'
import ProdutoFormModal from '@/components/ProdutoFormModal'
import { chipClasse } from '@/lib/apresentacao'
import { useCaixaOpcional } from '@/modules/caixa/store'
import { useEstoque } from '@/modules/estoque/store'
import { resumirEstoque } from '@/modules/estoque/indicadores'
import type { TipoMovimentacao } from '@/modules/estoque/types'
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import ListaProdutos, {
  type FiltroStatus,
} from '@/modules/produtos/components/ListaProdutos'
import MovimentacoesEstoque, {
  type FiltroPeriodo,
} from '@/modules/produtos/components/MovimentacoesEstoque'
import { formatarBRL } from '@/lib/moeda'

type Aba = 'produtos' | 'movimentacoes'

function lerFiltroInicial(): FiltroStatus {
  // Leitura pura — o consumo da chave acontece num useEffect (o initializer
  // do useState não pode ter efeito colateral: roda mais de uma vez no StrictMode).
  try {
    const valor = sessionStorage.getItem('studio-audax:estoque:filtro')
    return valor === 'baixo' ? 'baixo' : 'todos'
  } catch {
    return 'todos'
  }
}

function CardIndicador({
  valor,
  rotulo,
  cor = 'text-[#1C1A15]',
}: {
  valor: string
  rotulo: string
  cor?: string
}) {
  return (
    <div className="rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] px-3 py-3">
      <p className={`text-xl leading-none font-bold ${cor}`}>{valor}</p>
      <p className="mt-1.5 text-[11px] font-semibold tracking-[0.1em] text-[#8A8171] uppercase">
        {rotulo}
      </p>
    </div>
  )
}

export default function Produtos() {
  const { produtos, alternarAtivo } = useProdutos()
  const { movimentacoes, renomearProduto: renomearNoEstoque } = useEstoque()
  const { renomearProduto: renomearNoCaixa } = useCaixaOpcional()

  const [aba, setAba] = useState<Aba>('produtos')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>(lerFiltroInicial)
  // Deep-link do relatório: a chave é consumida uma única vez após a
  // montagem (o initializer do useState roda mais de uma vez no StrictMode
  // e não pode ter efeito colateral).
  useEffect(() => {
    sessionStorage.removeItem('studio-audax:estoque:filtro')
  }, [])
  const [modalProduto, setModalProduto] = useState<
    { modo: 'novo' } | { modo: 'editar'; produto: Produto } | null
  >(null)
  const [entradaProduto, setEntradaProduto] = useState<string | undefined>()
  const [ajusteProduto, setAjusteProduto] = useState<string | undefined>()
  const [entradaAberta, setEntradaAberta] = useState(false)
  const [ajusteAberto, setAjusteAberto] = useState(false)

  const [fPeriodo, setFPeriodo] = useState<FiltroPeriodo>('tudo')
  const [fProduto, setFProduto] = useState('')
  const [fTipo, setFTipo] = useState<TipoMovimentacao | ''>('')

  const resumo = useMemo(() => resumirEstoque(produtos), [produtos])

  function abrirEntrada(produtoId?: string) {
    setEntradaProduto(produtoId)
    setEntradaAberta(true)
  }

  function abrirAjuste(produtoId?: string) {
    setAjusteProduto(produtoId)
    setAjusteAberto(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Produtos
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {movimentacoes.length} movimentação(ões) de estoque · histórico
            completo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={chipClasse(aba === 'produtos')}
            onClick={() => setAba('produtos')}
          >
            Produtos
          </button>
          <button
            type="button"
            className={chipClasse(aba === 'movimentacoes')}
            onClick={() => setAba('movimentacoes')}
          >
            Movimentações
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CardIndicador
          valor={String(resumo.total)}
          rotulo="Total de produtos"
        />
        <CardIndicador
          valor={String(resumo.ativos)}
          rotulo="Produtos ativos"
        />
        <CardIndicador
          valor={String(resumo.inativos)}
          rotulo="Produtos inativos"
        />
        <CardIndicador
          valor={String(resumo.unidades)}
          rotulo="Unidades em estoque"
        />
        <CardIndicador
          valor={String(resumo.estoqueBaixo)}
          rotulo="Produtos com estoque baixo"
          cor={resumo.estoqueBaixo > 0 ? 'text-amber-700' : undefined}
        />
        <CardIndicador
          valor={String(resumo.semEstoque)}
          rotulo="Produtos sem estoque"
          cor={resumo.semEstoque > 0 ? 'text-red-600' : undefined}
        />
        <CardIndicador
          valor={formatarBRL(resumo.valorEstimado)}
          rotulo="Valor estimado do estoque"
          cor="text-[#8A6A14]"
        />
      </div>

      {aba === 'produtos' && (
        <ListaProdutos
          produtos={produtos}
          filtroStatus={filtroStatus}
          aoMudarFiltro={setFiltroStatus}
          aoNovo={() => setModalProduto({ modo: 'novo' })}
          aoEditar={(produto) => setModalProduto({ modo: 'editar', produto })}
          aoEntrada={abrirEntrada}
          aoAlternar={alternarAtivo}
        />
      )}

      {aba === 'movimentacoes' && (
        <MovimentacoesEstoque
          movimentacoes={movimentacoes}
          produtos={produtos}
          periodo={fPeriodo}
          produtoId={fProduto}
          tipo={fTipo}
          aoMudarPeriodo={setFPeriodo}
          aoMudarProduto={setFProduto}
          aoMudarTipo={setFTipo}
          aoEntrada={() => abrirEntrada()}
          aoAjuste={() => abrirAjuste()}
        />
      )}

      {modalProduto && (
        <ProdutoFormModal
          produto={modalProduto.modo === 'editar' ? modalProduto.produto : null}
          aoRenomear={(antigo, novo) => {
            renomearNoCaixa(antigo, novo)
            if (modalProduto.modo === 'editar') {
              renomearNoEstoque(modalProduto.produto.id, novo)
            }
          }}
          onFechar={() => setModalProduto(null)}
        />
      )}
      {entradaAberta && (
        <EntradaEstoqueModal
          produtoId={entradaProduto}
          onFechar={() => setEntradaAberta(false)}
        />
      )}
      {ajusteAberto && (
        <AjusteEstoqueModal
          produtoId={ajusteProduto}
          onFechar={() => setAjusteAberto(false)}
        />
      )}
    </div>
  )
}
