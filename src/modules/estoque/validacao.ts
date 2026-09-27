export function validarQuantidadeEstoque(
  quantidade: number,
  nomeProduto: string,
  estoqueDisponivel: number,
  quantidadeNoCarrinho = 0,
): string | null {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return 'Quantidade deve ser um número inteiro maior que zero.'
  }
  const soma = quantidadeNoCarrinho + quantidade
  if (soma > estoqueDisponivel) {
    return quantidadeNoCarrinho > 0
      ? `Estoque insuficiente para "${nomeProduto}": disponível ${estoqueDisponivel}, no carrinho ${quantidadeNoCarrinho} + ${quantidade}.`
      : `Estoque insuficiente para "${nomeProduto}": disponível ${estoqueDisponivel}, solicitado ${quantidade}.`
  }
  return null
}
