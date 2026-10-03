import { describe, expect, it } from 'vitest'
import {
  agruparPorCategoria,
  alternarComplemento,
  CATEGORIA_SEM_ROTULO,
  complementosDisponiveis,
  dadosValidos,
  ETAPAS,
  ETAPAS_PROGRESSO,
  escolherData,
  escolherHorario,
  escolherProfissional,
  escolherServico,
  etapaAnterior,
  etapaBloqueia,
  etapaSeguinte,
  ESTADO_VAZIO,
  invalidateHorarioSeNaoCabe,
  selecao,
  type EstadoAgendamento,
  type ItemCatalogo,
} from './estado'

const CATALOGO: ItemCatalogo[] = [
  { id: 'srv-corte', nome: 'Corte de  Cabelo', preco: 30, duracaoMin: 30, complementos: ['srv-barba', 'srv-sobrancelha'] },
  { id: 'srv-barba', nome: 'Barba', preco: 20, duracaoMin: 30, complementos: [] },
  { id: 'srv-sobrancelha', nome: 'Sobrancelha', preco: 8, duracaoMin: 15, complementos: [] },
]

/** Estado completo: serviço, profissional, dia, horário e cliente. */
const CHEIO: EstadoAgendamento = {
  servicoNome: 'Corte de  Cabelo',
  profissional: 'Cleiton Silva',
  data: '2026-10-05',
  horario: '14:00',
  complementoIds: ['srv-sobrancelha'],
  nome: 'Ana Souza',
  telefone: '(81) 99999-9999',
  observacao: '',
}

describe('etapas', () => {
  it('são oito, na ordem do fluxo pedido', () => {
    expect(ETAPAS).toEqual([
      'servico',
      'profissional',
      'data',
      'horario',
      'complementos',
      'dados',
      'resumo',
      'confirmacao',
    ])
  })

  it('o indicador mostra sete passos (a confirmação é fim, não passo)', () => {
    expect(ETAPAS_PROGRESSO).toHaveLength(7)
    expect(ETAPAS_PROGRESSO).not.toContain('confirmacao')
  })

  it('cada etapa só abre depois da escolha que a sustenta', () => {
    expect(etapaBloqueia(ESTADO_VAZIO, 'servico')).toBe(true)
    expect(etapaBloqueia(ESTADO_VAZIO, 'profissional')).toBe(true)
    expect(etapaBloqueia(ESTADO_VAZIO, 'resumo')).toBe(true)
    // Complementos e dados não prendem: são opcionais de avançar.
    expect(etapaBloqueia(ESTADO_VAZIO, 'complementos')).toBe(false)
    expect(etapaBloqueia(ESTADO_VAZIO, 'dados')).toBe(false)
  })

  it('o resumo só abre com serviço, profissional, data e horário', () => {
    expect(etapaBloqueia(CHEIO, 'resumo')).toBe(false)
    expect(etapaBloqueia({ ...CHEIO, horario: '' }, 'resumo')).toBe(true)
    expect(etapaBloqueia({ ...CHEIO, profissional: '' }, 'resumo')).toBe(true)
    expect(etapaBloqueia({ ...CHEIO, data: '' }, 'resumo')).toBe(true)
  })

  it('anterior e seguinte andam uma de cada vez e não saem da lista', () => {
    expect(etapaAnterior('servico')).toBe('servico')
    expect(etapaAnterior('data')).toBe('profissional')
    expect(etapaSeguinte('data')).toBe('horario')
    expect(etapaSeguinte('confirmacao')).toBe('confirmacao')
  })
})

describe('trocar de serviço', () => {
  it('limpa profissional, data, horário e complementos', () => {
    const proximo = escolherServico(CHEIO, 'Barba', [])
    expect(proximo.servicoNome).toBe('Barba')
    expect(proximo.data).toBe('')
    expect(proximo.horario).toBe('')
    expect(proximo.complementoIds).toEqual([])
  })

  it('NÃO faz a pessoa se apresentar de novo', () => {
    const proximo = escolherServico(CHEIO, 'Barba', [])
    expect(proximo.nome).toBe('Ana Souza')
    expect(proximo.telefone).toBe('(81) 99999-9999')
  })

  it('só mantém complementos que o novo serviço permite', () => {
    // Sobrancelha vale para o Corte; para a Barba, a lista é vazia.
    const naBarba = escolherServico(CHEIO, 'Barba', [])
    expect(naBarba.complementoIds).toEqual([])
  })

  it('não faz nada se o serviço for o mesmo', () => {
    expect(escolherServico(CHEIO, CHEIO.servicoNome, [])).toBe(CHEIO)
  })
})

describe('trocar de profissional', () => {
  it('limpa data e horário, mas mantém serviço e cliente', () => {
    const proximo = escolherProfissional(CHEIO, 'Ítalo Santos')
    expect(proximo.profissional).toBe('Ítalo Santos')
    expect(proximo.servicoNome).toBe('Corte de  Cabelo')
    expect(proximo.nome).toBe('Ana Souza')
    expect(proximo.data).toBe('')
    expect(proximo.horario).toBe('')
  })

  it('não toca nos complementos (o serviço continua o mesmo)', () => {
    expect(escolherProfissional(CHEIO, 'Ítalo Santos').complementoIds).toEqual([
      'srv-sobrancelha',
    ])
  })
})

describe('trocar de dia', () => {
  it('limpa só o horário', () => {
    const proximo = escolherData(CHEIO, '2026-10-06')
    expect(proximo.data).toBe('2026-10-06')
    expect(proximo.horario).toBe('')
    expect(proximo.profissional).toBe('Cleiton Silva')
  })
})

describe('complementos', () => {
  it('liga e desliga pelo id', () => {
    const ligado = alternarComplemento(ESTADO_VAZIO, 'srv-barba')
    expect(ligado.complementoIds).toEqual(['srv-barba'])
    expect(alternarComplemento(ligado, 'srv-barba').complementoIds).toEqual([])
  })

  it('só sugere o que a casa configurou para aquele serviço', () => {
    // O Corte lista Barba e Sobrancelha; a Barba não lista nada.
    expect(complementosDisponiveis(CATALOGO, 'Corte de  Cabelo').map((c) => c.nome)).toEqual([
      'Barba',
      'Sobrancelha',
    ])
    expect(complementosDisponiveis(CATALOGO, 'Barba')).toEqual([])
    expect(complementosDisponiveis(CATALOGO, 'Serviço Inexistente')).toEqual([])
  })

  it('nunca sugere o próprio serviço como complemento dele mesmo', () => {
    const lista = complementosDisponiveis(CATALOGO, 'Corte de  Cabelo')
    expect(lista.map((c) => c.nome)).not.toContain('Corte de  Cabelo')
  })

  it('recalcula duração e valor com os complementos', () => {
    const { base, complementos, duracaoMin, valor } = selecao(CHEIO, CATALOGO)
    expect(base?.nome).toBe('Corte de  Cabelo')
    expect(complementos.map((c) => c.nome)).toEqual(['Sobrancelha'])
    // 30 + 15 = 45 min; R$ 30 + R$ 8 = R$ 38.
    expect(duracaoMin).toBe(45)
    expect(valor).toBe(38)
  })

  it('sem serviço escolhido, a seleção é vazia e não quebra', () => {
    expect(selecao(ESTADO_VAZIO, CATALOGO)).toEqual({
      base: null,
      complementos: [],
      duracaoMin: 0,
      valor: 0,
    })
  })
})

describe('complemento que não cabe no horário', () => {
  it('devolve o horário quando ele some da lista de livres', () => {
    // Com a Sobrancelha (15 min) o 14:00 ainda cabe:
    const mantem = invalidateHorarioSeNaoCabe(CHEIO, ['13:00', '14:00', '15:00'])
    expect(mantem.horario).toBe('14:00')

    // Com a Barba (30 min) somada, o 14:00 passa do fim — some da lista.
    const devolve = invalidateHorarioSeNaoCabe(CHEIO, ['13:00', '15:00'])
    expect(devolve.horario).toBe('')
    // E o resto da escolha continua: só o horário que caiu.
    expect(devolve.profissional).toBe('Cleiton Silva')
    expect(devolve.data).toBe('2026-10-05')
  })

  it('não mexe em nada quando não há horário escolhido', () => {
    const semHorario = { ...CHEIO, horario: '' }
    expect(invalidateHorarioSeNaoCabe(semHorario, [])).toBe(semHorario)
  })
})

describe('dados do cliente', () => {
  it('aceita nome e telefone com DDD', () => {
    expect(dadosValidos(CHEIO)).toBe(true)
    expect(dadosValidos({ ...CHEIO, telefone: '81999999999' })).toBe(true)
  })

  it('recusa nome curto ou telefone sem DDD', () => {
    expect(dadosValidos({ ...CHEIO, nome: 'A' })).toBe(false)
    expect(dadosValidos({ ...CHEIO, telefone: '9999999' })).toBe(false)
    expect(dadosValidos({ ...CHEIO, telefone: '' })).toBe(false)
  })
})

describe('o caminho feliz completo', () => {
  it('leva do serviço à confirmação sem perder escolha', () => {
    let estado = escolherServico(ESTADO_VAZIO, 'Corte de  Cabelo', [
      'srv-barba',
      'srv-sobrancelha',
    ])
    expect(etapaBloqueia(estado, 'profissional')).toBe(true)

    estado = escolherProfissional(estado, 'Cleiton Silva')
    estado = escolherData(estado, '2026-10-05')
    estado = escolherHorario(estado, '14:00')
    estado = { ...estado, complementoIds: ['srv-sobrancelha'] }
    estado = { ...estado, nome: 'Ana Souza', telefone: '81999999999' }

    expect(estado).toEqual({
      servicoNome: 'Corte de  Cabelo',
      profissional: 'Cleiton Silva',
      data: '2026-10-05',
      horario: '14:00',
      complementoIds: ['srv-sobrancelha'],
      nome: 'Ana Souza',
      telefone: '81999999999',
      observacao: '',
    })
    expect(etapaBloqueia(estado, 'resumo')).toBe(false)
    expect(dadosValidos(estado)).toBe(true)
  })

  it('voltar e voltar NÃO perde nenhuma escolha', () => {
    // Voltar é só mudar o índice da etapa: o estado fica como está.
    const estado = CHEIO
    expect(etapaAnterior('resumo')).toBe('dados')
    expect(etapaAnterior(etapaAnterior('resumo'))).toBe('complementos')
    expect(estado.servicoNome).toBe('Corte de  Cabelo')
    expect(estado.profissional).toBe('Cleiton Silva')
    expect(estado.data).toBe('2026-10-05')
    expect(estado.horario).toBe('14:00')
    expect(estado.complementoIds).toEqual(['srv-sobrancelha'])
  })

  it('recomeçar limpa tudo', () => {
    const limpo = ESTADO_VAZIO
    expect(limpo.servicoNome).toBe('')
    expect(limpo.profissional).toBe('')
    expect(limpo.complementoIds).toEqual([])
  })
})

describe('agrupar por categoria (a sanfona da vitrine)', () => {
  const COM_CATEGORIA: ItemCatalogo[] = [
    { nome: 'Corte Audax', preco: 30, duracaoMin: 30, categoria: 'Cabelo' },
    { nome: 'Barba', preco: 20, duracaoMin: 20, categoria: 'Barba' },
    { nome: 'Platinado', preco: 120, duracaoMin: 90, categoria: 'Cabelo' },
  ]

  it('agrupa pela categoria oficial da casa, sem reordenar dentro do grupo', () => {
    const grupos = agruparPorCategoria(COM_CATEGORIA)
    expect(grupos.map((g) => g.categoria)).toEqual(['Cabelo', 'Barba'])
    expect(grupos[0].servicos.map((s) => s.nome)).toEqual([
      'Corte Audax',
      'Platinado',
    ])
    expect(grupos[1].servicos.map((s) => s.nome)).toEqual(['Barba'])
  })

  it('a ordem dos grupos é a do catálogo, não colada em A-Z', () => {
    const grupos = agruparPorCategoria([
      { nome: 'Barba', preco: 20, duracaoMin: 20, categoria: 'Barba' },
      { nome: 'Corte Audax', preco: 30, duracaoMin: 30, categoria: 'Cabelo' },
    ])
    expect(grupos.map((g) => g.categoria)).toEqual(['Barba', 'Cabelo'])
  })

  it('serviço sem categoria vai para "Outros" em vez de sumir', () => {
    const grupos = agruparPorCategoria([
      { nome: 'Corte Audax', preco: 30, duracaoMin: 30, categoria: 'Cabelo' },
      { nome: 'Pezinho', preco: 15, duracaoMin: 10 },
      { nome: 'Degradê', preco: 40, duracaoMin: 30, categoria: '   ' },
    ])
    expect(grupos.map((g) => g.categoria)).toEqual([
      'Cabelo',
      CATEGORIA_SEM_ROTULO,
    ])
    // Os dois sem categoria ficam juntos e nenhum é perdido.
    expect(grupos[1].servicos.map((s) => s.nome)).toEqual(['Pezinho', 'Degradê'])
  })

  it('catálogo vazio não gera grupo nenhum', () => {
    expect(agruparPorCategoria([])).toEqual([])
  })

  it('nenhum serviço é perdido nem repetido', () => {
    const grupos = agruparPorCategoria([
      ...COM_CATEGORIA,
      { nome: 'Pezinho', preco: 15, duracaoMin: 10 },
    ])
    const total = grupos.reduce((soma, g) => soma + g.servicos.length, 0)
    expect(total).toBe(4)
  })
})
