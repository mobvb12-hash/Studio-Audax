import { useEffect, useState } from 'react'
import { useServicos } from '@/modules/servicos/store'
import type { Servico } from '@/modules/servicos/types'

type Props = {
  servico?: Servico | null
  onFechar: () => void
  /** Chamado quando o nome muda, para propagar aos módulos (Agenda/Caixa) */
  aoRenomear?: (antigo: string, novo: string) => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function ServicoFormModal({
  servico,
  onFechar,
  aoRenomear,
}: Props) {
  const { adicionar, atualizar } = useServicos()
  const [nome, setNome] = useState(() => servico?.nome ?? '')
  const [preco, setPreco] = useState(() =>
    servico ? String(servico.preco).replace('.', ',') : '',
  )
  const [duracao, setDuracao] = useState(() =>
    servico ? String(servico.duracaoMin) : '',
  )
  const [erro, setErro] = useState('')

  const editando = Boolean(servico)

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  function salvar() {
    if (nome.trim().length < 2) {
      setErro('Informe o nome do serviço.')
      return
    }
    const precoNum = Number(preco.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      setErro('Informe um preço válido (ex.: 70 ou 70,00).')
      return
    }
    const duracaoNum = Number(duracao)
    if (!Number.isInteger(duracaoNum) || duracaoNum < 5) {
      setErro('Informe a duração em minutos (mínimo 5).')
      return
    }
    const dados = { nome, preco: precoNum, duracaoMin: duracaoNum }
    try {
      if (servico) {
        const antigo = servico.nome
        const destino = nome.trim()
        atualizar(servico.id, dados)
        if (antigo !== destino) aoRenomear?.(antigo, destino)
      } else {
        adicionar(dados)
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
            <h2 className="text-lg font-bold text-[#1C1A15]">
              {editando ? 'Editar serviço' : 'Novo serviço'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Preço e duração alimentam a Agenda automaticamente.
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
            {editando ? 'Salvar alterações' : 'Cadastrar serviço'}
          </button>
        </div>
      </div>
    </div>
  )
}
