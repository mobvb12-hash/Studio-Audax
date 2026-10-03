/**
 * Helpers de apresentação compartilhados por páginas e componentes.
 *
 * Somente formatação/rotulação visual — nenhuma regra de negócio aqui.
 * As funções foram centralizadas a partir de cópias idênticas espalhadas
 * em páginas e modais (chips, iniciais, datas).
 */

/** Classe Tailwind do chip/pill de filtro (ativo vs inativo). */
export function chipClasse(ativa: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
    ativa
      ? 'border-[#8A6A14] bg-[#8A6A14] text-white'
      : 'border-[#E5DCC3] bg-white text-[#4A4436] hover:border-[#8A6A14]'
  }`
}

/** Data ISO (aaaa-mm-dd) no formato curto pt-BR. */
export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR')
}

/**
 * Data local (aaaa-mm-dd) de um timestamp ISO.
 *
 * `criadoEm`/`atualizadoEm` chegam como ISO UTC (`.toISOString()`), mas os
 * períodos do sistema (`periodoMes`, `hojeISO`) são calculados em HORÁRIO
 * LOCAL — sem esta conversão, um registro criado às 22h de dia 30 vira "dia
 * 31" (ou dia 1 do mês seguinte) e some dos relatórios do mês correto.
 * Strings já em formato data (`aaaa-mm-dd`) são devolvidas intactas.
 */
export function dataLocal(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** Hora local (HH:mm) de um timestamp ISO — par de `dataLocal`. */
export function horaLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16)
  const hora = String(d.getHours()).padStart(2, '0')
  const minuto = String(d.getMinutes()).padStart(2, '0')
  return `${hora}:${minuto}`
}

/** Data/hora ISO completa no formato legível pt-BR (dia/mês/ano hora:minuto). */
export function formatarISO(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Iniciais do nome (primeiro + último) para avatares. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (!partes[0]) return '??'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * Formata um telefone brasileiro para exibição enquanto o usuário digita.
 *
 * Entrada aceita qualquer texto — só os dígitos interessam. O resultado é
 * progressivo (nunca esconde o que já foi digitado):
 * - celular (11 dígitos, ou número iniciado por 9): `81 99737-3593`
 * - linha fixa (10 dígitos): `81 3232-1111`
 * - até 2 dígitos: somente os dígitos
 * - mais de 11 dígitos: devolvidos intactos, sem formato inventado
 */
export function mascararTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '')
  const n = d.length
  if (n <= 2 || n > 11) return d
  const celular = n === 11 || d[2] === '9'
  if (celular) {
    return n > 7
      ? `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`
      : `${d.slice(0, 2)} ${d.slice(2)}`
  }
  return n > 6
    ? `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`
    : `${d.slice(0, 2)} ${d.slice(2)}`
}

/** Classe padrão dos campos de texto dos formulários/modais. */
export const CAMPO_FORM =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

/** Classe padrão dos selects de filtro em páginas (sem largura full). */
export const CAMPO_SELECT =
  'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

/** Classe padrão dos rótulos (labels) dos formulários/modais. */
export const ROTULO_FORM =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'

/**
 * Classes base da ÁREA DO CLIENTE (creme / preto / dourado).
 *
 * Vivem aqui, e não no kit de componentes, para que aquele arquivo exporte
 * apenas componentes — o que mantém o Fast Refresh do Vite funcionando.
 */
export const CX_CLIENTE = {
  tela: 'min-h-screen bg-cream-100 text-noir-900',
  conteudo: 'mx-auto w-full max-w-xl px-4 pt-6 pb-24 sm:px-6 sm:pt-10',
} as const
