import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { carregarBeneficiosClube } from '@/services/supabase/painel'
import type { BarbeariaPublica } from '@/services/supabase/agendaPublica'
import { linkWhatsapp } from '@/modules/painel/barbearia'
import {
  beneficiosDoPlano,
  normalizarBeneficios,
  rotuloDoPlano,
  type BeneficiosPublicos,
} from '@/modules/painel/clube'
import { LinhaSanfona } from './ui'

/**
 * Os planos do Audax Club mostrados na vitrine.
 *
 * Vêm da CONFIGURAÇÃO OFICIAL (`clube_beneficios_publicos`, migration 034):
 * o mesmo texto que a Área do Cliente mostra e que a IA do WhatsApp lê. Nada de
 * plano ou benefício escrito aqui — se a casa mudar a configuração, o que o
 * cliente lê muda junto.
 *
 * Sem Supabase (ou com a leitura falhando) a seção simplesmente não aparece:
 * é melhor uma vitrine sem Club do que um Club inventado.
 */
export function usePlanosClub(): BeneficiosPublicos | null {
  const [dados, setDados] = useState<BeneficiosPublicos | null>(null)

  useEffect(() => {
    let vivo = true
    void carregarBeneficiosClube()
      .then((bruto) => {
        if (vivo) setDados(normalizarBeneficios(bruto))
      })
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])

  return dados
}

/** Rótulos dos três planos, na ordem em que o dono os nomeou. */
export const ORDEM_PLANOS = ['cabelo', 'barba', 'cabelo_barba'] as const

/**
 * O plano do Audax Club.
 *
 * `aoEscolher` é o gancho de quando a tela tem o que fazer com o plano (a
 * vitrine não tem). Sem gancho, "Conhecer plano" vira conversa no WhatsApp
 * OFICIAL da casa — que é onde a assinatura é fechada, no balcão. O botão
 * some se o telefone oficial não estiver cadastrado: melhor um Club sem botão
 * do que um botão mandando conversa para número inventado.
 *
 * A mensagem cita o NOME do plano que o dono cadastrou e nada mais. O preço da
 * assinatura não entra aqui: ele é acordado na assinatura e não está em
 * nenhuma configuração oficial — escrever um valor na vitrine seria a vitrine
 * virando fonte da verdade.
 */
export function SecaoAudaxClub({
  barbearia,
  aberto,
  aoAlternar,
  aoEscolher,
}: {
  barbearia: BarbeariaPublica
  /** Aberto controlado pelo fluxo, como as linhas de serviço. */
  aberto: boolean
  aoAlternar: () => void
  aoEscolher?: (plano: string) => void
}) {
  const club = usePlanosClub()

  const planos = useMemo(() => {
    if (!club) return []
    return ORDEM_PLANOS.map((chave) => ({
      chave,
      rotulo: rotuloDoPlano(chave, club),
      beneficios: beneficiosDoPlano(chave, club),
    })).filter((p) => p.beneficios.length > 0)
  }, [club])

  const conversa = useMemo(
    () => (plano: string) =>
      linkWhatsapp(
        barbearia,
        `Olá! Quero conhecer o plano ${plano} do Audax Club.`,
      ),
    [barbearia],
  )

  if (planos.length === 0) return null

  return (
    /*
     * A MESMA peça de linha dos serviços — `LinhaSanfona`, na variante ouro.
     *
     * Fechado por padrão: três cards de plano abertos ocupavam mais do que a
     * tela inteira e empurravam a lista de serviços para fora da primeira
     * dobra. Fechado, o Club é uma linha que diz quantos planos existem, e quem
     * quiser ler os benefícios abre.
     *
     * A linha fechada não promete o que não está pronto: só a quantidade de
     * planos. Preço e condição de assinatura não são inventados aqui.
     */
    <LinhaSanfona
      painel="audax-club"
      titulo="Audax Club"
      subtitulo={`${planos.length} ${
        planos.length === 1 ? 'plano de assinatura' : 'planos de assinatura'
      }`}
      aberta={aberto}
      variante="ouro"
      aoAlternar={aoAlternar}
    >
      <p className="text-[13.5px] leading-relaxed text-noir-600">
        Assinatura com procedimento ilimitado durante a vigência.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {planos.map((plano) => {
          const conversaDoPlano = conversa(plano.rotulo)
          return (
            <div
              key={plano.chave}
              className="rounded-xl border border-cream-300 bg-cream-50 p-4"
            >
              <p className="text-[15px] font-semibold text-noir-900">
                {plano.rotulo}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {plano.beneficios.map((b) => (
                  <li key={b} className="text-[13px] leading-snug text-noir-600">
                    · {b}
                  </li>
                ))}
              </ul>
              {aoEscolher && (
                <button
                  type="button"
                  onClick={() => aoEscolher(plano.chave)}
                  className="mt-3 min-h-[40px] rounded-lg border border-gold-600 px-3.5 text-[12px] font-bold tracking-[0.1em] text-gold-800 uppercase hover:bg-gold-200/40"
                >
                  Conhecer plano
                </button>
              )}
              {!aoEscolher && conversaDoPlano && (
                <a
                  href={conversaDoPlano}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[40px] items-center rounded-lg border border-gold-600 px-3.5 text-[12px] font-bold tracking-[0.1em] text-gold-800 uppercase hover:bg-gold-200/40"
                >
                  Conhecer plano
                </a>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-noir-500">
        A assinatura é feita com a equipe no Studio. Fale com a gente no balcão
        para fazer parte do Club.
      </p>
    </LinhaSanfona>
  )
}

export type { ReactNode }
