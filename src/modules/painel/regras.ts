import { ESTADO_VAZIO } from '@/modules/agendamento/estado'
import type { EstadoAgendamento } from '@/modules/agendamento/estado'
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
 * As DUAS URLs públicas e divulgáveis do Studio Audax.
 *
 * São paths de verdade (não hash): é o que o cliente recebe no Instagram, no
 * WhatsApp, em status e em QR Code, e o que o Vercel serve via rewrite do
 * `vercel.json`. Os caminhos antigas por hash continuam valendo.
 */
export const CAMINHO_AGENDAR = '/agendar'
export const CAMINHO_CLIENTE = '/cliente'

/** Qual área a URL atual abre. */
export type AreaPública = 'agendar' | 'cliente' | 'app'

/**
 * Resolve a área pela URL.
 *
 * O HASH tem precedência sobre o pathname, e isso é_load-bearing: sem isso,
 * `/agendar#/painel` (o cliente pulando do agendamento para a Área do
 * Cliente) abriria a Agenda de novo, porque o pathname continua sendo
 * `/agendar`. O hash é o que também carrega o retorno de e-mail do Supabase.
 */
export function areaPelaUrl(): AreaPública {
  if (typeof window === 'undefined') return 'app'
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === '/painel' || hash.startsWith('/painel/')) return 'cliente'
  if (hash === '/agendar' || hash.startsWith('/agendar/')) return 'agendar'
  if (hashAuthRedirect()) return 'cliente'

  const caminho = window.location.pathname.replace(/\/+$/, '')
  if (caminho.endsWith(CAMINHO_AGENDAR)) return 'agendar'
  // `/cliente` é a URL oficial; `/painel` é o nome antigo e continua abrindo.
  if (caminho.endsWith(CAMINHO_CLIENTE)) return 'cliente'
  if (/\/painel$/.test(caminho)) return 'cliente'
  return 'app'
}

/** A rota atual é a do AGENDAMENTO PÚBLICO (`/agendar`)? */
export function ehRotaPublica(): boolean {
  return areaPelaUrl() === 'agendar'
}

/** A rota atual é a da ÁREA DO CLIENTE (`/cliente`)? */
export function ehRotaPainel(): boolean {
  return areaPelaUrl() === 'cliente'
}

/** URL absoluta da Área do Cliente — a que entra em cardápio e QR Code. */
export function urlAreaDoCliente(): string {
  if (typeof window === 'undefined') return CAMINHO_CLIENTE
  return `${window.location.origin}${CAMINHO_CLIENTE}`
}

/** URL absoluta do agendamento público. */
export function urlAgendamentoOficial(): string {
  if (typeof window === 'undefined') return CAMINHO_AGENDAR
  return `${window.location.origin}${CAMINHO_AGENDAR}`
}

/** Chave do preenchimento que viaja do painel para o agendamento. */
const CHAVE_PREENCHIMENTO = 'studio-audax:agendar:preenchimento'

export type PreenchimentoCliente = { nome: string; telefone: string }

/**
 * Vai para a Área do Cliente.
 *
 * A troca entre as duas áreas é uma navegação de verdade (não um hash): cada
 * uma tem URL oficial para poder ser divulgada sozinha. Sem isso, o botão
 * "Já sou cliente" do agendamento abriria `/agendar#/painel`, que é difícil de
 * compartilhar e não é o endereço oficial.
 *
 * `aba` opcional: leva a intenção junto (ex.: quem acabou de agendar quer cair
 * em "Agendamentos"), mas o endereço continua sendo `/cliente` para copiar e
 * colar — o hash é só o destino dentro da área.
 */
export function irParaAreaDoCliente(aba?: string): void {
  if (typeof window === 'undefined') return
  const destino = `${urlAreaDoCliente()}${aba ? `#/painel/${aba}` : ''}`
  if (areaPelaUrl() === 'cliente') {
    navegarPainel(aba ?? '')
    return
  }
  window.location.assign(destino)
}

/**
 * Vai para o agendamento OFICIAL, levando nome e telefone do cadastro para
 * o formulário já nascer preenchido.
 *
 * A identidade viaja por `sessionStorage`, nunca na URL: nome e telefone em
 * query string vazam em print, histórico e compartilhamento de link.
 */
export function irParaAgendamentoOficial(preenchimento?: PreenchimentoCliente): void {
  if (typeof window === 'undefined') return
  if (preenchimento?.nome || preenchimento?.telefone) {
    try {
      window.sessionStorage.setItem(
        CHAVE_PREENCHIMENTO,
        JSON.stringify({
          nome: preenchimento.nome ?? '',
          telefone: preenchimento.telefone ?? '',
        }),
      )
    } catch {
      // sessionStorage indisponível: o fluxo abre vazio, sem quebrar nada.
    }
  }
  if (areaPelaUrl() === 'agendar') return
  window.location.assign(urlAgendamentoOficial())
}

/**
 * Lê (sem apagar) o preenchimento deixado pelo painel do cliente.
 *
 * A leitura é separada do apagado de propósito: o estado inicial do
 * formulário é inicializado na primeira renderização, e o `sessionStorage` é
 * apagado num efeito — sem `setState` dentro do efeito, que o lint proíbe.
 */
export function lerPreenchimento(): PreenchimentoCliente | null {
  if (typeof window === 'undefined') return null
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_PREENCHIMENTO)
    if (!bruto) return null
    const dados = JSON.parse(bruto) as Partial<PreenchimentoCliente>
    return { nome: String(dados.nome ?? ''), telefone: String(dados.telefone ?? '') }
  } catch {
    return null
  }
}

/** Apaga o preenchimento: ele vale para uma visita, não para sempre. */
export function limparPreenchimento(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CHAVE_PREENCHIMENTO)
  } catch {
    // sessionStorage indisponível: nada a limpar.
  }
}

/* -------------------------------------------------------------------------- */
/* Retomada do agendamento: a ponte /agendar → /cliente → /agendar              */
/* -------------------------------------------------------------------------- */

/**
 * Chave do rascunho de agendamento guardado quando falta identificação.
 *
 * O fluxo público exige conta antes de confirmar. A pessoa escolheu serviço,
 * profissional, data e horário — apagar tudo mandaria ela recomeçar do zero
 * depois de criar a conta, e é aí que o abandono acontece. O rascunho fica no
 * `sessionStorage` (uma visita, não um dispositivo) e o fluxo o restaura quando
 * ela volta autenticada.
 *
 * Por que em `painel/regras` e não em `agendamento`: é a MESMA ponte do
 * `CHAVE_PREENCHIMENTO` acima — o troco entre as duas áreas mora aqui, e
 * `PainelAuthProvider` precisa ler isto sem importar o módulo de agendamento
 * para dentro dele.
 */
const CHAVE_RETOMADA = 'studio-audax:agendar:retomada'

/** Vida do rascunho. Passou disso, a pessoa refaz as escolhas. */
const VIDA_RETOMADA_MS = 30 * 60 * 1000

type RetomadaBruta = {
  estado?: Partial<EstadoAgendamento>
  salvoEm?: number
}

function normalizarRetomada(estado: Partial<EstadoAgendamento> | undefined) {
  const e = estado ?? {}
  return {
    ...ESTADO_VAZIO,
    servicoNome: String(e.servicoNome ?? ''),
    profissional: String(e.profissional ?? ''),
    data: String(e.data ?? ''),
    horario: String(e.horario ?? ''),
    complementoIds: Array.isArray(e.complementoIds)
      ? e.complementoIds.map(String)
      : [],
    nome: String(e.nome ?? ''),
    telefone: String(e.telefone ?? ''),
    // Sem estas duas linhas o rascunho voltaria SEM o e-mail e o nascimento
    // digitados: `...ESTADO_VAZIO` preenche com '' e some com o que a pessoa
    // acabou de escrever.
    email: String(e.email ?? ''),
    nascimento: String(e.nascimento ?? ''),
    observacao: String(e.observacao ?? ''),
  } satisfies EstadoAgendamento
}

/** Guarda o que a pessoa já escolheu antes de ir identificar-se. */
export function salvarRetomadaAgendamento(estado: EstadoAgendamento): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      CHAVE_RETOMADA,
      JSON.stringify({ estado, salvoEm: Date.now() }),
    )
  } catch {
    // sessionStorage indisponível: ela refaz as escolhas. Nada quebra.
  }
}

/**
 * Lê o rascunho (sem apagar) para o fluxo restaurar.
 *
 * `null` = não há rascunho, rascunho velho ou rascunho malformado. Toda
 * entrada é normalizada contra `ESTADO_VAZIO`: o que veio do `sessionStorage`
 * não é dado confiável, e um objeto incompleto não pode derrubar a etapa.
 */
export function lerRetomadaAgendamento(): EstadoAgendamento | null {
  if (typeof window === 'undefined') return null
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_RETOMADA)
    if (!bruto) return null
    const dados = JSON.parse(bruto) as RetomadaBruta
    if (typeof dados.salvoEm !== 'number') return null
    if (Date.now() - dados.salvoEm > VIDA_RETOMADA_MS) {
      limparRetomadaAgendamento()
      return null
    }
    const estado = normalizarRetomada(dados.estado)
    // Só vale restaurar um tentativa que chegou até o horário. Um rascunho
    // incompleto (escrito à mão, ou de uma versão antiga do fluxo) jogaria a
    // pessoa na etapa de extras sem nada escolhido — e o resumo sairia em
    // branco. Nesses casos é melhor recomeçar do que restaurar pela metade.
    if (!estado.servicoNome || !estado.profissional || !estado.data || !estado.horario) {
      limparRetomadaAgendamento()
      return null
    }
    return estado
  } catch {
    return null
  }
}

/** Há um rascunho novo o bastante para valer a pena restaurar? */
export function temRetomadaAgendamento(): boolean {
  return lerRetomadaAgendamento() !== null
}

/** Apaga o rascunho: ele vale para uma tentativa, não para sempre. */
export function limparRetomadaAgendamento(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CHAVE_RETOMADA)
  } catch {
    // sessionStorage indisponível: nada a limpar.
  }
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

/**
 * Navega entre as abas da Área do Cliente.
 *
 * Muda só o hash — o pathname `/cliente` continua de pé, então a URL
 * oficial sobrevive à navegação e o evento `hashchange` é nativo.
 */
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

/**
 * Data de nascimento em `YYYY-MM-DD` (é o que o campo `type="date"` entrega)
 * e que a RPC 018 normaliza com `audax_nascimento_iso`.
 *
 * Não é só "não vazio": uma data impossível (`2026-13-45`) passaria pelo
 * formato e a RPC devolveria `''`, o que derrubaria a prova de identidade sem
 * que a pessoa entendesse por quê.
 */
export function nascimentoValido(nascimento: string): boolean {
  const valor = nascimento.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const data = new Date(ano, mes - 1, dia)
  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) {
    return false
  }
  // Ninguém nasceu amanhã. Passa pelo formato, mas é uma data impossível como
  // data de nascimento — e a prova de identidade a rejeitaria lá na frente.
  return data.getTime() <= Date.now()
}
