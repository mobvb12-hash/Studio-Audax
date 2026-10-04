import type { BarbeariaPublica } from '@/services/supabase/agendaPublica'
import {
  linkInstagram,
  linkMapa,
  linkWhatsapp,
  rotuloInstagram,
  rotuloTelefone,
  temDadosDaBarbearia,
} from '../barbearia'
import { linhasDeHorario } from '../barbearia'
import { BotaoLink } from '../ui'

/**
 * Onde fica o Studio Audax.
 *
 * Todos os valores vêm da configuração oficial (`barbearia`); nada aqui é
 * escrito à mão. Um campo vazio simplesmente não gera botão — o WhatsApp, por
 * exemplo, só aparece depois que o número oficial for cadastrado em
 * Configurações. É o contrário de "inventar telefone para preencher a tela".
 */
export default function BlocoBarbearia({
  barbearia,
}: {
  barbearia: BarbeariaPublica
}) {
  const horarios = linhasDeHorario(barbearia.horarios)
  if (!temDadosDaBarbearia(barbearia) && horarios.length === 0) return null

  const mapa = linkMapa(barbearia)
  const whatsapp = linkWhatsapp(barbearia)
  const instagram = linkInstagram(barbearia)
  const telefone = rotuloTelefone(barbearia)
  const perfil = rotuloInstagram(barbearia)

  return (
    <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-noir-900" fill="none">
            <path
              d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="font-serif-display text-[19px] leading-tight font-semibold text-noir-900">
            Studio Audax
          </h2>
          {barbearia.endereco && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-noir-600">
              {barbearia.endereco}
            </p>
          )}
        </div>
      </div>

      <dl className="mb-4 flex flex-col gap-2.5">
        {/*
          * HORÁRIO DE FUNCIONAMENTO.
          *
          * Fica no mesmo bloco dos outros dados da casa porque é o mesmo dado.
          * E só aparece o que a casa cadastrou: a vitrine não completa horário
          * faltante com palpite, senão o cliente aparece na hora errada.
          */}
        {horarios.length > 0 && (
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-noir-400 uppercase">
              Horário
            </dt>
            {horarios.map((linha) => (
              <dd
                key={linha.nome}
                className="flex items-baseline justify-between gap-3 text-[13.5px] text-noir-800"
              >
                <span className="shrink-0 text-noir-600">{linha.nome}</span>
                <span className="text-right tabular-nums">{linha.texto}</span>
              </dd>
            ))}
          </div>
        )}
        {telefone && (
          <div className="flex items-baseline gap-2">
            <dt className="shrink-0 text-[11px] font-semibold tracking-[0.12em] text-noir-400 uppercase">
              WhatsApp
            </dt>
            <dd className="min-w-0 text-[13.5px] text-noir-800">{telefone}</dd>
          </div>
        )}
        {perfil && (
          <div className="flex items-baseline gap-2">
            <dt className="shrink-0 text-[11px] font-semibold tracking-[0.12em] text-noir-400 uppercase">
              Instagram
            </dt>
            <dd className="min-w-0 text-[13.5px] text-noir-800">{perfil}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {mapa && (
          <BotaoLink href={mapa} variante="primario">
            <span aria-hidden="true">📍</span> Como chegar
          </BotaoLink>
        )}
        {whatsapp && (
          <BotaoLink href={whatsapp}>
            <span aria-hidden="true">📱</span> WhatsApp
          </BotaoLink>
        )}
        {instagram && (
          <BotaoLink href={instagram}>
            <span aria-hidden="true">📸</span> Instagram
          </BotaoLink>
        )}
      </div>
    </section>
  )
}