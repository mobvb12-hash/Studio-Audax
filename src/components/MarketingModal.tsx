import { useMemo, useState } from 'react'
import { useAgenda } from '@/modules/agenda/store'
import { useCaixa } from '@/modules/caixa/store'
import { useClientes } from '@/modules/clientes/store'
import { montarPublicos } from '@/modules/marketing/regras'
import { useMarketing } from '@/modules/marketing/store'
import {
  PUBLICOS_ORDEM,
  PUBLICOS_ROTULO,
  type PublicoId,
} from '@/modules/marketing/types'

type Props = {
  onFechar: () => void
}

const CLASSE_ENTRADA =
  'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]'

/** Marketing e campanhas — públicos derivados + listas de público salvas. */
export default function MarketingModal({ onFechar }: Props) {
  const { clientes } = useClientes()
  const { agendamentos } = useAgenda()
  const { lancamentos } = useCaixa()
  const { listas, criarLista, removerLista } = useMarketing()

  const [nome, setNome] = useState('')
  const [publico, setPublico] = useState<PublicoId>('inativos')
  const [erro, setErro] = useState('')

  const publicos = useMemo(
    () => montarPublicos(clientes, agendamentos, lancamentos),
    [clientes, agendamentos, lancamentos],
  )

  function criar() {
    setErro('')
    try {
      criarLista({ nome, publico })
      setNome('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onFechar}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1C1A15]">
              Marketing e campanhas
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Públicos calculados dos dados reais — nada é copiado e nenhum
              envio acontece automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-md border border-[#E5DCC3] bg-white px-2 py-1 text-lg text-[#8A8171] hover:bg-[#F3ECDA]"
          >
            ×
          </button>
        </div>

        {/* Públicos atuais */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {publicos.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#1C1A15]">{p.rotulo}</p>
                <span className="rounded-full border border-[#F3ECDA] bg-[#F3ECDA] px-2.5 py-0.5 text-xs font-semibold text-[#8A6A14]">
                  {p.clientes.length} cliente(s)
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[#8A8171]">{p.descricao}</p>
            </div>
          ))}
        </div>

        {/* Criar lista */}
        <div className="mt-5 border-t border-[#E5DCC3] pt-4">
          <h3 className="text-sm font-bold text-[#1C1A15]">
            Criar lista de público
          </h3>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="mk-nome">
              Nome da lista
            </label>
            <input
              id="mk-nome"
              className={`flex-1 ${CLASSE_ENTRADA}`}
              placeholder="Ex.: Reativação setembro"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <label className="sr-only" htmlFor="mk-publico">
              Público
            </label>
            <select
              id="mk-publico"
              className={CLASSE_ENTRADA}
              value={publico}
              onChange={(e) => setPublico(e.target.value as PublicoId)}
            >
              {PUBLICOS_ORDEM.map((id) => (
                <option key={id} value={id}>
                  {PUBLICOS_ROTULO[id]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={criar}
              className="h-fit rounded-lg bg-[#8A6A14] px-3 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
            >
              Criar lista
            </button>
          </div>
          {erro && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {erro}
            </p>
          )}
        </div>

        {/* Listas salvas */}
        <div className="mt-4 border-t border-[#E5DCC3] pt-4">
          <h3 className="text-sm font-bold text-[#1C1A15]">
            Listas de público
          </h3>
          {listas.length === 0 ? (
            <p className="mt-2 text-sm text-[#A99E85]">
              Nenhuma lista criada. Use o formulário acima — os membros são
              calculados ao vivo a partir do público escolhido.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {listas.map((lista) => {
                const membros =
                  publicos.find((p) => p.id === lista.publico)?.clientes ?? []
                return (
                  <li
                    key={lista.id}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-[#1C1A15]">
                          {lista.nome}
                        </p>
                        <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2 py-0.5 text-[11px] font-semibold text-[#8A6A14]">
                          {PUBLICOS_ROTULO[lista.publico]}
                        </span>
                        <span className="text-[12px] text-[#8A8171]">
                          {membros.length} cliente(s)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removerLista(lista.id)}
                        className="rounded-lg border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436] hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        Remover
                      </button>
                    </div>
                    {membros.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {membros.slice(0, 8).map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full border border-[#E5DCC3] bg-[#FDFBF3] px-2 py-0.5 text-[11px] text-[#4A4436]"
                          >
                            {c.nome}
                          </span>
                        ))}
                        {membros.length > 8 && (
                          <span className="text-[11px] text-[#8A8171]">
                            + {membros.length - 8} cliente(s)
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
