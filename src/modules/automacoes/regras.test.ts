import { describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import {
  preferenciasPadrao,
  type Cliente,
} from '@/modules/clientes/types'
import type { AssinaturaClube } from '@/modules/clube/types'
import type { PedidoEspera } from '@/modules/espera/types'
import type { MensagemWhats } from '@/modules/whatsapp/types'
import {
  chaveTratada,
  gerarAutomacoes,
  semTratadas,
  type EntradaAutomacoes,
} from './regras'

const HOJE = hojeISO()
const AMANHA = somarDias(HOJE, 1)

function cli(id: string, nome: string, extras: Partial<Cliente> = {}): Cliente {
  return {
    id,
    nome,
    telefone: '(11) 99999-0000',
    email: '',
    observacao: '',
    ativo: true,
    genero: 'nao_informado',
    cpf: '',
    cnpj: '',
    nascimento: '',
    etiquetas: [],
    instagram: '',
    comoNosConheceu: '',
    telefones: [],
    endereco: null,
    preferencias: preferenciasPadrao(),
    criadoEm: `${somarDias(HOJE, -300)}T00:00:00.000Z`,
    atualizadoEm: `${somarDias(HOJE, -300)}T00:00:00.000Z`,
    ...extras,
  }
}

function ag(
  entrada: { cliente: string } & Partial<Agendamento>,
): Agendamento {
  return {
    id: entrada.id ?? 'a1',
    telefone: '(11) 99999-0000',
    servico: 'Corte',
    profissional: 'Audax',
    data: HOJE,
    horario: '09:00',
    status: 'pendente',
    observacao: '',
    criadoEm: `${HOJE}T00:00:00.000Z`,
    ...entrada,
  }
}

function ped(
  entrada: { id: string; clienteId: string; cliente: string } & Partial<PedidoEspera>,
): PedidoEspera {
  return {
    telefone: '(11) 98888-7777',
    servico: 'Corte',
    profissional: '',
    periodo: 'qualquer',
    dataPreferida: '',
    observacao: '',
    status: 'aguardando',
    criadoEm: `${HOJE}T00:00:00.000Z`,
    ...entrada,
  }
}

function ass(extras: Partial<AssinaturaClube> = {}): AssinaturaClube {
  return {
    id: 'as1',
    clienteId: 'c1',
    cliente: 'Ana Souza',
    plano: 'cabelo',
    valorMensal: 99.9,
    dataAssinatura: somarDias(HOJE, -35),
    proximoVencimento: somarDias(HOJE, -2),
    cancelada: false,
    criadoEm: `${HOJE}T00:00:00.000Z`,
    ...extras,
  }
}

function msg(extras: Partial<MensagemWhats> = {}): MensagemWhats {
  return {
    id: 'm1',
    clienteId: 'c1',
    cliente: 'Ana Souza',
    template: 'confirmacao',
    texto: 'Mensagem preparada',
    status: 'pendente',
    origem: 'crm',
    criadoEm: `${HOJE}T00:00:00.000Z`,
    ...extras,
  }
}

function entrada(
  extras: Partial<EntradaAutomacoes> = {},
): EntradaAutomacoes {
  return {
    agendamentos: [],
    clientes: [],
    lancamentos: [],
    assinaturas: [],
    pedidos: [],
    mensagens: [],
    ...extras,
  }
}

describe('Automações — confirmação de agendamento de amanhã', () => {
  it('sugere confirmação com chave estável e texto real', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [ag({ id: 'a1', cliente: 'Ana Souza', data: AMANHA })],
      }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: 'confirmacao:a1',
      tipo: 'confirmacao',
      template: 'confirmacao',
      clienteId: 'c1',
      cliente: 'Ana Souza',
      agendamentoId: 'a1',
    })
    expect(sugestoes[0].texto).toContain('Ana Souza')
    expect(sugestoes[0].texto).toContain('09:00')
  })

  it('não sugere confirmação fora da janela ou já confirmado', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            id: 'a1',
            cliente: 'Ana Souza',
            data: AMANHA,
            status: 'confirmado',
          }),
          ag({
            id: 'a2',
            cliente: 'Ana Souza',
            data: somarDias(HOJE, 3),
          }),
          ag({
            id: 'a3',
            cliente: 'Ana Souza',
            data: AMANHA,
            status: 'cancelado',
          }),
        ],
      }),
    )
    expect(sugestoes.filter((s) => s.tipo === 'confirmacao')).toHaveLength(0)
  })

  it('ignora agendamento de quem não está cadastrado', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [ag({ cliente: 'Desconhecido', data: AMANHA })],
      }),
    )
    expect(sugestoes).toHaveLength(0)
  })

  it('não duplica o que já foi preparado manualmente (pendente/enviada)', () => {
    const base = {
      clientes: [cli('c1', 'Ana Souza')],
      agendamentos: [ag({ id: 'a1', cliente: 'Ana Souza', data: AMANHA })],
    }
    expect(
      gerarAutomacoes(
        entrada({
          ...base,
          mensagens: [msg({ template: 'confirmacao', agendamentoId: 'a1' })],
        }),
      ),
    ).toHaveLength(0)
    expect(
      gerarAutomacoes(
        entrada({
          ...base,
          mensagens: [
            msg({
              template: 'confirmacao',
              agendamentoId: 'a1',
              status: 'enviada',
            }),
          ],
        }),
      ),
    ).toHaveLength(0)
    // falhou não trava: a sugestão volta a aparecer
    expect(
      gerarAutomacoes(
        entrada({
          ...base,
          mensagens: [
            msg({
              template: 'confirmacao',
              agendamentoId: 'a1',
              status: 'falhou',
            }),
          ],
        }),
      ),
    ).toHaveLength(1)
  })
})

describe('Automações — lembrete do dia', () => {
  it('sugere lembrete para agendamento de hoje', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({ id: 'a1', cliente: 'Ana Souza', status: 'confirmado' }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: 'lembrete:a1',
      tipo: 'lembrete',
      template: 'lembrete',
    })
  })

  it('respeita a preferência smsLembrete desligada', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [
          cli('c1', 'Ana Souza', {
            preferencias: { ...preferenciasPadrao(), smsLembrete: false },
          }),
        ],
        agendamentos: [ag({ cliente: 'Ana Souza' })],
      }),
    )
    expect(sugestoes).toHaveLength(0)
  })

  it('não lembra de quem não é de hoje nem de concluídos', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({ id: 'a1', cliente: 'Ana Souza', data: AMANHA }),
          ag({
            id: 'a2',
            cliente: 'Ana Souza',
            status: 'concluido',
          }),
        ],
      }),
    )
    expect(sugestoes.filter((s) => s.tipo === 'lembrete')).toHaveLength(0)
  })
})

describe('Automações — cancelamento e reagendamento', () => {
  it('avisa cancelamento de horário de hoje em diante', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            id: 'a1',
            cliente: 'Ana Souza',
            status: 'cancelado',
            data: AMANHA,
          }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: 'cancelamento:a1',
      tipo: 'cancelamento',
      template: 'cancelamento',
    })
    expect(sugestoes[0].texto).toContain('cancelado')
  })

  it('não avisa cancelamento de data já passada', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            cliente: 'Ana Souza',
            status: 'cancelado',
            data: somarDias(HOJE, -1),
          }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(0)
  })

  it('avisa o horário atual da remarcação com chave por horário', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            id: 'a1',
            cliente: 'Ana Souza',
            data: somarDias(HOJE, 3),
            horario: '15:00',
            status: 'confirmado',
            remarcacoes: [
              {
                de: { data: HOJE, horario: '09:00', profissional: 'Audax' },
                em: `${HOJE}T10:00:00.000Z`,
              },
            ],
          }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0].chave).toBe(
      `reagendamento:a1:${somarDias(HOJE, 3)}:15:00`,
    )
    expect(sugestoes[0].texto).toContain('remarcado')
    // mudar de horário gera outra chave (novo aviso legítimo)
    const mudado = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            id: 'a1',
            cliente: 'Ana Souza',
            data: somarDias(HOJE, 4),
            remarcacoes: [
              {
                de: { data: HOJE, horario: '09:00', profissional: 'Audax' },
                em: `${HOJE}T10:00:00.000Z`,
              },
            ],
          }),
        ],
      }),
    )
    expect(mudado[0].chave).not.toBe(sugestoes[0].chave)
  })
})

describe('Automações — aniversário', () => {
  const nascimentoHoje = `${HOJE.slice(0, 4)}-${HOJE.slice(5, 7)}-${HOJE.slice(8, 10)}`

  it('sugere felicitação no dia com chave por ano', () => {
    const sugestoes = gerarAutomacoes(
      entrada({ clientes: [cli('c1', 'Ana Souza', { nascimento: nascimentoHoje })] }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: `aniversario:c1:${HOJE.slice(0, 4)}`,
      tipo: 'aniversario',
      template: 'aniversario',
    })
    expect(sugestoes[0].texto).toContain('feliz aniversário')
  })

  it('não sugere fora do dia, para inativos ou sem marketing', () => {
    const outroMes = `${HOJE.slice(0, 4)}-${String(
      (Number(HOJE.slice(5, 7)) % 12) + 1,
    ).padStart(2, '0')}-15`
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [
          cli('c1', 'Outro Mês', { nascimento: outroMes }),
          cli('c2', 'Inativo', { nascimento: nascimentoHoje, ativo: false }),
          cli('c3', 'Sem Marketing', {
            nascimento: nascimentoHoje,
            preferencias: { ...preferenciasPadrao(), smsMarketing: false },
          }),
          cli('c4', 'Sem Data', { nascimento: '' }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(0)
  })
})

describe('Automações — inatividade (reativação)', () => {
  it('sugere reativação com 90+ dias e chave por último atendimento', () => {
    const ultima = somarDias(HOJE, -100)
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({ id: 'a1', cliente: 'Ana Souza', data: ultima, status: 'concluido' }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: `inatividade:c1:${ultima}`,
      tipo: 'inatividade',
      template: 'reativacao',
    })
    expect(sugestoes[0].texto).toContain('100 dia(s)')
  })

  it('não sugere antes de 90 dias nem com retorno marcado', () => {
    const recente = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            cliente: 'Ana Souza',
            data: somarDias(HOJE, -89),
            status: 'concluido',
          }),
        ],
      }),
    )
    expect(recente).toHaveLength(0)

    const comRetorno = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            id: 'a1',
            cliente: 'Ana Souza',
            data: somarDias(HOJE, -100),
            status: 'concluido',
          }),
          ag({
            id: 'a2',
            cliente: 'Ana Souza',
            data: somarDias(HOJE, 10),
            status: 'confirmado',
          }),
        ],
      }),
    )
    expect(comRetorno).toHaveLength(0)
  })

  it('não duplica reativação já preparada no CRM ou IA', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        agendamentos: [
          ag({
            cliente: 'Ana Souza',
            data: somarDias(HOJE, -100),
            status: 'concluido',
          }),
        ],
        mensagens: [msg({ template: 'reativacao', status: 'enviada' })],
      }),
    )
    expect(sugestoes).toHaveLength(0)
  })
})

describe('Automações — vencimento do Clube', () => {
  it('avisa vencimento próximo com dias e plano reais', () => {
    const vencimento = somarDias(HOJE, 2)
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        assinaturas: [ass({ proximoVencimento: vencimento })],
      }),
    )
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: `vencimento_clube:as1:${vencimento}`,
      tipo: 'vencimento_clube',
      template: 'vencimento_clube',
      clienteId: 'c1',
    })
    expect(sugestoes[0].texto).toContain('vence em 2 dia(s)')
    expect(sugestoes[0].texto).toContain('Cabelo')
  })

  it('avisa atraso e ignora ativa/cancelada/inativa', () => {
    const atrasada = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        assinaturas: [ass({ proximoVencimento: somarDias(HOJE, -3) })],
      }),
    )
    expect(atrasada[0].texto).toContain('venceu há 3 dia(s)')

    const fora = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza')],
        assinaturas: [
          ass({ proximoVencimento: somarDias(HOJE, 20) }),
          ass({ id: 'as2', cancelada: true }),
        ],
      }),
    )
    expect(fora).toHaveLength(0)

    const clienteInativo = gerarAutomacoes(
      entrada({
        clientes: [cli('c1', 'Ana Souza', { ativo: false })],
        assinaturas: [ass()],
      }),
    )
    expect(clienteInativo).toHaveLength(0)
  })
})

describe('Automações — horário liberado na fila', () => {
  const cancelado = ag({
    id: 'a1',
    cliente: 'Ana Souza',
    status: 'cancelado',
    data: somarDias(HOJE, 3),
    horario: '15:00',
    servico: 'Corte',
    profissional: 'Audax',
  })

  function base(): EntradaAutomacoes {
    return entrada({
      clientes: [cli('c2', 'Bruno Lima')],
      agendamentos: [cancelado],
      pedidos: [
        ped({ id: 'p1', clienteId: 'c2', cliente: 'Bruno Lima' }),
      ],
    })
  }

  it('convida quem está na fila com o serviço compatível', () => {
    const sugestoes = gerarAutomacoes(base())
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]).toMatchObject({
      chave: 'horario_liberado:a1:p1',
      tipo: 'horario_liberado',
      template: 'horario_liberado',
      clienteId: 'c2',
      cliente: 'Bruno Lima',
    })
    expect(sugestoes[0].texto).toContain('Bruno Lima')
    expect(sugestoes[0].texto).toContain('15:00')
  })

  it('filtra por serviço, período, status e vaga já reocupada', () => {
    const outroServico = gerarAutomacoes({
      ...base(),
      pedidos: [
        ped({ id: 'p1', clienteId: 'c2', cliente: 'Bruno Lima', servico: 'Barba' }),
      ],
    })
    expect(outroServico).toHaveLength(0)

    const periodoErrado = gerarAutomacoes({
      ...base(),
      pedidos: [
        ped({
          id: 'p1',
          clienteId: 'c2',
          cliente: 'Bruno Lima',
          periodo: 'manha',
        }),
      ],
    })
    expect(periodoErrado).toHaveLength(0)

    const encerrado = gerarAutomacoes({
      ...base(),
      pedidos: [
        ped({
          id: 'p1',
          clienteId: 'c2',
          cliente: 'Bruno Lima',
          status: 'atendido',
        }),
      ],
    })
    expect(encerrado).toHaveLength(0)

    const reocupado = gerarAutomacoes({
      ...base(),
      agendamentos: [
        cancelado,
        ag({
          id: 'a2',
          cliente: 'Carla Dias',
          data: cancelado.data,
          horario: '15:00',
          profissional: 'Audax',
          status: 'confirmado',
        }),
      ],
    })
    expect(reocupado).toHaveLength(0)

    const noPassado = gerarAutomacoes({
      ...base(),
      agendamentos: [{ ...cancelado, data: HOJE }],
    })
    expect(noPassado).toHaveLength(0)
  })
})

describe('Automações — anti-duplicação e ordenação', () => {
  it('semTratadas remove apenas as chaves tratadas (Set ou lista)', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [
          cli('c1', 'Ana Souza', { nascimento: HOJE }),
          cli('c2', 'Bruno Lima', { nascimento: HOJE }),
        ],
      }),
    )
    expect(sugestoes).toHaveLength(2)
    const filtradas = semTratadas(sugestoes, ['aniversario:c1:' + HOJE.slice(0, 4)])
    expect(filtradas).toHaveLength(1)
    expect(filtradas[0].clienteId).toBe('c2')
    expect(semTratadas(sugestoes, new Set(sugestoes.map((s) => s.chave)))).toHaveLength(0)
    expect(chaveTratada(['x'], 'x')).toBe(true)
    expect(chaveTratada(new Set(['y']), 'z')).toBe(false)
  })

  it('ordena por prioridade: confirmação antes de aniversário e Clube', () => {
    const sugestoes = gerarAutomacoes(
      entrada({
        clientes: [
          cli('c1', 'Ana Souza', { nascimento: HOJE }),
          cli('c2', 'Bruno Lima'),
        ],
        agendamentos: [ag({ id: 'a1', cliente: 'Bruno Lima', data: AMANHA })],
        assinaturas: [ass({ clienteId: 'c2', cliente: 'Bruno Lima' })],
      }),
    )
    expect(sugestoes.map((s) => s.tipo)).toEqual([
      'confirmacao',
      'aniversario',
      'vencimento_clube',
    ])
  })
})
