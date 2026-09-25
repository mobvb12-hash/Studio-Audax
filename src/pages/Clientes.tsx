import { useMemo, useState } from 'react'
import ClienteDetalheModal from '@/components/ClienteDetalheModal'
import ClienteFormModal from '@/components/ClienteFormModal'
import { formatarDataLonga } from '@/modules/agenda/catalogo'
import { useAgenda } from '@/modules/agenda/store'
import { useClientes } from '@/modules/clientes/store'
import type { Cliente } from '@/modules/clientes/types'

function normalizar(texto: string): string {
  return texto.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export default function Clientes() {
  const { clientes, remover } = useClientes()
  const { agendamentos } = useAgenda()
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [historicoDo, setHistoricoDo] = useState<Cliente | null>(null)

  const historico = useMemo(() => {
    const mapa = new Map<string, { total: number; ultimo: string }>()
    for (const ag of agendamentos) {
      if (ag.status === 'cancelado') continue
      const chave = normalizar(ag.cliente)
      if (!chave) continue
      const atual = mapa.get(chave) ?? { total: 0, ultimo: '' }
      atual.total += 1
      if (ag.data > atual.ultimo) atual.ultimo = ag.data
      mapa.set(chave, atual)
    }
    return mapa
  }, [agendamentos])

  const filtrados = useMemo(() => {
    const termo = normalizar(busca)
    const digitos = busca.replace(/\D/g, '')
    return clientes.filter((cliente) => {
      if (termo && normalizar(cliente.nome).includes(termo)) return true
      if (digitos && cliente.telefone.replace(/\D/g, '').includes(digitos))
        return true
      return false
    })
  }, [clientes, busca])

  function abrirNovo() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(cliente: Cliente) {
    setEditando(cliente)
    setModalAberto(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#1C1A15]">
            Clientes
          </h1>
          <p className="mt-2 text-[13px] text-[#4A4436]">
            {clientes.length} cliente(s) cadastrado(s) ·{' '}
            {filtrados.length === clientes.length
              ? 'todos'
              : `${filtrados.length} na busca`}
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="shrink-0 rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F]"
        >
          + Novo cliente
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4">
        <label className="sr-only" htmlFor="cli-busca">
          Buscar cliente
        </label>
        <input
          id="cli-busca"
          className="w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm outline-none focus:border-[#8A6A14]"
          placeholder="Buscar por nome ou telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[#DCCFAF] bg-[#FAF6EB]/60 px-4 py-10 text-center text-sm text-[#A99E85]">
          {clientes.length === 0
            ? 'Nenhum cliente cadastrado. Clique em “Novo cliente” para começar.'
            : 'Nenhum cliente encontrado para esta busca.'}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtrados.map((cliente) => {
            const info = historico.get(normalizar(cliente.nome))
            return (
              <li
                key={cliente.id}
                className="flex flex-col gap-3 rounded-xl border border-[#E5DCC3] bg-[#FDFBF3] p-4 sm:flex-row sm:items-center"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3ECDA] text-sm font-bold text-[#8A6A14]">
                  {iniciais(cliente.nome)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#1C1A15]">
                    {cliente.nome}{' '}
                    {cliente.telefone && (
                      <span className="ml-1 font-normal text-[#8A8171]">
                        {cliente.telefone}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-[#4A4436]">
                    {cliente.email && `${cliente.email} · `}
                    {cliente.observacao || 'Sem observações'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <span className="rounded-full border border-[#E5DCC3] bg-white px-2.5 py-1 text-xs font-medium text-[#4A4436]">
                    {info?.total ?? 0} atendimento(s)
                  </span>
                  {info?.ultimo && (
                    <span className="rounded-full border border-[#E5DCC3] bg-[#F3ECDA] px-2.5 py-1 text-xs font-medium text-[#8A6A14]">
                      Último: {formatarDataLonga(info.ultimo)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHistoricoDo(cliente)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Histórico
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirEdicao(cliente)}
                    className="rounded-lg border border-[#E5DCC3] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#F3ECDA]"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remover(cliente.id)}
                    className="rounded-lg px-2 py-1.5 text-xs text-[#A99E85] hover:bg-[#F3ECDA] hover:text-red-600"
                    aria-label={`Excluir ${cliente.nome}`}
                  >
                    Excluir
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {modalAberto && (
        <ClienteFormModal
          cliente={editando}
          onFechar={() => setModalAberto(false)}
        />
      )}

      {historicoDo && (
        <ClienteDetalheModal
          cliente={historicoDo}
          onFechar={() => setHistoricoDo(null)}
        />
      )}
    </div>
  )
}
