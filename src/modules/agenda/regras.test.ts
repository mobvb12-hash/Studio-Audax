import { describe, expect, it } from 'vitest'
import {
  EXPEDIENTE_PADRAO,
  bloqueioCobre,
  emAlmoco,
  foraDoExpediente,
  formatarMinutos,
  rotuloBloqueio,
  slotsDoExpediente,
  validarProposta,
  verificarConflito,
} from './regras'
import type { Agendamento, Bloqueio } from './types'

const DIA = '2026-09-25'

function ag(parcial: Partial<Agendamento>): Agendamento {
  return {
    id: `ag-${Math.random().toString(36).slice(2, 8)}`,
    cliente: 'Lucas Mendes',
    telefone: '',
    servico: 'Corte Degradê',
    profissional: 'Audax',
    data: DIA,
    horario: '10:00',
    status: 'confirmado',
    observacao: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    ...parcial,
  }
}

const duracaoDo = (servico: string) =>
  servico === 'Corte + Barba' ? 70 : servico === 'Barba' ? 30 : 40

describe('Agenda — conflito de horários (sobreposição)', () => {
  it('mesmo horário exato para o mesmo profissional é conflito', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(true)
    if (r.conflito) expect(r.fimExistente).toBe('10:40')
  })

  it('sobreposição parcial é conflito (10:00 de 40min + 10:30)', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00' })],
      { data: DIA, horario: '10:30', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(true)
    if (r.conflito) expect(r.agendamento.horario).toBe('10:00')
  })

  it('serviço longo que invade o próximo horário é conflito', () => {
    const r = verificarConflito(
      [ag({ horario: '11:00', servico: 'Corte + Barba' })],
      { data: DIA, horario: '11:30', profissional: 'Audax', duracaoMin: 30 },
      duracaoDo,
    )
    expect(r.conflito).toBe(true)
    if (r.conflito) expect(r.fimExistente).toBe('12:10')
  })

  it('encostado sem sobreposição não é conflito (10:00 40min → 10:40 livre)', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00' })],
      { data: DIA, horario: '10:40', profissional: 'Audax', duracaoMin: 30 },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('profissionais diferentes não conflitam', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00', profissional: 'Audax' })],
      { data: DIA, horario: '10:00', profissional: 'Diego', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('dias diferentes não conflitam', () => {
    const r = verificarConflito(
      [ag({ horario: '10:00', data: '2026-09-24' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('cancelado e não compareceu não bloqueiam o horário', () => {
    const cancelado = verificarConflito(
      [ag({ horario: '10:00', status: 'cancelado' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(cancelado.conflito).toBe(false)

    const faltou = verificarConflito(
      [ag({ horario: '10:00', status: 'nao_compareceu' })],
      { data: DIA, horario: '10:00', profissional: 'Audax', duracaoMin: 40 },
      duracaoDo,
    )
    expect(faltou.conflito).toBe(false)
  })

  it('ignorarId permite reagendar sem conflito consigo mesmo', () => {
    const existente = ag({ horario: '10:00' })
    const r = verificarConflito(
      [existente],
      {
        data: DIA,
        horario: '10:00',
        profissional: 'Audax',
        duracaoMin: 40,
        ignorarId: existente.id,
      },
      duracaoDo,
    )
    expect(r.conflito).toBe(false)
  })

  it('formatarMinutos formata a hora final', () => {
    expect(formatarMinutos(10 * 60 + 40)).toBe('10:40')
    expect(formatarMinutos(11 * 60 + 70)).toBe('12:10')
  })
})

function bloco(parcial: Partial<Bloqueio>): Bloqueio {
  return {
    id: `blk-${Math.random().toString(36).slice(2, 8)}`,
    profissional: 'Audax',
    data: DIA,
    inicio: '12:00',
    fim: '14:00',
    tipo: 'almoco',
    motivo: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    ...parcial,
  }
}

describe('slotsDoExpediente', () => {
  it('gera a grade padrão de 08:00 às 19:30 marcando o almoço', () => {
    const slots = slotsDoExpediente(EXPEDIENTE_PADRAO)
    expect(slots).toHaveLength(24)
    expect(slots[0]).toEqual({ hora: '08:00', intervalo: false })
    expect(slots[slots.length - 1]).toEqual({ hora: '19:30', intervalo: false })
    expect(slots.filter((s) => s.intervalo).map((s) => s.hora)).toEqual([
      '12:00',
      '12:30',
    ])
  })

  it('expediente customizado sem almoço não marca intervalo', () => {
    const slots = slotsDoExpediente({
      inicio: '09:00',
      fim: '17:00',
      almocoInicio: '13:00',
      almocoFim: '13:00',
    })
    expect(slots).toHaveLength(16)
    expect(slots.every((s) => !s.intervalo)).toBe(true)
    expect(slots[slots.length - 1].hora).toBe('16:30')
  })
})

describe('foraDoExpediente e emAlmoco', () => {
  it('detecta horário antes do início e depois do fim', () => {
    expect(foraDoExpediente('07:30', 30, EXPEDIENTE_PADRAO)).toBe(true)
    expect(foraDoExpediente('19:45', 30, EXPEDIENTE_PADRAO)).toBe(true)
    expect(foraDoExpediente('08:00', 40, EXPEDIENTE_PADRAO)).toBe(false)
    expect(foraDoExpediente('19:30', 30, EXPEDIENTE_PADRAO)).toBe(false)
  })

  it('detecta almoço e serviço que cruza o intervalo', () => {
    expect(emAlmoco('12:00', 30, EXPEDIENTE_PADRAO)).toBe(true)
    expect(emAlmoco('11:40', 40, EXPEDIENTE_PADRAO)).toBe(true)
    expect(emAlmoco('11:30', 30, EXPEDIENTE_PADRAO)).toBe(false)
    expect(emAlmoco('13:00', 60, EXPEDIENTE_PADRAO)).toBe(false)
  })
})

describe('bloqueioCobre', () => {
  it('bloqueio de dia inteiro cobre qualquer horário daquele dia', () => {
    const b = bloqueioCobre(
      [bloco({ inicio: '08:00', fim: '20:00', tipo: 'folga' })],
      { data: DIA, horario: '10:00', duracaoMin: 40, profissional: 'Audax' },
    )
    expect(b?.tipo).toBe('folga')
  })

  it('cobertura parcial e bordas de intervalo', () => {
    const lista = [bloco({ inicio: '10:00', fim: '11:00' })]
    expect(
      bloqueioCobre(lista, {
        data: DIA,
        horario: '10:30',
        duracaoMin: 30,
        profissional: 'Audax',
      }),
    ).not.toBeNull()
    // encostado no fim não cobre
    expect(
      bloqueioCobre(lista, {
        data: DIA,
        horario: '11:00',
        duracaoMin: 30,
        profissional: 'Audax',
      }),
    ).toBeNull()
  })

  it('intervalo de datas cobre os dias seguintes e respeita o profissional', () => {
    const lista = [
      bloco({
        data: '2026-09-25',
        dataFim: '2026-09-27',
        tipo: 'ferias',
        profissional: 'Diego',
        inicio: '08:00',
        fim: '20:00',
      }),
    ]
    expect(
      bloqueioCobre(lista, {
        data: '2026-09-26',
        horario: '10:00',
        duracaoMin: 30,
        profissional: 'Diego',
      })?.tipo,
    ).toBe('ferias')
    expect(
      bloqueioCobre(lista, {
        data: '2026-09-24',
        horario: '10:00',
        duracaoMin: 30,
        profissional: 'Diego',
      }),
    ).toBeNull()
    expect(
      bloqueioCobre(lista, {
        data: '2026-09-26',
        horario: '10:00',
        duracaoMin: 30,
        profissional: 'Audax',
      }),
    ).toBeNull()
  })
})

describe('rotuloBloqueio', () => {
  it('usa o tipo e acrescenta o motivo quando houver', () => {
    expect(rotuloBloqueio(bloco({ tipo: 'folga' }))).toBe('Folga')
    expect(
      rotuloBloqueio(bloco({ tipo: 'folga', motivo: 'atendimento externo' })),
    ).toBe('Folga — atendimento externo')
    expect(rotuloBloqueio(bloco({ tipo: 'outro', motivo: 'obra' }))).toBe(
      'Outro — obra',
    )
  })
})

describe('validarProposta — cobertura completa', () => {
  const base = {
    agendamentos: [] as Agendamento[],
    bloqueios: [] as Bloqueio[],
    expediente: EXPEDIENTE_PADRAO,
    data: DIA,
    horario: '10:00',
    profissional: 'Audax',
    duracaoMin: 40,
  }

  it('aceita horário livre dentro do expediente', () => {
    expect(validarProposta(base)).toEqual({ ok: true })
  })

  it('recusa fora do expediente', () => {
    const r = validarProposta({ ...base, horario: '07:00' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/fora do expediente/)
  })

  it('recusa horário de almoço', () => {
    const r = validarProposta({ ...base, horario: '12:00' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/almoço/)
  })

  it('recusa horário coberto por bloqueio informando o motivo', () => {
    const r = validarProposta({
      ...base,
      bloqueios: [
        bloco({ inicio: '09:00', fim: '11:00', tipo: 'ausencia', motivo: 'médico' }),
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/Ausência — médico/)
  })

  it('recusa conflito com agendamento existente', () => {
    const r = validarProposta({
      ...base,
      agendamentos: [ag({ horario: '10:00' })],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/^Conflito:/)
  })

  it('ignorarId permite remarcar para o próprio horário sem conflito', () => {
    const existente = ag({ horario: '10:00' })
    const r = validarProposta({
      ...base,
      agendamentos: [existente],
      ignorarId: existente.id,
    })
    expect(r).toEqual({ ok: true })
  })
})
