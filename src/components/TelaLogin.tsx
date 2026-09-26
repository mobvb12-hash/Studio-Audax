import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/modules/auth/useAuth'

/**
 * Tela de login do Studio Audax — só aparece quando o Supabase está
 * configurado (sem variáveis, o app continua local como sempre).
 * Usa a paleta aprovada do sistema; não altera o layout interno.
 */
export default function TelaLogin() {
  const { estado, erroEntrada, entrando, entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  const aviso = estado.status === 'deslogado' ? estado.aviso : ''

  async function submeter(evento: FormEvent) {
    evento.preventDefault()
    await entrar(email.trim(), senha)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFBF3] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[#E5DCC3] bg-white p-8">
        <h1 className="text-center text-xl font-bold text-[#1C1A15]">
          Studio Audax
        </h1>
        <div
          className="mx-auto mt-3 h-px w-16 bg-[#8A6A14]"
          aria-hidden="true"
        />
        <p className="mt-4 text-center text-sm text-[#8A8171]">
          Entre com seu acesso para abrir o painel.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submeter}>
          <div>
            <label
              htmlFor="login-email"
              className="block text-[13px] font-medium text-[#4A4436]"
            >
              E-mail
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5DCC3] px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]"
            />
          </div>
          <div>
            <label
              htmlFor="login-senha"
              className="block text-[13px] font-medium text-[#4A4436]"
            >
              Senha
            </label>
            <input
              id="login-senha"
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5DCC3] px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]"
            />
          </div>
          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded-lg bg-[#8A6A14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6F550F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {aviso && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
          >
            {aviso}
          </p>
        )}
        {erroEntrada && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
          >
            {erroEntrada}
          </p>
        )}
      </div>
    </div>
  )
}
