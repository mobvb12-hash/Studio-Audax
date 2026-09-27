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

/**
 * Converte "1.234,56" / "70,00" / "70.00" / "70" em número.
 *
 * O separador que aparece **por último** é o decimal: vírgula no pt-BR e
 * ponto em texto vindo de outro idioma. Ponto só é tratado como milhar
 * quando o padrão é inequívoco ("1.234", "1.234.567"), porque remover
 * todos os pontos cegamente faria "70.00" virar 7000.
 */
export function parseMoeda(texto: string): number {
  const limpo = texto.trim().replace(/\s/g, '')
  const ultimoPonto = limpo.lastIndexOf('.')
  const ultimaVirgula = limpo.lastIndexOf(',')

  if (ultimoPonto < 0 && ultimaVirgula < 0) return Number(limpo)

  if (ultimaVirgula > ultimoPonto) {
    // vírgula por último → decimal; os pontos são milhares ("1.234,56")
    return Number(limpo.replace(/\./g, '').replace(',', '.'))
  }

  if (ehMilhar(limpo, ultimoPonto)) {
    // ponto inequívoco de milhar ("1.234" / "1.234.567")
    return Number(limpo.replace(/[.,]/g, ''))
  }

  // ponto por último → decimal ("70.00"); separadores anteriores são milhar
  const cabeca = limpo.slice(0, ultimoPonto).replace(/[.,]/g, '')
  const cauda = limpo.slice(ultimoPonto + 1).replace(/[.,]/g, '')
  return Number(`${cabeca}.${cauda}`)
}

/** Último ponto é de milhar: cauda com exatamente 3 dígitos e grupos válidos. */
function ehMilhar(texto: string, ultimoPonto: number): boolean {
  const cauda = texto.slice(ultimoPonto + 1)
  if (!/^\d{3}$/.test(cauda)) return false
  const grupos = texto.split('.')
  return grupos.every((grupo, indice) => {
    if (indice === grupos.length - 1) return true
    return indice === 0 ? /^\d{1,3}$/.test(grupo) : /^\d{3}$/.test(grupo)
  })
}
