import type { FormEvent } from 'react'

/** Impede o reload da página e dispara a ação do formulário. */
export function submeterFormulario(evento: FormEvent, acao: () => void): void {
  evento.preventDefault()
  acao()
}
