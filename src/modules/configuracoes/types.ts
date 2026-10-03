import { COMISSAO_PADRAO } from '@/modules/clube/pote'

// Configurações do sistema — tipos e validação.
//
// Fonte ÚNICA (migration 022, tabela `configuracoes_sistema`): links oficiais,
// avaliação, chaves de notificação, parâmetros da IA e benefícios do Clube.
// Estas regras são a MESMA que o servidor valida (`audax_config_valida`); a
// tela valida para dar retorno imediato, nunca para sustituir o servidor.
//
// Duas garantias embutidas nos valores padrão:
//   • `avaliacao.link` e `clube.beneficios` começam VAZIOS de propósito — sem
//     configuração, a IA não envia link de avaliação nem promete benefício
//     nenhum (itens 8 e 15);
//   • desligar uma chave de notificação NÃO impede agendamento — a notificação
//     é o que para, não a agenda (item 12).
export type ChaveConfig =
  | 'links'
  | 'avaliacao'
  | 'notificacoes'
  | 'clube'
  | 'ia'
  | 'barbearia'

export const CHAVES_CONFIG: ChaveConfig[] = [
  'links',
  'avaliacao',
  'notificacoes',
  'clube',
  'ia',
  'barbearia',
]

export type ConfigLinks = { painel: string; avaliacao: string }
export type ConfigAvaliacao = { ativa: boolean; link: string; mensagem: string }
export type ConfigNotificacoes = {
  confirmacaoCliente: boolean
  profissionalAgendamento: boolean
  posAtendimento: boolean
  avaliacao: boolean
}
/**
 * Regras do Audax Club (migration 028).
 *
 * coberturas: categoria de serviço coberta por plano — ilimitado.
 *   Os nomes precisam bater com \servicos.categoria\. Categoria vazia nunca
 *   é coberta, então sobrancelha, químicos e produtos ficam de fora por padrão.
 * desconto: fração (0.10 = 10%). \categorias\ diz QUAIS categorias contam
 *   como procedimento químico; lista vazia = nenhum desconto químico ainda.
 * pote: o pote e sempre 100% da receita de assinaturas recebida no periodo.
 * comissao: comissao do profissional sobre a sua parcela do pote (0.40 = 40%).
 *   \tivo\ liga o botão de fechamento; \participantes\ vazio = todos.
 */
export type ConfigClube = {
  /** Benefícios em texto para a IA. Vazio = a IA não promete nada. */
  beneficios: Record<string, string[]>
  coberturas: Record<string, string[]>
  desconto: {
    quimicos: number
    produtos: number
    categorias: string[]
  }
  pote: {
    ativo: boolean
    participantes: string[]
  }
  /**
   * Comissão do profissional sobre a PRÓPRIA parcela do pote.
   * Fração (0.40 = 40%) — o padrão do Studio Audax. O pote NÃO tem
   * percentual: ele é sempre 100% da receita de assinaturas recebida.
   */
  comissao: {
    percentual: number
  }
}
export type ConfigIa = {
  maxSugestoes: number
  botoesInterativos: boolean
  nomeAtendente: string
}

export type ConfigBarbearia = {
  endereco: string
  telefone: string
  instagram: string
  mapa: string
  /**
   * Serviços em destaque na vitrine do agendamento público, na ordem gravada.
   *
   * Escolha do DONO, não ranking automático: o banco não tem contagem de
   * serviços e não vamos inventar uma. Vazio = a vitrine mostra só a lista
   * completa, sem nenhuma seção de destaque.
   */
  destaques: string[]
}

export type Configuracoes = {
  links: ConfigLinks
  avaliacao: ConfigAvaliacao
  notificacoes: ConfigNotificacoes
  clube: ConfigClube
  ia: ConfigIa
  barbearia: ConfigBarbearia
}

/** Padrão idêntico ao `CONFIG_PADRAO` da Edge Function. */
export const CONFIG_PADRAO: Configuracoes = {
  links: { painel: '', avaliacao: '' },
  avaliacao: { ativa: false, link: '', mensagem: '' },
  notificacoes: {
    confirmacaoCliente: true,
    profissionalAgendamento: true,
    posAtendimento: true,
    avaliacao: true,
  },
  clube: {
    beneficios: {},
    coberturas: { cabelo: [], barba: [], cabelo_barba: [] },
    desconto: { quimicos: 0, produtos: 0, categorias: [] },
    pote: { ativo: false, participantes: [] },
    comissao: { percentual: COMISSAO_PADRAO },
  },
ia: { maxSugestoes: 2, botoesInterativos: false, nomeAtendente: 'Audax' },
  barbearia: { endereco: '', telefone: '', instagram: '', mapa: '', destaques: [] },
}

export type EstadoConfig = {
  dados: Configuracoes
  carregando: boolean
  salvando: boolean
  erro: string | null
  /** true quando veio do banco; false = padrão assumido (sem Supabase/erro) */
  doBanco: boolean
  salvar: (chave: ChaveConfig) => Promise<void>
  recarregar: () => Promise<void>
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
  if (typeof valor === 'boolean') return valor
  if (valor === 'true') return true
  if (valor === 'false') return false
  return padrao
}

function inteiro(valor: unknown, padrao: number, min: number, max: number): number {
  // Ausente/vazio NÃO é zero: sem valor, vale o padrão.
  if (valor === null || valor === undefined) return padrao
  const bruto = typeof valor === 'string' ? valor.trim() : valor
  if (bruto === '') return padrao
  const numero = typeof bruto === 'number' ? bruto : Number(bruto)
  if (!Number.isFinite(numero)) return padrao
  const inteiroReal = Math.trunc(numero)
  return inteiroReal < min || inteiroReal > max ? padrao : inteiroReal
}

/** Só http(s) ou vazio — mesmo limite do servidor. */
export function linkValido(valor: string): boolean {
  const limpo = (valor ?? '').trim()
  if (!limpo) return true
  return /^https?:\/\/[^\s]+$/.test(limpo)
}

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

/** Normaliza o jsonb do banco; campo fora do formato cai no padrão. */
export function normalizarConfiguracoes(dados: unknown): Configuracoes {
  const raiz = objeto(dados)
  const links = objeto(raiz.links)
  const avaliacao = objeto(raiz.avaliacao)
  const notificacoes = objeto(raiz.notificacoes)
  const clube = objeto(raiz.clube)
  const coberturas = objeto(clube.coberturas)
  const desconto = objeto(clube.desconto)
  const pote = objeto(clube.pote)
  const comissao = objeto(clube.comissao)
  const ia = objeto(raiz.ia)
  const barbearia = objeto(raiz.barbearia)
  // Todo link passa pelo mesmo filtro de esquema — inclusive `avaliacao.link`,
  // que é o que a IA usa no pós-atendimento.
  const painel = texto(links.painel, '', 500)
  const linkAvaliacao = texto(links.avaliacao, '', 500)
  const linkPos = texto(avaliacao.link, '', 500)
  return {
    links: {
      painel: linkValido(painel) ? painel : '',
      avaliacao: linkValido(linkAvaliacao) ? linkAvaliacao : '',
    },
    avaliacao: {
      ativa: booleano(avaliacao.ativa, CONFIG_PADRAO.avaliacao.ativa),
      link: linkValido(linkPos) ? linkPos : '',
      mensagem: texto(avaliacao.mensagem, '', 600),
    },
    notificacoes: {
      confirmacaoCliente: booleano(
        notificacoes.confirmacaoCliente,
        CONFIG_PADRAO.notificacoes.confirmacaoCliente,
      ),
      profissionalAgendamento: booleano(
        notificacoes.profissionalAgendamento,
        CONFIG_PADRAO.notificacoes.profissionalAgendamento,
      ),
      posAtendimento: booleano(
        notificacoes.posAtendimento,
        CONFIG_PADRAO.notificacoes.posAtendimento,
      ),
      avaliacao: booleano(notificacoes.avaliacao, CONFIG_PADRAO.notificacoes.avaliacao),
    },
    clube: {
      beneficios: beneficios(clube.beneficios),
      coberturas: coberturaDe(coberturas),
      desconto: {
        quimicos: fracao(desconto.quimicos),
        produtos: fracao(desconto.produtos),
        categorias: listaDeTexto(desconto.categorias, 12),
      },
      pote: {
        ativo: booleano(pote.ativo, CONFIG_PADRAO.clube.pote.ativo),
        participantes: listaDeTexto(pote.participantes, 40),
      },
      comissao: {
        // Fração: 0.40 = 40% de comissão sobre a parcela do pote.
        // Aceita 0.40 ou 40; o servidor valida de novo.
        percentual: fracaoComPadrao(
          comissao.percentual ?? comissao.fracao,
          CONFIG_PADRAO.clube.comissao.percentual,
        ),
      },
    },
    ia: {
      maxSugestoes: inteiro(ia.maxSugestoes, CONFIG_PADRAO.ia.maxSugestoes, 0, 3),
      botoesInterativos: booleano(ia.botoesInterativos, CONFIG_PADRAO.ia.botoesInterativos),
      nomeAtendente: texto(ia.nomeAtendente, CONFIG_PADRAO.ia.nomeAtendente, 40),
    },
    barbearia: {
      endereco: texto(barbearia.endereco, '', 300),
      telefone: telefoneBarbearia(barbearia.telefone),
      instagram: texto(barbearia.instagram, '', 300),
      mapa: linkValido(texto(barbearia.mapa, '', 500))
        ? texto(barbearia.mapa, '', 500)
        : '',
      // Destaques: nomes de serviço do catálogo oficial. Servem de filtro no
      // catálogo público — um nome que não existir simplesmente não aparece.
      destaques: listaDeTexto(barbearia.destaques, 12).map((d) =>
        texto(d, '', 80),
      ),
    },
  }
}

/** Fração de desconto entre 0 e 1 (0.10 = 10%). Fora da faixa = 0. */
function fracao(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0
  return Math.round(n * 10000) / 10000
}

/**
 * Comissão do pote: aceita a fração canônica (0.40) e também a forma em
 * porcentagem que o dono digita na tela (40 → 0.40). Valores acima de 1 são
 * normalizados; fora de 0..100 cai no padrão — a tela nunca salva lixo.
 */
function fracaoComPadrao(valor: unknown, padrao: number): number {
  const n = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(n) || n < 0) return padrao
  const fracaoConvertida = n > 1 ? n / 100 : n
  if (fracaoConvertida > 1) return padrao
  return Math.round(fracaoConvertida * 10000) / 10000
}

/** Lista de texto, sem entradas vazias. */
function listaDeTexto(valor: unknown, limite: number): string[] {
  return Array.isArray(valor)
    ? valor
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, limite)
    : []
}

/** Coberturas por plano — só texto, sem número mágico no código. */
function coberturaDe(bruto: Record<string, unknown>): Record<string, string[]> {
  return {
    cabelo: listaDeTexto(bruto.cabelo, 12),
    barba: listaDeTexto(bruto.barba, 12),
    cabelo_barba: listaDeTexto(bruto.cabelo_barba, 12),
  }
}

/**
 * Telefone da casa: só dígitos, até 15 (mesmo limite do cliente). Espelha o
 * `telefoneBarbearia` da Edge Function.
 */
function telefoneBarbearia(valor: unknown): string {
  const digitos = texto(valor, '', 40).replace(/\D/g, '')
  return digitos.length > 15 ? '' : digitos
}

/** Motivo de recusa ou null — espelha `audax_config_valida` do servidor. */
export function problemaNaConfig(
  chave: ChaveConfig,
  valor: unknown,
): string | null {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return 'Configuração inválida.'
  }
  const bloco = valor as Record<string, unknown>
  if (chave === 'links' || chave === 'avaliacao') {
    for (const campo of ['painel', 'avaliacao', 'link'] as const) {
      if (!(campo in bloco)) continue
      if (typeof bloco[campo] !== 'string') return 'Link inválido.'
      if (!linkValido(bloco[campo] as string)) return 'Link inválido.'
    }
  }
if (chave === 'avaliacao' && 'mensagem' in bloco) {
    if (typeof bloco.mensagem !== 'string') return 'Mensagem de avaliação inválida.'
    if (bloco.mensagem.length > 600) return 'Mensagem de avaliação grande demais.'
  }
  if (chave === 'barbearia') {
    for (const campo of ['endereco', 'instagram'] as const) {
      if (!(campo in bloco)) continue
      if (typeof bloco[campo] !== 'string') return 'Dados da barbearia inválidos.'
      if ((bloco[campo] as string).length > 300) {
        return 'Dados da barbearia grandes demais.'
      }
    }
    if ('mapa' in bloco) {
      if (typeof bloco.mapa !== 'string' || !linkValido(bloco.mapa as string)) {
        return 'Link de mapa inválido.'
      }
    }
    if ('telefone' in bloco) {
      if (typeof bloco.telefone !== 'string') return 'Telefone da barbearia inválido.'
      const digitos = (bloco.telefone as string).replace(/\D/g, '')
      if (digitos.length > 15) return 'Telefone da barbearia inválido.'
    }
  }
  return null
}

/** Valor da chave, pronto para `admin_configuracao_salvar`. */
export function valorDaChave(
  chave: ChaveConfig,
  dados: Configuracoes,
): Record<string, unknown> {
  const bloco = dados[chave]
  return { ...bloco } as unknown as Record<string, unknown>
}

export const ROTULO_CHAVE: Record<ChaveConfig, string> = {
  links: 'Links oficiais',
  avaliacao: 'Avaliação',
  notificacoes: 'Notificações automáticas',
  clube: 'Audax Club',
ia: 'Atendente de IA',
  barbearia: 'Barbearia',
}

export const DESCRICAO_CHAVE: Record<ChaveConfig, string> = {
  links: 'Endereços usados pela IA e pelo pós-atendimento.',
  avaliacao: 'Mensagem e link enviados depois do atendimento concluído.',
  notificacoes:
    'O que é enviado automaticamente. Desligar impede o ENVIO — nunca o agendamento.',
  clube:
    'Benefícios por plano. Vazio significa que a IA não informa benefício nenhum.',
ia: 'Parâmetros de conversa da IA do WhatsApp.',
  barbearia:
    'Endereço, telefone/WhatsApp, Instagram e mapa. Vazio = a página pública e a IA não mostram esse dado.',
}
