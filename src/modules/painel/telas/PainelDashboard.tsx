import { useEffect, useState } from 'react'
import {
  listarMeusAgendamentos,
  obterMeuCadastro,
} from '@/services/supabase/painel'
import type {
  AgendamentoPainel,
  CadastroPainel,
} from '@/services/supabase/painel'
import { separarAgendamentos } from '../dashboard'
import { navegarPainel } from '../regras'
import CartaoAgendamento from './CartaoAgendamento'

type Carregando = { fase: 'carregando' } | { fase: 'erro'; mensagem: string }

function hojeISO(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

/**
 * Dashboard do cliente: saudação, próximo agendamento em destaque e os
 * últimos do histórico — tudo lido das linhas próprias (RLS de posse 018).
 */
export default function PainelDashboard() {
  const [carregando, setCarregando] = useState<Carregando | null>({
    fase: 'carregando',
  })
  const [cadastro, setCadastro] = useState<CadastroPainel | null>(null)
  const [agendamentos, setAgendamentos] = useState<AgendamentoPainel[]>([])
  // Clique em "Tentar de novo" muda a tentativa e o effect recarrega.
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    // Resultados entram pela cadeia assíncrona (setState síncrono no corpo
    // do effect é proibido pelas regras do React).
    Promise.all([obterMeuCadastro(), listarMeusAgendamentos()])
      .then(([meuCadastro, meusAgendamentos]) => {
        if (!vivo) return
        setCadastro(meuCadastro)
        setAgendamentos(meusAgendamentos)
        setCarregando(null)
      })
      .catch((erro: unknown) => {
        if (!vivo) return
        setCarregando({
          fase: 'erro',
          mensagem:
            erro instanceof Error && erro.message
              ? erro.message
              : 'Não foi possível carregar seu painel.',
        })
      })
    return () => {
      vivo = false
    }
  }, [tentativa])

  if (carregando?.fase === 'carregando') {
    return (
      <p className="py-10 text-center text-sm text-[#8A8171]">
        Carregando seu painel…
      </p>
    )
  }

  if (carregando?.fase === 'erro') {
    return (
      <div className="rounded-xl border border-[#E5DCC3] bg-white p-6 text-center">
        <p role="alert" className="text-sm text-red-700">
          {carregando.mensagem}
        </p>
        <button
          type="button"
          onClick={() => setTentativa((atual) => atual + 1)}
          className="mt-4 rounded-lg border border-[#E5DCC3] px-4 py-2 text-sm font-medium text-[#4A4436] hover:border-[#8A6A14]"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  const { proximos, historico } = separarAgendamentos(agendamentos, hojeISO())
  const proximo = proximos[0]
  const ultimos = historico.slice(0, 3)
  const primeiroNome = cadastro?.nome?.trim().split(/\s+/)[0] ?? ''

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-[22px] font-bold text-[#1C1A15]">
          {primeiroNome ? `Olá, ${primeiroNome}` : 'Seu painel'}
        </h1>
        <p className="mt-1 text-sm text-[#8A8171]">
          Acompanhe seus horários e faça novos agendamentos.
        </p>
      </section>

      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#8A6A14]">
          Próximo agendamento
        </h2>
        <div className="mt-2">
          {proximo ? (
            <CartaoAgendamento agendamento={proximo} />
          ) : (
            <div className="rounded-xl border border-dashed border-[#E5DCC3] bg-white p-6 text-center">
              <p className="text-sm text-[#8A8171]">
                Você ainda não tem um agendamento marcado.
              </p>
              <button
                type="button"
                onClick={() => navegarPainel('agendar')}
                className="mt-4 rounded-lg bg-[#8A6A14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6F550F]"
              >
                Agendar horário
              </button>
            </div>
          )}
        </div>
        {proximos.length > 1 && (
          <p className="mt-2 text-[13px] text-[#8A8171]">
            + {proximos.length - 1}{' '}
            {proximos.length - 1 === 1
              ? 'outro agendamento futuro'
              : 'outros agendamentos futuros'}
          </p>
        )}
      </section>

      {ultimos.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#8A6A14]">
            Últimos atendimentos
          </h2>
          <div className="mt-2 space-y-3">
            {ultimos.map((agendamento) => (
              <CartaoAgendamento key={agendamento.id} agendamento={agendamento} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
