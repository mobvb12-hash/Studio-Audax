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
import { Botao, Carregando, EstadoVazio } from '../ui'
import CartaoAgendamento from './CartaoAgendamento'

type Carregando = { fase: 'carregando' } | { fase: 'erro'; mensagem: string }

function hojeISO(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.12em] text-noir-500 uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/**
 * Início do painel do cliente: saudação, próximo horário em destaque e o
 * histórico recente. Tudo lido das linhas próprias (RLS de posse 018) —
 * nenhuma função administrativa aparece aqui.
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
    return <Carregando texto="Carregando seu painel…" />
  }

  if (carregando?.fase === 'erro') {
    return (
      <EstadoVazio
        alerta
        titulo="Não foi possível carregar"
        texto={carregando.mensagem}
      >
        <Botao aoClicar={() => setTentativa((atual) => atual + 1)}>
          Tentar de novo
        </Botao>
      </EstadoVazio>
    )
  }

  const { proximos, historico } = separarAgendamentos(agendamentos, hojeISO())
  const proximo = proximos[0]
  const ultimos = historico.slice(0, 3)
  const primeiroNome = cadastro?.nome?.trim().split(/\s+/)[0] ?? ''

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif-display text-[24px] leading-tight font-semibold text-noir-900">
          {primeiroNome ? `Olá, ${primeiroNome}` : 'Seu painel'}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-noir-500">
          Acompanhe seus horários e faça novos agendamentos.
        </p>
      </header>

      <Secao titulo="Próximo agendamento">
        {proximo ? (
          <>
            <CartaoAgendamento agendamento={proximo} destaque />
            {proximos.length > 1 && (
              <button
                type="button"
                onClick={() => navegarPainel('agendamentos')}
                className="mt-3 text-[13px] font-medium text-noir-500 hover:text-noir-900"
              >
                + {proximos.length - 1}{' '}
                {proximos.length - 1 === 1
                  ? 'outro agendamento futuro'
                  : 'outros agendamentos futuros'}
              </button>
            )}
          </>
        ) : (
          <EstadoVazio titulo="Você ainda não tem um agendamento marcado.">
            <Botao aoClicar={() => navegarPainel('agendar')}>
              Agendar horário
            </Botao>
          </EstadoVazio>
        )}
      </Secao>

      {ultimos.length > 0 && (
        <Secao titulo="Últimos atendimentos">
          <div className="flex flex-col gap-3">
            {ultimos.map((agendamento) => (
              <CartaoAgendamento key={agendamento.id} agendamento={agendamento} />
            ))}
          </div>
        </Secao>
      )}
    </div>
  )
}