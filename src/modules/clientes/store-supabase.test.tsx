import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import * as repositorio from '@/services/supabase/clientes'
import { ClientesProvider, useClientes } from './store'
import type { Cliente } from './types'

const CHAVE = 'studio-audax:clientes:v1'

// Tabela remota em memória: mesma semântica do Supabase para os testes.
const remoto = vi.hoisted(() => ({
  linhas: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  reiniciar() {
    remoto.linhas = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
  },
  gravar(cliente: unknown) {
    const linha = cliente as { id: string }
    const indice = remoto.linhas.findIndex(
      (item) => (item as { id: string }).id === linha.id,
    )
    if (indice >= 0) remoto.linhas[indice] = cliente
    else remoto.linhas.push(cliente)
  },
}))

// Supabase "configurado": o store enxerga o cliente remoto ativo.
vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/clientes', () => ({
  listarClientes: vi.fn(async () => {
    if (remoto.falhaLeitura) throw new Error('rede indisponível')
    return [...remoto.linhas] as never
  }),
  buscarClientes: vi.fn(async () => []),
  importarClientes: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    lista.forEach(remoto.gravar)
    return lista.length
  }),
  criarCliente: vi.fn(async (cliente: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravar(cliente)
    return cliente as never
  }),
  atualizarCliente: vi.fn(async (id: string, cliente: unknown) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.gravar({ ...(cliente as object), id } as never)
    return cliente as never
  }),
  alternarAtivoCliente: vi.fn(async (id: string, ativo: boolean) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    const alvo = remoto.linhas.find(
      (linha) => (linha as Cliente).id === id,
    ) as Cliente | undefined
    if (!alvo) return null
    remoto.gravar({ ...alvo, ativo })
    return { ...alvo, ativo }
  }),
  removerCliente: vi.fn(async (id: string) => {
    if (remoto.falhaEscrita) throw new Error('permission denied')
    remoto.linhas = remoto.linhas.filter(
      (linha) => (linha as Cliente).id !== id,
    )
    return true
  }),
}))

function cliente(id: string, nome: string, extra: Partial<Cliente> = {}) {
  return {
    id,
    nome,
    telefone: '(11) 90000-0000',
    email: `${id}@email.com`,
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
    preferencias: {
      emailAgendamentos: true,
      smsLembrete: true,
      smsMarketing: true,
      emailMarketing: true,
    },
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as Cliente
}

let ctx: ReturnType<typeof useClientes>

function Captura() {
  const valor = useClientes()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function Tela() {
  const { clientes, adicionar, atualizar, alternarAtivo, remover } = useClientes()
  return (
    <div>
      <output data-testid="lista">{JSON.stringify(clientes)}</output>
      <button
        type="button"
        onClick={() =>
          adicionar({
            nome: 'Lucas Mendes',
            telefone: '(11) 98888-7777',
            email: 'lucas@email.com',
            observacao: '',
          })
        }
      >
        criar
      </button>
      <button
        type="button"
        onClick={() => {
          const alvo = clientes[0]
          if (alvo)
            atualizar(alvo.id, {
              nome: alvo.nome,
              telefone: '(11) 90000-1111',
              email: 'editado@email.com',
              observacao: '',
            })
        }}
      >
        editar
      </button>
      <button
        type="button"
        onClick={() => {
          const alvo = clientes[0]
          if (alvo) alternarAtivo(alvo.id)
        }}
      >
        alternar
      </button>
      <button
        type="button"
        onClick={() => {
          const alvo = clientes[0]
          if (alvo) remover(alvo.id)
        }}
      >
        excluir
      </button>
    </div>
  )
}

function lerLista(): Cliente[] {
  return JSON.parse(screen.getByTestId('lista').textContent ?? '[]')
}

function montar() {
  return render(
    <ClientesProvider>
      <Captura />
      <Tela />
    </ClientesProvider>,
  )
}

function chavesBackup(): string[] {
  return Object.keys(localStorage).filter((chave) =>
    chave.startsWith(`${CHAVE}:backup:`),
  )
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useClientes>
})

describe('Clientes — Supabase como fonte oficial', () => {
  it('migra o localStorage preservando ids, cria snapshot e mantém a chave original', async () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        cliente('cli-001', 'Ana Dias'),
        cliente('cli-002', 'Bruno Canto'),
      ]),
    )

    montar()

    await waitFor(() => expect(remoto.linhas).toHaveLength(2))
    expect(remoto.linhas.map((l) => (l as Cliente).id)).toEqual([
      'cli-001',
      'cli-002',
    ])
    expect(chavesBackup()).toHaveLength(1)
    await waitFor(() =>
      expect(lerLista().map((c) => c.id)).toEqual(['cli-001', 'cli-002']),
    )
    await waitFor(() => {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Cliente[]
      expect(salvo).toHaveLength(2)
    })
  })

  it('dado remoto mais novo substitui o dado local antigo (não é sobrescrito)', async () => {
    localStorage.setItem(
      CHAVE,
      JSON.stringify([
        cliente('cli-1', 'Nome Local Antigo', {
          atualizadoEm: '2026-01-01T00:00:00.000Z',
        }),
      ]),
    )
    remoto.linhas = [
      cliente('cli-1', 'Nome Remoto Novo', {
        atualizadoEm: '2026-06-06T00:00:00.000Z',
      }),
    ]

    montar()

    await waitFor(() =>
      expect(lerLista().map((c) => c.nome)).toEqual(['Nome Remoto Novo']),
    )
    await waitFor(() => {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Cliente[]
      expect(salvo[0]?.nome).toBe('Nome Remoto Novo')
    })
    expect(remoto.linhas).toHaveLength(1)
  })

  it('F5: ao reabrir o sistema a lista oficial é a remota', async () => {
    remoto.linhas = [cliente('cli-9', 'Wesley Prado')]
    const primeiro = montar()
    await waitFor(() =>
      expect(lerLista().map((c) => c.nome)).toEqual(['Wesley Prado']),
    )
    primeiro.unmount()

    localStorage.setItem(CHAVE, JSON.stringify([cliente('cli-8', 'Local Velho')]))
    montar()

    await waitFor(() =>
      expect(lerLista().map((c) => c.id)).toEqual(['cli-8', 'cli-9']),
    )
    expect(lerLista().map((c) => c.nome)).toEqual([
      'Local Velho',
      'Wesley Prado',
    ])
  })

  it('leitura remota falha: mantém o fallback local e volta a gravar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(CHAVE, JSON.stringify([cliente('cli-1', 'Ana Dias')]))
    remoto.falhaLeitura = true

    montar()

    await waitFor(() =>
      expect(lerLista().map((c) => c.nome)).toEqual(['Ana Dias']),
    )
    expect(aviso).toHaveBeenCalled()
    expect(chavesBackup()).toHaveLength(0)

    remoto.falhaLeitura = false
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    await waitFor(() =>
      expect(
        (JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Cliente[]).map(
          (c) => c.nome,
        ),
      ).toContain('Lucas Mendes'),
    )
    aviso.mockRestore()
  })
})

describe('Clientes — escrita no Supabase com fallback local', () => {
  it('cria cliente enviando o mesmo id para o repositório', async () => {
    montar()
    await waitFor(() => expect(repositorio.listarClientes).toHaveBeenCalled())

    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })

    const esperado = lerLista().find((c) => c.nome === 'Lucas Mendes')
    expect(esperado).toBeTruthy()
    await waitFor(() =>
      expect(
        remoto.linhas.some((l) => (l as Cliente).id === esperado?.id),
      ).toBe(true),
    )
    const chamada = vi.mocked(repositorio.criarCliente).mock.calls[0][0]
    expect(chamada.id).toBe(esperado?.id)
  })

  it('criação com Supabase funcionando não gera aviso', async () => {
    montar()
    await waitFor(() => expect(repositorio.listarClientes).toHaveBeenCalled())

    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    await waitFor(() => expect(remoto.linhas).toHaveLength(1))

    expect(avisosPersistencia()).toEqual([])
  })

  it('falha na escrita remota não tira o cliente da tela nem do storage', async () => {
    montar()
    await waitFor(() => expect(repositorio.listarClientes).toHaveBeenCalled())

    remoto.falhaEscrita = true
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })

    // o registro local continua salvo e visível
    expect(lerLista().map((c) => c.nome)).toContain('Lucas Mendes')
    await waitFor(() =>
      expect(
        (JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Cliente[]).map(
          (c) => c.nome,
        ),
      ).toContain('Lucas Mendes'),
    )
    expect(remoto.linhas).toHaveLength(0)
    // a gravação não foi confirmada: nada pode aparecer como sucesso só porque
    // o cadastro está na tela
    const avisos = avisosPersistencia()
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('falha_sincronizacao')
    expect(avisos[0].chave).toBe(CHAVE)
    expect(avisos[0].mensagem).toMatch(/não foi confirmada no servidor/)
  })

  it('pendência da criação recusada é reenviada na carga seguinte (C2)', async () => {
    const primeira = montar()
    await waitFor(() => expect(repositorio.listarClientes).toHaveBeenCalled())

    remoto.falhaEscrita = true
    await act(async () => {
      fireEvent.click(screen.getByText('criar'))
    })
    const id = lerLista().find((c) => c.nome === 'Lucas Mendes')?.id
    expect(id).toBeTruthy()
    expect(remoto.linhas).toHaveLength(0)
    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])

    // nova carga com o Supabase de volta: a pendência é reenviada
    primeira.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() =>
      expect(remoto.linhas.map((l) => (l as Cliente).id)).toContain(id),
    )
    expect(repositorio.importarClientes).toHaveBeenCalled()
  })

  it('edição recusada avisa e preserva o dado local', async () => {
    remoto.linhas = [cliente('cli-1', 'Ana Dias')]
    montar()
    await waitFor(() =>
      expect(lerLista().map((c) => c.nome)).toEqual(['Ana Dias']),
    )
    expect(avisosPersistencia()).toEqual([])

    remoto.falhaEscrita = true
    await act(async () => {
      fireEvent.click(screen.getByText('editar'))
    })

    await waitFor(() =>
      expect(lerLista()[0]?.telefone).toBe('(11) 90000-1111'),
    )
    await waitFor(() =>
      expect(
        (JSON.parse(localStorage.getItem(CHAVE) ?? '[]') as Cliente[])[0]
          ?.telefone,
      ).toBe('(11) 90000-1111'),
    )
    expect((remoto.linhas[0] as Cliente).telefone).toBe('(11) 90000-0000')
    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])
  })

  it('exclusão recusada avisa que a remoção não foi confirmada', async () => {
    remoto.linhas = [cliente('cli-1', 'Ana Dias')]
    montar()
    await waitFor(() => expect(lerLista()).toHaveLength(1))

    remoto.falhaEscrita = true
    await act(async () => {
      fireEvent.click(screen.getByText('excluir'))
    })

    expect(lerLista()).toHaveLength(0)
    await waitFor(() => expect(remoto.linhas).toHaveLength(1))
    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])
  })

  it('atualizar, inativar e remover chamam o repositório mantendo a API síncrona', async () => {
    remoto.linhas = [cliente('cli-1', 'Ana Dias')]
    montar()
    await waitFor(() =>
      expect(lerLista().map((c) => c.nome)).toEqual(['Ana Dias']),
    )

    await act(async () => {
      fireEvent.click(screen.getByText('editar'))
    })
    await waitFor(() =>
      expect(vi.mocked(repositorio.atualizarCliente)).toHaveBeenCalled(),
    )
    expect(lerLista()[0]?.telefone).toBe('(11) 90000-1111')

    await act(async () => {
      fireEvent.click(screen.getByText('alternar'))
    })
    await waitFor(() =>
      expect(remoto.linhas[0] && (remoto.linhas[0] as Cliente).ativo).toBe(
        false,
      ),
    )
    expect(lerLista()[0]?.ativo).toBe(false)

    await act(async () => {
      fireEvent.click(screen.getByText('excluir'))
    })
    expect(lerLista()).toHaveLength(0)
    await waitFor(() => expect(remoto.linhas).toHaveLength(0))
  })

  it('mantém a API pública síncrona (adicionar devolve o cliente na hora)', async () => {
    montar()
    await waitFor(() => expect(repositorio.listarClientes).toHaveBeenCalled())

    let retorno: unknown
    act(() => {
      retorno = ctx.adicionar({
        nome: 'Sincrono Teste',
        telefone: '(11) 91234-5678',
        email: '',
        observacao: '',
      })
    })
    expect(retorno).not.toBeInstanceOf(Promise)
    expect((retorno as Cliente).id).toBeTruthy()
    expect(() =>
      ctx.adicionar({
        nome: 'sincrono teste',
        telefone: '(11) 99999-9999',
        email: '',
        observacao: '',
      }),
    ).toThrow(/Já existe um cliente com este nome/)
  })
})
