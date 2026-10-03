// Configuração CENTRALIZADA do sistema (migration 022) lida pela Edge
// Function (funções puras: sem Deno, sem rede, sem segredos).
//
// Uma regra só: se a configuração não vier, o comportamento é EXATAMENTE o de
// antes desta etapa. Ausência de configuração nunca quebra atendimento —
// `lerConfiguracoes` devolve o PADRÃO e a origem (`padrao` | `banco`), e o
// index registra qual foi. Isso mantém o sistema operacional mesmo antes da
// tela de Configurações existir ou se a chave for apagada.
//
// Nada aqui inventa valor de negócio: `clube.beneficios` e `avaliacao.link`
// começam VAZIOS de propósito. Vazio = a IA não fala de benefício e não
// manda link de avaliação (nunca inventar, §8/§15).
import { motivoSeguro } from './acoes.ts'

export type ConfigLinks = { painel: string; avaliacao: string }
export type ConfigAvaliacao = { ativa: boolean; link: string; mensagem: string }
export type ConfigNotificacoes = {
  confirmacaoCliente: boolean
  profissionalAgendamento: boolean
  posAtendimento: boolean
  avaliacao: boolean
}
export type ConfigClube = { beneficios: Record<string, string[]> }
export type ConfigIa = {
  maxSugestoes: number
  botoesInterativos: boolean
  nomeAtendente: string
}

/**
 * Dados oficiais da casa (migration 027).
 *
 * `telefone` nasce VAZIO porque o número oficial da barbearia não está em
 * nenhuma migration nem config deste repositório — ele vive atrás do secret
 * EVOLUTION_INSTANCE. Vazio = a IA não fala telefone; ninguém inventa número.
 */
export type ConfigBarbearia = {
  endereco: string
  telefone: string
  instagram: string
  mapa: string
}

export type Configuracoes = {
  links: ConfigLinks
  avaliacao: ConfigAvaliacao
  notificacoes: ConfigNotificacoes
  clube: ConfigClube
  ia: ConfigIa
  barbearia: ConfigBarbearia
}

/**
 * Padrão = o comportamento de referência do sistema. `clube.beneficios` vazio,
 * `avaliacao.link` vazio e `barbearia.telefone` vazio são intencionais: sem
 * configuração a IA não afirma benefício, não envia link e não dá telefone.
 */
export const CONFIG_PADRAO: Configuracoes = {
  links: { painel: '', avaliacao: '' },
  avaliacao: { ativa: false, link: '', mensagem: '' },
  notificacoes: {
    confirmacaoCliente: true,
    profissionalAgendamento: true,
    posAtendimento: true,
    avaliacao: true,
  },
  clube: { beneficios: {} },
  ia: { maxSugestoes: 2, botoesInterativos: false, nomeAtendente: 'Audax' },
  barbearia: { endereco: '', telefone: '', instagram: '', mapa: '' },
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function texto(valor: unknown, padrao = '', max = 600): string {
  if (typeof valor !== 'string') return padrao
  const limpo = valor.trim()
  if (!limpo) return padrao
  return limpo.length > max ? limpo.slice(0, max) : limpo
}

function booleano(valor: unknown, padrao: boolean): boolean {
  if (valor === true || valor === false) return valor
  if (valor === 'true') return true
  if (valor === 'false') return false
  return padrao
}

/** Só http(s) ou vazio — mesmo limite do validador do banco (022). */
function link(valor: unknown): string {
  const bruto = texto(valor, '', 500)
  return /^https?:\/\/[^\s]+$/.test(bruto) ? bruto : ''
}

function inteiro(valor: unknown, padrao: number, min: number, max: number): number {
  // Ausente/vazio NÃO é zero: sem valor, vale o padrão. Sem esta guarda,
  // `maxSugestoes` ausente viraria 0 e desligaria a sugestão sem ninguém
  // pedir.
  if (valor === null || valor === undefined) return padrao
  const bruto = typeof valor === 'string' ? valor.trim() : valor
  if (bruto === '') return padrao
  const numero = typeof bruto === 'number' ? bruto : Number(bruto)
  if (!Number.isFinite(numero)) return padrao
  const inteiroReal = Math.trunc(numero)
  return inteiroReal < min || inteiroReal > max ? padrao : inteiroReal
}

/** Benefícios: mapa plano → lista de textos. Entrada que não é texto some. */
function beneficios(valor: unknown): Record<string, string[]> {
  const mapa: Record<string, string[]> = {}
  for (const [plano, lista] of Object.entries(objeto(valor))) {
    if (!Array.isArray(lista)) continue
    const itens = lista
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 10)
    if (itens.length) mapa[plano] = itens
  }
  return mapa
}

/**
 * Normaliza o jsonb da RPC `ia_configuracoes_ler` no formato da conversa.
 * Campo ausente/válido demais cai no PADRÃO — nunca lança, nunca inventa.
 */
export function normalizarConfiguracoes(dados: unknown): Configuracoes {
  const raiz = objeto(dados)

  const blocoLinks = objeto(raiz.links)
  const blocoAvaliacao = objeto(raiz.avaliacao)
  const blocoNotificacoes = objeto(raiz.notificacoes)
  const blocoClube = objeto(raiz.clube)
  const blocoIa = objeto(raiz.ia)
  const blocoBarbearia = objeto(raiz.barbearia)

  return {
    links: {
      painel: link(blocoLinks.painel),
      avaliacao: link(blocoLinks.avaliacao),
    },
    avaliacao: {
      ativa: booleano(blocoAvaliacao.ativa, CONFIG_PADRAO.avaliacao.ativa),
      link: link(blocoAvaliacao.link) || link(blocoLinks.avaliacao),
      mensagem: texto(blocoAvaliacao.mensagem, '', 600),
    },
    notificacoes: {
      confirmacaoCliente: booleano(
        blocoNotificacoes.confirmacaoCliente,
        CONFIG_PADRAO.notificacoes.confirmacaoCliente,
      ),
      profissionalAgendamento: booleano(
        blocoNotificacoes.profissionalAgendamento,
        CONFIG_PADRAO.notificacoes.profissionalAgendamento,
      ),
      posAtendimento: booleano(
        blocoNotificacoes.posAtendimento,
        CONFIG_PADRAO.notificacoes.posAtendimento,
      ),
      avaliacao: booleano(blocoNotificacoes.avaliacao, CONFIG_PADRAO.notificacoes.avaliacao),
    },
    clube: { beneficios: beneficios(blocoClube.beneficios) },
    ia: {
      maxSugestoes: inteiro(blocoIa.maxSugestoes, CONFIG_PADRAO.ia.maxSugestoes, 0, 3),
      botoesInterativos: booleano(
        blocoIa.botoesInterativos,
        CONFIG_PADRAO.ia.botoesInterativos,
      ),
      nomeAtendente: texto(blocoIa.nomeAtendente, CONFIG_PADRAO.ia.nomeAtendente, 40),
    },
    barbearia: {
      endereco: texto(blocoBarbearia.endereco, '', 300),
      // Só dígitos e sinal: o número que o dono digita nunca vira comando.
      telefone: telefoneBarbearia(blocoBarbearia.telefone),
      instagram: texto(blocoBarbearia.instagram, '', 300),
      mapa: link(blocoBarbearia.mapa),
    },
  }
}

/** Telefone da casa: só `+` e dígitos, até 15 (mesmo limite do cliente). */
function telefoneBarbearia(valor: unknown): string {
  const bruto = texto(valor, '', 40)
  const digitos = bruto.replace(/\D/g, '')
  if (!digitos || digitos.length > 15) return ''
  return digitos
}

export type ConfiguracoesLidas = {
  config: Configuracoes
  /** true = veio do banco; false = padrão assumido por falha/ausência */
  doBanco: boolean
  motivo: string | null
}

/**
 * Lê a configuração e degrada com segurança: erro da RPC, json inválido ou
 * vazio → PADRÃO + log. O atendimento NUNCA depende de a configuração existir.
 */
export function lerConfiguracoes(carregar: () => Promise<unknown>): Promise<ConfiguracoesLidas> {
  return carregar()
    .then((dados) => {
      if (dados === null || dados === undefined) {
        return { config: CONFIG_PADRAO, doBanco: false, motivo: 'configuracao-vazia' }
      }
      return { config: normalizarConfiguracoes(dados), doBanco: true, motivo: null }
    })
    .catch((erro: unknown) => ({
      config: CONFIG_PADRAO,
      doBanco: false,
      motivo: motivoSeguro(erro instanceof Error ? erro.message : 'erro'),
    }))
}

/**
 * Benefícios CONFIGURADOS de um plano. Lista vazia = a IA não fala de
 * benefício — é isso que impede inventar promessa (§8).
 */
export function beneficiosDoPlano(config: Configuracoes, plano: string): string[] {
  const lista = config.clube.beneficios[plano]
  return Array.isArray(lista) ? lista : []
}
