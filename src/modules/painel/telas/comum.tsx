import type { ReactNode } from 'react'

/** Campo de formulário no padrão visual do Studio Audax. */
export function Campo({
  id,
  label,
  tipo,
  valor,
  aoMudar,
  obrigatorio = true,
  autocomplete,
  placeholder,
  dica,
}: {
  id: string
  label: string
  tipo: string
  valor: string
  aoMudar: (valor: string) => void
  obrigatorio?: boolean
  autocomplete?: string
  placeholder?: string
  dica?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-noir-700">
        {label}
      </label>
      <input
        id={id}
        type={tipo}
        required={obrigatorio}
        autoComplete={autocomplete}
        placeholder={placeholder}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        className="mt-1 w-full rounded-lg border border-cream-300 px-3 py-2 text-sm text-noir-900 outline-none focus:border-gold-700"
      />
      {dica && <p className="mt-1 text-[12px] text-noir-500">{dica}</p>}
    </div>
  )
}

export function ErroPainel({ texto }: { texto: string }) {
  if (!texto) return null
  return (
    <p
      role="alert"
      className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
    >
      {texto}
    </p>
  )
}

export function AvisoPainel({ texto }: { texto: string }) {
  if (!texto) return null
  return (
    <p
      role="status"
      className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
    >
      {texto}
    </p>
  )
}

export function BotaoPrimario({
  type = 'submit',
  processando,
  rotulo,
  processandoRotulo,
}: {
  type?: 'submit' | 'button'
  processando: boolean
  rotulo: string
  processandoRotulo: string
}) {
  return (
    <button
      type={type}
      disabled={processando}
      className="w-full rounded-lg bg-gold-700 px-4 py-2.5 text-sm font-semibold text-cream-50 hover:bg-gold-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {processando ? processandoRotulo : rotulo}
    </button>
  )
}

/** Card central com o cabeçalho dourado do Audax. */
export function CartaoPainel({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-cream-300 bg-white p-8">
        <h1 className="text-center text-xl font-bold text-noir-900">{titulo}</h1>
        <div
          className="mx-auto mt-3 h-px w-16 bg-gold-700"
          aria-hidden="true"
        />
        {subtitulo && (
          <p className="mt-4 text-center text-sm text-noir-500">{subtitulo}</p>
        )}
        {children}
      </div>
    </div>
  )
}

export function LinkPainel({
  aoClicar,
  children,
}: {
  aoClicar: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="w-full text-center text-[13px] font-medium text-gold-700 hover:underline"
    >
      {children}
    </button>
  )
}
