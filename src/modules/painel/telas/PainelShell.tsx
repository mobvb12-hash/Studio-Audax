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

const ABAS: Aba[] = [
  { rota: 'inicio', rotulo: 'Início' },
  { rota: 'agendamentos', rotulo: 'Agendamentos' },
  { rota: 'perfil', rotulo: 'Perfil' },
  { rota: 'clube', rotulo: 'Clube' },
]

/** Conteúdo honesto para as abas que ainda não têm tela nesta etapa. */
function EmBreve({ rotulo }: { rotulo: string }) {
  return (
    <div className="rounded-xl border border-[#E5DCC3] bg-white p-8 text-center">
      <h1 className="text-[22px] font-bold text-[#1C1A15]">{rotulo}</h1>
      <div className="mx-auto mt-4 h-px w-16 bg-[#8A6A14]" aria-hidden="true" />
      <p className="mx-auto mt-4 max-w-md text-sm text-[#8A8171]">
        Esta tela entra na próxima etapa do painel do cliente.
      </p>
    </div>
  )
}

function conteudoDaRota(rota: string): ReactNode {
  if (rota === 'inicio') return <PainelDashboard />
  if (rota === 'agendamentos') return <PainelAgendamentos />
  if (rota === 'agendar') return <TelaAgendarPainel />
  if (rota === 'perfil') return <TelaPerfilPainel />
  if (rota === 'clube') return <PainelClube />
  const aba = ABAS.find((item) => item.rota === rota)
  if (aba) return <EmBreve rotulo={aba.rotulo} />
  return <EmBreve rotulo="Painel" />
}

/**
 * Estrutura do painel logado: cabeçalho com sair, abas de navegação e o
 * conteúdo da rota `#/painel/...`.
 */
export default function PainelShell() {
  const { sair } = usePainelAuth()
  const [rota, setRota] = useState(() => rotaPainelAtual())

  useEffect(() => {
    const aoMudar = () => setRota(rotaPainelAtual())
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  return (
    <div className="min-h-screen bg-[#FDFBF3]">
      <header className="border-b border-[#E5DCC3] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-[15px] font-bold text-[#1C1A15]">Studio Audax</p>
            <p className="text-[12px] text-[#8A8171]">Seu painel</p>
          </div>
          <button
            type="button"
            onClick={() => void sair()}
            className="rounded-lg border border-[#E5DCC3] px-3 py-1.5 text-[13px] font-medium text-[#4A4436] hover:border-[#8A6A14]"
          >
            Sair
          </button>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-2">
          {ABAS.map((aba) => {
            const ativa = rota === aba.rota
            return (
              <button
                key={aba.rota}
                type="button"
                onClick={() => navegarPainel(aba.rota === 'inicio' ? '' : aba.rota)}
                className={
                  ativa
                    ? 'shrink-0 rounded-lg bg-[#8A6A14] px-3 py-1.5 text-[13px] font-semibold text-white'
                    : 'shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#4A4436] hover:bg-[#FDFBF3]'
                }
              >
                {aba.rotulo}
              </button>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {conteudoDaRota(rota)}
      </main>
    </div>
  )
}
