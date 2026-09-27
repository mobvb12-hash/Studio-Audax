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

/** Classe padrão dos campos de texto dos formulários/modais. */
export const CAMPO_FORM =
  'w-full rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

/** Classe padrão dos selects de filtro em páginas (sem largura full). */
export const CAMPO_SELECT =
  'rounded-lg border border-[#E5DCC3] bg-white px-3 py-2 text-sm text-[#1C1A15] outline-none focus:border-[#8A6A14]'

/** Classe padrão dos rótulos (labels) dos formulários/modais. */
export const ROTULO_FORM =
  'mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#8A8171] uppercase'
