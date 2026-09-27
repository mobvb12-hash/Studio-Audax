import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ServicosProvider, useServicos } from './store'
import type { Servico } from './types'

const CHAVE = 'studio-audax:servicos:v1'

let ctx: ReturnType<typeof useServicos>

function Captura() {
  const valor = useServicos()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function Tela() {
  const { servicos, adicionar, atualizar, remover } = useServicos()
  const alvo = servicos.find((s) => s.nome === 'Pezinho')
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(servicos)}</output>
      <button
        type="button"
        onClick={() =>
          void adicionar({ nome: 'Pezinho', preco: 25, duracaoMin: 20 })
        }
      >
        criar
      </button>
      {alvo && (
        <>
          <button
            type="button"
            onClick={() =>
              void atualizar(alvo.id, {
                nome: alvo.nome,
                preco: 85,
                duracaoMin: 45,
              })
            }
          >
            editar
          </button>
          <button type="button" onClick={() => void remover(alvo.id)}>
            excluir
          </button>
        </>
      )}
    </div>
  )
}

function lerLista(): Servico[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <ServicosProvider>
      <Captura />
      <Tela />
    </ServicosProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useServicos>
})

describe('Serviços — store', () => {
  it('instalação nova inicia com os serviços do catálogo', () => {
    montar()
    const lista = lerLista()
    expect(lista.length).toBeGreaterThan(0)
    expect(lista.map((s) => s.nome)).toContain('Corte Degradê')
    const corte = lista.find((s) => s.nome === 'Corte Degradê')
    expect(corte?.preco).toBe(70)
    expect(corte?.duracaoMin).toBe(40)
  })

  it('cria serviço com nome, preço e duração e grava no localStorage', async () => {
    montar()
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    await waitFor(() =>
      expect(lerLista().find((s) => s.nome === 'Pezinho')).toBeTruthy(),
    )
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(CHAVE) ?? '[]').find(
          (s: Servico) => s.nome === 'Pezinho',
        )?.preco,
      ).toBe(25),
    )
    const novo = lerLista().find((s) => s.nome === 'Pezinho')
    expect(novo).toBeTruthy()
    expect(novo?.preco).toBe(25)
    expect(novo?.duracaoMin).toBe(20)
  })

  it('edits preço e duração (reflete em novos agendamentos)', async () => {
    montar()
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    await waitFor(() =>
      expect(lerLista().find((s) => s.nome === 'Pezinho')).toBeTruthy(),
    )
    await act(async () => {
      fireEvent.click(screen.getByText('editar'))
    })
    await waitFor(() =>
      expect(lerLista().find((s) => s.nome === 'Pezinho')?.preco).toBe(85),
    )
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(CHAVE) ?? '[]').find(
          (s: Servico) => s.nome === 'Pezinho',
        )?.duracaoMin,
      ).toBe(45),
    )
    const alvo = lerLista().find((s) => s.nome === 'Pezinho')
    expect(alvo?.preco).toBe(85)
    expect(alvo?.duracaoMin).toBe(45)
  })

  it('exclui serviço (exclusão onde permitido)', async () => {
    montar()
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    await waitFor(() =>
      expect(lerLista().find((s) => s.nome === 'Pezinho')).toBeTruthy(),
    )
    const antes = lerLista().length
    await act(async () => {
      fireEvent.click(screen.getByText('excluir'))
    })
    await waitFor(() => expect(lerLista()).toHaveLength(antes - 1))
  })

  it('simulas F5: dados continuam corretos ao reabrir o sistema', async () => {
    const primeiro = montar()
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    await waitFor(() =>
      expect(lerLista().find((s) => s.nome === 'Pezinho')).toBeTruthy(),
    )
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(CHAVE) ?? '[]').find(
          (s: Servico) => s.nome === 'Pezinho',
        ),
      ).toBeTruthy(),
    )
    primeiro.unmount()

    montar()
    const novo = lerLista().find((s) => s.nome === 'Pezinho')
    expect(novo).toBeTruthy()
    expect(novo?.preco).toBe(25)
    expect(lerLista().map((s) => s.nome)).toContain('Corte Degradê')
  })

  it('rejeita serviço duplicado por nome', async () => {
    montar()
    await expect(
      ctx.adicionar({ nome: 'corte degradê', preco: 60, duracaoMin: 30 }),
    ).rejects.toThrow(/Já existe um serviço com este nome/)

    await act(() =>
      ctx.adicionar({ nome: 'Pezinho', preco: 25, duracaoMin: 20 }),
    )
    await expect(
      ctx.adicionar({ nome: 'Pezinho', preco: 30, duracaoMin: 15 }),
    ).rejects.toThrow(/Já existe um serviço com este nome/)
    expect(ctx.servicos.filter((s) => s.nome === 'Pezinho')).toHaveLength(1)
  })
})

describe('Serviços — validação no store', () => {
  it('rejeita nome, preço e duração inválidos sem criar o serviço', async () => {
    montar()
    await expect(
      ctx.adicionar({ nome: ' x', preco: 50, duracaoMin: 30 }),
    ).rejects.toThrow(/Informe o nome do serviço/)
    await expect(
      ctx.adicionar({ nome: 'Novo', preco: -5, duracaoMin: 30 }),
    ).rejects.toThrow(/preço válido/)
    await expect(
      ctx.adicionar({ nome: 'Novo', preco: Number.NaN, duracaoMin: 30 }),
    ).rejects.toThrow(/preço válido/)
    await expect(
      ctx.adicionar({ nome: 'Novo', preco: 50, duracaoMin: 4 }),
    ).rejects.toThrow(/mínimo 5/)
    expect(
      ctx.servicos.some((s) => s.nome === 'Novo'),
    ).toBe(false)
  })

  it('rejeita atualização inválida mantendo o cadastro intacto', async () => {
    montar()
    const alvo = ctx.servicos.find((s) => s.nome === 'Corte Degradê')!
    await expect(
      ctx.atualizar(alvo.id, { nome: alvo.nome, preco: -1, duracaoMin: 30 }),
    ).rejects.toThrow(/preço válido/)
    expect(ctx.porId(alvo.id)?.preco).toBe(70)
  })

  it('categoria é opcional e fica salva no cadastro', async () => {
    montar()
    await act(() =>
      ctx.adicionar({
        nome: 'Pezinho',
        preco: 25,
        duracaoMin: 20,
        categoria: 'Barba',
      }),
    )
    expect(ctx.servicos.find((s) => s.nome === 'Pezinho')?.categoria).toBe(
      'Barba',
    )
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(CHAVE) ?? '[]').find(
          (s: Servico) => s.nome === 'Pezinho',
        )?.categoria,
      ).toBe('Barba'),
    )
  })
})

describe('Serviços — status ativo/inativo (sem apagar dados)', () => {
  it('serviço nasce ativo e alternarAtivo inativa/reativa preservando tudo', async () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    await new Promise((r) => setTimeout(r, 0))
    const alvo = lerLista().find((s) => s.nome === 'Pezinho')!
    expect(alvo.ativo).toBe(true)

    await act(() => ctx.alternarAtivo(alvo.id))
    const inativo = lerLista().find((s) => s.id === alvo.id)!
    expect(inativo.ativo).toBe(false)
    expect(inativo.preco).toBe(25)
    expect(inativo.duracaoMin).toBe(20)

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(
      noStorage.find((s: Servico) => s.nome === 'Pezinho')?.ativo,
    ).toBe(false)

    await act(() => ctx.alternarAtivo(alvo.id))
    expect(lerLista().find((s) => s.id === alvo.id)?.ativo).toBe(true)
  })

  it('atualizar preserva o status inativo do serviço', async () => {
    montar()
    const alvo = ctx.servicos.find((s) => s.nome === 'Corte Degradê')!
    await act(() => ctx.alternarAtivo(alvo.id))
    await act(() => {
      void ctx.atualizar(alvo.id, {
        nome: alvo.nome,
        preco: 80,
        duracaoMin: alvo.duracaoMin,
      })
    })
    const atual = ctx.porId(alvo.id)!
    expect(atual.ativo).toBe(false)
    expect(atual.preco).toBe(80)
  })

  it('registros antigos no localStorage ganham ativo: true e categoria vazia', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        {
          id: 'srv-velho',
          nome: 'Corte Velho',
          preco: 40,
          duracaoMin: 20,
          criadoEm: '2026-01-01T00:00:00.000Z',
          atualizadoEm: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    montar()
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].nome).toBe('Corte Velho')
    expect(lista[0].ativo).toBe(true)
    expect(lista[0].categoria).toBe('')
  })

  it('lista salva vazia não reinstala o seed', () => {
    localStorage.setItem(CHAVE, JSON.stringify([]))
    montar()
    expect(lerLista()).toHaveLength(0)
  })
})
