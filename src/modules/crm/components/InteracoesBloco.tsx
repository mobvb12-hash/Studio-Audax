import { useState } from 'react'
import { formatarISO } from '@/lib/apresentacao'
import { useCrm } from '@/modules/crm/store'
import {
  TIPOS_INTERACAO,
  TIPOS_INTERACAO_ROTULO,
  type Interacao,
} from '@/modules/crm/types'

/** Cadastro e lista de interações/notas do cliente. */
export default function InteracoesBloco({
  clienteId,
  interacoes,
}: {
  clienteId: string
  interacoes: Interacao[]
}) {
  const { adicionarInteracao } = useCrm()
  const [tipo, setTipo] = useState('nota')
  const [texto, setTexto] = useState('')
  const [erroNota, setErroNota] = useState('')

  function salvarNota() {
    setErroNota('')
    try {
      adicionarInteracao({
        clienteId,
        tipo: tipo as 'nota' | 'ligacao' | 'presencial',
        texto,
      })
      setTexto('')
    } catch (e) {
      setErroNota(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  return (
    <div className="mt-5 border-t border-[#E5DCC3] pt-4">
      <h3 className="text-sm font-bold text-[#121110]">
        Interações e notas
      </h3>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="crm-tipo">
          Tipo de interação
        </label>
        <select
          id="crm-tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
        >
          {TIPOS_INTERACAO.map((t) => (
            <option key={t} value={t}>
              {TIPOS_INTERACAO_ROTULO[t]}
            </option>
          ))}
        </select>
        <div className="flex-1">
          <label className="sr-only" htmlFor="crm-nota">
            Nova interação
          </label>
          <textarea
            id="crm-nota"
            rows={2}
            placeholder="Ex.: cliente pediu para lembrar por WhatsApp..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
          />
        </div>
        <button
          type="button"
          onClick={salvarNota}
          className="h-fit rounded-lg border border-[#8A6A14] bg-white px-3 py-2 text-sm font-medium text-[#8A6A14] hover:bg-[#F3ECDA]"
        >
          Salvar interação
        </button>
      </div>
      {erroNota && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {erroNota}
        </p>
      )}
      {interacoes.length === 0 ? (
        <p className="mt-3 text-sm text-[#A99E85]">
          Nenhuma interação registrada ainda.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {interacoes.map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2"
            >
              <p className="text-[11px] font-semibold text-[#8A6A14]">
                {TIPOS_INTERACAO_ROTULO[i.tipo]} · {formatarISO(i.criadoEm)}
              </p>
              <p className="mt-0.5 text-sm text-[#3A352C]">{i.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
