import { digitosDosTelefones, type Cliente } from '@/modules/clientes/types'

/**
 * Busca de clientes para os seletores administrativos.
 *
 * Fica num módulo próprio (e não dentro do componente) para que o arquivo do
 * seletor exporte apenas componentes — é o que mantém o Fast Refresh do Vite
 * funcionando. Não guarda estado nem conhece React: é só a regra de filtragem.
 *
 * Regra: casa por QUALQUE parte do nome, ignorando acentos e caixa, e também
 * por dígitos de telefone quando o operador digita algo que parece telefone.
 * Só clientes ativos entram no resultado — inativar nunca apaga o histórico.
 */

/** Remove acentos e caixa, para comparar "João" com "Joao". */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Filtra e ordena por nome, respeitando o limite de itens exibidos. */
export function filtrarClientesParaSelecao(
  clientes: Cliente[],
  busca: string,
  limite = 50,
): Cliente[] {
  const termo = normalizarParaBusca(busca)
  // Cliente inativo nunca entra na lista — é o mesmo comportamento que os
  // `<select>` antigos tinham, e inativar um cadastro não pode sumir com o
  // histórico nem liberar o cadastro para novos atendimentos.
  const ativos = clientes
    .filter((cliente) => cliente.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  if (!termo) return ativos.slice(0, limite)
  const digitos = termo.replace(/\D/g, '')
  return ativos
    .filter((cliente) => {
      if (normalizarParaBusca(cliente.nome).includes(termo)) return true
      if (digitos.length >= 3) {
        return digitosDosTelefones(cliente.telefone, cliente.telefones).some(
          (telefone) => telefone.includes(digitos),
        )
      }
      return false
    })
    .slice(0, limite)
}

/**
 * Informação auxiliar para distinguir nomes iguais ou parecidos: o telefone,
 * já em (DDD) NNNNN-NNNN. Vazio quando o cadastro não tem telefone.
 */
export function auxiliarCliente(cliente: Cliente): string {
  const primeiro = digitosDosTelefones(cliente.telefone, cliente.telefones)[0]
  if (!primeiro) return ''
  const ddd = primeiro.slice(0, 2)
  const resto = primeiro.slice(2)
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`
}