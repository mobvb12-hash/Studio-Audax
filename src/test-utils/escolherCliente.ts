import { fireEvent, screen } from '@testing-library/react'

/**
 * Escolhe um cliente no `SeletorCliente` (o combobox com busca que substituiu o
 * `<select>` cru nas telas administrativas).
 *
 * Os testes drivesm o componente como o usuário faria: abre o campo, digita
 * parte do nome e clica no resultado. O rótulo é paramétrico porque o mesmo
 * componente aparece em telas diferentes.
 */
export async function escolherCliente(termo: string, rotulo = 'Cliente') {
  const campo = screen.getByRole('combobox', { name: rotulo })
  fireEvent.focus(campo)
  fireEvent.change(campo, { target: { value: termo } })
  const opcao = await screen.findByRole('option', {
    name: new RegExp(`^${termo}`, 'i'),
  })
  fireEvent.click(opcao)
}