import { describe, expect, it } from 'vitest'
import { hojeISO, somarDias } from '@/modules/agenda/catalogo'
import type { Agendamento } from '@/modules/agenda/types'
import type { Lancamento } from '@/modules/caixa/types'
import { preferenciasPadrao, type Cliente } from '@/modules/clientes/types'
import { montarPublicos } from './regras'
import { PUBLICOS_ORDEM, PUBLICOS_ROTULO } from './types'

const HOJE = hojeISO()

function cliente(id: string, nome: string, extras: Partial<Cliente> = {}): Cliente {
  return {
    id,
    nome,
    telefone: '',
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
    criadoEm: `${somarDias(HOJE, -10)}T00:00:00.000Z`,
    atualizadoEm: `${somarDias(HOJE, -10)}T00:00:00.000Z`,
    ...extras,
  }
}

function ag(clienteNome: string, dataRel: number): Agendamento {
  return {
    id: `ag-${clienteNome}-${dataRel}`,
    cliente: clienteNome,
    telefone: '',
    servico: 'Corte Degradê',
    profissional: 'Audax',
    data: somarDias(HOJE, dataRel),
    horario: '10:00',
    status: 'concluido',
    observacao: '',
    criadoEm: '2026-01-01T00:00:00.000Z',
    duracaoMin: 40,
  }
}

/** Cinco clientes, um por segmento, + aniversariante do mês. */
function base() {
  const aniversario = `${HOJE.slice(0, 4)}-${HOJE.slice(5, 7)}-15`
  const clientes = [
    cliente('c-inativo', 'Ivo Rocha', {
      criadoEm: `${somarDias(HOJE, -120)}T00:00:00.000Z`,
    }),
    cliente('c-recorrente', 'Ana Souza'),
    cliente('c-semretorno', 'Bruno Lima'),
    cliente('c-novo', 'Carla Dias', {
      criadoEm: `${somarDias(HOJE, -5)}T00:00:00.000Z`,
    }),
    cliente('c-aniv', 'Davi Ramos', {
      nascimento: aniversario,
      criadoEm: `${somarDias(HOJE, -200)}T00:00:00.000Z`,
    }),
  ]
  const agendamentos: Agendamento[] = [
    ag('Ana Souza', -5),
    ag('Ana Souza', -12),
    ag('Ana Souza', -22),
    ag('Bruno Lima', -50),
  ]
  return { clientes, agendamentos }
}

describe('montarPublicos — públicos derivados sem cópia de dados', () => {
  it('segue a ordem oficial e os rótulos de PUBLICOS_ORDEM', () => {
    const { clientes, agendamentos } = base()
    const publicos = montarPublicos(clientes, agendamentos, [], HOJE)
    expect(publicos.map((p) => p.id)).toEqual(PUBLICOS_ORDEM)
    expect(publicos.map((p) => p.rotulo)).toEqual(
      PUBLICOS_ORDEM.map((id) => PUBLICOS_ROTULO[id]),
    )
    expect(publicos).toHaveLength(5)
  })

  it('conta cada público pelo comportamento real e pelo aniversário do mês', () => {
    const { clientes, agendamentos } = base()
    const publicos = montarPublicos(clientes, agendamentos, [], HOJE)
    const porId = Object.fromEntries(publicos.map((p) => [p.id, p]))

    expect(porId.inativos.clientes.map((c) => c.nome)).toEqual([
      'Ivo Rocha',
      'Davi Ramos',
    ])
    expect(porId.recorrentes.clientes.map((c) => c.nome)).toEqual(['Ana Souza'])
    expect(porId.sem_retorno.clientes.map((c) => c.nome)).toEqual(['Bruno Lima'])
    expect(porId.novos.clientes.map((c) => c.nome)).toEqual(['Carla Dias'])
    expect(porId.aniversariantes.clientes.map((c) => c.nome)).toEqual([
      'Davi Ramos',
    ])
  })

  it('aniversariante de outro mês não entra e descrições explicam o público', () => {
    const { clientes, agendamentos } = base()
    const outroMes = HOJE.slice(5, 7) === '07' ? '08' : '07'
    clientes.push(
      cliente('c-aniv-fora', 'Eva Nunes', { nascimento: `1990-${outroMes}-20` }),
    )
    const publicos = montarPublicos(clientes, agendamentos, [], HOJE)
    const aniv = publicos.find((p) => p.id === 'aniversariantes')!
    expect(aniv.clientes.map((c) => c.nome)).toEqual(['Davi Ramos'])
    const inativos = publicos.find((p) => p.id === 'inativos')!
    expect(inativos.descricao).toContain('reativação')
  })

  it('não altera os arrays de entrada', () => {
    const { clientes, agendamentos } = base()
    const clientesCopia = [...clientes]
    const agsCopia = [...agendamentos]
    montarPublicos(clientes, agendamentos, [] as Lancamento[], HOJE)
    expect(clientes).toEqual(clientesCopia)
    expect(agendamentos).toEqual(agsCopia)
  })
})
