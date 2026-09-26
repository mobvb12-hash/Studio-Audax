import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CaixaProvider, useCaixa } from '@/modules/caixa/store'
import { AgendaProvider, useAgenda } from './store'
import type { Agendamento } from './types'

const CHAVE = 'studio-audax:agendamentos:v1'

function Tela() {
  const {
    agendamentos,
    adicionar,
    mudarStatus,
    remover,
    renomearProfissional,
    renomearServico,
    renomearCliente,
  } = useAgenda()
  const primeiro = agendamentos[0]
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(agendamentos)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            cliente: 'Lucas Mendes',
            telefone: '(11) 98888-7777',
            servico: 'Corte Degradê',
            profissional: 'Audax',
            data: '2026-09-25',
            horario: '10:00',
            observacao: '',
          })
        }
      >
        criar
      </button>
      {primeiro && (
        <>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'confirmado')}
          >
            confirmar
          </button>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'concluido')}
          >
            concluir
          </button>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'cancelado')}
          >
            cancelar
          </button>
          <button
            type="button"
            onClick={() => mudarStatus(primeiro.id, 'nao_compareceu')}
          >
            faltou
          </button>
          <button type="button" onClick={() => remover(primeiro.id)}>
            excluir
          </button>
          <button
            type="button"
            onClick={() => renomearProfissional('Audax', 'Audax Barbearia')}
          >
            renomear-profissional
          </button>
          <button
            type="button"
            onClick={() => renomearServico('Corte Degradê', 'Corte novo')}
          >
            renomear-servico
          </button>
          <button
            type="button"
            onClick={() => renomearCliente('Lucas Mendes', 'Lucas')}
          >
            renomear-cliente
          </button>
        </>
      )}
    </div>
  )
}

function lerLista(): Agendamento[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <AgendaProvider>
      <Tela />
    </AgendaProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('Agenda — store', () => {
  it('cria agendamento com status pendente e grava no localStorage', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].status).toBe('pendente')
    expect(lista[0].cliente).toBe('Lucas Mendes')
    expect(lista[0].servico).toBe('Corte Degradê')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage).toHaveLength(1)
    expect(noStorage[0].horario).toBe('10:00')
  })

  it('altera status: confirmar, concluir, cancelar e não compareceu', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('confirmar'))
    expect(lerLista()[0].status).toBe('confirmado')

    fireEvent.click(screen.getByText('concluir'))
    expect(lerLista()[0].status).toBe('concluido')

    fireEvent.click(screen.getByText('cancelar'))
    expect(lerLista()[0].status).toBe('cancelado')

    fireEvent.click(screen.getByText('faltou'))
    expect(lerLista()[0].status).toBe('nao_compareceu')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage[0].status).toBe('nao_compareceu')
  })

  it('exclui agendamento (exclusão onde permitido)', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('excluir'))
    expect(lerLista()).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')).toHaveLength(0)
  })

  it('simula F5: dados continuam corretos ao reabrir o sistema', () => {
    const primeiro = montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('cancelar'))
    primeiro.unmount()

    montar()
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].status).toBe('cancelado')
    expect(lista[0].cliente).toBe('Lucas Mendes')
  })

  it('propaga renomeações de profissional, serviço e cliente aos agendamentos', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))

    fireEvent.click(screen.getByText('renomear-profissional'))
    fireEvent.click(screen.getByText('renomear-servico'))
    fireEvent.click(screen.getByText('renomear-cliente'))

    const ag = lerLista()[0]
    expect(ag.profissional).toBe('Audax Barbearia')
    expect(ag.servico).toBe('Corte novo')
    expect(ag.cliente).toBe('Lucas')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(noStorage[0].profissional).toBe('Audax Barbearia')
    expect(noStorage[0].servico).toBe('Corte novo')
    expect(noStorage[0].cliente).toBe('Lucas')
  })

  it('renomear sem alteração ou com nome inexistente não muda nada', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))

    fireEvent.click(screen.getByText('renomear-cliente'))
    const depois = lerLista()[0]
    expect(depois.cliente).toBe('Lucas')

    fireEvent.click(screen.getByText('renomear-profissional'))
    expect(lerLista()[0].profissional).toBe('Audax Barbearia')
  })
})

const DIA = '2026-09-25'

function TelaExtra() {
  const {
    agendamentos,
    bloqueios,
    expediente,
    adicionar,
    mudarStatus,
    remarcar,
    salvarExpediente,
    criarBloqueio,
    removerBloqueio,
    renomearProfissional,
  } = useAgenda()
  const [saida, setSaida] = useState('')

  function tentar(rotulo: string, fn: () => unknown) {
    try {
      fn()
      setSaida(`${rotulo}:ok`)
    } catch (e) {
      setSaida(`${rotulo}:${e instanceof Error ? e.message : 'erro'}`)
    }
  }

  const criar = (horario: string, cliente: string) =>
    adicionar({
      cliente,
      telefone: '',
      servico: 'Corte Degradê',
      profissional: 'Audax',
      data: DIA,
      horario,
      observacao: '',
      duracaoMin: 40,
    })

  return (
    <div>
      <output data-testid="saida">{saida}</output>
      <output data-testid="lista">{JSON.stringify(agendamentos)}</output>
      <output data-testid="blks">{JSON.stringify(bloqueios)}</output>
      <output data-testid="exp">{JSON.stringify(expediente)}</output>
      <button
        type="button"
        onClick={() => tentar('fora', () => criar('07:00', 'Fora'))}
      >
        criar-fora
      </button>
      <button
        type="button"
        onClick={() => tentar('almoco', () => criar('12:00', 'Almoço'))}
      >
        criar-almoco
      </button>
      <button
        type="button"
        onClick={() => tentar('livre', () => criar('10:00', 'Ana Souza'))}
      >
        criar-livre
      </button>
      <button
        type="button"
        onClick={() => tentar('conflito', () => criar('10:00', 'Bruno Dias'))}
      >
        criar-conflito
      </button>
      <button
        type="button"
        onClick={() => tentar('criar-11', () => criar('11:00', 'Carla Lima'))}
      >
        criar-11
      </button>
      <button
        type="button"
        onClick={() => {
          if (agendamentos[0]) mudarStatus(agendamentos[0].id, 'cancelado')
        }}
      >
        cancelar-primeiro
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('remarcar', () =>
            remarcar(agendamentos[0].id, {
              data: DIA,
              horario: '11:00',
              profissional: 'Audax',
            }),
          )
        }
      >
        remarcar-11
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('remarcar-ocupado', () =>
            remarcar(agendamentos[0].id, {
              data: DIA,
              horario: '11:00',
              profissional: 'Audax',
            }),
          )
        }
      >
        remarcar-para-11
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('expediente', () =>
            salvarExpediente({
              inicio: '10:00',
              fim: '09:00',
              almocoInicio: '12:00',
              almocoFim: '13:00',
            }),
          )
        }
      >
        salvar-expediente-invalido
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('expediente', () =>
            salvarExpediente({
              inicio: '09:00',
              fim: '17:00',
              almocoInicio: '13:00',
              almocoFim: '14:00',
            }),
          )
        }
      >
        salvar-expediente
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('bloqueio', () =>
            criarBloqueio({
              profissional: 'Audax',
              data: DIA,
              inicio: '15:00',
              fim: '17:00',
              tipo: 'folga',
              motivo: '',
            }),
          )
        }
      >
        criar-bloqueio
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('bloqueio', () =>
            criarBloqueio({
              profissional: 'Audax',
              data: DIA,
              inicio: '15:00',
              fim: '17:00',
              tipo: 'outro',
              motivo: '',
            }),
          )
        }
      >
        criar-bloqueio-outro-sem-motivo
      </button>
      <button
        type="button"
        onClick={() => {
          if (bloqueios[0]) removerBloqueio(bloqueios[0].id)
        }}
      >
        remover-bloqueio
      </button>
      <button
        type="button"
        onClick={() => renomearProfissional('Audax', 'Barbudo')}
      >
        renomear-pro
      </button>
    </div>
  )
}

function montarExtra() {
  return render(
    <AgendaProvider>
      <TelaExtra />
    </AgendaProvider>,
  )
}

function lerExtra(): { lista: Agendamento[]; blks: unknown[]; exp: unknown } {
  return {
    lista: JSON.parse(screen.getByTestId('lista').textContent ?? '[]'),
    blks: JSON.parse(screen.getByTestId('blks').textContent ?? '[]'),
    exp: JSON.parse(screen.getByTestId('exp').textContent ?? '{}'),
  }
}

describe('Agenda — validação de criação (expediente, almoço, conflito)', () => {
  it('bloqueia fora do expediente e horário de almoço', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-fora'))
    expect(screen.getByTestId('saida').textContent).toContain(
      'fora do expediente',
    )
    fireEvent.click(screen.getByText('criar-almoco'))
    expect(screen.getByTestId('saida').textContent).toContain('almoço')
    expect(lerExtra().lista).toHaveLength(0)
  })

  it('bloqueia conflito no mesmo horário e profissional', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-livre'))
    expect(screen.getByTestId('saida').textContent).toContain('livre:ok')
    fireEvent.click(screen.getByText('criar-conflito'))
    expect(screen.getByTestId('saida').textContent).toContain('Conflito:')
    expect(lerExtra().lista).toHaveLength(1)
  })

  it('cancelar libera o horário para novo agendamento', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-livre'))
    fireEvent.click(screen.getByText('cancelar-primeiro'))
    fireEvent.click(screen.getByText('criar-conflito'))
    expect(screen.getByTestId('saida').textContent).toContain('conflito:ok')
    const lista = lerExtra().lista
    expect(lista).toHaveLength(2)
    expect(lista.filter((a) => a.status === 'cancelado')).toHaveLength(1)
  })
})

describe('Agenda — bloqueios de agenda', () => {
  it('cria bloqueio e grava no localStorage', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-bloqueio'))
    expect(screen.getByTestId('saida').textContent).toContain('bloqueio:ok')
    expect(lerExtra().blks).toHaveLength(1)

    const noStorage = JSON.parse(
      localStorage.getItem('studio-audax:bloqueios:v1') ?? '[]',
    )
    expect(noStorage).toHaveLength(1)
    expect(noStorage[0].tipo).toBe('folga')
    expect(noStorage[0].profissional).toBe('Audax')
  })

  it('renomear profissional propaga para os bloqueios e remover limpa', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-bloqueio'))
    fireEvent.click(screen.getByText('renomear-pro'))
    expect(lerExtra().blks[0]).toMatchObject({ profissional: 'Barbudo' })

    fireEvent.click(screen.getByText('remover-bloqueio'))
    expect(lerExtra().blks).toHaveLength(0)
  })

  it('bloqueio inválido lança erro', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-bloqueio-outro-sem-motivo'))
    expect(screen.getByTestId('saida').textContent).toContain('motivo')
    expect(lerExtra().blks).toHaveLength(0)
  })
})

describe('Agenda — expediente configurável', () => {
  it('valida e persiste o expediente', () => {
    montarExtra()
    fireEvent.click(screen.getByText('salvar-expediente-invalido'))
    expect(screen.getByTestId('saida').textContent).toContain(
      'depois do início',
    )
    expect(lerExtra().exp).toMatchObject({ inicio: '08:00' })

    fireEvent.click(screen.getByText('salvar-expediente'))
    expect(screen.getByTestId('saida').textContent).toContain('expediente:ok')
    expect(lerExtra().exp).toMatchObject({
      inicio: '09:00',
      fim: '17:00',
      almocoInicio: '13:00',
      almocoFim: '14:00',
    })
    const noStorage = JSON.parse(
      localStorage.getItem('studio-audax:expediente:v1') ?? '{}',
    )
    expect(noStorage).toMatchObject({ inicio: '09:00' })
  })
})

describe('Agenda — remarcação', () => {
  it('move mantendo id e status e registra o histórico', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-livre'))
    const antes = lerExtra().lista[0]
    expect(antes.horario).toBe('10:00')

    fireEvent.click(screen.getByText('remarcar-11'))
    expect(screen.getByTestId('saida').textContent).toContain('remarcar:ok')

    const depois = lerExtra().lista
    expect(depois).toHaveLength(1)
    expect(depois[0].id).toBe(antes.id)
    expect(depois[0].status).toBe('pendente')
    expect(depois[0].horario).toBe('11:00')
    expect(depois[0].remarcacoes).toHaveLength(1)
    expect(depois[0].remarcacoes?.[0].de).toMatchObject({
      data: DIA,
      horario: '10:00',
      profissional: 'Audax',
    })
  })

  it('recusa remarcação para horário ocupado', () => {
    montarExtra()
    fireEvent.click(screen.getByText('criar-livre'))
    fireEvent.click(screen.getByText('criar-11'))
    const id = lerExtra().lista[0].id
    expect(lerExtra().lista[0].horario).toBe('10:00')

    fireEvent.click(screen.getByText('remarcar-para-11'))
    expect(screen.getByTestId('saida').textContent).toContain('Conflito:')
    expect(lerExtra().lista.find((a) => a.id === id)?.horario).toBe('10:00')
  })
})

/* ------------------------------------------------------------------ */
/* Trava de agendamento pago (jaPago do CaixaProvider)                */
/* ------------------------------------------------------------------ */

function TelaPagamento() {
  const { agendamentos, adicionar, mudarStatus, remover } = useAgenda()
  const { registrarPagamento, estornar } = useCaixa()
  const [saida, setSaida] = useState('')
  const [idLancamento, setIdLancamento] = useState('')

  function tentar(rotulo: string, fn: () => unknown) {
    try {
      fn()
      setSaida(`${rotulo}:ok`)
    } catch (e) {
      setSaida(`${rotulo}:${e instanceof Error ? e.message : 'erro'}`)
    }
  }

  const ag = agendamentos[0]

  return (
    <div>
      <output data-testid="saida">{saida}</output>
      <output data-testid="lista">{JSON.stringify(agendamentos)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            cliente: 'Ana Souza',
            telefone: '',
            servico: 'Corte Degradê',
            profissional: 'Audax',
            data: DIA,
            horario: '10:00',
            observacao: '',
            duracaoMin: 40,
          })
        }
      >
        criar
      </button>
      <button
        type="button"
        onClick={() => {
          if (!ag) return
          const l = registrarPagamento({
            agendamentoId: ag.id,
            data: DIA,
            hora: ag.horario,
            cliente: ag.cliente,
            profissional: ag.profissional,
            servico: ag.servico,
            valor: 100,
            desconto: 0,
            formaPagamento: 'pix',
            statusAgendamento: 'concluido',
          })
          setIdLancamento(l.id)
        }}
      >
        pagar
      </button>
      <button
        type="button"
        onClick={() => tentar('estornar', () => estornar(idLancamento))}
      >
        estornar
      </button>
      <button
        type="button"
        onClick={() =>
          tentar('cancelar', () => {
            if (ag) mudarStatus(ag.id, 'cancelado')
          })
        }
      >
        cancelar
      </button>
      <button
        type="button"
        onClick={() => tentar('excluir', () => ag && remover(ag.id))}
      >
        excluir
      </button>
    </div>
  )
}

function montarPagamento() {
  return render(
    <CaixaProvider>
      <AgendaProvider>
        <TelaPagamento />
      </AgendaProvider>
    </CaixaProvider>,
  )
}

function lerSaida(): string {
  return screen.getByTestId('saida').textContent ?? ''
}

function lerPagamentos(): Agendamento[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

describe('Agenda — agendamento pago não pode ser cancelado nem excluído', () => {
  it('pago: cancelar é bloqueado orientando estornar no Caixa', () => {
    montarPagamento()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('pagar'))

    fireEvent.click(screen.getByText('cancelar'))
    expect(lerSaida()).toContain('Estorne o pagamento no Caixa antes de cancelar')
    expect(lerPagamentos()[0].status).not.toBe('cancelado')

    // status original preservado
    expect(lerPagamentos()[0].status).toBe('pendente')
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')[0].status).toBe(
      'pendente',
    )
  })

  it('pago: excluir é bloqueado orientando estornar no Caixa', () => {
    montarPagamento()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('pagar'))

    fireEvent.click(screen.getByText('excluir'))
    expect(lerSaida()).toContain('Estorne o pagamento no Caixa antes de excluir')
    expect(lerPagamentos()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')).toHaveLength(1)
  })

  it('pagamento estornado: cancelar e excluir passam a ser permitidos', () => {
    montarPagamento()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('pagar'))
    fireEvent.click(screen.getByText('estornar'))

    fireEvent.click(screen.getByText('cancelar'))
    expect(lerSaida()).toBe('cancelar:ok')
    expect(lerPagamentos()[0].status).toBe('cancelado')

    fireEvent.click(screen.getByText('excluir'))
    expect(lerSaida()).toBe('excluir:ok')
    expect(lerPagamentos()).toHaveLength(0)
  })

  it('sem pagamento: cancelar e excluir continuam funcionando como antes', () => {
    montarPagamento()
    fireEvent.click(screen.getByText('criar'))

    fireEvent.click(screen.getByText('cancelar'))
    expect(lerSaida()).toBe('cancelar:ok')
    expect(lerPagamentos()[0].status).toBe('cancelado')

    fireEvent.click(screen.getByText('excluir'))
    expect(lerSaida()).toBe('excluir:ok')
    expect(lerPagamentos()).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')).toHaveLength(0)
  })
})
