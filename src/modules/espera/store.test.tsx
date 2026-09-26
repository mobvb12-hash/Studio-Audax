import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EsperaProvider, useEspera, useEsperaOpcional } from './store'
import type { NovoPedidoInput, PedidoEspera } from './types'

const CHAVE = 'studio-audax:espera:v1'

let ctx: ReturnType<typeof useEspera>

function Captura() {
  const espera = useEspera()
  useEffect(() => {
    ctx = espera
  })
  return null
}

function montar() {
  return render(
    <EsperaProvider>
      <Captura />
    </EsperaProvider>,
  )
}

function lerLista(): PedidoEspera[] {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
}

const BASE: NovoPedidoInput = {
  clienteId: 'c1',
  cliente: 'Ana Souza',
  telefone: '(11) 91111-2222',
  servico: 'Corte Degradê',
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useEspera>
})

describe('Espera store — cadastro e validação', () => {
  it('adiciona pedido normalizando campos e persiste no localStorage', () => {
    montar()
    act(() => {
      ctx.adicionar({
        ...BASE,
        servico: '  Corte Degradê  ',
        observacao: '  Prefere tarde  ',
      })
    })
    expect(ctx.pedidos).toHaveLength(1)
    expect(ctx.pedidos[0].servico).toBe('Corte Degradê')
    expect(ctx.pedidos[0].observacao).toBe('Prefere tarde')
    expect(ctx.pedidos[0].periodo).toBe('qualquer')
    expect(ctx.pedidos[0].status).toBe('aguardando')
    expect(ctx.pedidos[0].criadoEm).toBeTruthy()

    const salvo = lerLista()
    expect(salvo).toHaveLength(1)
    expect(salvo[0].cliente).toBe('Ana Souza')
  })

  it('valida antes de gravar: cliente ausente e serviço em branco', () => {
    montar()
    expect(() =>
      ctx.adicionar({ ...BASE, clienteId: '', cliente: '' }),
    ).toThrow('Selecione o cliente.')
    expect(() => ctx.adicionar({ ...BASE, servico: '   ' })).toThrow(
      'Selecione o serviço desejado.',
    )
    expect(ctx.pedidos).toHaveLength(0)
    expect(lerLista()).toHaveLength(0)
  })

  it('não duplica: mesmo cliente aguardando é recusado; encerrado não trava', () => {
    montar()
    act(() => {
      ctx.adicionar(BASE)
    })
    expect(() => ctx.adicionar(BASE)).toThrow(
      'Este cliente já está na lista de espera.',
    )
    expect(ctx.pedidos).toHaveLength(1)

    act(() => {
      ctx.adicionar({ ...BASE, clienteId: 'c2', cliente: 'Bruno Lima' })
    })
    expect(ctx.pedidos).toHaveLength(2)

    act(() => {
      ctx.mudarStatus(ctx.pedidos[0].id, 'atendido')
    })
    act(() => {
      ctx.adicionar(BASE)
    })
    expect(ctx.pedidos).toHaveLength(3)
    expect(lerLista()).toHaveLength(3)
  })

  it('histórico da fila sobrevive ao reload (simula F5)', () => {
    montar()
    act(() => {
      ctx.adicionar(BASE)
    })
    ctx = undefined as unknown as ReturnType<typeof useEspera>
    montar()
    expect(ctx.pedidos).toHaveLength(1)
    expect(ctx.pedidos[0].cliente).toBe('Ana Souza')
  })
})

describe('Espera store — edição, status e remoção', () => {
  it('edita preservando id, status e criadoEm', () => {
    montar()
    act(() => {
      ctx.adicionar(BASE)
    })
    const { id, criadoEm } = ctx.pedidos[0]
    act(() => {
      ctx.editar(id, {
        ...BASE,
        servico: 'Barba',
        profissional: 'Diego',
        periodo: 'manha',
        dataPreferida: '2026-04-01',
        observacao: '  Ligar antes  ',
      })
    })
    expect(ctx.pedidos).toHaveLength(1)
    expect(ctx.pedidos[0]).toMatchObject({
      id,
      criadoEm,
      status: 'aguardando',
      servico: 'Barba',
      profissional: 'Diego',
      periodo: 'manha',
      dataPreferida: '2026-04-01',
      observacao: 'Ligar antes',
    })
    expect(() => ctx.editar('nope', BASE)).toThrow(
      'Pedido da lista de espera não encontrado.',
    )
  })

  it('edição também trava duplicidade de cliente aguardando', () => {
    montar()
    act(() => {
      ctx.adicionar(BASE)
      ctx.adicionar({ ...BASE, clienteId: 'c2', cliente: 'Bruno Lima' })
    })
    expect(() => ctx.editar(ctx.pedidos[1].id, BASE)).toThrow(
      'Este cliente já está na lista de espera.',
    )
    act(() => {
      ctx.editar(ctx.pedidos[1].id, {
        ...BASE,
        clienteId: 'c2',
        cliente: 'Bruno Lima',
        servico: 'Barba',
      })
    })
    expect(ctx.pedidos[1].servico).toBe('Barba')
  })

  it('encerra com atendido/cancelado; pedido encerrado não muda de novo', () => {
    montar()
    act(() => {
      ctx.adicionar(BASE)
    })
    const id = ctx.pedidos[0].id
    act(() => {
      ctx.mudarStatus(id, 'atendido')
    })
    expect(ctx.pedidos[0].status).toBe('atendido')
    expect(ctx.pedidos[0].encerradoEm).toBeTruthy()
    expect(() => ctx.mudarStatus(id, 'cancelado')).toThrow(
      'Este pedido já foi encerrado.',
    )
    expect(() => ctx.mudarStatus('nope', 'atendido')).toThrow(
      'Pedido da lista de espera não encontrado.',
    )
    expect(() => ctx.mudarStatus(id, 'aguardando' as never)).toThrow(
      'Status inválido para a lista de espera.',
    )
  })

  it('remove da lista e do localStorage', () => {
    montar()
    act(() => {
      ctx.adicionar(BASE)
    })
    expect(lerLista()).toHaveLength(1)
    act(() => {
      ctx.remover(ctx.pedidos[0].id)
    })
    expect(ctx.pedidos).toHaveLength(0)
    expect(lerLista()).toHaveLength(0)
  })
})

describe('Espera store — propagação de renomeações', () => {
  it('renomear cliente/profissional/serviço atualiza os pedidos', () => {
    montar()
    act(() => {
      ctx.adicionar({ ...BASE, profissional: 'Audax' })
    })
    act(() => {
      ctx.renomearCliente('Ana Souza', 'Ana Prado')
      ctx.renomearProfissional('Audax', 'Carlos')
      ctx.renomearServico('Corte Degradê', 'Corte Social')
    })
    expect(ctx.pedidos[0]).toMatchObject({
      cliente: 'Ana Prado',
      profissional: 'Carlos',
      servico: 'Corte Social',
    })
  })

  it('renomear sem mudança ou sem destino não altera nada', () => {
    montar()
    act(() => {
      ctx.adicionar({ ...BASE, profissional: 'Audax' })
    })
    act(() => {
      ctx.renomearCliente('Ana Souza', 'Ana Souza')
      ctx.renomearProfissional('Audax', '   ')
      ctx.renomearServico('Outro', 'Novo')
    })
    expect(ctx.pedidos[0]).toMatchObject({
      cliente: 'Ana Souza',
      profissional: 'Audax',
      servico: 'Corte Degradê',
    })
  })
})

describe('useEsperaOpcional — árvore sem provider', () => {
  it('devolve estado vazio e ações sem efeito', () => {
    let obtido: ReturnType<typeof useEsperaOpcional> | null = null
    function Probe() {
      const valor = useEsperaOpcional()
      useEffect(() => {
        obtido = valor
      })
      return null
    }
    render(<Probe />)
    expect(obtido).not.toBeNull()
    expect(obtido!.pedidos).toEqual([])
    expect(() => obtido!.remover('x')).not.toThrow()
  })
})
