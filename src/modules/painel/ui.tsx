import type { ReactNode } from 'react'

/**
 * Kit visual do ÁREA DO CLIENTE (Painel do Cliente e agendamento público).
 *
 * Um único lugar para a linguagem visual: creme, preto, branco e dourado
 * Audax. Tudo aqui é APRESENTAÇÃO — nenhuma regra de negócio, nenhum dado
 * inventado e nenhuma chamada de rede. Os valores vêm sempre dos serviços
 * oficiais (catálogo, Agenda, cadastro do cliente).
 *
 * Mobile-first: alvos de toque grandes, sem rolagem horizontal, grade que
 * colapsa em telas pequenas e hierarquia feita por espaço/tamanho em vez de
 * sombra — premium sem exagero.
 *
 * Este arquivo exporta SOMENTE componentes: as classes de página ficam em
 * `CX_CLIENTE` (@/lib/apresentacao), o que preserva o Fast Refresh.
 */

/** Marca do Studio Audax — serifa discreta, sem exuberância. */
export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <div className={compacta ? 'text-center' : 'text-center'}>
      <p className="font-serif-display text-[11px] font-semibold tracking-[0.34em] text-gold-600 uppercase">
        Studio
      </p>
      <p className="font-serif-display text-[22px] leading-none font-semibold tracking-[0.18em] text-noir-900 uppercase">
        Audax
      </p>
    </div>
  )
}

export function Cabecalho({
  marca = true,
  titulo,
  subtitulo,
  direita,
}: {
  marca?: boolean
  titulo: string
  subtitulo?: string
  direita?: ReactNode
}) {
  return (
    <header className="mb-6">
      {direita ? (
        <div className="mb-5 flex items-start justify-between gap-3">
          <Marca />
          {direita}
        </div>
      ) : (
        marca && (
          <div className="mb-5">
            <Marca />
          </div>
        )
      )}
      <h1 className="font-serif-display text-[26px] leading-tight font-semibold text-noir-900 sm:text-[30px]">
        {titulo}
      </h1>
      {subtitulo && (
        <p className="mt-1.5 text-[14px] leading-relaxed text-noir-500">{subtitulo}</p>
      )}
    </header>
  )
}

/**
 * Progresso do agendamento. Fica discreto: um traço por etapa, com a etapa
 * atual em dourado e as concluídas com marca de check.
 */
export function Passos({
  etapas,
  atual,
}: {
  etapas: string[]
  atual: number
}) {
  return (
    <ol className="mb-6 flex items-center gap-1.5" aria-label="Progresso do agendamento">
      {etapas.map((etapa, indice) => {
        const concluida = indice < atual
        const ativa = indice === atual
        return (
          <li key={etapa} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className={`h-1 w-full rounded-full transition-colors ${
                concluida ? 'bg-gold-500' : ativa ? 'bg-gold-500' : 'bg-cream-300'
              }`}
              aria-hidden="true"
            />
            <span
              className={`truncate text-[10px] leading-tight font-medium tracking-wide uppercase ${
                ativa ? 'text-gold-700' : concluida ? 'text-noir-400' : 'text-noir-300'
              }`}
            >
              {etapa}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Cartão de etapa: número + título + instrução curta. */
export function Bloco({
  numero,
  titulo,
  children,
  descricao,
  acao,
}: {
  numero?: number
  titulo: string
  descricao?: string
  children: ReactNode
  acao?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-cream-300 bg-cream-50 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {numero !== undefined && (
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-500 text-[11px] font-bold text-noir-900"
              aria-hidden="true"
            >
              {numero}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] leading-tight font-semibold text-noir-900">
              {titulo}
            </h2>
            {descricao && (
              <p className="mt-1 text-[13px] leading-relaxed text-noir-500">
                {descricao}
              </p>
            )}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

export type OpcaoItem = {
  id: string
  titulo: string
  descricao?: string
  preco?: string
}

/**
 * Opção selecionável em formato de "tile". Um toque grande, estado de seleção
 * em dourado com contraste suficiente, e o texto sempre em bloco — nada de
 * item estreito apertado no celular.
 */
export function Opcao({
  item,
  selecionado,
  aoEscolher,
  multilinha = false,
}: {
  item: OpcaoItem
  selecionado: boolean
  aoEscolher: () => void
  multilinha?: boolean
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionado}
      aria-label={[item.titulo, item.descricao, item.preco]
        .filter(Boolean)
        .join(' ')}
      className={[
        'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
        multilinha ? 'min-h-[56px]' : 'min-h-[52px]',
        selecionado
          ? 'border-gold-500 bg-gold-200/60 ring-1 ring-gold-500'
          : 'border-cream-300 bg-cream-50 hover:border-gold-400 hover:bg-cream-100',
      ].join(' ')}
    >
      {/* Nome acessível explícito: o leitor de tela precisa ouvir "Corte 40 min
          R$ 70,00", e não "Corte40 minR$ 70,00" — o `gap` do flex não conta
          como espaço na hora de montar o rótulo. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-snug font-medium text-noir-900">
          {item.titulo}
        </span>
        {item.descricao && (
          <span className="mt-0.5 block truncate text-[12.5px] text-noir-500">
            {item.descricao}
          </span>
        )}
      </span>
      {item.preco && (
        <span
          className={`shrink-0 text-[14px] font-semibold tabular-nums ${
            selecionado ? 'text-gold-800' : 'text-noir-700'
          }`}
        >
          {item.preco}
        </span>
      )}
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selecionado ? 'border-gold-600 bg-gold-500' : 'border-cream-400'
        }`}
        aria-hidden="true"
      >
        {selecionado && (
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-noir-900" fill="none">
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  )
}

/** Grade de horários: 3 colunas em telas maiores, 3 também no celular estreito. */
export function GradeOpcoes({
  items,
  children,
  colunas = 3,
}: {
  items: OpcaoItem[]
  children: (item: OpcaoItem) => ReactNode
  colunas?: 2 | 3 | 4
}) {
  const grade =
    colunas === 2
      ? 'grid-cols-2'
      : colunas === 4
        ? 'grid-cols-3 sm:grid-cols-4'
        : 'grid-cols-3'
  return <div className={`grid gap-2 ${grade}`}>{items.map((item) => children(item))}</div>
}

/** Botão de horário — célula compacta, mas com alvo de toque confortável. */
export function BotaoHorario({
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
      className={`min-h-[48px] rounded-xl border text-[14px] font-semibold tabular-nums transition-colors ${
        selecionado
          ? 'border-gold-600 bg-gold-500 text-noir-900 shadow-[0_1px_0_rgba(18,17,14,0.12)]'
          : 'border-cream-300 bg-cream-50 text-noir-700 hover:border-gold-400 hover:bg-cream-100'
      }`}
    >
      {hora}
    </button>
  )
}

/**
 * Botão de SLOT: horário + profissional no mesmo toque.
 *
 * É o que resolve "Cleiton e Ítalo ao mesmo tempo": cada par
 * horário × profissional vira um botão próprio e clicável. A hora é o dado
 * grande (é o que o cliente procura) e o profissional vem embaixo, discreto.
 * Escolher o slot já ESCOLHE o profissional — não existe passo separado.
 */
export function BotaoSlot({
  hora,
  profissional,
  selecionado,
  aoEscolher,
}: {
  hora: string
  profissional: string
  selecionado: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionado}
      aria-label={`Horário ${hora} com ${profissional}`}
      className={`flex min-h-[62px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 transition-colors ${
        selecionado
          ? 'border-gold-600 bg-gold-500 text-noir-900 shadow-[0_1px_0_rgba(18,17,14,0.12)]'
          : 'border-cream-300 bg-cream-50 text-noir-800 hover:border-gold-400 hover:bg-cream-100'
      }`}
    >
      <span className="text-[16px] leading-none font-semibold tabular-nums">
        {hora}
      </span>
      <span
        className={`max-w-full truncate text-[11.5px] leading-tight ${
          selecionado ? 'text-noir-800' : 'text-noir-500'
        }`}
      >
        {profissional}
      </span>
    </button>
  )
}

/**
 * Botão de serviço com o rótulo `[ ESCOLHER ]` explícito.
 *
 * Um cartão por serviço, do jeito que o cliente lê: nome em destaque, preço e
 * duração logo abaixo e o verbo de ação escrito — nada de descobrir o que um
 * botão faz só pelo formato.
 */
export function CartaoServico({
  nome,
  preco,
  duracaoMin,
  selecionado,
  aoEscolher,
}: {
  nome: string
  preco: string
  duracaoMin: number
  selecionado: boolean
  aoEscolher: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={selecionado}
      aria-label={`${nome} — ${preco} — ${duracaoMin} minutos`}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        selecionado
          ? 'border-gold-600 bg-gold-200/50 ring-1 ring-gold-600'
          : 'border-cream-300 bg-cream-50 hover:border-gold-400 hover:bg-cream-100'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-snug font-semibold text-noir-900">
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
          {preco}
        </span>
        <span
          className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold tracking-[0.1em] uppercase ${
            selecionado
              ? 'border-gold-600 bg-gold-500 text-noir-900'
              : 'border-cream-400 text-noir-500'
          }`}
        >
          {selecionado ? 'Escolhido' : 'Escolher'}
        </span>
      </span>
    </button>
  )
}

/** Botão que abre um link externo (maps, WhatsApp, Instagram). */
export function BotaoLink({
  children,
  href,
  variante = 'secundario',
}: {
  children: ReactNode
  href: string
  variante?: 'primario' | 'secundario'
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-center text-[13.5px] font-semibold transition-colors ${
        variante === 'primario'
          ? 'bg-gold-500 text-noir-900 hover:bg-gold-400'
          : 'border border-cream-300 bg-cream-50 text-noir-800 hover:border-gold-400 hover:bg-cream-100'
      }`}
    >
      {children}
    </a>
  )
}

export function Botao({
  children,
  aoClicar,
  tipo = 'button',
  desabilitado,
  cheio = true,
  variante = 'primario',
  tamanho = 'md',
}: {
  children: ReactNode
  aoClicar: () => void
  tipo?: 'button' | 'submit'
  desabilitado?: boolean
  cheio?: boolean
  variante?: 'primario' | 'secundario' | 'fantasma'
  tamanho?: 'sm' | 'md' | 'lg'
}) {
  const altura =
    tamanho === 'lg'
      ? 'min-h-[54px] px-6 text-[15px]'
      : tamanho === 'sm'
        ? 'min-h-[40px] px-3.5 text-[13px]'
        : 'min-h-[48px] px-5 text-[14px]'
  const estilo =
    variante === 'primario'
      ? 'bg-gold-500 text-noir-900 font-semibold hover:bg-gold-400 active:bg-gold-600'
      : variante === 'secundario'
        ? 'border border-cream-300 bg-cream-50 text-noir-800 font-medium hover:border-gold-400 hover:bg-cream-100'
        : 'text-noir-500 font-medium hover:text-noir-900'
  return (
    <button
      type={tipo}
      onClick={aoClicar}
      disabled={desabilitado}
      className={[
        'inline-flex items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        altura,
        cheio ? 'w-full' : '',
        estilo,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** Linha do resumo: rótulo discreto, valor destacado. */
export function LinhaResumo({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] text-noir-500">{rotulo}</span>
      <span
        className={`text-right text-[14px] tabular-nums ${
          destaque ? 'font-bold text-noir-900' : 'font-medium text-noir-800'
        }`}
      >
        {valor}
      </span>
    </div>
  )
}

export function Resumo({ children }: { children: ReactNode }) {
  return (
    <dl className="divide-y divide-cream-200 rounded-xl border border-cream-300 bg-cream-100/60 px-4 py-1">
      {children}
    </dl>
  )
}

export function EstadoVazio({
  titulo,
  texto,
  children,
  alerta,
}: {
  titulo: string
  texto?: string
  children?: ReactNode
  /**
   * Marca o bloco como `alert` na árvore de acessibilidade. Use quando o
   * título/texto é um ERRO — leitores de tela precisam anunciar a falha,
   * não só mostrá-la.
   */
  alerta?: boolean
}) {
  return (
    <div
      role={alerta ? 'alert' : undefined}
      className="rounded-2xl border border-dashed border-cream-400 bg-cream-50 px-5 py-8 text-center"
    >
      <p className="font-serif-display text-[17px] font-semibold text-noir-800">
        {titulo}
      </p>
      {texto && <p className="mt-1.5 text-[13.5px] text-noir-500">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

export function Carregando({ texto }: { texto: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-10 text-[14px] text-noir-500"
    >
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-cream-400 border-t-gold-600"
        aria-hidden="true"
      />
      {texto}
    </div>
  )
}

export function Aviso({
  texto,
  tipo = 'erro',
}: {
  texto: string
  tipo?: 'erro' | 'info'
}) {
  if (!texto) return null
  return (
    <p
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed ${
        tipo === 'erro'
          ? 'border-noir-300/60 bg-cream-100 text-noir-800'
          : 'border-gold-300 bg-gold-200/50 text-noir-800'
      }`}
    >
      {texto}
    </p>
  )
}

export function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  placeholder,
  autoComplete,
  inputMode,
  obrigatorio,
  dica,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  tipo?: string
  placeholder?: string
  autoComplete?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email'
  obrigatorio?: boolean
  dica?: string
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12px] font-semibold tracking-[0.1em] text-noir-600 uppercase"
      >
        {rotulo}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={obrigatorio}
        className="min-h-[52px] w-full rounded-xl border border-cream-300 bg-cream-50 px-4 text-[15px] text-noir-900 outline-none placeholder:text-noir-300 focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
      />
      {dica && <p className="mt-1.5 text-[12px] text-noir-500">{dica}</p>}
    </div>
  )
}

/**
 * Tela de sucesso. Mostra o que foi reservado e o que acontece agora —
 * nada de detalhe técnico de banco ou API para o cliente.
 */
export function Confirmacao({
  titulo,
  frase,
  children,
  acoes,
}: {
  titulo: string
  frase?: string
  children?: ReactNode
  acoes?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gold-300 bg-cream-50 p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-noir-900" fill="none">
            <path
              d="m5 12.5 4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h1 className="mt-4 font-serif-display text-[24px] leading-tight font-semibold text-noir-900">
          {titulo}
        </h1>
        {frase && (
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-noir-500">
            {frase}
          </p>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
      {acoes && <div className="mt-6 flex flex-col gap-2">{acoes}</div>}
    </div>
  )
}