import { useEffect, useState } from 'react'
import { useEstoque } from '@/modules/estoque/store'
import { useProdutos } from '@/modules/produtos/store'
import type { Produto } from '@/modules/produtos/types'
import { parseMoeda } from '@/lib/moeda'

type Props = {
  produto?: Produto | null
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function ProdutoFormModal({ produto, onFechar }: Props) {
  const { adicionar, atualizar } = useProdutos()
  const { registrarInicial } = useEstoque()
  const editando = Boolean(produto)

  const [nome, setNome] = useState(() => produto?.nome ?? '')
  const [categoria, setCategoria] = useState(() => produto?.categoria ?? '')
  const [preco, setPreco] = useState(() =>
    produto ? String(produto.preco.toFixed(2)).replace('.', ',') : '',
  )
  const [custo, setCusto] = useState(() =>
    produto ? String(produto.custo.toFixed(2)).replace('.', ',') : '',
  )
  const [estoque, setEstoque] = useState(() =>
    produto ? String(produto.estoque) : '0',
  )
  const [minimo, setMinimo] = useState(() =>
    produto ? String(produto.estoqueMinimo) : '0',
  )
  const [foto, setFoto] = useState(() => produto?.foto ?? '')
  const [ativo, setAtivo] = useState(() => produto?.ativo ?? true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    try {
      const precoNum = parseMoeda(preco)
      const custoNum = custo.trim() === '' ? 0 : parseMoeda(custo)
      const minimoNum = minimo.trim() === '' ? 0 : Number(minimo.trim())
      if (editando && produto) {
        atualizar(produto.id, {
          nome,
          preco: precoNum,
          custo: custoNum,
          estoqueMinimo: minimoNum,
          categoria,
          foto,
          ativo,
        })
        onFechar()
        return
      }
      const estoqueNum = estoque.trim() === '' ? 0 : Number(estoque.trim())
      const novo = adicionar({
        nome,
        preco: precoNum,
        custo: custoNum,
        estoque: estoqueNum,
        estoqueMinimo: minimoNum,
        categoria,
        foto,
        ativo,
      })
      // Estoque inicial gera movimentação identificada — nunca só um número
      if (novo.estoque > 0) {
        registrarInicial(novo, novo.estoque)
      }
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">
              {editando ? 'Editar produto' : 'Novo produto'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              {editando
                ? 'O estoque atual é alterado por entradas e ajustes, com histórico.'
                : 'O estoque inicial gera a movimentação “Estoque inicial”.'}
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

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={rotulo} htmlFor="prd-nome">
              Nome *
            </label>
            <input
              id="prd-nome"
              className={campo}
              placeholder="Ex.: Pomada modeladora"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="prd-categoria">
              Categoria
            </label>
            <input
              id="prd-categoria"
              className={campo}
              placeholder="Ex.: Pomadas"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="prd-preco">
              Preço de venda (R$) *
            </label>
            <input
              id="prd-preco"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 30,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="prd-custo">
              Custo (R$)
            </label>
            <input
              id="prd-custo"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 12,00"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="prd-minimo">
              Estoque mínimo
            </label>
            <input
              id="prd-minimo"
              className={campo}
              inputMode="numeric"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className={rotulo} htmlFor="prd-estoque">
              {editando ? 'Estoque atual (somente leitura)' : 'Estoque inicial'}
            </label>
            <input
              id="prd-estoque"
              className={`${campo} ${editando ? 'bg-[#F3ECDA] text-[#8A8171]' : ''}`}
              inputMode="numeric"
              value={estoque}
              readOnly={editando}
              onChange={(e) => setEstoque(e.target.value)}
            />
            {editando && produto && (
              <p className="mt-1 text-[12px] text-[#8A8171]">
                Atual: {produto.estoque} unidade(s) · altere por entrada ou ajuste
              </p>
            )}
          </div>
          <div className="col-span-2">
            <label className={rotulo} htmlFor="prd-foto">
              Foto (URL, opcional)
            </label>
            <input
              id="prd-foto"
              className={campo}
              placeholder="https://..."
              value={foto}
              onChange={(e) => setFoto(e.target.value)}
            />
          </div>
          <label
            className="col-span-2 flex items-center gap-2 text-sm text-[#1C1A15]"
            htmlFor="prd-ativo"
          >
            <input
              id="prd-ativo"
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Produto ativo (aparece no PDV)
          </label>
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
            {editando ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
        </div>
      </div>
    </div>
  )
}
