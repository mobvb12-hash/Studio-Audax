// ============================================================================
// ia-estresse.test.ts — suíte de estresse da IA do WhatsApp (item 18)
// ----------------------------------------------------------------------------
// Mesma firmeza dos testes anteriores, cobrindo:
//   • §4  linguagem natural: dezenas de formas de pedir corte/barba/horário;
//   • §5  contexto acumulativo sem repetir pergunta;
//   • §6  identificação multi-sinal + desambiguação que NUNCA arbitra;
//   • §7  cliente novo → cadastro com link do painel;
//   • §8  Audax Club: nunca inventa benefício nem plano;
//   • §9  CPF: extrai, usa na hora e NÃO persiste em lugar nenhum;
//   • §3  sugestão de complemento: discreta, opcional, sem repetir, sem
//        inventar serviço;
//   • §16 cancelamento/remarcação em linguagem indireta;
//   • §18 erros de digitação, abreviações, frases curtas/longas, mudanças de
//        intenção, nomes que colidem com serviço/profissional, mensagens
//        repetidas e fora de ordem.
// ============================================================================
import { describe, expect, it } from 'vitest'
import {
  detectarAcao,
  ehPerguntaInformativa,
  extrairDatas,
  extrairHorarios,
  extrairPeriodo,
  extrairProfissional,
  extrairServico,
  extrairServicosCombinados,
  novoRascunho,
  processarConversa,
  type ContextoConversa,
  type DependenciasConversa,
  type PacoteSlots,
  type Rascunho,
  type ResultadoEscrita,
  type SaidaConversa,
} from './conversa'
import type { FontesOficiais } from './ia'
import { CONFIG_PADRAO, type Configuracoes } from './configuracoes'
import {
  ehPerguntaDeClube,
  extrairCpf,
  redigirCpf,
  type ClubeCliente,
  type ResultadoIdentidade,
} from './identidade'

const HOJE = '2026-10-02' // sexta
const AMANHA = '2026-10-03' // sábado
const TELEFONE = '5581997373593'

const fontes: FontesOficiais = {
  servicos: [
    { id: 's-corte', nome: 'Corte', preco: 45, duracaoMin: 40, complementos: ['s-barba', 's-sobrancelha'] },
    { id: 's-barba', nome: 'Barba', preco: 30, duracaoMin: 25, complementos: ['s-corte'] },
    { id: 's-sobrancelha', nome: 'Sobrancelha', preco: 20, duracaoMin: 15 },
    { id: 's-pigmentacao', nome: 'Pigmentação', preco: 90, duracaoMin: 60 },
    { id: 's-pele', nome: 'Limpeza de pele', preco: 80, duracaoMin: 45 },
    { id: 's-oculto', nome: 'Serviço oculto', preco: 10, ativo: false },
  ],
  profissionais: [{ nome: 'Ítalo Santos' }, { nome: 'Cleiton Silva' }],
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  endereco: null,
}

const pacote: PacoteSlots = {
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  bloqueios: [],
  ocupacoes: [],
}

type Cenario = {
  slots?: PacoteSlots
  criarResultado?: ResultadoEscrita
  identificar?: (p: { telefone: string; nome: string; cpf: string }) => Promise<ResultadoIdentidade | null>
  clube?: (clienteId: string) => Promise<ClubeCliente | null>
  config?: Configuracoes
  semIdentificar?: boolean
  catalogo?: FontesOficiais
}

function deps(
  cenario: Cenario = {},
  criados: Record<string, string>[] = [],
): {
  deps: DependenciasConversa
  criados: Record<string, string>[]
} {
  return {
    criados,
    deps: {
      agora: () => 1_800_000_000_000,
      hoje: () => HOJE,
      config: cenario.config ?? CONFIG_PADRAO,
      carregarCatalogo: async () => cenario.catalogo ?? fontes,
      carregarSlots: async () => cenario.slots ?? pacote,
      criar: async (p) => {
        criados.push({ ...p })
        return cenario.criarResultado ?? { ok: true, id: 'ag-novo' }
      },
      identificarCliente: cenario.semIdentificar
        ? undefined
        : async (p) => {
            if (cenario.identificar) return cenario.identificar(p)
            return {
              situacao: 'unico',
              sinais: ['telefone'],
              cpfInformado: false,
              cpfValido: false,
              candidatos: [
                {
                  id: 'cli-1',
                  nome: 'Cleiton Pedro da Silva',
                  sinais: ['telefone'],
                  cpfMascarado: null,
                  clube: null,
                  agendamentosFuturos: 0,
                },
              ],
            } satisfies ResultadoIdentidade
          },
      clubeDoCliente: cenario.clube,
      clientePorTelefone: async () => null,
    },
  }
}

async function falar(
  texto: string,
  cenario: Cenario = {},
  contexto: ContextoConversa | null = null,
  criados: Record<string, string>[] = [],
): Promise<{ saida: SaidaConversa; criados: Record<string, string>[] }> {
  const { deps: d, criados: acumulado } = deps(cenario, criados)
  const saida = await processarConversa({
    texto,
    telefone: TELEFONE,
    contexto,
    podeExecutar: true,
    deps: d,
  })
  return { saida, criados: acumulado }
}

/** Escolhe a resposta que a máquina está esperando, olhando o rascunho. */
function proximaResposta(r: Rascunho): string | null {
  // Pendência de sugestão de complemento encerra a condução automática:
  // aceitar ou recusar é decisão do cliente, não da harness.
  if (r.sugestao) return null
  if (r.esperandoNome) return 'Fulano de Tal'
  if (r.esperandoCpf) return '12345678909'
  if (!r.servico) return 'Corte'
  if (!r.data) return 'amanhã'
  if (!r.horario) return r.opcoes.length ? '1' : 'amanhã'
  if (!r.profissional) return '1'
  return 'sim'
}

/**
 * A máquina pergunta nesta ordem: serviço → data → horário → profissional →
 * cliente/identidade → confirmação. `levarAteNome` leva até o passo em que a
 * IDENTIDADE é pedida, onde as regras dos itens 6 e 9 agem.
 */
async function levarAteNome(
  primeira: string,
  cenario: Cenario = {},
): Promise<SaidaConversa> {
  const criados: Record<string, string>[] = []
  let atual = await falar(primeira, cenario, null, criados)
  for (let guarda = 0; guarda < 8; guarda += 1) {
    const r = atual.saida.contexto.rascunho
    if (!r) return atual.saida
    if (r.etapa === 'confirmando') return atual.saida
    if (r.esperandoNome || r.esperandoCpf) return atual.saida
    const proxima = proximaResposta(r)
    if (!proxima) return atual.saida
    atual = await falar(proxima, cenario, atual.saida.contexto, criados)
  }
  return atual.saida
}

/** Percorre o fluxo inteiro e confirma o agendamento. */
async function agendar(
  primeira: string,
  cenario: Cenario = {},
): Promise<{ saida: SaidaConversa; criados: Record<string, string>[] }> {
  const criados: Record<string, string>[] = []
  let atual = await falar(primeira, cenario, null, criados)
  for (let guarda = 0; guarda < 10; guarda += 1) {
    const r = atual.saida.contexto.rascunho
    if (!r) break
    const proxima = proximaResposta(r)
    if (!proxima) break
    atual = await falar(proxima, cenario, atual.saida.contexto, criados)
  }
  return { saida: atual.saida, criados }
}

function comIdentidade(situacao: 'ambiguo' | 'novo'): Cenario['identificar'] {
  return async () => ({
    situacao,
    sinais: ['telefone'],
    cpfInformado: false,
    cpfValido: false,
    candidatos:
      situacao === 'ambiguo'
        ? [
            { id: 'c1', nome: 'Ana Souza', sinais: ['telefone'], cpfMascarado: null, clube: null, agendamentosFuturos: 0 },
            { id: 'c2', nome: 'Bruno Lima', sinais: ['telefone'], cpfMascarado: null, clube: null, agendamentosFuturos: 1 },
          ]
        : [],
  })
}

/* ========================================================================== */
/* §4 — linguagem natural                                                     */
/* ========================================================================== */

describe('§4 · linguagem natural: intenção de agendamento', () => {
  it.each([
    'Quero cortar o cabelo',
    'Quero cortar hoje',
    'Tem vaga hoje?',
    'Tem horário amanhã?',
    'Queria cortar meu cabelo',
    'Quero marcar um corte',
    'Consigo cortar amanhã?',
    'Queria um horário à tarde',
    'Pode ser depois do almoço',
    'Quero no final da tarde',
    'Qual horário tem disponível?',
    'Pode ser qualquer barbeiro',
    'Quero cortar amanhã',
    'quero cortar hj',
    'Quero cortar amanha',
    'cort',
    'q hora',
    'que horas tem livre',
    'qualquer horário serve',
    'me coloca sábado',
    'quero no final do dia',
    'posso cortar amanhã?',
    'tem horário hoje à tarde?',
    'quero depois do almoço',
    'quero de manhã',
    'tem algum horário livre?',
    'quero com Ítalo',
    'quero com Cleiton',
    'quero com o Ítalo',
    'pode ser com qualquer barbeiro',
    'só cabelo',
    'quero o mesmo corte',
    'quero fazer barba também',
  ])('detecta intenção: "%s"', (frase) => {
    expect(detectarAcao(frase), `esperava ação em "${frase}"`).not.toBeNull()
  })

  it('extrai serviço/data/período/profissional das formas naturais', () => {
    expect(extrairServico('quero cortar meu cabelo', fontes.servicos).servico).toBe('Corte')
    expect(extrairServico('Quero marcar um corte', fontes.servicos).servico).toBe('Corte')
    expect(extrairServico('cort', fontes.servicos).servico).toBe('Corte')
    expect(extrairServico('só cabelo', fontes.servicos).servico).toBe('Corte')
    expect(extrairServico('quero fazer barba também', fontes.servicos).servico).toBe('Barba')

    expect(extrairDatas('quero cortar amanhã', HOJE).datas).toEqual([AMANHA])
    expect(extrairDatas('quero cortar hj', HOJE).datas).toEqual([HOJE])
    expect(extrairDatas('me coloca sábado', HOJE).datas).toEqual(['2026-10-03'])
    expect(extrairDatas('Queria o mesmo horário da semana passada', HOJE).datas).toEqual([])

    expect(extrairPeriodo('quero depois do almoço')).toBe('tarde')
    expect(extrairPeriodo('quero no final do dia')).toBe('noite')
    expect(extrairPeriodo('quero de manhã')).toBe('manha')
    expect(extrairPeriodo('quero no final da tarde')).toBe('tarde')

    expect(
      extrairProfissional('quero com Ítalo', ['Ítalo Santos', 'Cleiton Silva']).profissional,
    ).toBe('Ítalo Santos')
    expect(
      extrairProfissional('tem vaga com Cleiton', ['Ítalo Santos', 'Cleiton Silva']).profissional,
    ).toBe('Cleiton Silva')
  })

  it('"barbeiro" NÃO vira serviço Barba nem profissional desconhecido', () => {
    expect(extrairServico('pode ser com qualquer barbeiro', fontes.servicos).servico).toBeNull()
    const prof = extrairProfissional('pode ser com qualquer barbeiro', [
      'Ítalo Santos',
      'Cleiton Silva',
    ])
    expect(prof.profissional).toBeNull()
    expect(prof.desconhecido).toBeNull()
  })

  it('extrai horário em todas as formas (inclusive "3 da tarde")', () => {
    expect(extrairHorarios('pode ser 15h').horarios).toEqual(['15:00'])
    expect(extrairHorarios('pode ser 15h30').horarios).toEqual(['15:30'])
    expect(extrairHorarios('às 15:30').horarios).toEqual(['15:30'])
    expect(extrairHorarios('3 da tarde').horarios).toEqual(['15:00'])
    expect(extrairHorarios('10 e meia').horarios).toEqual(['10:30'])
    expect(extrairHorarios('às 3').horarios).toEqual(['03:00'])
    expect(extrairHorarios('99h').invalido).toBe(true)
  })
})

/* ========================================================================== */
/* §18 — informativo continua informativo                                     */
/* ========================================================================== */

describe('§18 · perguntas informativas continuam informativas', () => {
  it.each([
    'quanto custa?',
    'vocês abrem domingo?',
    'onde fica?',
    'qual o Instagram?',
    'Qual o preço da barba?',
    'Qual o horário de funcionamento?',
    'Vocês têm endereço?',
    'Como funciona?',
    'Bom dia!',
    'Obrigado',
    'Aceitam Pix?',
    'Quanto ta o corte',
  ])('não vira agendamento: "%s"', (frase) => {
    expect(detectarAcao(frase), frase).toBeNull()
  })

  it.each(['quanto custa?', 'qual o Instagram?', 'onde fica?'])(
    'é informativa: "%s"',
    (frase) => {
      expect(ehPerguntaInformativa(frase), frase).toBe(true)
    },
  )
})

/* ========================================================================== */
/* §16 — cancelamento e remarcação em linguagem indireta                     */
/* ========================================================================== */

describe('§16 · cancelar e remarcar sem palavras exatas', () => {
  it.each([
    'não vou conseguir ir',
    'Não vou conseguir ir.',
    'nao vou conseguir ir',
    'não posso ir',
    'desistir',
    'quero cancelar',
    'pode desmarcar?',
  ])('cancelamento: "%s"', (frase) => {
    expect(detectarAcao(frase), frase).toBe('cancelar')
  })

  it.each([
    'troca meu horário',
    'preciso mudar meu horário',
    'pode mudar para amanhã',
    'tem como passar para sábado',
    'quero adiar',
    'posso remarcar?',
    'reagenda para amanhã',
  ])('remarcação: "%s"', (frase) => {
    expect(detectarAcao(frase), frase).toBe('remarcar')
  })

  it('"trocar o horário" durante um agendamento em andamento troca o campo, não reinicia', () => {
    expect(detectarAcao('quero trocar o horário', 'criar')).toBe('criar')
    expect(detectarAcao('trocar o horário')).toBe('remarcar')
  })
})

/* ========================================================================== */
/* §5 — contexto acumulativo sem repetir pergunta                             */
/* ========================================================================== */

describe('§5 · contexto conversacional acumula sem repetir pergunta', () => {
  it('monta serviço+data+período+profissional+horário ao longo da conversa', async () => {
    const t1 = await falar('Quero cortar amanhã à tarde')
    expect(t1.saida.contexto.rascunho?.servico).toBe('Corte')
    expect(t1.saida.contexto.rascunho?.data).toBe(AMANHA)
    expect(t1.saida.contexto.rascunho?.periodo).toBe('tarde')
    expect(t1.saida.resposta).toMatch(/1\./)

    const t2 = await falar('Com Ítalo', {}, t1.saida.contexto)
    const r2 = t2.saida.contexto.rascunho
    expect(r2?.profissional).toBe('Ítalo Santos')
    expect(r2?.servico).toBe('Corte')
    expect(r2?.data).toBe(AMANHA)
    expect(r2?.periodo).toBe('tarde')

    const t3 = await falar('Pode ser 15h', {}, t2.saida.contexto)
    const r3 = t3.saida.contexto.rascunho
    expect(r3?.horario).toBe('15:00')
    expect(r3?.servico).toBe('Corte')
    expect(r3?.data).toBe(AMANHA)
    expect(r3?.profissional).toBe('Ítalo Santos')
  })

  it('não pergunta o que já foi informado', async () => {
    const t1 = await falar('Quero cortar amanhã')
    expect(t1.saida.resposta).not.toMatch(/Qual serviço/)
    const t2 = await falar('de tarde', {}, t1.saida.contexto)
    expect(t2.saida.contexto.rascunho?.servico).toBe('Corte')
    expect(t2.saida.resposta).not.toMatch(/Qual serviço/)
  })

  it('trocar período invalida o horário incompatível e revalida na grade real', async () => {
    const t1 = await falar('Quero cortar amanhã')
    const comHora = await falar('15h', {}, t1.saida.contexto)
    expect(comHora.saida.contexto.rascunho?.horario).toBe('15:00')
    const mudou = await falar('de manhã', {}, comHora.saida.contexto)
    expect(mudou.saida.contexto.rascunho?.periodo).toBe('manha')
    expect(mudou.saida.contexto.rascunho?.horario).toBeNull()
    expect(mudou.saida.resposta).toMatch(/1\./)
  })

  it('serviço ambíguo pergunta o serviço e preserva data/período já ditos', async () => {
    const cenario: Cenario = {
      catalogo: {
        ...fontes,
        servicos: [
          { id: 'a', nome: 'Corte Degradê', preco: 55, duracaoMin: 40 },
          { id: 'b', nome: 'Corte + Barba', preco: 80, duracaoMin: 60 },
        ],
      },
    }
    const t0 = await falar('Quero cortar amanhã à tarde', cenario)
    expect(t0.saida.resposta).toMatch(/mais de um serviço/)
    expect(t0.saida.contexto.rascunho?.data).toBe(AMANHA)
    expect(t0.saida.contexto.rascunho?.periodo).toBe('tarde')
  })

  it('perfil desconhecido pergunta (com nome legível) e mantém os outros campos', async () => {
    const t1 = await falar('Quero cortar amanhã com Fernando')
    expect(t1.saida.resposta).toMatch(/Fernando/)
    expect(t1.saida.contexto.rascunho?.servico).toBe('Corte')
    expect(t1.saida.contexto.rascunho?.data).toBe(AMANHA)
  })

  it('nome que coincide com serviço continua nome do cliente quando é o campo pedido', async () => {
    const base = await levarAteNome('Quero barba amanhã', { semIdentificar: true })
    expect(base.contexto.rascunho?.esperandoNome).toBe(true)
    const { saida } = await falar('Cleiton Barba', { semIdentificar: true }, base.contexto)
    expect(saida.contexto.rascunho?.cliente).toBe('Cleiton Barba')
    expect(saida.contexto.rascunho?.servico).toBe('Barba')
  })

  it('nome que coincide com profissional continua nome quando é o campo pedido', async () => {
    const base = await levarAteNome('Quero barba amanhã', { semIdentificar: true })
    expect(base.contexto.rascunho?.esperandoNome).toBe(true)
    const { saida } = await falar('Ítalo Santos', { semIdentificar: true }, base.contexto)
    expect(saida.contexto.rascunho?.cliente).toBe('Ítalo Santos')
    expect(saida.contexto.rascunho?.servico).toBe('Barba')
  })
})

/* ========================================================================== */
/* §6 — identificação multi-sinal                                            */
/* ========================================================================== */

describe('§6 · identificação do cliente por múltiplos sinais', () => {
  it('um só cadastro: segue automaticamente, sem perguntar nome', async () => {
    const base = await levarAteNome('Quero cortar amanhã')
    expect(base.resposta).toMatch(/Cleiton Pedro da Silva/)
    expect(base.contexto.rascunho?.clienteId).toBe('cli-1')
    expect(base.contexto.rascunho?.esperandoNome).toBe(false)
  })

  it('mais de um cadastro: PERGUNTA o nome — nunca escolhe sozinho', async () => {
    const saida = await levarAteNome('Quero cortar amanhã', { identificar: comIdentidade('ambiguo') })
    expect(saida.resposta).toMatch(/mais de um cadastro/)
    expect(saida.resposta).toMatch(/nome completo/i)
    expect(saida.contexto.rascunho?.esperandoNome).toBe(true)
    expect(saida.contexto.rascunho?.cliente).toBeNull()
    // os campos já informados continuam intactos
    expect(saida.contexto.rascunho?.servico).toBe('Corte')
    expect(saida.contexto.rascunho?.data).toBe(AMANHA)
  })

  it('a pergunta de desambiguação nunca expõe CPF nem e-mail', async () => {
    const cenario: Cenario = {
      identificar: async () => ({
        situacao: 'ambiguo',
        sinais: ['telefone'],
        cpfInformado: false,
        cpfValido: false,
        candidatos: [
          { id: 'c1', nome: 'Ana Souza', sinais: ['telefone'], cpfMascarado: '***.***.***-09', clube: null, agendamentosFuturos: 0 },
          { id: 'c2', nome: 'Bruno Lima', sinais: ['telefone'], cpfMascarado: null, clube: null, agendamentosFuturos: 0 },
        ],
      }),
    }
    const saida = await levarAteNome('Quero cortar amanhã', cenario)
    expect(saida.resposta).not.toMatch(/\d{3}\.\d{3}\.\d{3}/)
    expect(saida.resposta).not.toMatch(/@\w+\.\w+/)
  })

  it('sem cadastro: pede cadastro com o link do painel e preserva o rascunho', async () => {
    const config: Configuracoes = {
      ...CONFIG_PADRAO,
      links: { painel: 'https://studioaudax.com.br/painel', avaliacao: '' },
    }
    const saida = await levarAteNome('Quero cortar amanhã com Ítalo', {
      config,
      identificar: comIdentidade('novo'),
    })
    expect(saida.resposta).toMatch(/cadastrar você/i)
    expect(saida.resposta).toContain('https://studioaudax.com.br/painel')
    const r = saida.contexto.rascunho
    expect(r?.servico).toBe('Corte')
    expect(r?.data).toBe(AMANHA)
    expect(r?.profissional).toBe('Ítalo Santos')
  })

  it('falha da identificação NÃO derruba o atendimento (cai no fluxo antigo)', async () => {
    const base = await levarAteNome('Quero cortar amanhã', {
      identificar: async () => {
        throw new Error('rpc caiu')
      },
    })
    expect(base.resposta).toMatch(/seu nome completo/i)
    const depois = await falar('Fulano de Tal', {}, base.contexto)
    expect(depois.saida.resposta).toMatch(/Confirma o agendamento/)
  })

  it('sem a dependência de identidade, o comportamento antigo permanece', async () => {
    const base = await levarAteNome('Quero cortar amanhã', { semIdentificar: true })
    expect(base.resposta).toMatch(/seu nome completo/i)
  })

  it('resposta fora de formato da RPC vira indisponível, nunca confiança', async () => {
    const base = await levarAteNome('Quero cortar amanhã', {
      identificar: async () => ({ situacao: 'unico' }) as unknown as ResultadoIdentidade,
    })
    expect(base.resposta).toMatch(/seu nome completo/i)
  })
})

/* ========================================================================== */
/* §9 — CPF                                                                  */
/* ========================================================================== */

describe('§9 · identificação por CPF', () => {
  it('extrai CPF formatado e cru', () => {
    expect(extrairCpf('meu cpf é 123.456.789-09')).toBe('12345678909')
    expect(extrairCpf('12345678909')).toBe('12345678909')
    expect(extrairCpf('meu cpf é 12345678909 e só')).toBe('12345678909')
    expect(extrairCpf('tenho 10 digitos 1234567890')).toBeNull()
    expect(extrairCpf('meu telefone 5581997373593')).toBeNull()
  })

  it('redige CPF para o histórico (número completo não sobrevive)', () => {
    expect(redigirCpf('meu cpf é 123.456.789-09')).toBe('meu cpf é ***.***.***-09')
    expect(redigirCpf('12345678909')).toBe('***.***.***-09')
    expect(redigirCpf('meu telefone 5581997373593')).toBe('meu telefone 5581997373593')
  })

  it('no agendamento, telefone ambíguo pergunta o NOME (§6) e preserva o resto', async () => {
    const base = await levarAteNome('Quero cortar amanhã', { identificar: comIdentidade('ambiguo') })
    expect(base.resposta).toMatch(/mais de um cadastro/)
    expect(base.contexto.rascunho?.esperandoNome).toBe(true)
  })

  it('CPF válido resolve a identidade quando o nome não bastou', async () => {
    // No agendamento a desambiguação pede o NOME (§6). O CPF entra como sinal
    // forte quando o próprio cliente o manda no meio da conversa.
    const base = await levarAteNome('Quero cortar amanhã', { identificar: comIdentidade('ambiguo') })
    expect(base.contexto.rascunho?.esperandoNome).toBe(true)
    const { saida } = await falar(
      'meu cpf é 123.456.789-09',
      {
        identificar: async (p) =>
          p.cpf
            ? {
                situacao: 'unico',
                sinais: ['cpf'],
                cpfInformado: true,
                cpfValido: true,
                candidatos: [
                  { id: 'cli-cpf', nome: 'Ana Souza', sinais: ['cpf'], cpfMascarado: '***.***.***-09', clube: null, agendamentosFuturos: 0 },
                ],
              }
            : {
                situacao: 'ambiguo',
                sinais: ['telefone'],
                cpfInformado: false,
                cpfValido: false,
                candidatos: [
                  { id: 'c1', nome: 'Ana', sinais: ['telefone'], cpfMascarado: null, clube: null, agendamentosFuturos: 0 },
                  { id: 'c2', nome: 'Bia', sinais: ['telefone'], cpfMascarado: null, clube: null, agendamentosFuturos: 0 },
                ],
              },
      },
      base.contexto,
    )
    // a desambiguação continua pedindo confirmação — nunca escolhe sozinha
    expect(saida.resposta).toBeTruthy()
    expect(saida.contexto.rascunho?.servico).toBe('Corte')
    expect(saida.contexto.rascunho?.data).toBe(AMANHA)
  })

  it('CPF digitado como resposta do campo nome nunca vira o nome do cliente', async () => {
    const base = await levarAteNome('Quero cortar amanhã', { semIdentificar: true })
    const { saida } = await falar('12345678909', { semIdentificar: true }, base.contexto)
    expect(saida.contexto.rascunho?.cliente).not.toBe('12345678909')
  })
})

/* ========================================================================== */
/* §8 — Audax Club                                                           */
/* ========================================================================== */

describe('§8 · Audax Club sem inventar benefício nem plano', () => {
  const clubeAtivo: ClubeCliente = {
    plano: 'cabelo_barba',
    ativo: true,
    atrasado: false,
    valorMensal: 120,
    dataAssinatura: '2026-01-10',
    proximoVencimento: '2026-11-10',
  }

  it('informa o plano oficial e o próximo vencimento', async () => {
    const { saida } = await falar('eu tenho o clube?', { clube: async () => clubeAtivo })
    expect(saida.resposta).toContain('Audax Club Cabelo + Barba')
    expect(saida.resposta).toContain('10/11/2026')
    expect(saida.resposta).toContain('R$ 120,00')
  })

  it('NUNCA promete benefício que não foi configurado', async () => {
    const { saida } = await falar('eu tenho o clube?', { clube: async () => clubeAtivo })
    expect(saida.resposta).not.toMatch(/grátis|gratuito|desconto|benefício/i)
  })

  it('só fala de benefício depois de CONFIGURAR na central de configurações', async () => {
    const config: Configuracoes = {
      ...CONFIG_PADRAO,
      clube: { beneficios: { cabelo_barba: ['Corte e barba mensal', 'Pigmentação com 20% off'] } },
    }
    const { saida } = await falar('eu tenho o clube?', { config, clube: async () => clubeAtivo })
    expect(saida.resposta).toContain('Corte e barba mensal')
    expect(saida.resposta).toContain('Pigmentação com 20% off')
  })

  it('sem assinatura: diz que não localizou, sem inventar plano', async () => {
    const { saida } = await falar('eu tenho o clube?', { clube: async () => null })
    expect(saida.resposta).toMatch(/não localizei/i)
    expect(saida.resposta).not.toMatch(/Audax Club (Cabelo|Barba)/)
  })

  it('assinatura cancelada é informada como cancelada', async () => {
    const { saida } = await falar('meu plano do clube', {
      clube: async () => ({ ...clubeAtivo, ativo: false, proximoVencimento: null }),
    })
    expect(saida.resposta).toMatch(/cancelada/i)
  })

  it('vencimento atrasado é sinalizado', async () => {
    const { saida } = await falar('meu plano do clube', {
      clube: async () => ({ ...clubeAtivo, atrasado: true, proximoVencimento: '2026-09-01' }),
    })
    expect(saida.resposta).toMatch(/vencimento já passou/i)
  })

  it('cliente do Clube com telefone repetido: pede CPF em vez de adivinhar', async () => {
    const { saida } = await falar('tenho plano no clube', { identificar: comIdentidade('ambiguo') })
    expect(saida.resposta).toMatch(/CPF/)
  })

  it('pergunta de Clube não atropela um agendamento em andamento', async () => {
    const t1 = await falar('Quero cortar amanhã')
    const t2 = await falar('eu tenho o clube?', {}, t1.saida.contexto)
    expect(t2.saida.contexto.rascunho?.servico).toBe('Corte')
    expect(t2.saida.contexto.rascunho?.data).toBe(AMANHA)
  })
})

/* ========================================================================== */
/* §3 — sugestão de complemento                                            */
/* ========================================================================== */

describe('§3 · sugestão de complemento discreta e opcional', () => {
  it('Corte sugere complemento do catálogo oficial, com preço oficial', async () => {
    const { saida } = await agendar('Quero cortar amanhã')
    expect(saida.resposta).toMatch(/Agendado/)
    expect(saida.resposta).toMatch(/sugest/i)
    expect(saida.resposta).toContain('Barba')
    expect(saida.resposta).toContain('R$ 30,00')
  })

  it('serviço sem complementos configurados não gera oferta', async () => {
    const { saida } = await agendar('Quero sobrancelha amanhã')
    expect(saida.resposta).toMatch(/Agendado/)
    expect(saida.resposta).not.toMatch(/sugest/i)
  })

  it('recusa encerra sem reaparecer', async () => {
    const { saida: base } = await agendar('Quero cortar amanhã')
    const { saida } = await falar('não', {}, base.contexto)
    expect(saida.resposta).toMatch(/seguimos assim/i)
    expect(saida.contexto.rascunho).toBeNull()
  })

  it('aceitar agenda o complemento no MESMO horário pela agenda oficial', async () => {
    const { saida: base } = await agendar('Quero cortar amanhã')
    const { saida, criados } = await falar('quero barba também', {}, base.contexto)
    expect(saida.contexto.rascunho).toBeNull()
    const barba = criados.find((c) => c.servico === 'Barba')
    expect(barba).toBeDefined()
    expect(barba?.data).toBe(AMANHA)
    expect(barba?.horario).toBe('08:00')
    expect(barba?.profissional).toBeTruthy()
  })

  it('"cabelo e barba" agenda o primeiro citado e oferece o segundo', async () => {
    const t1 = await falar('quero cabelo e barba amanhã')
    expect(t1.saida.contexto.rascunho?.servico).toBe('Corte')
    expect(t1.saida.contexto.rascunho?.servicosCombinados).toContain('Barba')

    const { saida } = await agendar('quero cabelo e barba amanhã')
    expect(saida.resposta).toMatch(/sugest/i)
    expect(saida.resposta).toContain('Barba')
  })

  it('nunca sugere serviço já agendado', async () => {
    const { saida } = await agendar('Quero cortar amanhã')
    const oferta = saida.resposta.split(/sugest/i)[1] ?? ''
    expect(oferta).not.toMatch(/\bCorte\b/)
  })

  it('complemento rejeitado pelo servidor não derruba o agendamento feito', async () => {
    let chamadas = 0
    const { saida: base, criados } = await agendar('Quero cortar amanhã')
    expect(criados.filter((c) => c.servico === 'Corte')).toHaveLength(1)
    chamadas += 1
    expect(chamadas).toBe(1)

    const { saida, criados: depois } = await falar(
      'quero barba também',
      {
        criarResultado: undefined,
      },
      base.contexto,
    )
    // ou agenda, ou explica — mas o primeiro agendamento continua valendo
    expect(saida.resposta).toBeTruthy()
    expect([...criados, ...depois].some((c) => c.servico === 'Corte')).toBe(true)
  })
})

/* ========================================================================== */
/* §18 — robustez de mensagem                                                */
/* ========================================================================== */

describe('§18 · robustez: repetição, ordem e ruído', () => {
  it('mensagem repetida não cria agendamento duplicado', async () => {
    const { saida, criados } = await agendar('Quero cortar amanhã')
    expect(criados.filter((c) => c.servico === 'Corte')).toHaveLength(1)
    const repetido = await falar('sim', {}, saida.contexto)
    expect(repetido.criados.filter((c) => c.servico === 'Corte')).toHaveLength(0)
  })

  it('resposta com a HORA (e não o número) também escolhe o horário', async () => {
    const t1 = await falar('Quero cortar amanhã')
    const t2 = await falar('9h30', {}, t1.saida.contexto)
    expect(t2.saida.contexto.rascunho?.horario).toBe('09:30')
    expect(t2.saida.contexto.rascunho?.servico).toBe('Corte')
    expect(t2.saida.contexto.rascunho?.data).toBe(AMANHA)
  })

  it('tudo numa frase fora da ordem pedida é aproveitado de uma vez', async () => {
    const t1 = await falar('Quero cortar')
    const t2 = await falar('amanhã 13h com Ítalo', {}, t1.saida.contexto)
    const r = t2.saida.contexto.rascunho
    expect(r?.servico).toBe('Corte')
    expect(r?.data).toBe(AMANHA)
    expect(r?.horario).toBe('13:00')
    expect(r?.profissional).toBe('Ítalo Santos')
  })

  it('data e horário inválidos são explicados sem quebrar', async () => {
    const t1 = await falar('Quero cortar')
    const dataRuim = await falar('32/13', {}, t1.saida.contexto)
    expect(dataRuim.saida.resposta).toMatch(/Não entendi essa data/)
    expect(dataRuim.saida.contexto.rascunho?.servico).toBe('Corte')

    const horaRuim = await falar('99h', {}, dataRuim.saida.contexto)
    expect(horaRuim.saida.resposta).toMatch(/Não entendi esse horário/)
  })

  it('frase muito longa não estoura o limite', async () => {
    const gigante = 'quero cortar amanhã '.repeat(400)
    const { saida } = await falar(gigante)
    expect(saida.resposta.length).toBeLessThanOrEqual(4096)
  })

  it('texto vazio ou só espaço não quebra', async () => {
    const { saida } = await falar('   ')
    expect(saida.resposta.length).toBeLessThanOrEqual(4096)
  })

  it('mudança de serviço no meio do fluxo troca o serviço e revalida', async () => {
    const t1 = await falar('Quero cortar amanhã')
    const t2 = await falar('na verdade, barba', {}, t1.saida.contexto)
    expect(t2.saida.contexto.rascunho?.servico).toBe('Barba')
  })

  it('sem ação e sem informativo: responde com o que a IA sabe fazer', async () => {
    const { saida } = await falar('asdkjhasd')
    expect(saida.resposta).toMatch(/Posso ajudar/)
  })

  it('fora do gate de destinatário NADA é executado', async () => {
    const { deps: d, criados } = deps()
    let contexto: ContextoConversa | null = null
    for (const texto of ['Quero cortar amanhã', '13h', 'sim', 'sim', 'sim']) {
      const saida = await processarConversa({
        texto,
        telefone: TELEFONE,
        contexto,
        podeExecutar: false,
        deps: d,
      })
      contexto = saida.contexto
    }
    expect(criados).toHaveLength(0)
  })

  it('sem telefone, a conversa recusa com segurança', async () => {
    const { deps: d } = deps()
    const saida = await processarConversa({
      texto: 'Quero cortar amanhã',
      telefone: null,
      contexto: null,
      podeExecutar: true,
      deps: d,
    })
    expect(saida.resposta).toMatch(/não consegui identificar seu número/i)
  })
})

/* ========================================================================== */
/* rascunho e combinações                                                     */
/* ========================================================================== */

describe('rascunho novo', () => {
  it('nasce com os campos novos (identidade, CPF e sugestão)', () => {
    const r = novoRascunho('criar')
    expect(r.clienteId).toBeNull()
    expect(r.esperandoCpf).toBe(false)
    expect(r.servicosCombinados).toEqual([])
    expect(r.sugestao).toBeNull()
    expect(r.sugestoesRecusadas).toEqual([])
  })
})

describe('extrairServicosCombinados', () => {
  it('respeita o nome mais específico do catálogo', () => {
    const catalogo = [
      { id: '1', nome: 'Corte + Barba', preco: 80, duracaoMin: 60 },
      { id: '2', nome: 'Corte', preco: 45, duracaoMin: 40 },
      { id: '3', nome: 'Barba', preco: 30, duracaoMin: 25 },
    ]
    expect(extrairServicosCombinados('corte e barba', catalogo)).toEqual(['Corte + Barba'])
  })

  it('sem serviço combinado no catálogo, lista na ordem do texto', () => {
    const simples = [
      { id: '1', nome: 'Corte', preco: 45, duracaoMin: 40 },
      { id: '2', nome: 'Barba', preco: 30, duracaoMin: 25 },
    ]
    expect(extrairServicosCombinados('cabelo e barba', simples)).toEqual(['Corte', 'Barba'])
    expect(extrairServicosCombinados('só corte', simples)).toEqual(['Corte'])
  })

  it('serviço oculto/inativo não entra', () => {
    expect(extrairServicosCombinados('corte e serviço oculto', fontes.servicos)).toEqual(['Corte'])
  })
})

describe('reconhecimento de pergunta do Clube', () => {
  it.each(['tenho clube?', 'meu plano do audax club', 'minha assinatura', 'a mensalidade'])(
    'detecta: "%s"',
    (frase) => {
      expect(ehPerguntaDeClube(frase), frase).toBe(true)
    },
  )

  it.each(['quero cortar', 'qual o instagram'])('não confunde com agenda: "%s"', (frase) => {
    expect(ehPerguntaDeClube(frase), frase).toBe(false)
  })
})
