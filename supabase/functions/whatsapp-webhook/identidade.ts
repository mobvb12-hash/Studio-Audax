// Identificação do cliente por MÚLTIPLOS SINAIS + Clube (itens 6, 8, 9).
// Funções puras: sem Deno, sem rede, sem segredos.
//
// O telefone sozinho não identifica ninguém — no mundo real o mesmo número
// pode estar em mais de um cadastro. A decisão mora AQUI, e é deliberadamente
// conservadora:
//
//   unico    → um só cadastro e os sinais não se contradizem: segue automático;
//   ambiguo  → mais de um, ou sinais apontando para cadastros diferentes:
//              NÃO escolhe, pergunta (uma pergunta curta, nunca uma ficha);
//   novo     → nenhum sinal encontrou cadastro: oferece o cadastro do painel.
//
// CPF: entra como sinal forte, é validado no servidor (audax_cpf_valido) e
// NUNCA aparece completo — nem na mensagem, nem no log, nem no contexto
// persistido. Este módulo só enxerga `cpfMascarado` ('***.***.***-09').
import type { Configuracoes } from './configuracoes.ts'
import { beneficiosDoPlano } from './configuracoes.ts'
import { normalizar } from './texto.ts'

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type SituacaoIdentidade = 'novo' | 'ambiguo' | 'unico'

export type ClubeCliente = {
  plano: string
  ativo: boolean
  atrasado: boolean
  valorMensal: number | string | null
  dataAssinatura: string | null
  proximoVencimento: string | null
}

export type CandidatoCliente = {
  id: string
  nome: string
  sinais: string[]
  /** Mascarado pelo servidor; este módulo nunca recebe o CPF completo. */
  cpfMascarado: string | null
  clube: ClubeCliente | null
  agendamentosFuturos: number
}

export type ResultadoIdentidade = {
  situacao: SituacaoIdentidade
  sinais: string[]
  cpfInformado: boolean
  cpfValido: boolean
  candidatos: CandidatoCliente[]
}

/* ------------------------------------------------------------------ */
/* Interpretação da resposta da RPC (formalibdade — o resto é confiança) */
/* ------------------------------------------------------------------ */

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function texto(valor: unknown, max = 80): string {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : ''
}

function numero(valor: unknown): number | string | null {
  return typeof valor === 'number' || typeof valor === 'string' ? valor : null
}

function interpretarClube(valor: unknown): ClubeCliente | null {
  const bloco = objeto(valor)
  if (!Object.keys(bloco).length) return null
  const plano = texto(bloco.plano, 40)
  if (!plano) return null
  return {
    plano,
    ativo: bloco.ativo === true,
    atrasado: bloco.atrasado === true,
    valorMensal: numero(bloco.valorMensal),
    dataAssinatura: texto(bloco.dataAssinatura, 10) || null,
    proximoVencimento: texto(bloco.proximoVencimento, 10) || null,
  }
}

/**
 * Converte a resposta de `ia_clientes_identificar`. Dados fora do formato são
 * tratados como "não identificado" — nunca como confiança.
 */
export function interpretarIdentidade(dados: unknown): ResultadoIdentidade {
  const raiz = objeto(dados)
  const situacao = texto(raiz.situacao, 10)
  const candidatos = Array.isArray(raiz.candidatos)
    ? raiz.candidatos
        .map((item): CandidatoCliente | null => {
          const c = objeto(item)
          const id = texto(c.id, 80)
          if (!id) return null
          return {
            id,
            nome: texto(c.nome, 80),
            sinais: Array.isArray(c.sinais)
              ? c.sinais.filter((s): s is string => typeof s === 'string').slice(0, 5)
              : [],
            // o servidor já devolve mascarado; se vier algo completo, descarta
            cpfMascarado:
              typeof c.cpfMascarado === 'string' && /^\*{3}\.\*{3}\.\*{3}-\d{2}$/.test(c.cpfMascarado)
                ? c.cpfMascarado
                : null,
            clube: interpretarClube(c.clube),
            agendamentosFuturos:
              typeof c.agendamentosFuturos === 'number' && c.agendamentosFuturos >= 0
                ? c.agendamentosFuturos
                : 0,
          }
        })
        .filter((c): c is CandidatoCliente => c !== null)
    : []

  return {
    situacao: situacao === 'unico' || situacao === 'ambiguo' ? situacao : 'novo',
    sinais: Array.isArray(raiz.sinais)
      ? raiz.sinais.filter((s): s is string => typeof s === 'string').slice(0, 5)
      : [],
    cpfInformado: raiz.cpfInformado === true,
    cpfValido: raiz.cpfValido === true,
    candidatos,
  }
}

/* ------------------------------------------------------------------ */
/* CPF: extração do texto do cliente                                   */
/* ------------------------------------------------------------------ */

/**
 * CPF digitado como número: 11 dígitos seguidos (`... meia 12345678909`).
 * Sequência de exatamente 11 dígitos soltos é CPF; 10 ou 12 é telefone/data.
 */
export function extrairCpf(texto: string): string | null {
  const limpo = normalizar(texto ?? '')
  if (!limpo) return null
  const sequencia = limpo.match(/(?<!\d)(\d{11})(?!\d)/)
  if (sequencia) return sequencia[1]
  const formatado = limpo.match(/(?<!\d)(\d{3})\D+(\d{3})\D+(\d{3})\D+(\d{2})(?!\d)/)
  if (formatado) return `${formatado[1]}${formatado[2]}${formatado[3]}${formatado[4]}`
  return null
}

/** O cliente está perguntando/informando o CPF? (evita roubar o nome) */
export function ehRespostaDeCpf(texto: string): boolean {
  return extrairCpf(texto) !== null
}

/**
 * Redige o CPF de um texto para o histórico da conversa.
 *
 * O CPF é usado NA HORA para identificar e depois descartado — mas o histórico
 * persistido (30 min) guardaria o texto digitado, CPF incluído. Esta função
 * devolve o texto com o CPF substituído pela máscara, de modo que nem o
 * contexto nem qualquer leitura posterior guardem o número completo (§9).
 */
export function redigirCpf(texto: string): string {
  const original = texto ?? ''
  const mascara = (digitos: string) => `***.***.***-${digitos.slice(-2)}`
  return original
    // CPF já formatado: 123.456.789-09 → ***.***.***-09
    .replace(
      /(?<!\d)(\d{3})[.\s-](\d{3})[.\s-](\d{3})[.\s-](\d{2})(?!\d)/g,
      (_achado, _a: string, _b: string, _c: string, d: string) => mascara(d),
    )
    // CPF cru: 12345678909 → ***.***.***-09
    .replace(/(?<!\d)(\d{11})(?!\d)/g, (_achado, digitos: string) => mascara(digitos))
}

/** Primeira letra maiúscula — a IA não escreve nome de pessoa em minúscula. */
export function capitalizar(texto: string): string {
  const limpo = (texto ?? '').trim()
  if (!limpo) return ''
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

/* ------------------------------------------------------------------ */
/* Mensagens                                                           */
/* ------------------------------------------------------------------ */

export function perguntaCpfMsg(): string {
  return 'Para confirmar que é você, poderia me informar seu CPF? Só os números.'
}

export function conflitoCpfMsg(): string {
  return 'Esse CPF não bate com nenhum cadastro nosso. Pode conferir os números?'
}

/**
 * Desambiguação de identidade (§6): uma pergunta curta que usa o que o próprio
 * cliente já informou. Quando possível mostra o nome do candidato que ele já
 * digitou (confirma sem expor a lista), e sempre pede o NOME COMPLETO —
 * nunca CPF, e-mail, endereço ou qualquer outro dado sensível.
 */
export function desambiguacaoMsg(resultado: ResultadoIdentidade, nomeInformado: string): string {
  const base =
    'Encontrei mais de um cadastro associado a essas informações. ' +
    'Para confirmar que é você, poderia me informar seu nome completo?'
  const candidato = resultado.candidatos.find((c) =>
    nomeInformado
      ? normalizar(c.nome).includes(normalizar(nomeInformado)) &&
        normalizar(nomeInformado).length >= 3
      : false,
  )
  if (!candidato) return base
  return `${base}\nConferi que existe um cadastro em nome de ${primeiroNome(candidato.nome)}.`
}

export function primeiroNome(nome: string): string {
  const partes = normalizar(nome).split(' ').filter(Boolean)
  return partes[0] ?? ''
}

/** Cadastro inexistente (§7): explica o porquê e oferece o caminho do painel. */
export function cadastroNecessarioMsg(config: Configuracoes): string {
  const url = config.links.painel
  const base =
    'Para concluir seu agendamento, preciso primeiro cadastrar você. ' +
    'Você pode fazer seu cadastro pelo site do Studio Audax.'
  return url ? `${base}\n${url}` : base
}

/* ------------------------------------------------------------------ */
/* Audax Club (§8) — nunca inventa benefício, nunca informa plano inexistente */
/* ------------------------------------------------------------------ */

function moeda(valor: number | string | null): string {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `R$ ${valor.toFixed(2).replace('.', ',')}`
  }
  if (typeof valor === 'string') {
    const numero = Number(valor)
    if (Number.isFinite(numero)) return `R$ ${numero.toFixed(2).replace('.', ',')}`
  }
  return ''
}

const ROTULO_PLANO: Record<string, string> = {
  cabelo: 'Cabelo',
  barba: 'Barba',
  cabelo_barba: 'Cabelo + Barba',
}

/**
 * Texto do Clube a partir dos dados OFICIAIS + benefícios CONFIGURADOS.
 * Retorna null quando não há assinatura (a IA então não fala de plano).
 * `situacao` permite a IA dizer "vence em X" sem calcular data por conta.
 */
export function clubeMsg(
  clube: ClubeCliente | null,
  config: Configuracoes,
  hojeIso: string,
): string | null {
  if (!clube || !clube.plano) return null
  const rotulo = ROTULO_PLANO[clube.plano] ?? clube.plano
  const linhas: string[] = [`Você tem o Audax Club ${rotulo}.`]

  if (!clube.ativo) {
    linhas.push('Sua assinatura está cancelada e não está ativa no momento.')
  } else if (clube.atrasado) {
    linhas.push('O próximo vencimento já passou — fale com a recepção para regularizar.')
  } else if (clube.proximoVencimento && clube.proximoVencimento > hojeIso) {
    linhas.push(`Próximo vencimento: ${formatarData(clube.proximoVencimento)}.`)
  }

  const preco = moeda(clube.valorMensal)
  if (clube.ativo && preco) linhas.push(`Mensalidade: ${preco}.`)

  // Benefício só quando CONFIGURADO — lista vazia = não diz nada (§8).
  for (const beneficio of beneficiosDoPlano(config, clube.plano)) {
    linhas.push(`• ${beneficio}`)
  }

  return linhas.join('\n')
}

function formatarData(iso: string): string {
  const partes = iso.split('-')
  if (partes.length !== 3) return iso
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

/** O cliente declarou ter plano? (para pedir CPF quando o telefone não basta) */
export function ehPerguntaDeClube(texto: string): boolean {
  const t = normalizar(texto)
  return /\b(clube|audax club|plano|assinatura|assinante|mensal|mensalidade)\b/.test(t)
}
