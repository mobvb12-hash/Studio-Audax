import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { usePainelAuth } from '../usePainelAuth'
import { navegarPainel, rotaPainelAtual } from '../regras'
import PainelDashboard from './PainelDashboard'
import PainelAgendamentos from './PainelAgendamentos'
import PainelClube from './PainelClube'
import TelaAgendarPainel from './TelaAgendarPainel'
import TelaPerfilPainel from './TelaPerfilPainel'

type Aba = {
  rota: string
  rotulo: string
}

/**
 * Abas do painel. O "Agendar" é uma AÇÃO, não uma aba de navegação — por isso
 * vira o botão dourado da barra, que é onde o cliente procura por ele.
 */
const ABAS: Aba[] = [
  { rota: 'inicio', rotulo: 'Início' },
  { rota: 'agendamentos', rotulo: 'Agendamentos' },
  { rota: 'perfil', rotulo: 'Perfil' },
  { rota: 'clube', rotulo: 'Clube' },
]

function conteudoDaRota(rota: string): ReactNode {
  if (rota === 'inicio') return <PainelDashboard />
  if (rota === 'agendamentos') return <PainelAgendamentos />
  if (rota === 'agendar') return <TelaAgendarPainel />
  if (rota === 'perfil') return <TelaPerfilPainel />
  if (rota === 'clube') return <PainelClube />
  const aba = ABAS.find((item) => item.rota === rota)
  if (aba) {
    return (
      <div className="rounded-2xl border border-cream-300 bg-cream-50 p-8 text-center">
        <h1 className="font-serif-display text-[20px] font-semibold text-noir-900">
          {aba.rotulo}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-noir-500">
          Esta área entra na próxima etapa do painel do cliente.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-cream-300 bg-cream-50 p-8 text-center">
      <h1 className="font-serif-display text-[20px] font-semibold text-noir-900">
        Painel
      </h1>
    </div>
  )
}

/**
 * Estrutura do painel logado: cabeçalho discreto, ação principal em destaque e
 * navegação por abas. Mobile-first — a barra de abas rola sem arrastar a
 * página e o botão de agendar fica sempre visível no topo.
 */
export default function PainelShell() {
  const { sair } = usePainelAuth()
  const [rota, setRota] = useState(() => rotaPainelAtual())

  useEffect(() => {
    const aoMudar = () => setRota(rotaPainelAtual())
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  const naAgendar = rota === 'agendar'

  return (
    <div className="min-h-screen bg-cream-100 text-noir-900">
      <header className="border-b border-cream-300 bg-cream-50">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-6">
          <div className="min-w-0">
            <p className="font-serif-display text-[11px] leading-none font-semibold tracking-[0.34em] text-gold-600 uppercase">
              Studio
            </p>
            <p className="font-serif-display text-[19px] leading-tight font-semibold tracking-[0.16em] text-noir-900 uppercase">
              Audax
            </p>
          </div>
          <button
            type="button"
            onClick={() => void sair()}
            className="min-h-[40px] shrink-0 rounded-xl border border-cream-300 px-3.5 text-[13px] font-medium text-noir-600 hover:border-gold-400 hover:text-noir-900"
          >
            Sair
          </button>
        </div>

        {!naAgendar && (
          <nav className="mx-auto flex w-full max-w-xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
            {ABAS.map((aba) => {
              const ativa = rota === aba.rota
              return (
                <button
                  key={aba.rota}
                  type="button"
                  onClick={() => navegarPainel(aba.rota === 'inicio' ? '' : aba.rota)}
                  aria-current={ativa ? 'page' : undefined}
                  className={`min-h-[42px] shrink-0 rounded-xl px-3.5 text-[13.5px] font-medium transition-colors ${
                    ativa
                      ? 'bg-noir-900 text-cream-50'
                      : 'text-noir-600 hover:bg-cream-200'
                  }`}
                >
                  {aba.rotulo}
                </button>
              )
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-6 pb-28 sm:px-6">
        {conteudoDaRota(rota)}
      </main>

      {/* Ação principal sempre ao alcance do polegar */}
      {!naAgendar && (
        <div className="fixed inset-x-0 bottom-0 border-t border-cream-300 bg-cream-100/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto w-full max-w-xl">
            <button
              type="button"
              onClick={() => navegarPainel('agendar')}
              className="min-h-[52px] w-full rounded-xl bg-gold-500 text-[15px] font-semibold text-noir-900 transition-colors hover:bg-gold-400"
            >
              Agendar novo horário
            </button>
          </div>
        </div>
      )}
    </div>
  )
}