import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ServicoFormModal from './ServicoFormModal'
import type { Servico } from '@/modules/servicos/types'

const estado = vi.hoisted(() => ({
  adicionar: vi.fn(),
  atualizar: vi.fn(),
  servicos: [] as Servico[],
}))

vi.mock('@/modules/servicos/store', () => ({
  useServicos: () => ({
    adicionar: estado.adicionar,
    atualizar: estado.atualizar,
    servicos: estado.servicos,
  }),
}))

function servico(parcial: Partial<Servico>): Servico {
  return {
    id: 'srv-x',
    nome: 'Serviço',
    preco: 50,
    duracaoMin: 30,
    categoria: '',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }
}

beforeEach(() => {
  estado.adicionar.mockReset().mockResolvedValue(null)
  estado.atualizar.mockReset().mockResolvedValue(undefined)
  estado.servicos = [
    servico({ id: 'srv-corte', nome: 'Corte', complementos: ['srv-barba'] }),
    servico({ id: 'srv-barba', nome: 'Barba', preco: 35, duracaoMin: 15 }),
    servico({ id: 'srv-escova', nome: 'Escova', preco: 40, duracaoMin: 20 }),
    servico({ id: 'srv-inativo', nome: 'Pete Inativo', ativo: false }),
  ]
})

describe('ServicoFormModal — complementos', () => {
  it('lista só os outros serviços ativos e salva os marcados', async () => {
    render(
      <ServicoFormModal
        servico={estado.servicos[0]}
        onFechar={() => undefined}
      />,
    )

    // candidatos: Barba e Escova — nem ele mesmo, nem o inativo
    expect(screen.getByText('Sugerir como complemento')).toBeTruthy()
    expect(screen.getByLabelText(/Barba/)).toBeTruthy()
    expect(screen.getByLabelText(/Escova/)).toBeTruthy()
    expect(screen.queryByLabelText(/Corte/)).toBeNull()
    expect(screen.queryByLabelText(/Pete Inativo/)).toBeNull()

    // configuração atual já vem marcada, e nada é marcado sozinho além disso
    expect((screen.getByLabelText(/Barba/) as HTMLInputElement).checked).toBe(
      true,
    )
    expect((screen.getByLabelText(/Escova/) as HTMLInputElement).checked).toBe(
      false,
    )

    fireEvent.click(screen.getByLabelText(/Escova/))
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    )

    await waitFor(() =>
      expect(estado.atualizar).toHaveBeenCalledWith(
        'srv-corte',
        expect.objectContaining({
          nome: 'Corte',
          complementos: ['srv-barba', 'srv-escova'],
        }),
      ),
    )
  })

  it('desmarcar um complemento sai da configuração ao salvar', async () => {
    render(
      <ServicoFormModal
        servico={estado.servicos[0]}
        onFechar={() => undefined}
      />,
    )

    fireEvent.click(screen.getByLabelText(/Barba/))
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvar alterações' }),
    )

    await waitFor(() =>
      expect(estado.atualizar).toHaveBeenCalledWith(
        'srv-corte',
        expect.objectContaining({ complementos: [] }),
      ),
    )
  })

  it('novo serviço guarda os complementos escolhidos', async () => {
    render(<ServicoFormModal onFechar={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Nome *'), {
      target: { value: 'Luzes' },
    })
    fireEvent.change(screen.getByLabelText(/Preço/), {
      target: { value: '120' },
    })
    fireEvent.change(screen.getByLabelText(/Duração/), {
      target: { value: '90' },
    })
    fireEvent.click(screen.getByLabelText(/Barba/))
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar serviço' }))

    await waitFor(() =>
      expect(estado.adicionar).toHaveBeenCalledWith(
        expect.objectContaining({ nome: 'Luzes', complementos: ['srv-barba'] }),
      ),
    )
  })
})
