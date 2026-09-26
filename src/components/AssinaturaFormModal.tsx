import { useEffect, useMemo, useState } from 'react'
import { formatarDataLonga, hojeISO } from '@/modules/agenda/catalogo'
import { useClientes } from '@/modules/clientes/store'
import { useClube } from '@/modules/clube/store'
import { addMonthsISO, dataISOValida } from '@/modules/clube/regras'
import {
  PLANOS_CLUBE,
  type AssinaturaClube,
  type PlanoClube,
} from '@/modules/clube/types'
import { parseMoeda } from '@/lib/moeda'

type Props = {
  onFechar: () => void
  /** Presente = modo edição (cliente, plano e mensalidade; datas não mudam) */
  assinatura?: AssinaturaClube | null
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

function valorTextoFormatado(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function AssinaturaFormModal({ onFechar, assinatura }: Props) {
  const { clientes } = useClientes()
  const { assinar, atualizar, podeAssinar } = useClube()
  const editando = Boolean(assinatura)

  const [clienteId, setClienteId] = useState(() => assinatura?.clienteId ?? '')
  const [plano, setPlano] = useState<PlanoClube | ''>(
    () => assinatura?.plano ?? '',
  )
  const [valorTexto, setValorTexto] = useState(() =>
    assinatura ? valorTextoFormatado(assinatura.valorMensal) : '',
  )
  const [data, setData] = useState(
    () => assinatura?.dataAssinatura ?? hojeISO(),
  )
  const [erro, setErro] = useState('')

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const disponiveis = useMemo(
    () =>
      clientes.filter(
        (c) =>
          // Em edição o próprio cliente permanece selecionável
          (editando && c.id === assinatura?.clienteId) ||
          (c.ativo && podeAssinar(c.id)),
      ),
    [clientes, podeAssinar, editando, assinatura],
  )

  const vencimentoPrevisto = editando
    ? assinatura!.proximoVencimento
    : dataISOValida(data)
      ? addMonthsISO(data, 1)
      : '—'

  function confirmar() {
    const cliente = clientes.find((c) => c.id === clienteId)
    if (!cliente) {
      setErro('Selecione o cliente.')
      return
    }
    if (!plano) {
      setErro('Selecione o plano.')
      return
    }
    try {
      if (editando && assinatura) {
        atualizar(assinatura.id, {
          clienteId: cliente.id,
          cliente: cliente.nome,
          plano,
          valorMensal: parseMoeda(valorTexto),
        })
      } else {
        assinar({
          clienteId: cliente.id,
          cliente: cliente.nome,
          plano,
          valorMensal: parseMoeda(valorTexto),
          dataAssinatura: data,
        })
      }
      onFechar()
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : editando
            ? 'Não foi possível salvar as alterações.'
            : 'Não foi possível criar a assinatura.',
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">
              {editando ? 'Editar assinatura' : 'Nova assinatura'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              {editando
                ? 'Audax Club · cliente, plano e mensalidade. Datas e histórico não mudam.'
                : 'Audax Club · assinante vigente ganha 10% de desconto em produtos no PDV.'}
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

        {disponiveis.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-6 text-center text-sm text-[#A99E85]">
            {clientes.some((c) => c.ativo)
              ? 'Todos os clientes já têm assinatura em andamento. Cancele uma assinatura existente para cadastrar outra.'
              : 'Nenhum cliente ativo disponível. Reative um cliente na página Clientes para criar uma assinatura.'}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={rotulo} htmlFor="ass-cliente">
                Cliente *
              </label>
              <select
                id="ass-cliente"
                className={campo}
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {disponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="ass-plano">
                Plano *
              </label>
              <select
                id="ass-plano"
                className={campo}
                value={plano}
                onChange={(e) => setPlano(e.target.value as PlanoClube | '')}
              >
                <option value="">Selecione...</option>
                {PLANOS_CLUBE.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="ass-valor">
                Mensalidade (R$) *
              </label>
              <input
                id="ass-valor"
                className={campo}
                inputMode="decimal"
                placeholder="Ex.: 89,90"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="ass-data">
                Data da assinatura *
              </label>
              <input
                id="ass-data"
                type={editando ? 'text' : 'date'}
                className={`${campo} ${editando ? 'bg-[#F3ECDA] text-[#8A8171]' : ''}`}
                value={
                  editando ? formatarDataLonga(assinatura!.dataAssinatura) : data
                }
                readOnly={editando}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="ass-vencimento">
                Próximo vencimento
              </label>
              <input
                id="ass-vencimento"
                className={campo}
                value={
                  vencimentoPrevisto === '—'
                    ? '—'
                    : formatarDataLonga(vencimentoPrevisto)
                }
                readOnly
              />
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
            className="rounded-lg border border-[#E5DCC3] bg-white px-4 py-2 text-sm font-medium text-[#4A4436] hover:bg-[#F3ECDA]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={disponiveis.length === 0}
            className="rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F] disabled:cursor-not-allowed disabled:bg-[#C9BC94]"
          >
            {editando ? 'Salvar alterações' : 'Criar assinatura'}
          </button>
        </div>
      </div>
    </div>
  )
}
