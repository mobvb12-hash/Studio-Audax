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

/**
 * Horário de funcionamento, agrupado por dia.
 *
 * "Segunda a sexta" é um AGRUPAMENTO de leitura, não uma regra: se os cinco
 * dias não tiverem o mesmo horário, caem em linhas separadas. Isso é o que
 * segura a tela honesta quando a casa muda o sábado — em vez de prometer o
 * horário de segunda numa sexta que fecha mais cedo.
 *
 * Só mostra o que a casa configurou (`barbearia.horarios`). Dia sem entrada
 * usa o expediente geral da Agenda, que não é público aqui:omitir é melhor que
 * chutar. Com o mesmo conjunto, `agenda_expediente_do_dia` monta a grade.
 */
export function linhasDeHorario(
  horarios: BarbeariaPublica['horarios'],
): { nome: string; texto: string }[] {
  if (!horarios) return []
  const hora = (chave: string) => {
    const d = horarios[chave]
    return d ? `${d.inicio} às ${d.fim}` : ''
  }
  const linhas: { nome: string; texto: string }[] = []
  const semana = ['1', '2', '3', '4', '5'].map(hora).filter(Boolean)
  if (semana.length === 5 && new Set(semana).size === 1) {
    linhas.push({ nome: 'Segunda a sexta', texto: semana[0] })
  } else {
    for (const [chave, nome] of [
      ['1', 'Segunda'],
      ['2', 'Terça'],
      ['3', 'Quarta'],
      ['4', 'Quinta'],
      ['5', 'Sexta'],
    ] as const) {
      const texto = hora(chave)
      if (texto) linhas.push({ nome, texto })
    }
  }
  const sabado = hora('6')
  if (sabado) linhas.push({ nome: 'Sábado', texto: sabado })
  const domingo = hora('0')
  if (domingo) linhas.push({ nome: 'Domingo', texto: domingo })
  return linhas
}

