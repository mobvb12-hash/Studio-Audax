import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ProfissionaisProvider, useProfissionais } from './store'
import type { Profissional } from './types'

const CHAVE = 'studio-audax:profissionais:v1'

let ctx: ReturnType<typeof useProfissionais>

function Captura() {
  const valor = useProfissionais()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function Lista() {
  const { profissionais, adicionar, atualizar } = useProfissionais()
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(profissionais)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            nome: 'Luan Silva',
            telefone: '(11) 91234-5678',
            email: 'luan@email.com',
            foto: 'data:image/jpeg;base64,NOVA',
          })
        }
      >
        criar
      </button>
      <button
        type="button"
        onClick={() => {
          const alvo = profissionais.find((p) => p.nome === 'Luan Silva')
          if (alvo)
            atualizar(alvo.id, {
              nome: alvo.nome,
              telefone: '(11) 99999-0000',
              email: 'editado@email.com',
              foto: '',
            })
        }}
      >
        editar-sem-foto
      </button>
    </div>
  )
}

function lerLista(): Profissional[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <ProfissionaisProvider>
      <Captura />
      <Lista />
    </ProfissionaisProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  ctx = undefined as unknown as ReturnType<typeof useProfissionais>
})

describe('Profissionais — store', () => {
  it('instalação nova inicia com Audax e Diego e campos vazios', () => {
    montar()
    const lista = lerLista()
    expect(lista.map((p) => p.nome)).toEqual(['Audax', 'Diego'])
    for (const p of lista) {
      expect(p.telefone).toBe('')
      expect(p.email).toBe('')
      expect(p.foto).toBe('')
    }
  })

  it('migra dados antigos sem apagar (mantém nomes e completa campos)', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        { id: 'antigo-1', nome: 'Diego', criadoEm: '2026-01-01' },
        { id: 'antigo-2', nome: 'Audax', criadoEm: '2026-01-01' },
      ]),
    )
    montar()
    const lista = lerLista()
    expect(lista.map((p) => p.nome)).toEqual(['Audax', 'Diego'])
    expect(lista[0].telefone).toBe('')
    expect(lista[0].email).toBe('')
    expect(lista[0].foto).toBe('')
  })

  it('cria funcionário com telefone, e-mail e foto e grava no localStorage', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    const salvo = lerLista().find((p) => p.nome === 'Luan Silva')
    expect(salvo).toBeTruthy()
    expect(salvo?.telefone).toBe('(11) 91234-5678')
    expect(salvo?.email).toBe('luan@email.com')
    expect(salvo?.foto).toBe('data:image/jpeg;base64,NOVA')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(
      noStorage.find((p: Profissional) => p.nome === 'Luan Silva')?.telefone,
    ).toBe('(11) 91234-5678')
  })

  it('edita telefone/e-mail e remove foto, persistindo no localStorage', () => {
    montar()
    fireEvent.click(screen.getByText('criar'))
    fireEvent.click(screen.getByText('editar-sem-foto'))
    const salvo = lerLista().find((p) => p.nome === 'Luan Silva')
    expect(salvo?.telefone).toBe('(11) 99999-0000')
    expect(salvo?.email).toBe('editado@email.com')
    expect(salvo?.foto).toBe('')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    const alvo = noStorage.find((p: Profissional) => p.nome === 'Luan Silva')
    expect(alvo?.telefone).toBe('(11) 99999-0000')
    expect(alvo?.foto).toBe('')
  })

  it('simula F5: dados continuam corretos ao reabrir o sistema', () => {
    const primeiro = montar()
    fireEvent.click(screen.getByText('criar'))
    primeiro.unmount()

    montar() // nova montagem = página recarregada
    const lista = lerLista()
    const luan = lista.find((p) => p.nome === 'Luan Silva')
    expect(luan).toBeTruthy()
    expect(luan?.telefone).toBe('(11) 91234-5678')
    expect(luan?.email).toBe('luan@email.com')
    expect(luan?.foto).toBe('data:image/jpeg;base64,NOVA')
    expect(lista.map((p) => p.nome)).toContain('Audax')
    expect(lista.map((p) => p.nome)).toContain('Diego')
  })

  it('preserva lista vazia salva sem reinstalar o seed', () => {
    localStorage.setItem(CHAVE, JSON.stringify([]))
    montar()
    expect(lerLista()).toHaveLength(0)
  })

  it('rejeita profissional duplicado por nome', () => {
    montar()
    expect(() =>
      ctx.adicionar({ nome: 'audax', telefone: '', email: '', foto: '' }),
    ).toThrow(/Já existe um profissional com este nome/)

    act(() => {
      ctx.adicionar({
        nome: 'Luan Silva',
        telefone: '',
        email: '',
        foto: '',
      })
    })
    expect(() =>
      ctx.adicionar({ nome: 'Luan Silva', telefone: '', email: '', foto: '' }),
    ).toThrow(/Já existe um profissional com este nome/)
    expect(
      ctx.profissionais.filter((p) => p.nome === 'Luan Silva'),
    ).toHaveLength(1)
  })
})
