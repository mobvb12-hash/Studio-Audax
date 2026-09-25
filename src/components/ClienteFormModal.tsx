import { useEffect, useState } from 'react'
import { useClientes } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'

type Props = {
  aberto: boolean
  cliente?: Cliente | null
  onFechar: () => void
}

const campo =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

const rotulo =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

export default function ClienteFormModal({ aberto, cliente, onFechar }: Props) {
  const { adicionar, atualizar } = useClientes()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  const editando = Boolean(cliente)

  useEffect(() => {
    if (aberto) {
      setNome(cliente?.nome ?? '')
      setTelefone(cliente?.telefone ?? '')
      setEmail(cliente?.email ?? '')
      setObservacao(cliente?.observacao ?? '')
      setErro('')
    }
  }, [aberto, cliente])

  useEffect(() => {
    if (!aberto) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, onFechar])

  if (!aberto) return null

  function salvar() {
    if (nome.trim().length < 2) {
      setErro('Informe o nome do cliente.')
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('Informe um e-mail válido ou deixe em branco.')
      return
    }
    const dados = {
      nome,
      telefone,
      email,
      observacao,
    }
    if (cliente) atualizar(cliente.id, dados)
    else adicionar(dados)
    onFechar()
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
              {editando ? 'Editar cliente' : 'Novo cliente'}
            </h2>
            <p className="mt-1 text-[13px] text-[#8A8171]">
              Salvo neste navegador (localStorage) até o backend chegar.
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
            <label className={rotulo} htmlFor="cli-nome">
              Nome *
            </label>
            <input
              id="cli-nome"
              className={campo}
              placeholder="Ex.: Lucas Mendes"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="cli-tel">
              Telefone / WhatsApp
            </label>
            <input
              id="cli-tel"
              className={campo}
              placeholder="(11) 99999-9999"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="cli-email">
              E-mail
            </label>
            <input
              id="cli-email"
              type="email"
              className={campo}
              placeholder="cliente@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="cli-obs">
              Observação
            </label>
            <textarea
              id="cli-obs"
              className={`${campo} min-h-[64px] resize-y`}
              placeholder="Ex.: alergia a produtos com amônia..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
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
            {editando ? 'Salvar alterações' : 'Cadastrar cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
