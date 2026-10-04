import { CAMPO_FORM as campo, ROTULO_FORM as rotulo } from '@/lib/apresentacao'
import { parseMoeda } from '@/lib/moeda'
import { useEffect, useState } from 'react'
import { CATEGORIAS_SUGERIDAS } from '@/modules/servicos/regras'
import { useServicos } from '@/modules/servicos/store'
import type { Servico } from '@/modules/servicos/types'

type Props = {
  servico?: Servico | null
  onFechar: () => void
  /** Chamado quando o nome muda, para propagar aos módulos (Agenda/Caixa) */
  aoRenomear?: (antigo: string, novo: string) => void
}

export default function ServicoFormModal({
  servico,
  onFechar,
  aoRenomear,
}: Props) {
  const { adicionar, atualizar, servicos } = useServicos()
  const [nome, setNome] = useState(() => servico?.nome ?? '')
  const [preco, setPreco] = useState(() =>
    servico ? String(servico.preco).replace('.', ',') : '',
  )
  const [duracao, setDuracao] = useState(() =>
    servico ? String(servico.duracaoMin) : '',
  )
  const [categoria, setCategoria] = useState(() => servico?.categoria ?? '')
  const [complementos, setComplementos] = useState<string[]>(
    () => servico?.complementos ?? [],
  )
  const [erro, setErro] = useState('')

  const editando = Boolean(servico)
  // Candidatos a complemento: outros serviços ativos (nunca ele mesmo).
  const candidatos = servicos.filter(
    (s) => s.ativo && s.id !== servico?.id,
  )

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function alternarComplemento(id: string) {
    setComplementos((atual) =>
      atual.includes(id)
        ? atual.filter((item) => item !== id)
        : [...atual, id],
    )
  }

  async function salvar() {
    if (nome.trim().length < 2) {
      setErro('Informe o nome do serviço.')
      return
    }
    const precoNum = parseMoeda(preco)
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      setErro('Informe um preço válido (ex.: 70 ou 70,00).')
      return
    }
    const duracaoNum = Number(duracao)
    if (!Number.isInteger(duracaoNum) || duracaoNum < 5) {
      setErro('Informe a duração em minutos (mínimo 5).')
      return
    }
    if (categoria.trim().length > 40) {
      setErro('Categoria muito longa (máximo 40 caracteres).')
      return
    }
    const dados = {
      nome,
      preco: precoNum,
      duracaoMin: duracaoNum,
      categoria,
      complementos: complementos.filter((id) =>
        candidatos.some((s) => s.id === id),
      ),
    }
    try {
      if (servico) {
        const antigo = servico.nome
        const destino = nome.trim()
        await atualizar(servico.id, dados)
        if (antigo !== destino) aoRenomear?.(antigo, destino)
      } else {
        await adicionar(dados)
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
        className="w-full max-w-lg rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#121110]">
              {editando ? 'Editar serviço' : 'Novo serviço'}
            </h2>
            <p className="mt-1 text-[13px] text-[#7C7469]">
              Preço e duração alimentam a Agenda automaticamente.
            </p>
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

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="srv-nome">
              Nome *
            </label>
            <input
              id="srv-nome"
              className={campo}
              placeholder="Ex.: Corte Degradê"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="srv-preco">
              Preço (R$) *
            </label>
            <input
              id="srv-preco"
              className={campo}
              inputMode="decimal"
              placeholder="Ex.: 70,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="srv-duracao">
              Duração (min) *
            </label>
            <input
              id="srv-duracao"
              className={campo}
              inputMode="numeric"
              placeholder="Ex.: 40"
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="srv-categoria">
              Categoria
            </label>
            <input
              id="srv-categoria"
              className={campo}
              list="srv-lista-categorias"
              placeholder="Ex.: Cabelo, Barba (opcional)"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
            <datalist id="srv-lista-categorias">
              {CATEGORIAS_SUGERIDAS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>

        {candidatos.length > 0 && (
          <div className="mt-4">
            <p className={rotulo}>Sugerir como complemento</p>
            <p className="mb-2 text-xs text-[#7C7469]">
              Ao agendar este serviço, o cliente poderá somar os itens
              marcados — com preço e duração do próprio catálogo.
            </p>
            <div className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-lg border border-[#E5DCC3] bg-white p-2">
              {candidatos.map((s) => {
                const marcado = complementos.includes(s.id)
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm ${
                      marcado ? 'bg-[#FAF6EB]' : 'hover:bg-[#F3ECDA]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarComplemento(s.id)}
                      className="h-4 w-4 accent-[#8A6A14]"
                    />
                    <span className="flex-1 text-[#121110]">{s.nome}</span>
                    <span className="text-xs text-[#7C7469]">
                      {s.duracaoMin} min
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

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
            {editando ? 'Salvar alterações' : 'Cadastrar serviço'}
          </button>
        </div>
      </div>
    </div>
  )
}
