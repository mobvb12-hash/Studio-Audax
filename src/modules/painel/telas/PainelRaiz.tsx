import { useEffect, useState } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { navegarPainel, rotaPainelAtual } from '../regras'
import TelaCadastrarPainel from './TelaCadastrarPainel'
import TelaConfirmeEmailPainel from './TelaConfirmeEmailPainel'
import TelaEntrarPainel from './TelaEntrarPainel'
import TelaRecuperarPainel from './TelaRecuperarPainel'
import TelaRedefinirPainel from './TelaRedefinirPainel'
import TelaVincularPainel from './TelaVincularPainel'
import PainelShell from './PainelShell'

function Carregando({ texto }: { texto: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 text-sm text-noir-500">
      {texto}
    </div>
  )
}

function SemSupabase() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-cream-300 bg-white p-8">
        <h1 className="text-center text-xl font-bold text-noir-900">
          Studio Audax
        </h1>
        <div className="mx-auto mt-3 h-px w-16 bg-gold-700" aria-hidden="true" />
        <p role="alert" className="mt-4 text-sm text-noir-500">
          O painel do cliente está configurado para exigir acesso, mas o
          Supabase não foi encontrado.
        </p>
        <p className="mt-3 text-[13px] text-noir-500">
          Configure <span className="font-mono">VITE_SUPABASE_URL</span> e{' '}
          <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> e
          recarregue a página.
        </p>
      </div>
    </div>
  )
}

const ROTAS_AUTENTICACAO = ['entrar', 'cadastrar', 'recuperar', 'redefinir']

/** Roteador interno `#/painel/*` — decide a tela pelo estado + rota. */
export default function PainelRaiz() {
  const { estado } = usePainelAuth()
  const [rota, setRota] = useState(() => rotaPainelAtual())

  useEffect(() => {
    const aoMudar = () => setRota(rotaPainelAtual())
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  const pronto = estado.status === 'pronto'
  useEffect(() => {
    if (pronto && ROTAS_AUTENTICACAO.includes(rota)) {
      navegarPainel('')
    }
  }, [pronto, rota])

  if (estado.status === 'sem_supabase') return <SemSupabase />
  if (estado.status === 'carregando') {
    return <Carregando texto="Verificando seu acesso…" />
  }
  if (estado.status === 'vinculando') {
    return <Carregando texto="Preparando seu painel…" />
  }
  if (estado.status === 'redefinindo') return <TelaRedefinirPainel />
  if (estado.status === 'precisa_vinculo') return <TelaVincularPainel />
  if (estado.status === 'confirme_email') return <TelaConfirmeEmailPainel />

  if (estado.status === 'sem_sessao') {
    if (rota === 'cadastrar') return <TelaCadastrarPainel />
    if (rota === 'recuperar') return <TelaRecuperarPainel />
    if (rota === 'redefinir') return <TelaRedefinirPainel />
    return <TelaEntrarPainel />
  }

  return <PainelShell />
}
