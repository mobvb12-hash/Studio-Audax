export function normalizarTexto(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** Converte "1.234,56" / "70.00" / "70" em número. */
export function parseMoeda(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'))
}
