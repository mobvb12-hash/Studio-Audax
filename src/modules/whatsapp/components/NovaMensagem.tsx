import type { Cliente } from '@/modules/clientes/types'
import {
  TEMPLATES_CENTRAL,
  TEMPLATES_ROTULO,
  type IdTemplate,
} from '@/modules/whatsapp/types'

type Props = {
  clientes: Cliente[]
  clienteId: string
  aoCliente: (clienteId: string) => void
  template: IdTemplate
  aoTemplate: (template: IdTemplate) => void
  aoCriar: () => void
  erro: string
  aviso: string
}

/** Formulário de preparo de nova mensagem com templates oficiais. */
export default function NovaMensagem({
  clientes,
  clienteId,
  aoCliente,
  template,
  aoTemplate,
  aoCriar,
  erro,
  aviso,
}: Props) {
  return (
    <div className="mt-5 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
      <h2 className="text-sm font-bold text-[#121110]">Nova mensagem</h2>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-[12px] font-medium text-[#3A352C]">
          Cliente
          <select
            value={clienteId}
            onChange={(e) => aoCliente(e.target.value)}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#121110] outline-none focus:border-[#8A6A14]"
          >
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-[12px] font-medium text-[#3A352C]">
          Modelo
          <select
            value={template}
            onChange={(e) => aoTemplate(e.target.value as IdTemplate)}
            className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#121110] outline-none focus:border-[#8A6A14]"
          >
            {TEMPLATES_CENTRAL.map((id) => (
              <option key={id} value={id}>
                {TEMPLATES_ROTULO[id]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={aoCriar}
          className="rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] hover:bg-[#A8842C]"
        >
          Criar mensagem pendente
        </button>
      </div>
      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mt-3 rounded-lg bg-[#E9F5E4] px-3 py-2 text-[13px] text-[#3F6B33]">
          {aviso}
        </p>
      )}
    </div>
  )
}
