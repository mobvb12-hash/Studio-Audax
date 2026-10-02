// §18/§19 — validação offline das frases da especificação de produção,
// executada ANTES do teste real no WhatsApp. Catálogo = snapshot REAL do
// Studio Audax (consultado via Management API em 2026-10-02): serviços,
// profissionais e expediente como estão em produção hoje.
import { describe, expect, it } from 'vitest'
import {
  detectarAcao,
  ehPerguntaInformativa,
  extrairHorarios,
  extrairPeriodo,
  horarioNoPeriodo,
  processarConversa,
} from './conversa'
import type {
  ContextoConversa,
  DependenciasConversa,
  PacoteSlots,
  ResumoAgendamento,
} from './conversa'
import type { FontesOficiais } from './ia'

const HOJE = '2026-10-02' // sexta-feira real
const AMANHA = '2026-10-03' // sábado real
const TELEFONE = '5581997373593'

const fontes: FontesOficiais = {
  servicos: [
    { nome: 'Barba', preco: 50, duracaoMin: 30 },
    { nome: 'Corte + Barba', preco: 110, duracaoMin: 70 },
    { nome: 'Corte Degradê', preco: 70, duracaoMin: 40 },
    { nome: 'Corte Infantil', preco: 60, duracaoMin: 35 },
    { nome: 'Platinado / Luzes', preco: 180, duracaoMin: 120 },
    { nome: 'Sobrancelha', preco: 25, duracaoMin: 15 },
  ],
  profissionais: [{ nome: 'Cleiton Silva' }, { nome: 'Ítalo Santos' }],
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  endereco: null,
}

const slots: PacoteSlots = {
  expediente: { inicio: '08:00', fim: '20:00', almocoInicio: '12:00', almocoFim: '13:00' },
  bloqueios: [],
  ocupacoes: [],
}

type OpcoesTeste = {
  slots?: PacoteSlots
  listar?: ResumoAgendamento[]
  contexto?: ContextoConversa | null
}

async function rodar(texto: string, opcoes: OpcoesTeste = {}) {
  const chamadas = { criar: [] as Record<string, string>[] }
  const deps: DependenciasConversa = {
    agora: () => 1_800_000_000_000,
    hoje: () => HOJE,
    carregarCatalogo: async () => fontes,
    carregarSlots: async () => opcoes.slots ?? slots,
    listarAgendamentos: async () => opcoes.listar ?? [],
    clientePorTelefone: async () => null,
    criar: async (p) => {
      chamadas.criar.push({ ...p })
      return { ok: true, id: 'novo-id' }
    },
    cancelar: async () => ({ ok: true }),
    remarcar: async () => ({ ok: true }),
  }
  const saida = await processarConversa({
    texto,
    telefone: TELEFONE,
    contexto: opcoes.contexto ?? null,
    deps,
    podeExecutar: true,
  })
  return { saida, chamadas }
}

function horasDa(resposta: string): number[] {
  return (resposta.match(/(\d{1,2})h/g) ?? []).map((h) => Number(h.replace('h', '')))
}

function semSegredos(texto: string): void {
  expect(texto).not.toMatch(/sb_secret_|Bearer\s+\S|AIza|eyJ[A-Za-z0-9_-]{10,}/)
}

/* ------------------------------------------------------------------ */
/* §3 — intenção em linguagem natural (mensagem primeira)              */
/* ------------------------------------------------------------------ */

describe('§3 · frases de intenção iniciam a conversa de agendamento', () => {
  const ambiguas = [
    'Quero cortar o cabelo.',
    'Queria cortar meu cabelo.',
    'Preciso cortar o cabelo.',
    'Tem vaga para cortar o cabelo?',
    'Tem horário para corte?',
    'Consigo marcar um corte?',
    'Quero marcar meu corte.',
    'Queria agendar meu cabelo.',
  ]
  it.each(ambiguas)('%s → pergunta o serviço sem inventar', async (texto) => {
    const { saida } = await rodar(texto)
    expect(saida.acao).toBe('criar')
    expect(saida.executada).toBe(false)
    expect(saida.resposta).toContain('mais de um serviço parecido')
    semSegredos(saida.resposta)
  })

  it('Tem horário amanhã? → captura a data real de amanhã', async () => {
    const { saida } = await rodar('Tem horário amanhã?')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.data).toBe(AMANHA)
    expect(saida.resposta).toContain('Qual serviço')
  })

  it('Tem vaga hoje? → captura hoje', async () => {
    const { saida } = await rodar('Tem vaga hoje?')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.data).toBe(HOJE)
  })

  it('Tem algum horário à tarde? → período tarde, pergunta serviço', async () => {
    const { saida } = await rodar('Tem algum horário à tarde?')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.periodo).toBe('tarde')
    expect(saida.resposta).toContain('Qual serviço')
  })

  it('Queria depois do almoço. → tarde', async () => {
    const { saida } = await rodar('Queria depois do almoço.')
    expect(saida.contexto.rascunho?.periodo).toBe('tarde')
  })

  it('Pode ser no período da tarde. → tarde', async () => {
    const { saida } = await rodar('Pode ser no período da tarde.')
    expect(saida.contexto.rascunho?.periodo).toBe('tarde')
  })

  it('Queria mais pro fim do dia. → noite (fim do expediente ≥18h)', async () => {
    const { saida } = await rodar('Queria mais pro fim do dia.')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.periodo).toBe('noite')
  })

  it('Tem horário de manhã? → inicia conversa com período manhã', async () => {
    const { saida } = await rodar('Tem horário de manhã?')
    expect(detectarAcao('Tem horário de manhã?')).toBe('criar')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.periodo).toBe('manha')
    expect(saida.resposta).toContain('Qual serviço')
  })

  it('Quero cabelo e barba. → Corte + Barba direto', async () => {
    const { saida } = await rodar('Quero cabelo e barba.')
    expect(saida.contexto.rascunho?.servico).toBe('Corte + Barba')
    expect(saida.resposta).toContain('Para qual dia?')
  })

  it('Quero cortar e fazer a barba. → Corte + Barba direto', async () => {
    const { saida } = await rodar('Quero cortar e fazer a barba.')
    expect(saida.contexto.rascunho?.servico).toBe('Corte + Barba')
  })

  it('Tem vaga com o Ítalo? → captura o profissional e pede o serviço', async () => {
    const { saida } = await rodar('Tem vaga com o Ítalo?')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.profissional).toBe('Ítalo Santos')
    expect(saida.resposta).toContain('Qual serviço')
  })

  it('Quero com o Cleiton. → inicia conversa e captura o profissional', async () => {
    expect(detectarAcao('Quero com o Cleiton.')).toBe('criar')
    const { saida } = await rodar('Quero com o Cleiton.')
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.profissional).toBe('Cleiton Silva')
    expect(saida.resposta).toContain('Qual serviço')
  })
})

/* ------------------------------------------------------------------ */
/* §5 — períodos filtram a grade antes do limite                       */
/* ------------------------------------------------------------------ */

describe('§5 · todos os períodos são capturados e filtram a grade', () => {
  const casos: [string, 'manha' | 'tarde' | 'noite'][] = [
    ['de manhã', 'manha'],
    ['pela manhã', 'manha'],
    ['no período da manhã', 'manha'],
    ['cedo', 'manha'],
    ['bem cedo', 'manha'],
    ['à tarde', 'tarde'],
    ['de tarde', 'tarde'],
    ['pela tarde', 'tarde'],
    ['no período da tarde', 'tarde'],
    ['depois do almoço', 'tarde'],
    ['após o almoço', 'tarde'],
    ['mais tarde', 'noite'],
    ['à noite', 'noite'],
    ['de noite', 'noite'],
    ['no período da noite', 'noite'],
    ['fim do dia', 'noite'],
  ]
  it.each(casos)('"%s" → %s', async (texto, periodo) => {
    const base = await rodar('Quero agendar um Corte Degradê amanhã.')
    const { saida } = await rodar(texto, { contexto: base.saida.contexto })
    expect(saida.contexto.rascunho?.periodo).toBe(periodo)
    expect(saida.executada).toBe(false)
    for (const h of horasDa(saida.resposta)) {
      expect(
        horarioNoPeriodo(`${String(h).padStart(2, '0')}:00`, periodo),
        `${h}h fora do período`,
      ).toBe(true)
    }
    semSegredos(saida.resposta)
  })

  it('extrairPeriodo: fim do dia / mais tarde são o trecho final (noite)', () => {
    expect(extrairPeriodo('fim do dia')).toBe('noite')
    expect(extrairPeriodo('mais tarde')).toBe('noite')
    expect(extrairPeriodo('mais tarde à noite')).toBe('noite')
    expect(extrairPeriodo('depois do almoço')).toBe('tarde')
    expect(extrairPeriodo('primeira hora')).toBe('manha')
  })
})

/* ------------------------------------------------------------------ */
/* §6 — horários: formatos reais, sem converter 15h em 3h              */
/* ------------------------------------------------------------------ */

describe('§6 · horários em formatos naturais', () => {
  async function base() {
    const t = await rodar('Quero agendar um Corte Degradê amanhã.')
    return t.saida.contexto
  }

  const pares: [string, string][] = [
    ['10h', '10:00'],
    ['10:00', '10:00'],
    ['10', '10:00'],
    ['10 e meia', '10:30'],
    ['às 10 e meia', '10:30'],
    ['10h30', '10:30'],
    ['15:00', '15:00'],
    ['15h30', '15:30'],
    ['3 da tarde', '15:00'],
  ]
  it.each(pares)('"%s" → %s', async (texto, esperado) => {
    const { saida } = await rodar(texto, { contexto: await base() })
    expect(saida.contexto.rascunho?.horario).toBe(esperado)
  })

  it('3 da tarde fixa o horário 15:00 E o período tarde', async () => {
    const { saida } = await rodar('3 da tarde', { contexto: await base() })
    expect(saida.contexto.rascunho?.periodo).toBe('tarde')
  })

  it('15:00 NÃO vira 03:00 nem limpa coerência', async () => {
    const { saida } = await rodar('15:00', { contexto: await base() })
    expect(saida.contexto.rascunho?.horario).toBe('15:00')
  })

  const foraDaGrade: [string, 'manha' | 'noite'][] = [
    ['3 da manhã', 'manha'],
    ['9 da noite', 'noite'],
    ['15:45', 'manha'],
  ]
  it.each(foraDaGrade)(
    '"%s" fora da grade → nunca inventa horário',
    async (texto) => {
      const { saida } = await rodar(texto, { contexto: await base() })
      expect(saida.executada).toBe(false)
      expect(saida.resposta).toMatch(/não está livre|Tenho estes horários/)
      semSegredos(saida.resposta)
    },
  )

  it('extrairHorarios: "10 e meia" é 10:30, nunca índice de lista', () => {
    expect(extrairHorarios('10 e meia').horarios).toEqual(['10:30'])
    expect(extrairHorarios('às 10 e meia').horarios).toEqual(['10:30'])
    expect(extrairHorarios('15:45').horarios).toEqual(['15:45'])
    expect(extrairHorarios('3 da tarde').horarios).toEqual(['15:00'])
  })
})

/* ------------------------------------------------------------------ */
/* §7 — profissionais: todas as formulações + troca                    */
/* ------------------------------------------------------------------ */

describe('§7 · profissionais em todas as formulações', () => {
  async function comPeriodo() {
    const t = await rodar('Quero agendar um Corte Degradê amanhã à tarde.')
    return t.saida.contexto
  }

  const casos: [string, string][] = [
    ['com Cleiton', 'Cleiton Silva'],
    ['com o Cleiton', 'Cleiton Silva'],
    ['quero Cleiton', 'Cleiton Silva'],
    ['com Ítalo', 'Ítalo Santos'],
    ['com o Ítalo', 'Ítalo Santos'],
    ['quero com o Ítalo', 'Ítalo Santos'],
  ]
  it.each(casos)('"%s" → %s', async (texto, prof) => {
    const { saida } = await rodar(texto, { contexto: await comPeriodo() })
    expect(saida.contexto.rascunho?.profissional).toBe(prof)
    expect(saida.executada).toBe(false)
  })

  it('troca "melhor com Cleiton." sobrescreve o profissional anterior', async () => {
    const ctx = await comPeriodo()
    const t1 = await rodar('com o Ítalo', { contexto: ctx })
    expect(t1.saida.contexto.rascunho?.profissional).toBe('Ítalo Santos')
    const t2 = await rodar('melhor com Cleiton.', { contexto: t1.saida.contexto })
    expect(t2.saida.contexto.rascunho?.profissional).toBe('Cleiton Silva')
  })

  it('"tem vaga com ele?" mantém o profissional já escolhido', async () => {
    const ctx = await comPeriodo()
    const t1 = await rodar('com Cleiton', { contexto: ctx })
    expect(t1.saida.contexto.rascunho?.profissional).toBe('Cleiton Silva')
    const t2 = await rodar('tem vaga com ele?', { contexto: t1.saida.contexto })
    expect(t2.saida.contexto.rascunho?.profissional).toBe('Cleiton Silva')
    expect(t2.saida.resposta).toContain('Cleiton Silva')
    expect(t2.saida.executada).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* §8 — nomes de cliente nunca são roubados por outros campos          */
/* ------------------------------------------------------------------ */

describe('§8 · captura de nome completo', () => {
  async function ateNome() {
    const t1 = await rodar('Quero agendar um Corte Degradê amanhã à tarde.')
    const t2 = await rodar('13h', { contexto: t1.saida.contexto })
    expect(t2.saida.resposta).toContain('nome completo')
    return t2.saida.contexto
  }

  const nomes = [
    'Cleiton Pedro da Silva',
    'João Ítalo da Silva',
    'Maria Cleiton Santos',
    'Pedro Barba da Silva',
  ]
  it.each(nomes)('"%s" vira o nome do cliente', async (nome) => {
    const ctx = await ateNome()
    const { saida } = await rodar(nome, { contexto: ctx })
    expect(saida.contexto.rascunho?.cliente).toBe(nome)
    expect(saida.executada).toBe(false)
  })

  const naoSaoNome: [string, (r: ContextoConversa) => unknown][] = [
    ['com Cleiton', (c) => c.rascunho?.profissional],
    ['às 10h', (c) => c.rascunho?.horario],
    ['amanhã', (c) => c.rascunho?.data],
    ['de tarde', (c) => c.rascunho?.periodo],
    ['quero barba', (c) => c.rascunho?.servico],
  ]
  it.each(naoSaoNome)('"%s" NÃO vira nome', async (texto, confere) => {
    const ctx = await ateNome()
    const { saida } = await rodar(texto, { contexto: ctx })
    expect(saida.contexto.rascunho?.cliente).toBeNull()
    expect(confere(saida.contexto)).toBeTruthy()
  })
})

/* ------------------------------------------------------------------ */
/* §9 — serviços em linguagem natural com o catálogo REAL              */
/* ------------------------------------------------------------------ */

describe('§9 · serviços naturais contra o catálogo real', () => {
  const diretos: [string, string][] = [
    ['quero cabelo e barba', 'Corte + Barba'],
    ['quero cortar e fazer barba', 'Corte + Barba'],
    ['quero só barba', 'Barba'],
    ['quero fazer a sobrancelha', 'Sobrancelha'],
    ['quero fazer uma sobrancelha', 'Sobrancelha'],
    ['quero platinado', 'Platinado / Luzes'],
    ['quero luzes', 'Platinado / Luzes'],
    ['quero um corte infantil', 'Corte Infantil'],
  ]
  it.each(diretos)('"%s" → %s', async (texto, servico) => {
    const { saida } = await rodar(texto)
    expect(saida.acao).toBe('criar')
    expect(saida.contexto.rascunho?.servico).toBe(servico)
  })

  const ambiguos = [
    'cortar o cabelo',
    'corte',
    'quero fazer o cabelo',
    'quero cortar o cabelo do meu filho',
  ]
  it.each(ambiguos)('"%s" → pergunta entre os reais, sem escolher sozinho', async (texto) => {
    const { saida } = await rodar(texto)
    expect(saida.acao).toBe('criar')
    expect(saida.resposta).toContain('mais de um serviço parecido')
    expect(saida.executada).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* §10 — contexto sobrevive entre mensagens                            */
/* ------------------------------------------------------------------ */

describe('§10 · jornada de 6 turnos preserva o contexto', () => {
  it('intenção → período → profissional → horário → nome → confirma', async () => {
    const t1 = await rodar('Quero agendar um Corte Degradê amanhã.')
    expect(t1.saida.contexto.rascunho?.servico).toBe('Corte Degradê')
    expect(t1.saida.contexto.rascunho?.data).toBe(AMANHA)

    const t2 = await rodar('À tarde.', { contexto: t1.saida.contexto })
    expect(t2.saida.contexto.rascunho?.servico).toBe('Corte Degradê')
    expect(t2.saida.contexto.rascunho?.periodo).toBe('tarde')

    const t3 = await rodar('Com o Ítalo.', { contexto: t2.saida.contexto })
    expect(t3.saida.contexto.rascunho?.profissional).toBe('Ítalo Santos')
    expect(t3.saida.contexto.rascunho?.periodo).toBe('tarde')

    const t4 = await rodar('10h.', { contexto: t3.saida.contexto })
    expect(t4.saida.contexto.rascunho?.horario).toBe('10:00')
    expect(t4.saida.contexto.rascunho?.profissional).toBe('Ítalo Santos')
    expect(t4.saida.contexto.rascunho?.data).toBe(AMANHA)

    const t5 = await rodar('Cleiton Pedro da Silva.', { contexto: t4.saida.contexto })
    expect(t5.saida.contexto.rascunho?.cliente).toBe('Cleiton Pedro da Silva')
    expect(t5.saida.executada).toBe(false)

    const t6 = await rodar('Pode confirmar.', { contexto: t5.saida.contexto })
    expect(t6.saida.executada).toBe(true)
    expect(t6.chamadas.criar).toHaveLength(1)
    expect(t6.chamadas.criar[0].cliente).toBe('Cleiton Pedro da Silva')
    expect(t6.chamadas.criar[0].profissional).toBe('Ítalo Santos')
    semSegredos(t6.saida.resposta)
  })
})

/* ------------------------------------------------------------------ */
/* §11 — mudança de ideia: a última decisão válida vence               */
/* ------------------------------------------------------------------ */

describe('§11 · mudanças de ideia no meio do fluxo', () => {
  it('período troca, profissional troca — sem perder os demais dados', async () => {
    const t1 = await rodar('Quero agendar um Corte Degradê.')
    expect(t1.saida.contexto.rascunho?.servico).toBe('Corte Degradê')

    const t2 = await rodar('Quero amanhã de manhã.', { contexto: t1.saida.contexto })
    expect(t2.saida.contexto.rascunho?.data).toBe(AMANHA)
    expect(t2.saida.contexto.rascunho?.periodo).toBe('manha')

    const t3 = await rodar('Melhor à tarde.', { contexto: t2.saida.contexto })
    expect(t3.saida.contexto.rascunho?.periodo).toBe('tarde')
    expect(t3.saida.contexto.rascunho?.data).toBe(AMANHA)

    const t4 = await rodar('Pode ser com Ítalo.', { contexto: t3.saida.contexto })
    expect(t4.saida.contexto.rascunho?.profissional).toBe('Ítalo Santos')

    const t5 = await rodar('Melhor com Cleiton.', { contexto: t4.saida.contexto })
    expect(t5.saida.contexto.rascunho?.profissional).toBe('Cleiton Silva')
    expect(t5.saida.contexto.rascunho?.periodo).toBe('tarde')
    expect(t5.saida.executada).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* §12 — horário × período incompatível                                */
/* ------------------------------------------------------------------ */

describe('§12 · incompatibilidade horário × período é corrigida', () => {
  it('período tarde + "8h." → o horário específico vence (dado coerente)', async () => {
    const t1 = await rodar('Quero agendar um Corte Degradê amanhã.')
    const t2 = await rodar('Quero à tarde.', { contexto: t1.saida.contexto })
    expect(t2.saida.contexto.rascunho?.periodo).toBe('tarde')
    const t3 = await rodar('8h.', { contexto: t2.saida.contexto })
    expect(t3.saida.contexto.rascunho?.horario).toBe('08:00')
    expect(t3.saida.contexto.rascunho?.periodo).toBeNull()
    expect(t3.saida.executada).toBe(false)
  })

  it('horário 15h + "De manhã." → limpa o horário e filtra a manhã', async () => {
    const t1 = await rodar('Quero agendar um Corte Degradê amanhã.')
    const t2 = await rodar('Quero 15h.', { contexto: t1.saida.contexto })
    expect(t2.saida.contexto.rascunho?.horario).toBe('15:00')
    const t3 = await rodar('De manhã.', { contexto: t2.saida.contexto })
    expect(t3.saida.contexto.rascunho?.horario).toBeNull()
    expect(t3.saida.contexto.rascunho?.periodo).toBe('manha')
    for (const h of horasDa(t3.saida.resposta)) {
      expect(horarioNoPeriodo(`${String(h).padStart(2, '0')}:00`, 'manha')).toBe(true)
    }
  })
})

/* ------------------------------------------------------------------ */
/* §13/§14 — vaga inicia conversa; informativa continua bloqueada      */
/* ------------------------------------------------------------------ */

describe('§13 · perguntas de vaga iniciam a conversa', () => {
  const frases = [
    'Tem vaga?',
    'Tem horário?',
    'Tem algum horário disponível?',
    'Tem vaga hoje?',
    'Tem vaga amanhã?',
    'Consigo horário amanhã?',
    'Tem algum horário à tarde?',
    'Quero cortar amanhã.',
    'Queria marcar um corte.',
  ]
  it.each(frases)('"%s" → ação', (texto) => {
    expect(detectarAcao(texto)).toBe('criar')
  })
})

describe('§14 · informativas continuam sem ação de agenda', () => {
  const frases = [
    'Quanto custa o corte?',
    'Qual o horário de funcionamento?',
    'Qual o endereço?',
    'Qual o Instagram?',
    'Qual o preço da barba?',
    'Quais os preços?',
  ]
  it.each(frases)('"%s" → informativa', (texto) => {
    expect(detectarAcao(texto)).toBeNull()
    expect(ehPerguntaInformativa(texto)).toBe(true)
  })

  const semAcao = [
    'Pode ser com o cartão?',
    'quero saber o preço com desconto',
    'quero falar com você',
    'quero pagar pix',
  ]
  it.each(semAcao)('"%s" → não vira agenda', (texto) => {
    expect(detectarAcao(texto)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* MENSAGEM 1 — jornada real prevista, do início ao fim                */
/* ------------------------------------------------------------------ */

describe('MENSAGEM 1 · "Quero cortar o cabelo amanhã à tarde."', () => {
  it('pergunta o serviço preservando sábado e tarde, e só executa na confirmação', async () => {
    const m1 = await rodar('Quero cortar o cabelo amanhã à tarde.')
    expect(m1.saida.acao).toBe('criar')
    expect(m1.saida.contexto.rascunho?.data).toBe(AMANHA)
    expect(m1.saida.contexto.rascunho?.periodo).toBe('tarde')
    expect(m1.saida.resposta).toContain('mais de um serviço parecido')
    expect(m1.saida.executada).toBe(false)
    semSegredos(m1.saida.resposta)

    const m2 = await rodar('Corte Degradê', { contexto: m1.saida.contexto })
    expect(m2.saida.contexto.rascunho?.servico).toBe('Corte Degradê')
    expect(m2.saida.contexto.rascunho?.periodo).toBe('tarde')
    expect(m2.saida.executada).toBe(false)

    const m3 = await rodar('13h', { contexto: m2.saida.contexto })
    expect(m3.saida.contexto.rascunho?.horario).toBe('13:00')
    expect(m3.saida.executada).toBe(false)

    const m4 = await rodar('com o Ítalo', { contexto: m3.saida.contexto })
    expect(m4.saida.contexto.rascunho?.profissional).toBe('Ítalo Santos')
    expect(m4.saida.resposta).toContain('nome completo')
    expect(m4.saida.executada).toBe(false)

    const m5 = await rodar('João Teste da Silva', { contexto: m4.saida.contexto })
    expect(m5.saida.contexto.rascunho?.cliente).toBe('João Teste da Silva')
    expect(m5.saida.resposta).toContain('Confirma o agendamento')
    expect(m5.saida.executada).toBe(false)

    const m6 = await rodar('Pode confirmar.', { contexto: m5.saida.contexto })
    expect(m6.saida.executada).toBe(true)
    expect(m6.chamadas.criar).toHaveLength(1)
    expect(m6.chamadas.criar[0]).toMatchObject({
      cliente: 'João Teste da Silva',
      profissional: 'Ítalo Santos',
      horario: '13:00',
      data: AMANHA,
    })
    semSegredos(m6.saida.resposta)
  })
})
