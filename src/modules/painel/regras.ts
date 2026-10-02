import type { EstadoVinculo } from './tipos'

/** Rotas do painel do cliente (`#/painel/...`). */
export type RotaPainel =
  | 'inicio'
  | 'entrar'
  | 'cadastrar'
  | 'recuperar'
  | 'redefinir'
  | string

/**
 * A rota atual é a do PAINEL DO CLIENTE? Mesmo critério de `#/agendar`:
 * hash `#/painel...` ou pathname terminando em `/painel`. O retorno do
 * e-mail do Supabase (`#access_token=...&type=...`) também conta — sem
 * isto o link de confirmação/recuperação cairia no portão do app interno.
 */
export function ehRotaPainel(): boolean {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === '/painel' || hash.startsWith('/painel/')) return true
  if (hashAuthRedirect()) return true
  return /\/painel\/?$/.test(window.location.pathname)
}

/** Subrota após `#/painel/` ('' ou ausente = 'inicio'). */
export function rotaPainelAtual(): RotaPainel {
  if (typeof window === 'undefined') return 'inicio'
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === '/painel') return 'inicio'
  if (hash.startsWith('/painel/')) {
    return hash.slice('/painel/'.length) || 'inicio'
  }
  return 'inicio'
}

export function navegarPainel(rota: string): void {
  window.location.hash = rota ? `#/painel/${rota}` : '#/painel'
}

/**
 * O hash atual carrega o retorno de um link do Supabase (e-mail)?
 * `recovery` = redefinição de senha; `signup` = confirmação de conta.
 */
export function hashAuthRedirect(): 'recovery' | 'signup' | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (hash.includes('type=recovery')) return 'recovery'
  if (hash.includes('type=signup')) return 'signup'
  return null
}

/** Remove os tokens de e-mail do hash (depois de confirmar/redefinir). */
export function limparHashAuth(): void {
  if (typeof window === 'undefined') return
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search + '#/painel',
  )
}

/** Destino do e-mail de recuperação — volta direto no formulário de redefinição. */
export function urlRedefinicao(): string {
  if (typeof window === 'undefined') return '#/painel/redefinir'
  return `${window.location.origin}${window.location.pathname}#/painel/redefinir`
}

function ehFalhaDeConexao(texto: string): boolean {
  return /fetch|network|conex|failed to/i.test(texto)
}

export function mensagemErroCadastro(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (ehFalhaDeConexao(texto)) return 'Falha de conexão. Tente novamente.'
  if (/already (registered|exists)/i.test(texto)) {
    return 'Este e-mail já tem uma conta. Entre ou recupere a senha.'
  }
  if (/password/i.test(texto)) {
    return 'A senha precisa de pelo menos 6 caracteres.'
  }
  return 'Não foi possível criar a conta. Tente novamente.'
}

export function mensagemErroRecuperacao(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (ehFalhaDeConexao(texto)) return 'Falha de conexão. Tente novamente.'
  return 'Não foi possível enviar o e-mail. Tente novamente.'
}

export function mensagemErroRedefinicao(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (ehFalhaDeConexao(texto)) return 'Falha de conexão. Tente novamente.'
  if (/password should be at least|at least 6/i.test(texto)) {
    return 'A senha precisa de pelo menos 6 caracteres.'
  }
  if (/session|jwt|token|recovery|expired/i.test(texto)) {
    return 'A sessão de recuperação expirou. Solicite um novo link.'
  }
  return 'Não foi possível redefinir a senha. Tente novamente.'
}

/**
 * Mensagem do vínculo: os erros da RPC 018 já são amigáveis e nunca
 * expõem dados de outro cadastro — só textos conhecidos passam; o resto
 * vira frase genérica (não vaza erro interno do banco).
 */
export function mensagemErroVinculo(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (ehFalhaDeConexao(texto)) return 'Falha de conexão. Tente novamente.'
  if (
    /Informe seu nome|Informe um telefone|Sessão expirada|Não foi possível concluir/i.test(
      texto,
    )
  ) {
    return texto
  }
  return 'Não foi possível verificar seu cadastro. Tente novamente.'
}

/**
 * Mensagem ao salvar o perfil: os erros da RPC `painel_cliente_atualizar`
 * (018) já são amigáveis e nunca vazam dados — só textos conhecidos
 * passam; o resto vira frase genérica.
 */
export function mensagemErroPerfil(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : ''
  if (ehFalhaDeConexao(texto)) return 'Falha de conexão. Tente novamente.'
  if (
    /Informe seu nome|Informe um telefone|Sessão expirada|não está vinculado/i.test(
      texto,
    )
  ) {
    return texto
  }
  return 'Não foi possível salvar o cadastro. Tente novamente.'
}

/** Aviso da tela de vínculo para cada estado da prova de identidade. */
export function avisoParaEstadoVinculo(estado: EstadoVinculo): string {
  if (estado === 'ambiguo') {
    return 'Mais de um cadastro parece com seus dados. Confirme com sua data de nascimento.'
  }
  if (estado === 'precisa_dados') {
    return 'Encontramos possíveis cadastros, mas precisamos confirmar seus dados.'
  }
  if (estado === 'nao_confirmado') {
    return 'Não foi possível confirmar seus dados. Revise o nome e o telefone.'
  }
  return ''
}

/** O estado exige o campo de nascimento no formulário de vínculo? */
export function exigeNascimento(estado: EstadoVinculo): boolean {
  return estado === 'ambiguo' || estado === 'precisa_dados'
}

export const AVISO_CONFIRME_EMAIL =
  'Enviamos um link de confirmação para o seu e-mail. Abra o link para ativar a conta.'

export const AVISO_LINK_ENVIADO =
  'Se este e-mail estiver cadastrado, o link de redefinição foi enviado.'

export function telefoneValido(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, '')
  return digitos.length >= 10 && digitos.length <= 13
}

export function nomeValido(nome: string): boolean {
  return nome.trim().length >= 2
}

export function senhaValida(senha: string): boolean {
  return senha.length >= 6
}
