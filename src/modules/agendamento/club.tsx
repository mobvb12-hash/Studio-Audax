import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { carregarBeneficiosClube } from '@/services/supabase/painel'
import {
  beneficiosDoPlano,
  normalizarBeneficios,
  rotuloDoPlano,
  type BeneficiosPublicos,
} from '@/modules/painel/clube'

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

export function SecaoAudaxClub({ aoEscolher }: { aoEscolher?: (plano: string) => void }) {
  const club = usePlanosClub()

  const planos = useMemo(() => {
    if (!club) return []
    return ORDEM_PLANOS.map((chave) => ({
      chave,
      rotulo: rotuloDoPlano(chave, club),
      beneficios: beneficiosDoPlano(chave, club),
    })).filter((p) => p.beneficios.length > 0)
  }, [club])

  if (planos.length === 0) return null

  return (
    <section className="rounded-2xl border border-gold-300 bg-gold-200/20 p-5">
      <h2 className="font-serif-display text-[19px] font-semibold text-noir-900">
        Audax Club
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-noir-600">
        Assinatura com procedimento ilimitado durante a vigência.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {planos.map((plano) => (
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
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-noir-500">
        A assinatura é feita com a equipe no Studio. Fale com a gente no balcão
        para fazer parte do Club.
      </p>
    </section>
  )
}

export type { ReactNode }
