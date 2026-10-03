import type { BarbeariaPublica } from '@/services/supabase/agendaPublica'

/**
 * Links públicos da barbearia — derivados dos DADOS OFICIAIS configurados,
 * nunca digitados aqui.
 *
 * Regra da casa: campo vazio = não inventar. Se o telefone oficial ainda não
 * foi cadastrado, o botão de WhatsApp simplesmente não existe — é melhor uma
 * seção sem botão do que um número falso em nome do Studio Audax.
 */

/** Só dígitos, com DDI. '55' entra quando o número local tem 10 ou 11 dígitos. */
export function digitosDoTelefone(bruto: string): string {
  const digitos = (bruto ?? '').replace(/\D/g, '')
  if (!digitos) return ''
  return digitos.startsWith('55') && digitos.length > 12 ? digitos : `55${digitos}`
}

/**
 * Link de conversa no WhatsApp, com a mensagem já escrita.
 * Vazio quando não há telefone oficial configurado.
 */
export function linkWhatsapp(
  barbearia: BarbeariaPublica,
  mensagem = 'Olá! Quero agendar um horário no Studio Audax.',
): string {
  const numero = digitosDoTelefone(barbearia.telefone)
  if (!numero) return ''
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

/**
 * Link do Instagram. Aceita tanto `@perfil` quanto a URL completa; normaliza
 * para o endereço público. Vazio quando não configurado.
 */
export function linkInstagram(barbearia: BarbeariaPublica): string {
  const bruto = (barbearia.instagram ?? '').trim()
  if (!bruto) return ''
  if (/^https?:\/\//i.test(bruto)) return bruto
  const perfil = bruto.replace(/^@+/, '').replace(/\/+$/, '')
  return perfil ? `https://instagram.com/${perfil}` : ''
}

/**
 * Link de mapa. Usa a URL oficial quando configurada; senão monta uma busca
 * pelo endereço oficial — que é a única coisa que o cliente precisa digitar,
 * e sempre com o texto que a própria casa cadastrou.
 */
export function linkMapa(barbearia: BarbeariaPublica): string {
  if (barbearia.mapa) return barbearia.mapa
  const endereco = (barbearia.endereco ?? '').trim()
  if (!endereco) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    endereco,
  )}`
}

/** Só o @perfil para exibir, sem URL. */
export function rotuloInstagram(barbearia: BarbeariaPublica): string {
  const bruto = (barbearia.instagram ?? '').trim()
  if (!bruto) return ''
  if (/^https?:\/\//i.test(bruto)) {
    const partes = bruto.replace(/\/+$/, '').split('/')
    return `@${partes[partes.length - 1]}`
  }
  return bruto.startsWith('@') ? bruto : `@${bruto}`
}

/** Telefone legível para exibir, ou '' quando não configurado. */
export function rotuloTelefone(barbearia: BarbeariaPublica): string {
  const digitos = (barbearia.telefone ?? '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  }
  return barbearia.telefone.trim()
}

/** A casa tem dados suficientes para merecer a seção? */
export function temDadosDaBarbearia(barbearia: BarbeariaPublica): boolean {
  return Boolean(
    barbearia.endereco.trim() ||
      barbearia.telefone.trim() ||
      barbearia.instagram.trim(),
  )
}