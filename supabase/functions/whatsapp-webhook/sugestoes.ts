// Sugestão INTELIGENTE de serviço complementar (item 3). Funções puras.
//
// Regras que este módulo não pode quebrar (§3):
//   • sugere SÓ o que está REALMENTE cadastrado: os ids vêm de
//     `servicos.complementos` (coluna oficial, editada pelo admin) e são
//     resolvidos contra o catálogo oficial — nunca inventa serviço nem preço;
//   • NUNCA sugere algo que o cliente já escolheu (Corte + Barba não gera
//     "Barba" de novo);
//   • é DISCRETA e OPCIONAL: um convite, nunca uma etapa obrigatória. O
//     cliente sempre pode ignorar e seguir confirmando o que já escolheu;
//   • não vira funil de venda: no máximo `limite` itens (2 por padrão, teto 3),
//     e nada de repetir a oferta se o cliente já recusou uma vez.
import type { FonteServico } from './ia.ts'
import { normalizar } from './texto.ts'

export type SugestaoComplemento = {
  id: string
  nome: string
  preco: number | string | null
  duracaoMin: number | null
}

/** Preço do catálogo oficial; nada de valor escrito à mão. */
function precoLegivel(valor: number | string | null | undefined): string {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `R$ ${valor.toFixed(2).replace('.', ',')}`
  }
  if (typeof valor === 'string') {
    const numero = Number(valor)
    if (Number.isFinite(numero)) return `R$ ${numero.toFixed(2).replace('.', ',')}`
  }
  return ''
}

/**
 * Complementos do serviço escolhido, resolvidos no catálogo e sem repetir o que
 * já está na seleção. Serviço base sem `complementos`, inativo ou com lista
 * vazia → lista vazia (não há o que sugerir).
 */
export function sugerirComplementos(
  catalogo: FonteServico[],
  servicoEscolhido: string | null,
  jaEscolhidos: string[],
  limite = 2,
): SugestaoComplemento[] {
  const teto = Math.max(0, Math.min(Math.trunc(limite), 3))
  if (!teto) return []
  if (!servicoEscolhido) return []

  const base = catalogo.find(
    (s) => s.nome === servicoEscolhido && s.ativo !== false,
  )
  if (!base || !Array.isArray(base.complementos) || !base.complementos.length) return []

  const naoEscolhidos = new Set(jaEscolhidos.filter(Boolean))
  naoEscolhidos.add(servicoEscolhido)

  const sugestoes: SugestaoComplemento[] = []
  const vistos = new Set<string>()
  for (const id of base.complementos) {
    if (sugestoes.length >= teto) break
    if (typeof id !== 'string' || !id.trim()) continue
    if (vistos.has(id) || naoEscolhidos.has(id)) continue
    const alvo = catalogo.find((s) => s.id === id && s.ativo !== false)
    if (!alvo || !alvo.nome) continue
    vistos.add(id)
    sugestoes.push({
      id,
      nome: alvo.nome,
      preco: alvo.preco ?? null,
      duracaoMin: typeof alvo.duracaoMin === 'number' ? alvo.duracaoMin : null,
    })
  }
  return sugestoes
}

/**
 * Texto da sugestão. Deliberadamente curto e opcional: uma linha de convite,
 * o nome do serviço e o preço oficial, e a saída mais óbvia ("pode seguir
 * assim"). Sem pressão, sem CTA de venda.
 */
export function sugestoesMsg(sugestoes: SugestaoComplemento[]): string {
  if (!sugestoes.length) return ''
  const itens = sugestoes.map((s) => {
    const preco = precoLegivel(s.preco)
    return preco ? `${s.nome} (${preco})` : s.nome
  })
  const lista = itens.length > 1
    ? itens.slice(0, -1).join(', ') + ' ou ' + itens.at(-1)
    : itens[0]
  return (
    `Só uma sugestão: ${lista} combina bastante com o que você escolheu. ` +
    'Quer adicionar ou pode seguir assim como está?'
  )
}

/**
 * O cliente recusou/ignorou a sugestão deste serviço? Então não oferece de novo
 * no mesmo atendimento — evita a "sequência agressiva de vendas" (§3).
 */
export function podeSugerir(servicoEscolhido: string | null, jaRecusados: string[]): boolean {
  if (!servicoEscolhido) return false
  return !jaRecusados.includes(servicoEscolhido)
}

/** Houve recusa/negação nesta mensagem? (para marcar e não repetir) */
export function ehRecusaDeSugestao(texto: string): boolean {
  const t = normalizar(texto)
  if (!t) return false
  return (
    /^(nao|deixa|dispensavel|obrigado|pode ser assim|sem sugest)[.!,\s]*$/.test(t) ||
    /\b(deixa pra depois|depois eu vejo|pode seguir assim|nao precisa|nem precisa)\b/.test(t)
  )
}
