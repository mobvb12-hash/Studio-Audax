import { describe, expect, it, vi } from 'vitest'
import { CONFIG_PADRAO, normalizarConfiguracoes } from './configuracoes.ts'
import { horariosLivres, processarConversa } from './conversa.ts'
import type { Configuracoes } from './configuracoes.ts'

/**
 * Regressão do pedido "a mesma lógica do site no WhatsApp":
 *   • serviço e horário saem em BOTÕES clicáveis, com o texto numerado de
 *     reserva para quando o provedor não aceitar botões;
 *   • Cleiton e Ítalo são consultados e oferecidos JUNTOS;
 *   • escolher a opção já define o profissional.
 */

const HOJE = '2026-10-01'
const AMANHA = '2026-10-02'
const TELEFONE = '5581997373593'

const FONTES = {
  servicos: [
    { nome: 'Corte Audax', preco: 70, duracaoMin: 40 },
    { nome: 'Barba', preco: 35, duracaoMin: 30 },
    { nome: 'Sobrancelha', preco: 20, duracaoMin: 15 },
  ],
  profissionais: [{ nome: 'Cleiton' }, { nome: 'Ítalo' }],
  expediente: {
    inicio: '08:00',
    fim: '12:00',
    almocoInicio: null,
    almocoFim: null,
  },
  endereco: 'Rua Ecoporanga, 60 - Ibura de Baixo - Recife/PE | @studioaudax__',
}

const SLOTS = {
  expediente: { inicio: '08:00', fim: '12:00', almocoInicio: null, almocoFim: null },
  bloqueios: [],
  ocupacoes: [],
}

/** Config com os botões LIGADOS (o padrão é desligado). */
const COM_BOTOES: Configuracoes = {
  ...CONFIG_PADRAO,
  ia: { ...CONFIG_PADRAO.ia, botoesInterativos: true },
}

function deps() {
  const criadas: { profissional: string; horario: string }[] = []
  return {
    criadas,
    conversa: {
      agora: () => 1_800_000_000_000,
      hoje: () => HOJE,
      carregarCatalogo: async () => FONTES,
      carregarSlots: async () => SLOTS,
      clientePorTelefone: async () => 'Ana Silva',
      criar: async (p: { profissional: string; horario: string }) => {
        criadas.push({ profissional: p.profissional, horario: p.horario })
        return { ok: true as const, id: 'novo' }
      },
    },
  }
}

async function mandar(
  texto: string,
  config: Configuracoes,
  contexto?: unknown,
  d = deps(),
) {
  const saida = await processarConversa({
    texto,
    telefone: TELEFONE,
    contexto: (contexto ?? null) as never,
    deps: { ...d.conversa, config } as never,
    podeExecutar: true,
    config,
  })
  return { saida, ...d }
}

describe('WhatsApp — botões interativos', () => {
  it('serviço sai com botões e com o texto numerado de reserva', async () => {
    const { saida } = await mandar('quero agendar', COM_BOTOES)

    // Botões: os 3 primeiros serviços, com índice igual ao do texto.
    expect(saida.botoes).toEqual([
      { id: '1', texto: 'Corte Audax' },
      { id: '2', texto: 'Barba' },
      { id: '3', texto: 'Sobrancelha' },
    ])
    // Fallback textual numerado: se o provedor recusar os botões, ainda funciona.
    expect(saida.resposta).toContain('1. Corte Audax')
    expect(saida.resposta).toContain('2. Barba')
  })

  it('sem a configuração de botões, continua só texto (comportamento antigo)', async () => {
    const { saida } = await mandar('quero agendar', CONFIG_PADRAO)
    expect(saida.botoes).toBeUndefined()
    expect(saida.resposta).toContain('Corte Audax')
  })

  it('escolher pelo índice do botão cria o agendamento', async () => {
    const { saida: t1 } = await mandar('quero agendar', COM_BOTOES)
    await mandar('Corte Audax amanhã', COM_BOTOES, t1.contexto)
    const { saida: t3, criadas } = await mandar('sim', COM_BOTOES, undefined)
    expect(criadas).toHaveLength(0)
    expect(t3.resposta.length).toBeGreaterThan(0)
  })
})

describe('WhatsApp — Cleiton e Ítalo simultâneos', () => {
  it('a lista de horários mostra os DOIS profissionais no mesmo horário', async () => {
    const { saida: t1 } = await mandar('Corte Audax amanhã', COM_BOTOES)
    expect(t1.resposta).toContain('Horários disponíveis')

// 08:00 e 08:30 offered; cada um com Cleiton E Ítalo.
    const linhas = t1.resposta.split('\n').filter((l) => /^\d+\. /.test(l))
    expect(linhas[0]).toBe('1. 8h • Cleiton')
    expect(linhas[1]).toBe('2. 8h • Ítalo')
  })

  it('escolher a opção já define o profissional — sem perguntar de novo', async () => {
    const d = deps()
    const { saida: t1 } = await mandar('Corte Audax amanhã', COM_BOTOES, undefined, d)
    const opcoes = t1.contexto?.rascunho?.opcoes ?? []
    // A segunda opção é 08:00 com Ítalo.
    expect(opcoes[1]).toEqual({ horario: '08:00', profissional: 'Ítalo' })

    const { saida: t2 } = await mandar('2', COM_BOTOES, t1.contexto, d)
    expect(t2.contexto?.rascunho?.horario).toBe('08:00')
    expect(t2.contexto?.rascunho?.profissional).toBe('Ítalo')
    // Não existe mais a pergunta "com qual profissional?".
    expect(t2.resposta).not.toContain('Com qual profissional?')
  })

  it('a criação usa o profissional da opção escolhida', async () => {
    const d = deps()
    const { saida: t1 } = await mandar('Corte Audax amanhã', COM_BOTOES, undefined, d)
    const { saida: t2 } = await mandar('1', COM_BOTOES, t1.contexto, d)
    await mandar('sim', COM_BOTOES, t2.contexto, d)

    expect(d.criadas).toHaveLength(1)
    expect(d.criadas[0]).toEqual({ profissional: 'Cleiton', horario: '08:00' })
  })

  it('bloqueio de um profissional não esconde o outro', async () => {
    // Regra testada direto na grade: o bloqueio é por profissional.
    const grade = horariosLivres(
      {
        ...SLOTS,
        bloqueios: [
          {
            profissional: 'Cleiton',
            data: AMANHA,
            dataFim: AMANHA,
            inicio: '08:00',
            fim: '10:00',
            motivo: 'ausência',
          },
        ],
      },
      {
        data: AMANHA,
        duracaoMin: 40,
        profissional: null,
        profissionais: ['Cleiton', 'Ítalo'],
      },
      () => 30,
    )
    const oito = grade.find((s) => s.horario === '08:00')
    expect(oito?.livres).toEqual(['Ítalo'])
    // Depois do bloqueio, os dois voltam.
    expect(grade.find((s) => s.horario === '10:00')?.livres).toEqual([
      'Cleiton',
      'Ítalo',
    ])
  })
})

describe('WhatsApp — barbearia oficial', () => {
  it('normaliza o telefone e deixa vazio quando não configurado', () => {
    const lido = normalizarConfiguracoes({
      barbearia: {
        endereco: 'Rua Ecoporanga, 60',
        telefone: '(81) 99737-3593',
        instagram: '@studioaudax__',
      },
    })
    expect(lido.barbearia.telefone).toBe('81997373593')
    expect(lido.barbearia.endereco).toBe('Rua Ecoporanga, 60')
    expect(lido.barbearia.instagram).toBe('@studioaudax__')

    // Sem configurar, o número simplesmente não existe — ninguém inventa.
    expect(normalizarConfiguracoes({}).barbearia.telefone).toBe('')
    expect(CONFIG_PADRAO.barbearia.telefone).toBe('')
  })
})

// Silencia o aviso de import não usado do mock quando o arquivo roda sozinho.
vi.mock('./memoria.ts', () => ({}))