import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SeletorCliente from './SeletorCliente'
import { auxiliarCliente, filtrarClientesParaSelecao } from './buscaCliente'
import type { Cliente } from '@/modules/clientes/types'

function cliente(parcial: Partial<Cliente> & { nome: string }): Cliente {
  return {
    id: parcial.nome.toLowerCase().replace(/\W/g, '-'),
    telefone: '',
    email: '',
    nascimento: '',
    genero: 'nao_informado',
    ativo: true,
    observacoes: '',
    telefonePrincipal: true,
    telefones: [],
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...parcial,
  } as Cliente
}

const ANA = cliente({ id: 'c1', nome: 'Ana Silva', telefone: '(11) 98888-7777' })
const JOAO = cliente({ id: 'c2', nome: 'João Pedro da Silva', telefone: '(21) 97777-6666' })
const INATIVO = cliente({ id: 'c3', nome: 'Cliente Antigo', ativo: false })
const LISTA = [ANA, JOAO, INATIVO]

describe('busca do seletor de cliente', () => {
  it('casa por qualquer parte do nome, ignorando acentos e caixa', () => {
    expect(filtrarClientesParaSelecao(LISTA, 'pedro').map((c) => c.nome)).toEqual([
      'João Pedro da Silva',
    ])
    expect(filtrarClientesParaSelecao(LISTA, 'joao').map((c) => c.nome)).toEqual([
      'João Pedro da Silva',
    ])
    expect(filtrarClientesParaSelecao(LISTA, 'ANA').map((c) => c.nome)).toEqual([
      'Ana Silva',
    ])
  })

  it('casa por dígitos de telefone mesmo com a busca formatada', () => {
    expect(filtrarClientesParaSelecao(LISTA, '(11) 98888').map((c) => c.nome)).toEqual([
      'Ana Silva',
    ])
    expect(filtrarClientesParaSelecao(LISTA, '97777').map((c) => c.nome)).toEqual([
      'João Pedro da Silva',
    ])
  })

  it('nunca oferece cliente inativo', () => {
    expect(
      filtrarClientesParaSelecao(LISTA, 'Cliente Antigo').map((c) => c.nome),
    ).toEqual([])
  })

  it('busca vazia respeita o limite, ordena por nome e esconde inativos', () => {
    expect(filtrarClientesParaSelecao(LISTA, '', 1).map((c) => c.nome)).toEqual([
      'Ana Silva',
    ])
    expect(filtrarClientesParaSelecao(LISTA, '').map((c) => c.nome)).toEqual([
      'Ana Silva',
      'João Pedro da Silva',
    ])
  })

  it('formata o telefone como informação auxiliar', () => {
    expect(auxiliarCliente(ANA)).toBe('(11) 98888-7777')
    expect(auxiliarCliente(cliente({ nome: 'Sem Fone' }))).toBe('')
  })
})

describe('SeletorCliente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pesquisa por nome e mostra o telefone do lado para desambiguar', async () => {
    render(
      <SeletorCliente
        id="sel"
        clientes={LISTA}
        valor=""
        aoEscolher={() => {}}
      />,
    )

    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ana' } })

    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Ana Silva/ })).toBeTruthy(),
    )
    expect(screen.getByRole('option', { name: /Ana Silva/ }).textContent).toContain(
      '(11) 98888-7777',
    )
  })

  it('escolhe pelo teclado e avisa o chamador com o id do cliente', async () => {
    const aoEscolher = vi.fn()
    render(
      <SeletorCliente id="sel" clientes={LISTA} valor="" aoEscolher={aoEscolher} />,
    )

    const campo = screen.getByRole('combobox')
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: 'silva' } })
    await waitFor(() =>
      expect(screen.getAllByRole('option')).toHaveLength(2),
    )

    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(aoEscolher).toHaveBeenCalledWith('c2')
  })

  it('sem resultado explica que nada foi encontrado, sem quebrar', async () => {
    render(
      <SeletorCliente id="sel" clientes={LISTA} valor="" aoEscolher={() => {}} />,
    )

    const campo = screen.getByRole('combobox')
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: 'zzzz' } })

    await waitFor(() =>
      expect(screen.getByText(/Nenhum cliente ativo encontrado/)).toBeTruthy(),
    )
  })

  it('já com cliente escolhido mostra o nome e permite trocar', async () => {
    const aoEscolher = vi.fn()
    render(
      <SeletorCliente id="sel" clientes={LISTA} valor="c1" aoEscolher={aoEscolher} />,
    )

    expect(screen.getByText('Ana Silva')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }))
    expect(aoEscolher).toHaveBeenCalledWith('')
    expect(screen.getByRole('combobox')).toBeTruthy()
  })
})