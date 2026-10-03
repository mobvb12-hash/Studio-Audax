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
// voltar, o cartão de serviço da vitrine e os blocos dela (galeria da casa,
// carrossel de destaques, sanfona de serviços e equipe).
// ============================================================================
import { useState } from 'react'
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

/* ------------------------------------------------------------------ */
/* Blocos da vitrine                                                    */
/* ------------------------------------------------------------------ */

/** Uma pessoa da equipe, só o mínimo que a vitrine precisa mostrar. */
type PessoaVitrine = { id?: string; nome: string; foto?: string }

/** Rótulo da seção, no mesmo desenho dos outros títulos da vitrine. */
function TituloSecao({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.12em] text-noir-500 uppercase">
      {children}
    </h2>
  )
}

/** Esconde a barra de rolagem: quem desliza é o dedo, não um dedo mole. */
const SEM_BARRA =
  'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/**
 * Galeria da casa, no topo da vitrine.
 *
 * As fotos vêm de `barbearia.fotos` — a configuração que o dono edita. Vazio é
 * resposta válida e NORMAL: enquanto a casa não cadastrar foto nenhuma, a
 * galeria simplesmente não existe e a vitrine abre direto nos serviços. Não
 * entra imagem de banco de imagens nem foto de demonstração: a vitrine não
 * mostra uma barbearia que não é a do dono.
 *
 * Foto que falha ao carregar some em vez de virar moldura quebrada — o
 * cadastro é link, e link pode vencer.
 */
export function GaleriaBarbearia({ fotos }: { fotos?: string[] }) {
  const [quebradas, setQuebradas] = useState<number[]>([])
  const lista = (fotos ?? []).map((f) => f.trim()).filter(Boolean)
  if (lista.length === 0) return null

  return (
    <section aria-label="Fotos do Studio Audax" className="mb-7">
      <ul className={`-mx-4 flex snap-x snap-mandatory gap-3 px-4 sm:-mx-6 sm:px-6 ${SEM_BARRA}`}>
        {lista.map((foto, indice) =>
          quebradas.includes(indice) ? null : (
            <li
              key={`${foto}-${indice}`}
              className="w-[82%] shrink-0 snap-start sm:w-[45%]"
            >
              <img
                src={foto}
                alt=""
                loading={indice === 0 ? 'eager' : 'lazy'}
                onError={() =>
                  setQuebradas((atual) =>
                    atual.includes(indice) ? atual : [...atual, indice],
                  )
                }
                className="h-44 w-full rounded-2xl border border-cream-300 bg-cream-200 object-cover sm:h-60"
              />
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

/** Cartão do destaque: nome, duração, preço e o botão de agendar. */
function CartaoDestaque({
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
    <li
      className={`flex w-[74%] shrink-0 snap-start flex-col justify-between gap-3 rounded-2xl border p-4 transition-colors sm:w-[268px] ${
        selecionado
          ? 'border-gold-600 bg-gold-200/50'
          : 'border-cream-300 bg-cream-50'
      }`}
    >
      <div>
        <p className="text-[17px] leading-snug font-semibold text-noir-900">
          {nome}
        </p>
        <p className="mt-0.5 text-[12.5px] text-noir-500">{duracaoMin} min</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[15px] font-semibold tabular-nums ${
            selecionado ? 'text-gold-800' : 'text-noir-800'
          }`}
        >
          {formatarBRL(preco)}
        </span>
        <button
          type="button"
          onClick={aoEscolher}
          aria-pressed={selecionado}
          aria-label={`Agendar ${nome}`}
          className={`min-h-[38px] rounded-lg px-3.5 text-[12px] font-bold tracking-[0.1em] uppercase transition-colors ${
            selecionado
              ? 'border border-gold-600 text-gold-800'
              : 'bg-gold-500 text-noir-900 hover:bg-gold-400'
          }`}
        >
          {selecionado ? 'Escolhido' : 'Agendar'}
        </button>
      </div>
    </li>
  )
}

/**
 * "Destaques da casa" em carrossel: os serviços que o DONO escolheu em
 * Configurações, na ordem que ele gravou.
 *
 * Rolagem horizontal com `snap` em vez de setas e bolinhas: no celular o
 * arrasto é o gesto que a pessoa já conhece e não exige ponteiro fino nem
 * estado de "qual slide está na tela" — que é o que quebraria se a lista
 * mudasse de tamanho depois de montada.
 */
export function CarrosselDestaques({
  servicos,
  selecionado,
  aoEscolher,
}: {
  servicos: { nome: string; preco: number; duracaoMin: number }[]
  selecionado: string
  aoEscolher: (nome: string) => void
}) {
  if (servicos.length === 0) return null
  return (
    <div>
      <ul className={`-mx-4 flex snap-x snap-mandatory gap-3 px-4 sm:-mx-6 sm:px-6 ${SEM_BARRA}`}>
        {servicos.map((s) => (
          <CartaoDestaque
            key={s.nome}
            nome={s.nome}
            preco={s.preco}
            duracaoMin={s.duracaoMin}
            selecionado={selecionado === s.nome}
            aoEscolher={() => aoEscolher(s.nome)}
          />
        ))}
      </ul>
      {servicos.length > 1 && (
        <p className="mt-2 text-[11.5px] text-noir-400">
          Arraste para ver os outros destaques.
        </p>
      )}
    </div>
  )
}

/**
 * "Todos os serviços" em sanfona, agrupada pela CATEGORIA OFICIAL da casa.
 *
 * O agrupamento vem de `agruparPorCategoria` (migration 039) — a mesma
 * categoria que a equipe digita no cadastro. Serviço sem categoria cai em
 * "Outros" em vez de sumir.
 *
 * `<details>` nativo: abre e fecha sem uma linha de estado, o teclado e o
 * leitor de tela já sabem o que é, e o primeiro grupo vem aberto para a pessoa
 * não precisar descobrir que existe uma lista escondida. Depois de montado,
 * quem abre e fecha é o navegador — o React só escreve o atributo uma vez.
 */
export function SanfonaServicos({
  grupos,
  selecionado,
  aoEscolher,
}: {
  grupos: { categoria: string; servicos: { nome: string; preco: number; duracaoMin: number }[] }[]
  selecionado: string
  aoEscolher: (nome: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {grupos.map((grupo, indice) => (
        <details
          key={grupo.categoria}
          open={indice === 0}
          className="group rounded-2xl border border-cream-300 bg-cream-50"
        >
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="text-[15px] font-semibold text-noir-900">
              {grupo.categoria}
            </span>
            <span className="flex items-center gap-2 text-[12.5px] text-noir-500">
              {grupo.servicos.length}
              <span
                aria-hidden="true"
                className="text-[11px] transition-transform group-open:rotate-180"
              >
                ▼
              </span>
            </span>
          </summary>
          <ul className="flex flex-col gap-2 px-3 pb-3">
            {grupo.servicos.map((s) => (
              <li key={s.nome}>
                <CartaoServicoVitrine
                  nome={s.nome}
                  preco={s.preco}
                  duracaoMin={s.duracaoMin}
                  selecionado={selecionado === s.nome}
                  aoEscolher={() => aoEscolher(s.nome)}
                />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

/**
 * "Nossa equipe": quem trabalha na casa, com a foto que o dono cadastrou.
 *
 * É INFORMAÇÃO, não escolha: aqui ninguém é selecionado. O profissional é
 * escolhido na etapa seguinte, onde a Agenda já diz quem está livre no dia.
 * Por isso estes cartões não são botão — botão que não faz nada é pior que
 * texto, e a pessoa ia procurar onde clicar.
 */
export function EquipeVitrine({ profissionais }: { profissionais: PessoaVitrine[] }) {
  if (profissionais.length === 0) return null
  return (
    <div>
      <TituloSecao>Nossa equipe</TituloSecao>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {profissionais.map((p) => (
          <li
            key={p.id ?? p.nome}
            className="flex items-center gap-3 rounded-2xl border border-cream-300 bg-cream-50 p-3"
          >
            {p.foto ? (
              <img
                src={p.foto}
                alt=""
                loading="lazy"
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream-200 font-serif-display text-[15px] font-semibold text-noir-600"
              >
                {p.nome.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 text-[15px] font-semibold text-noir-900">
              {p.nome}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-noir-400">
        Você escolhe o profissional no próximo passo, com quem estiver livre no
        dia.
      </p>
    </div>
  )
}
