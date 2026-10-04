import type { MotivoSessao, SessaoInfo } from '@/modules/auth/tipos'

/**
 * Painel do cliente — contrato da camada de autenticação + vínculo.
 * O provider consome ESTE interface; o adaptador do Supabase
 * (services/supabase/painel) a implementa — nos testes entra um cliente
 * falso sem rede.
 */

/** Por que a sessão mudou; `recuperar` = link de redefinição de senha. */
export type MotivoPainel = MotivoSessao | 'recuperar'

export type DadosCadastro = {
  nome: string
  email: string
  telefone: string
  /**
   * Data de nascimento, `YYYY-MM-DD`.
   *
   * É um dos cinco campos obrigatórios do cadastro. NÃO vai para o
   * `raw_user_meta_data` da conta (isso fica no JWT, que o próprio navegador
   * lê): ele viaja só para a RPC `painel_cliente_vincular` (018), que usa na
   * prova de identidade e grava em `clientes.nascimento`.
   */
  nascimento: string
  senha: string
}

/**
 * Estados devolvidos por `painel_cliente_vincular` (018) — nunca dados de
 * outro cadastro, só o resultado da prova de identidade.
 */
export type EstadoVinculo =
  | 'vinculado'
  | 'criado'
  | 'ambiguo'
  | 'precisa_dados'
  | 'nao_confirmado'

export type ResultadoVinculo = {
  estado: EstadoVinculo
  clienteId?: string
}

/** Colunas editáveis do cadastro pelo próprio cliente (RPC da 018). */
export type DadosPerfilPainel = {
  nome: string
  telefone: string
  nascimento: string
  genero: string
}

export type RegistroCliente = DadosPerfilPainel & {
  id: string
  email: string
}

export type ClientePainel = {
  sessao(): Promise<SessaoInfo | null>
  /** Confirma a sessão COM o servidor (mesma semântica do ClienteAuth). */
  confirmar(): Promise<boolean>
  observar(
    mudou: (sessao: SessaoInfo | null, motivo: MotivoPainel) => void,
  ): () => void
  /** Lança Error com mensagem pronta quando as credenciais falham. */
  entrar(email: string, senha: string): Promise<SessaoInfo>
  sair(): Promise<void>
  /**
   * Cria a conta (Supabase Auth). Devolve `null` quando a confirmação de
   * e-mail está ativa no projeto — o painel entra no estado `confirme_email`.
   */
  cadastrar(dados: DadosCadastro): Promise<SessaoInfo | null>
  recuperar(email: string): Promise<void>
  redefinir(senha: string): Promise<void>
  vincular(
    nome: string | null,
    telefone: string | null,
    nascimento: string,
  ): Promise<ResultadoVinculo>
  atualizar(dados: DadosPerfilPainel): Promise<RegistroCliente>
}
