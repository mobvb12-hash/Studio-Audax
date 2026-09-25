// Regras puras do módulo Profissionais — validação de cadastro e filtro
// de status ativo/inativo (inativar preserva histórico).
import type { Profissional } from './types'

/** Mensagem de erro amigável ou null quando o profissional é válido. */
export function validarProfissional(entrada: {
  nome: string
  telefone?: string
  email?: string
}): string | null {
  if (entrada.nome.trim().length < 2) {
    return 'Informe o nome completo do profissional.'
  }
  const telefone = (entrada.telefone ?? '').trim()
  if (telefone && telefone.replace(/\D/g, '').length < 8) {
    return 'Informe um telefone válido ou deixe em branco.'
  }
  const email = (entrada.email ?? '').trim()
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return 'Informe um e-mail válido ou deixe em branco.'
  }
  return null
}

/** Profissionais que podem receber novos agendamentos. */
export function filtrarProfissionaisAtivos(
  profissionais: Profissional[],
): Profissional[] {
  return profissionais.filter((p) => p.ativo)
}
