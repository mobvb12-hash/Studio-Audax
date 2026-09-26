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
  it('instalação nova inicia com Cleiton Silva e Ítalo Santos e campos vazios', () => {
    montar()
    const lista = lerLista()
    expect(lista.map((p) => p.nome)).toEqual(['Cleiton Silva', 'Ítalo Santos'])
    expect(lista.map((p) => p.id)).toEqual([
      'prof-cleiton-silva',
      'prof-italo-santos',
    ])
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
    expect(lista[0].ativo).toBe(true)
    expect(lista[1].ativo).toBe(true)
  })

  it('renomeia os placeholders intactos do template para a equipe real', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        {
          id: 'prof-audax',
          nome: 'Audax',
          telefone: '',
          email: '',
          foto: '',
          ativo: true,
          criadoEm: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'prof-diego',
          nome: 'Diego',
          telefone: '',
          email: '',
          foto: '',
          ativo: true,
          criadoEm: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    montar()
    const lista = lerLista()
    expect(lista.map((p) => p.nome)).toEqual(['Cleiton Silva', 'Ítalo Santos'])
    // ids preservados: chaves de comissões e configs continuam valendo
    expect(lista.map((p) => p.id)).toEqual(['prof-audax', 'prof-diego'])
  })

  it('placeholder já renomeado pelo usuário não é tocado pela migração', () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        {
          id: 'prof-audax',
          nome: 'Audax Barbearia',
          telefone: '(11) 91111-2222',
          email: '',
          foto: '',
          ativo: true,
          criadoEm: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    montar()
    const lista = lerLista()
    expect(lista).toHaveLength(1)
    expect(lista[0].nome).toBe('Audax Barbearia')
    expect(lista[0].telefone).toBe('(11) 91111-2222')
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
    expect(lista.map((p) => p.nome)).toContain('Cleiton Silva')
    expect(lista.map((p) => p.nome)).toContain('Ítalo Santos')
  })

  it('preserva lista vazia salva sem reinstalar o seed', () => {
    localStorage.setItem(CHAVE, JSON.stringify([]))
    montar()
    expect(lerLista()).toHaveLength(0)
  })

  it('rejeita profissional duplicado por nome', () => {
    montar()
    expect(() =>
      ctx.adicionar({ nome: 'cleiton silva', telefone: '', email: '', foto: '' }),
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

describe('Profissionais — validação no store', () => {
  it('rejeita nome curto, telefone curto e e-mail inválido sem salvar', () => {
    montar()
    expect(() =>
      ctx.adicionar({ nome: ' D ', telefone: '', email: '', foto: '' }),
    ).toThrow(/nome completo do profissional/)
    expect(() =>
      ctx.adicionar({ nome: 'Luan', telefone: '123', email: '', foto: '' }),
    ).toThrow(/telefone válido/)
    expect(() =>
      ctx.adicionar({ nome: 'Luan', telefone: '', email: 'erro', foto: '' }),
    ).toThrow(/e-mail válido/)
    expect(ctx.profissionais.some((p) => p.nome === 'Luan')).toBe(false)
  })

  it('rejeita atualização inválida mantendo o cadastro intacto', () => {
    montar()
    const alvo = ctx.profissionais.find((p) => p.nome === 'Cleiton Silva')!
    expect(() =>
      ctx.atualizar(alvo.id, { nome: 'A', telefone: '', email: '', foto: '' }),
    ).toThrow(/nome completo do profissional/)
    expect(ctx.porId(alvo.id)?.nome).toBe('Cleiton Silva')
  })
})

describe('Profissionais — status ativo/inativo (sem apagar dados)', () => {
  it('profissional nasce ativo e alternarAtivo inativa/reativa preservando tudo', () => {
    montar()
    const alvo = ctx.profissionais.find((p) => p.nome === 'Ítalo Santos')!
    expect(alvo.ativo).toBe(true)

    act(() => ctx.alternarAtivo(alvo.id))
    const inativo = ctx.porId(alvo.id)!
    expect(inativo.ativo).toBe(false)
    expect(inativo.nome).toBe('Ítalo Santos')
    expect(inativo.telefone).toBe('')
    expect(inativo.email).toBe('')

    const noStorage = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    expect(
      noStorage.find((p: Profissional) => p.nome === 'Ítalo Santos')?.ativo,
    ).toBe(false)

    act(() => ctx.alternarAtivo(alvo.id))
    expect(ctx.porId(alvo.id)?.ativo).toBe(true)
  })

  it('atualizar preserva o status inativo do profissional', () => {
    montar()
    const alvo = ctx.profissionais.find((p) => p.nome === 'Ítalo Santos')!
    act(() => ctx.alternarAtivo(alvo.id))
    act(() => {
      ctx.atualizar(alvo.id, {
        nome: 'Ítalo Santos',
        telefone: '(11) 97777-6666',
        email: 'italo@email.com',
        foto: '',
      })
    })
    const atual = ctx.porId(alvo.id)!
    expect(atual.ativo).toBe(false)
    expect(atual.telefone).toBe('(11) 97777-6666')
    expect(atual.email).toBe('italo@email.com')
  })

  it('profissionais criados nascem ativos por padrão', () => {
    montar()
    act(() => {
      ctx.adicionar({
        nome: 'Luan Silva',
        telefone: '(11) 91234-5678',
        email: '',
        foto: '',
      })
    })
    const novo = ctx.profissionais.find((p) => p.nome === 'Luan Silva')!
    expect(novo.ativo).toBe(true)
  })
})
