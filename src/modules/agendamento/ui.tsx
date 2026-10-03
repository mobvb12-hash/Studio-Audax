// ============================================================================
// Agendamento público — as peças de tela do fluxo passo a passo.
//
// Só APRESENTAÇÃO. Nenhuma regra de negócio, nenhuma chamada de rede e nenhum
// dado inventado: os valores chegam prontos do catálogo e da Agenda oficiais.
//
// Este arquivo não reimplementa o kit do Painel do Cliente (`painel/ui`):
// reaproveita o que já existe (Marca, Botao, BotaoLink, Aviso, EstadoV,
// Campo, Resumo, LinhaResumo) e acrescenta só o que o fluxo passo a passo
// precisa — casca de etapa, indicador numerado, cartão com foto, botão de
// voltar e o cartão de serviço da vitrine.
// ============================================================================
import type { ReactNode } from 'react'
import { dataLocal } from '@/lib/apresentacao'
import { formatarBRL } from '@/lib/moeda'
import {
  Aviso,
  Botao,
  BotaoLink,
  Campo,
  Carregando,
  Confirmacao,
  EstadoVazio,
  LinhaResumo,
  Marca,
  Resumo,
} from '@/modules/painel/ui'
import { ETAPA_ROTULO, ETAPAS_PROGRESSO, type Etapa } from './estado'

export {
  Aviso,
  Botao,
  BotaoLink,
  Campo,
  Carregando,
  Confirmacao,
  EstadoVazio,
  LinhaResumo,
  Marca,
  Resumo,
}

/* ------------------------------------------------------------------ */
/* Progresso numerado                                                     */
/* ------------------------------------------------------------------ */

/**
 * "1 Serviço → 2 Profissional → …"
 *
 * Só o texto da etapa atual é escrito; os outros ficam como número. Sete
 * palavras numa linha de celular viram um garrancho ilegível — o número diz
 * onde a pessoa está, e o título da tela diz o que fazer.
 */
export function Progresso({ etapa }: { etapa: Etapa }) {
  const atual = ETAPAS_PROGRESSO.indexOf(etapa)
  // Na confirmação não há passo: é o fim do caminho.
  const posicao = atual < 0 ? ETAPAS_PROGRESSO.length : atual
  return (
    <nav aria-label="Etapas do agendamento" className="mb-5">
      <ol className="flex items-center gap-1.5">
        {ETAPAS_PROGRESSO.map((item, indice) => {
          const feito = indice < posicao
          const ativa = indice === posicao
          return (
            <li key={item} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span
                className={`h-1 w-full rounded-full transition-colors ${
                  feito || ativa ? 'bg-gold-500' : 'bg-cream-300'
                }`}
                aria-hidden="true"
              />
              <span
                className={`truncate text-[10px] leading-tight font-semibold tracking-wide uppercase ${
                  ativa ? 'text-gold-700' : 'text-noir-400'
                }`}
                aria-current={ativa ? 'step' : undefined}
              >
                {indice + 1} {ETAPA_ROTULO[item]}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Casca de etapa                                                        */
/* ------------------------------------------------------------------ */

/**
 * Uma etapa por tela.
 *
 * `voltar` só aparece quando existe etapa anterior — na primeira, não há para
 * onde voltar e o botão só gastaria o polegar do cliente.
 */
export function Tela({
  etapa,
  titulo,
  descricao,
  voltar,
  acoes,
  children,
}: {
  etapa: Etapa
  titulo: string
  descricao?: string
  voltar?: () => void
  acoes?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={titulo}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-gold-700 uppercase">
            {ETAPA_ROTULO[etapa]}
          </p>
          <h1 className="mt-1 font-serif-display text-[24px] leading-tight font-semibold text-noir-900">
            {titulo}
          </h1>
          {descricao && (
            <p className="mt-1.5 text-[14px] leading-relaxed text-noir-500">
              {descricao}
            </p>
          )}
        </div>
        {acoes}
      </div>
      {voltar && (
        <button
          type="button"
          onClick={voltar}
          className="mb-4 inline-flex min-h-[38px] items-center gap-1 rounded-lg px-1 text-[13.5px] font-medium text-noir-500 hover:text-noir-900"
        >
          <span aria-hidden="true">←</span> Voltar
        </button>
      )}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Cartões                                                               */
/* ------------------------------------------------------------------ */

/** Botão "ESCOLHER" — o verbo aparece escrito, como o dono pediu. */
export function SeloEscolher({ escolhido }: { escolhido?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-bold tracking-[0.1em] uppercase ${
        escolhido
          ? 'border-gold-600 bg-gold-500 text-noir-900'
          : 'border-cream-400 text-noir-500'
      }`}
    >
      {escolhido ? 'Escolhido' : 'Escolher'}
    </span>
  )
}

/** Cartão de serviço da vitrine: nome, duração, preço e ESCOLHER. */
export function CartaoServicoVitrine({
  nome,
  preco,
  duracaoMin,
  selecionado,
  aoEscolher,
}: {
  nome: string
  preco: number
  duracaoMin: number
  selecionado: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionado}
      aria-label={`${nome} - ${formatarBRL(preco)} - ${duracaoMin} minutos`}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        selecionado
          ? 'border-gold-600 bg-gold-200/50 ring-1 ring-gold-600'
          : 'border-cream-300 bg-cream-50 hover:border-gold-400 hover:bg-cream-100'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-snug font-semibold text-noir-900">
          {nome}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-noir-500">
          {duracaoMin} min
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`text-[15px] font-semibold tabular-nums ${
            selecionado ? 'text-gold-800' : 'text-noir-800'
          }`}
        >
          {formatarBRL(preco)}
        </span>
        <SeloEscolher escolhido={selecionado} />
      </span>
    </button>
  )
}

/** Cartão de profissional, com foto quando a casa cadastrou. */
export function CartaoProfissional({
  nome,
  foto,
  selecionado,
  aoEscolher,
}: {
  nome: string
  foto?: string
  selecionado: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionado}
      aria-label={`Escolher ${nome}`}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        selecionado
          ? 'border-gold-600 bg-gold-200/50 ring-1 ring-gold-600'
          : 'border-cream-300 bg-cream-50 hover:border-gold-400 hover:bg-cream-100'
      }`}
    >
      {foto ? (
        <img
          src={foto}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cream-200 font-serif-display text-[16px] font-semibold text-noir-600"
        >
          {nome.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 text-[16px] font-semibold text-noir-900">
        {nome}
      </span>
      <SeloEscolher escolhido={selecionado} />
    </button>
  )
}

/** Botão de horário: HH:MM e nada mais — o profissional já foi escolhido. */
export function BotaoHora({
  hora,
  selecionado,
  aoEscolher,
}: {
  hora: string
  selecionado: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionado}
      aria-label={`Horário ${hora}`}
      className={`min-h-[52px] rounded-xl border text-[15px] font-semibold tabular-nums transition-colors ${
        selecionado
          ? 'border-gold-600 bg-gold-500 text-noir-900'
          : 'border-cream-300 bg-cream-50 text-noir-800 hover:border-gold-400'
      }`}
    >
      {hora}
    </button>
  )
}

/** Botão de dia: dia da semana + número, no calendário do Studio Audax. */
export function BotaoDia({
  iso,
  selecionado,
  desabilitado,
  aoEscolher,
}: {
  iso: string
  selecionado: boolean
  desabilitado?: boolean
  aoEscolher: () => void
}) {
  const dia = dataLocal(iso)
  const d = new Date(`${dia}T12:00:00`)
  const semana = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return (
    <button
      type="button"
      onClick={aoEscolher}
      disabled={desabilitado}
      aria-pressed={selecionado}
      aria-label={`Dia ${dia}`}
      className={`flex min-h-[62px] flex-col items-center justify-center rounded-xl border px-2 transition-colors ${
        desabilitado
          ? 'cursor-not-allowed border-cream-200 bg-cream-100 text-noir-300'
          : selecionado
            ? 'border-gold-600 bg-gold-500 text-noir-900'
            : 'border-cream-300 bg-cream-50 text-noir-800 hover:border-gold-400'
      }`}
    >
      <span className="text-[10.5px] font-semibold tracking-wide uppercase">
        {semana}
      </span>
      <span className="text-[17px] font-semibold tabular-nums">
        {dia.slice(8, 10)}
      </span>
    </button>
  )
}

/** Data por extenso, para o resumo: "segunda-feira, 05/10/2026". */
export function dataPorExtenso(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const data = d.toLocaleDateString('pt-BR')
  const diaSemana = d.toLocaleDateString('pt-BR', { weekday: 'long' })
  return `${diaSemana}, ${data}`
}
