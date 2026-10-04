import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cliente } from '@/modules/clientes/types'
import { auxiliarCliente, filtrarClientesParaSelecao } from './buscaCliente'

export default function SeletorCliente({
  clientes,
  valor,
  aoEscolher,
  id,
  vazioRotulo = 'Selecione um cliente...',
  obrigatorio,
}: {
  clientes: Cliente[]
  /** Id do cliente selecionado ('' = nenhum). */
  valor: string
  aoEscolher: (id: string) => void
  id: string
  vazioRotulo?: string
  obrigatorio?: boolean
}) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [realce, setRealce] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)

  const selecionado = useMemo(
    () => clientes.find((c) => c.id === valor) ?? null,
    [clientes, valor],
  )
  const resultados = useMemo(
    () => filtrarClientesParaSelecao(clientes, busca),
    [clientes, busca],
  )

  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (evento: MouseEvent) => {
      if (!caixaRef.current?.contains(evento.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  function escolher(cliente: Cliente) {
    aoEscolher(cliente.id)
    setBusca('')
    setAberto(false)
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setAberto(true)
      setRealce((atual) => Math.min(atual + 1, resultados.length - 1))
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setRealce((atual) => Math.max(atual - 1, 0))
    } else if (evento.key === 'Enter' && aberto && resultados[realce]) {
      evento.preventDefault()
      escolher(resultados[realce])
    } else if (evento.key === 'Escape') {
      setAberto(false)
    }
  }

  const rotulo = selecionado ? selecionado.nome : vazioRotulo

  return (
    <div ref={caixaRef} className="relative">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12px] font-semibold tracking-[0.1em] text-[#6B6353] uppercase"
      >
        Cliente
      </label>

      {selecionado && !aberto ? (
        <div className="flex items-center gap-2">
          <div className="flex min-h-[52px] flex-1 items-center justify-between gap-2 rounded-xl border border-[#E5DCC3] bg-white px-4">
            <span className="min-w-0 truncate text-[15px] text-[#121110]">
              {selecionado.nome}
            </span>
            <span className="shrink-0 text-[12px] text-[#7C7469]">
              {auxiliarCliente(selecionado)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              aoEscolher('')
              setAberto(true)
            }}
            className="min-h-[52px] shrink-0 rounded-xl border border-[#E5DCC3] px-3 text-[13px] font-medium text-[#3A352C] hover:border-[#8A6A14]"
          >
            Trocar
          </button>
        </div>
      ) : (
        <>
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={aberto}
            aria-controls={`${id}-lista`}
            aria-autocomplete="list"
            autoComplete="off"
            required={obrigatorio}
            placeholder="Pesquisar cliente..."
            value={busca}
            onFocus={() => setAberto(true)}
            onChange={(evento) => {
              setBusca(evento.target.value)
              setAberto(true)
              setRealce(0)
            }}
            onKeyDown={aoTeclar}
            className="min-h-[52px] w-full rounded-xl border border-[#E5DCC3] bg-white px-4 text-[15px] text-[#121110] outline-none placeholder:text-[#A99E85] focus:border-[#8A6A14] focus:ring-1 focus:ring-[#8A6A14]"
          />

          {aberto && (
            <ul
              id={`${id}-lista`}
              role="listbox"
              className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#E5DCC3] bg-white py-1 shadow-lg"
            >
              {resultados.length === 0 ? (
                <li className="px-4 py-3 text-[13px] text-[#7C7469]">
                  Nenhum cliente ativo encontrado para “{busca}”.
                </li>
              ) : (
                resultados.map((cliente, indice) => (
                  <li key={cliente.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={indice === realce}
                      onMouseEnter={() => setRealce(indice)}
                      onClick={() => escolher(cliente)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] ${
                        indice === realce
                          ? 'bg-[#F3ECDA] text-[#121110]'
                          : 'text-[#3A352C]'
                      }`}
                    >
                      <span className="min-w-0 truncate">{cliente.nome}</span>
                      <span className="shrink-0 text-[12px] text-[#7C7469]">
                        {auxiliarCliente(cliente)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
      {!valor && !aberto && (
        <span className="sr-only">{rotulo}</span>
      )}
    </div>
  )
}
