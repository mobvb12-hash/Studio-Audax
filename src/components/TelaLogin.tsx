import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/modules/auth/useAuth'
import { MarcaAudax, SeloDesde2024 } from '@/components/MarcaAudax'

/**
 * Tela de login do Studio Audax — só aparece quando o Supabase está
 * configurado (sem variáveis, o app continua local como sempre).
 * Repaginada com a identidade da barbearia: fundo preto, marca em dourado
 * e botão dourado com texto preto (mesma leitura das postagens).
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
    <div className="flex min-h-screen items-center justify-center bg-[#0C0B0A] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#2E2A21] bg-[#141311] p-8 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
        <div className="flex justify-center">
          <MarcaAudax className="h-16 w-16 text-[#F7F3EA]" />
        </div>
        <h1 className="mt-4 text-center font-display text-xl font-extrabold tracking-[0.2em] text-[#F7F3EA] uppercase">
          Studio Audax
        </h1>
        <SeloDesde2024 className="mt-3" />
        <p className="mt-4 text-center text-sm text-[#A99E85]">
          Entre com seu acesso para abrir o painel.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submeter}>
          <div>
            <label
              htmlFor="login-email"
              className="block text-[13px] font-medium text-[#C9BFA4]"
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
              className="mt-1 w-full rounded-lg border border-[#3A352C] bg-[#0C0B0A] px-3 py-2 text-sm text-[#F7F3EA] outline-none placeholder:text-[#5A5346] focus:border-[#C9A24A]"
            />
          </div>
          <div>
            <label
              htmlFor="login-senha"
              className="block text-[13px] font-medium text-[#C9BFA4]"
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
              className="mt-1 w-full rounded-lg border border-[#3A352C] bg-[#0C0B0A] px-3 py-2 text-sm text-[#F7F3EA] outline-none placeholder:text-[#5A5346] focus:border-[#C9A24A]"
            />
          </div>
          <button
            type="submit"
            disabled={entrando}
            className="w-full rounded-lg bg-[#C9A24A] px-4 py-2.5 text-sm font-semibold text-[#121110] hover:bg-[#A8842C] disabled:cursor-not-allowed disabled:opacity-60"
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
