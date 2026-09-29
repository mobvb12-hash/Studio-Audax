import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import * as repositorio from '@/services/supabase/profissionais'
import { ProfissionaisProvider, useProfissionais } from './store'
import type { Profissional } from './types'

const CHAVE = 'studio-audax:profissionais:v1'

// Tabela remota em memória: mesma semântica do Supabase para os testes.
const remoto = vi.hoisted(() => ({
  linhas: [] as unknown[],
  falhaLeitura: false,
  falhaEscrita: false,
  leituraCongelada: false,
  liberarLeitura: null as null | (() => void),
  reiniciar() {
    remoto.linhas = []
    remoto.falhaLeitura = false
    remoto.falhaEscrita = false
    remoto.leituraCongelada = false
    remoto.liberarLeitura = null
  },
  gravar(linha: unknown) {
    const id = (linha as { id: string }).id
    const indice = remoto.linhas.findIndex(
      (item) => (item as { id: string }).id === id,
    )
    if (indice >= 0) remoto.linhas[indice] = linha
    else remoto.linhas.push(linha)
  },
  ids(): string[] {
    return remoto.linhas.map((linha) => (linha as { id: string }).id)
  },
}))

// Supabase "configurado": o store enxerga o cliente remoto ativo.
vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }))

vi.mock('@/services/supabase/profissionais', () => ({
  listarProfissionais: vi.fn(async () => {
    // a lista é capturada na chamada: quem cria durante a leitura ainda
    // está fora do resultado (mesma corrida do navegador)
    const captura = [...remoto.linhas]
    // erro de consulta não vira lista vazia: o repositório lança
    if (remoto.falhaLeitura) throw new Error('rede indisponível')
    if (remoto.leituraCongelada) {
      await new Promise<void>((liberar) => {
        remoto.liberarLeitura = liberar
      })
    }
    return captura as never
  }),
  importarProfissionais: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    lista.forEach(remoto.gravar)
    return lista.length
  }),
  criarProfissional: vi.fn(async (profissional: unknown) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    remoto.gravar(profissional)
    return profissional as never
  }),
  atualizarProfissional: vi.fn(
    async (id: string, input: Record<string, unknown>) => {
      if (remoto.falhaEscrita) throw new Error('rede indisponível')
      const alvo = remoto.linhas.find(
        (linha) => (linha as { id: string }).id === id,
      ) as Record<string, unknown> | undefined
      if (!alvo) return null
      const linha = { ...alvo, ...input, id }
      remoto.gravar(linha)
      return linha as never
    },
  ),
  alternarAtivoProfissional: vi.fn(async (id: string, ativo: boolean) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    const alvo = remoto.linhas.find(
      (linha) => (linha as { id: string }).id === id,
    ) as Record<string, unknown> | undefined
    if (!alvo) return null
    const linha = { ...alvo, ativo }
    remoto.gravar(linha)
    return linha as never
  }),
  removerProfissional: vi.fn(async (id: string) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    remoto.linhas = remoto.linhas.filter(
      (linha) => (linha as { id: string }).id !== id,
    )
    return true
  }),
}))

let ctx: ReturnType<typeof useProfissionais>

function Captura() {
  const valor = useProfissionais()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function montar() {
  return render(
    <ProfissionaisProvider>
      <Captura />
    </ProfissionaisProvider>,
  )
}

function prof(id: string, nome: string, extra: Partial<Profissional> = {}) {
  return {
    id,
    nome,
    telefone: '',
    email: '',
    foto: '',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as Profissional
}

function gravarLocal(lista: Profissional[]): void {
  localStorage.setItem(CHAVE, JSON.stringify(lista))
}

function salvoLocal(): Profissional[] {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
}

function chavesBackup(): string[] {
  return Object.keys(localStorage).filter((chave) =>
    chave.startsWith(`${CHAVE}:backup:`),
  )
}

function linhasSalvasNoBackup(): Profissional[] {
  const chaves = chavesBackup()
  if (chaves.length === 0) return []
  return JSON.parse(localStorage.getItem(chaves[chaves.length - 1]) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useProfissionais>
})

describe('Profissionais — cadastro local e Supabase', () => {
  it('banco realmente vazio (leitura ok, 0 linhas) reenvia o cadastro local', async () => {
    gravarLocal([prof('p-1', 'Ana Local')])
    remoto.linhas = [] // consulta funciona e não devolve nenhuma linha

    montar()

    // vazio legítimo ≠ falha de leitura: aqui o reenvio é o comportamento certo
    await waitFor(() => expect(remoto.ids()).toEqual(['p-1']))
    expect(ctx.profissionais.map((p) => p.nome)).toEqual(['Ana Local'])
    expect(repositorio.importarProfissionais).toHaveBeenCalledTimes(1)
  })

  it('cadastro local ausente no remoto é enviado e continua na lista', async () => {
    gravarLocal([prof('p-1', 'Ana Local'), prof('p-2', 'Bruno Local')])
    remoto.linhas = [prof('p-1', 'Ana Local')]

    montar()

    // antes do C2 a lista remota substituía a local e "Bruno Local" sumia
    await waitFor(() => expect(ctx.profissionais).toHaveLength(2))
    expect(ctx.profissionais.map((p) => p.id)).toEqual(['p-1', 'p-2'])
    await waitFor(() => expect(remoto.ids()).toEqual(['p-1', 'p-2']))
    const enviados = vi.mocked(repositorio.importarProfissionais).mock.calls
    expect(enviados).toHaveLength(1)
    expect(enviados[0][0].map((p) => p.id)).toEqual(['p-2'])
    await waitFor(() =>
      expect(salvoLocal().map((p) => p.id)).toEqual(['p-1', 'p-2']),
    )
  })

  it('instalação nova com remoto preenchido adota a lista oficial e não envia o seed', async () => {
    remoto.linhas = [prof('p-1', 'Ana Remoto')]

    montar()

    // storage vazio: o seed do template não pode sobrescrever o remoto
    await waitFor(() =>
      expect(ctx.profissionais.map((p) => p.nome)).toEqual(['Ana Remoto']),
    )
    expect(repositorio.importarProfissionais).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(1)
  })

  it('registro novo só no remoto entra na união sem reenviar o que já é igual', async () => {
    gravarLocal([prof('p-1', 'Ana Local')])
    remoto.linhas = [prof('p-1', 'Ana Local'), prof('p-9', 'Zeca Remoto')]

    montar()

    await waitFor(() => expect(ctx.profissionais).toHaveLength(2))
    expect(ctx.profissionais.map((p) => p.nome)).toEqual([
      'Ana Local',
      'Zeca Remoto',
    ])
    expect(repositorio.importarProfissionais).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(2)
  })

  it('falha de leitura não vira banco vazio: nada é reenviado e o remoto fica intacto', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gravarLocal([prof('p-1', 'Ana Local')])
    // o servidor tem o cadastro de outro aparelho: não pode ser sobrescrito
    remoto.linhas = [prof('p-1', 'Ana Local'), prof('p-9', 'Zeca Remoto')]
    remoto.falhaLeitura = true

    montar()

    await waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('Supabase indisponível'),
      expect.any(Error),
    )
    // "não consegui ler" não pode virar "banco vazio" → nenhum reenvio
    expect(repositorio.importarProfissionais).not.toHaveBeenCalled()
    // o que já existia no servidor continua intacto
    expect(remoto.ids()).toEqual(['p-1', 'p-9'])
    // e o cadastro local permanece como estava
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    expect(ctx.profissionais[0]?.nome).toBe('Ana Local')
    await waitFor(() => expect(salvoLocal()).toHaveLength(1))
    aviso.mockRestore()
  })

  it('leitura boa com reenvio recusado avisa envio incompleto e mantém o local', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gravarLocal([prof('p-1', 'Ana Local'), prof('p-2', 'Bruno Local')])
    remoto.linhas = [prof('p-1', 'Ana Local')]
    remoto.falhaEscrita = true

    montar()

    await waitFor(() => expect(aviso).toHaveBeenCalled())
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('envio incompleto'),
    )
    await waitFor(() => expect(ctx.profissionais).toHaveLength(2))
    expect(remoto.ids()).toEqual(['p-1'])
    aviso.mockRestore()
  })

  it('leitura rejeitada pontual mantém o fallback local intacto e avisa', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gravarLocal([prof('p-1', 'Ana Local')])
    vi.mocked(repositorio.listarProfissionais).mockRejectedValueOnce(
      new Error('rede indisponível'),
    )

    montar()

    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    expect(ctx.profissionais[0]?.nome).toBe('Ana Local')
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('Supabase indisponível'),
      expect.any(Error),
    )
    await waitFor(() => expect(salvoLocal()).toHaveLength(1))
    aviso.mockRestore()
  })

  it('edição sem gravação remota persiste local e é reenviada na próxima carga', async () => {
    gravarLocal([prof('p-1', 'Ana Local')])
    remoto.linhas = [prof('p-1', 'Ana Local')]
    const primeira = montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    // nada avisado enquanto a sincronização funciona
    expect(avisosPersistencia()).toEqual([])

    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.atualizar('p-1', {
        nome: 'Ana Editada',
        telefone: '(11) 2222-2222',
        email: '',
        foto: '',
      })
    })
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Ana Editada'))
    expect((remoto.linhas[0] as Profissional).nome).toBe('Ana Local')
    // a edição não foi confirmada no servidor: a tela precisa avisar
    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])

    primeira.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() => expect(ctx.profissionais[0]?.nome).toBe('Ana Editada'))
    await waitFor(
      () => expect((remoto.linhas[0] as Profissional).nome).toBe('Ana Editada'),
      { timeout: 3000 },
    )
    expect(linhasSalvasNoBackup()[0]?.nome).toBe('Ana Local')
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Ana Editada'))
  })

  it('criação durante a janela de carga não some nem do estado nem do localStorage', async () => {
    gravarLocal([prof('p-1', 'Ana Local')])
    remoto.linhas = [prof('p-1', 'Ana Local')]
    remoto.leituraCongelada = true

    montar()

    await act(async () => {
      await ctx.adicionar({
        nome: 'Luan Silva',
        telefone: '(11) 91234-5678',
        email: '',
        foto: '',
      })
    })
    expect(ctx.profissionais).toHaveLength(2)

    await act(async () => {
      remoto.liberarLeitura?.()
    })

    await waitFor(() => expect(ctx.profissionais).toHaveLength(2))
    expect(ctx.profissionais.map((p) => p.nome)).toContain('Luan Silva')
    await waitFor(() =>
      expect(salvoLocal().map((p) => p.nome)).toContain('Luan Silva'),
    )
  })

  it('criação recusada pelo Supabase avisa e não perde o dado local', async () => {
    gravarLocal([prof('p-1', 'Ana Local')])
    remoto.linhas = [prof('p-1', 'Ana Local')]
    montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    expect(avisosPersistencia()).toEqual([])

    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.adicionar({
        nome: 'Luan Silva',
        telefone: '(11) 91234-5678',
        email: '',
        foto: '',
      })
    })

    // não há sucesso indevido: o aviso diz que o servidor não confirmou
    const avisos = avisosPersistencia()
    expect(avisos).toHaveLength(1)
    expect(avisos[0].tipo).toBe('falha_sincronizacao')
    expect(avisos[0].mensagem).toMatch(/não foi confirmada no servidor/)
    expect(avisos[0].mensagem).toMatch(/Nada foi perdido/)
    // o dado fica no estado e no localStorage (pendência do C2)
    await waitFor(() =>
      expect(ctx.profissionais.map((p) => p.nome)).toContain('Luan Silva'),
    )
    await waitFor(() =>
      expect(salvoLocal().map((p) => p.nome)).toContain('Luan Silva'),
    )
    expect(remoto.ids()).toEqual(['p-1'])
  })

  it('exclusão recusada pelo Supabase avisa que a remoção não foi confirmada', async () => {
    gravarLocal([prof('p-1', 'Ana Local')])
    remoto.linhas = [prof('p-1', 'Ana Local')]
    montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))

    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.remover('p-1')
    })

    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])
    await waitFor(() => expect(ctx.profissionais).toHaveLength(0))
    // a linha continua no Supabase — a exclusão não foi confirmada
    expect(remoto.ids()).toEqual(['p-1'])
  })

  it('divergência: o local vence e a versão remota substituída fica no snapshot', async () => {
    gravarLocal([prof('p-1', 'Nome Local')])
    remoto.linhas = [prof('p-1', 'Nome Remoto')]

    montar()

    await waitFor(() => expect(ctx.profissionais[0]?.nome).toBe('Nome Local'))
    await waitFor(
      () => expect((remoto.linhas[0] as Profissional).nome).toBe('Nome Local'),
      { timeout: 3000 },
    )
    expect(chavesBackup()).toHaveLength(1)
    expect(linhasSalvasNoBackup()[0]?.nome).toBe('Nome Remoto')
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Nome Local'))
  })
})

// Tombstone de exclusão (mesmo padrão do Caixa): a remoção precisa
// sobreviver ao F5 — sem ele o registro volta pela lista do servidor e a
// exclusão "não gruda". Idempotente: reaplicar não afeta quem não foi
// excluído e o tombstone é limpo quando o Supabase converge.
describe('Profissionais — exclusão persistida (sem ressurreição no F5)', () => {
  const CHAVE_TOMB = 'studio-audax:profissionais:removidos:v1'

  it('remoção não confirmada pelo servidor não volta no F5 e é reaplicada até convergir', async () => {
    gravarLocal([prof('p-1', 'Ana Local'), prof('p-2', 'Bruno Local')])
    remoto.linhas = [prof('p-1', 'Ana Local'), prof('p-2', 'Bruno Local')]
    const primeiro = montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(2))

    // servidor recusa a exclusão (ex.: rede fora)
    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.remover('p-1')
    })
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    // a remoção fica registrada em tombstone; servidor continua com a linha
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(CHAVE_TOMB) ?? '[]')).toEqual([
        'p-1',
      ]),
    )
    expect(remoto.ids()).toEqual(['p-1', 'p-2'])

    // F5: servidor volta ao normal mas ainda devolve o registro excluído
    primeiro.unmount()
    remoto.falhaEscrita = false
    const segundo = montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    // não ressuscita; o p-2 (nunca excluído) segue intacto
    expect(ctx.profissionais.map((p) => p.id)).toEqual(['p-2'])
    await waitFor(() => expect(salvoLocal().map((p) => p.id)).toEqual(['p-2']))
    // reaplicação idempotente da exclusão pendente
    expect(repositorio.removerProfissional).toHaveBeenCalledWith('p-1')
    expect(repositorio.removerProfissional).not.toHaveBeenCalledWith('p-2')
    await waitFor(() => expect(remoto.ids()).toEqual(['p-2']))

    // servidor convergiu: a próxima carga limpa o tombstone
    segundo.unmount()
    montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(CHAVE_TOMB) ?? '[]')).toEqual([]),
    )
    expect(ctx.profissionais.map((p) => p.id)).toEqual(['p-2'])
  })

  it('exclusão confirmada não volta no F5 e não afeta os demais cadastros', async () => {
    gravarLocal([prof('p-1', 'Ana Local'), prof('p-2', 'Bruno Local')])
    remoto.linhas = [prof('p-1', 'Ana Local'), prof('p-2', 'Bruno Local')]
    const primeiro = montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(2))

    await act(async () => {
      await ctx.remover('p-1')
    })
    await waitFor(() => expect(remoto.ids()).toEqual(['p-2']))

    primeiro.unmount()
    montar()
    await waitFor(() => expect(ctx.profissionais).toHaveLength(1))
    expect(ctx.profissionais.map((p) => p.id)).toEqual(['p-2'])
    expect(ctx.profissionais[0]?.nome).toBe('Bruno Local')
  })
})
