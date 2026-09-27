import { act, render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisosPersistencia, limparAvisosPersistencia } from '@/lib/persistencia'
import * as repositorio from '@/services/supabase/servicos'
import { ServicosProvider, useServicos } from './store'
import type { Servico } from './types'

const CHAVE = 'studio-audax:servicos:v1'

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

vi.mock('@/services/supabase/servicos', () => ({
  listarServicos: vi.fn(async () => {
    // a lista é capturada na chamada: quem cria durante a leitura ainda
    // está fora do resultado (mesma corrida do navegador)
    const captura = [...remoto.linhas]
    if (remoto.falhaLeitura) return []
    if (remoto.leituraCongelada) {
      await new Promise<void>((liberar) => {
        remoto.liberarLeitura = liberar
      })
    }
    return captura as never
  }),
  importarServicos: vi.fn(async (lista: unknown[]) => {
    if (remoto.falhaEscrita) return 0
    lista.forEach(remoto.gravar)
    return lista.length
  }),
  criarServico: vi.fn(async (servico: unknown) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    remoto.gravar(servico)
    return servico as never
  }),
  atualizarServico: vi.fn(async (id: string, input: Record<string, unknown>) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    const alvo = remoto.linhas.find(
      (linha) => (linha as { id: string }).id === id,
    ) as Record<string, unknown> | undefined
    if (!alvo) return null
    const linha = {
      ...alvo,
      ...input,
      id,
      atualizadoEm: new Date().toISOString(),
    }
    remoto.gravar(linha)
    return linha as never
  }),
  alternarAtivoServico: vi.fn(async (id: string, ativo: boolean) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    const alvo = remoto.linhas.find(
      (linha) => (linha as { id: string }).id === id,
    ) as Record<string, unknown> | undefined
    if (!alvo) return null
    const linha = { ...alvo, ativo, atualizadoEm: new Date().toISOString() }
    remoto.gravar(linha)
    return linha as never
  }),
  removerServico: vi.fn(async (id: string) => {
    if (remoto.falhaEscrita) throw new Error('rede indisponível')
    remoto.linhas = remoto.linhas.filter(
      (linha) => (linha as { id: string }).id !== id,
    )
    return true
  }),
}))

let ctx: ReturnType<typeof useServicos>

function Captura() {
  const valor = useServicos()
  useEffect(() => {
    ctx = valor
  })
  return null
}

function montar() {
  return render(
    <ServicosProvider>
      <Captura />
    </ServicosProvider>,
  )
}

function svc(id: string, nome: string, extra: Partial<Servico> = {}) {
  return {
    id,
    nome,
    preco: 50,
    duracaoMin: 30,
    categoria: '',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00.000Z',
    atualizadoEm: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as Servico
}

function gravarLocal(lista: Servico[]): void {
  localStorage.setItem(CHAVE, JSON.stringify(lista))
}

function salvoLocal(): Servico[] {
  return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
}

function chavesBackup(): string[] {
  return Object.keys(localStorage).filter((chave) =>
    chave.startsWith(`${CHAVE}:backup:`),
  )
}

function linhasSalvasNoBackup(): Servico[] {
  const chaves = chavesBackup()
  if (chaves.length === 0) return []
  return JSON.parse(localStorage.getItem(chaves[chaves.length - 1]) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  limparAvisosPersistencia()
  remoto.reiniciar()
  vi.clearAllMocks()
  ctx = undefined as unknown as ReturnType<typeof useServicos>
})

describe('Serviços — cadastro local e Supabase', () => {
  it('cadastro local ausente no remoto é enviado e continua na lista', async () => {
    gravarLocal([svc('s-1', 'Corte'), svc('s-2', 'Escova')])
    remoto.linhas = [svc('s-1', 'Corte')]

    montar()

    // antes do C2 a lista remota substituía a local e "Escova" sumia
    await waitFor(() => expect(ctx.servicos).toHaveLength(2))
    expect(ctx.servicos.map((s) => s.id)).toEqual(['s-1', 's-2'])
    await waitFor(() => expect(remoto.ids()).toEqual(['s-1', 's-2']))
    const enviados = vi.mocked(repositorio.importarServicos).mock.calls
    expect(enviados).toHaveLength(1)
    expect(enviados[0][0].map((s) => s.id)).toEqual(['s-2'])
    await waitFor(() =>
      expect(salvoLocal().map((s) => s.id)).toEqual(['s-1', 's-2']),
    )
  })

  it('instalação nova com remoto preenchido adota a lista oficial e não envia o seed', async () => {
    remoto.linhas = [svc('s-1', 'Corte Oficial')]

    montar()

    // storage vazio: o seed do template não pode sobrescrever o remoto
    await waitFor(() =>
      expect(ctx.servicos.map((s) => s.nome)).toEqual(['Corte Oficial']),
    )
    expect(repositorio.importarServicos).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(1)
  })

  it('registro novo só no remoto entra na união sem reenviar o que já é igual', async () => {
    gravarLocal([svc('s-1', 'Corte')])
    remoto.linhas = [svc('s-1', 'Corte'), svc('s-9', 'Barba')]

    montar()

    await waitFor(() => expect(ctx.servicos).toHaveLength(2))
    expect(ctx.servicos.map((s) => s.nome)).toEqual(['Barba', 'Corte'])
    expect(repositorio.importarServicos).not.toHaveBeenCalled()
    expect(remoto.linhas).toHaveLength(2)
  })

  it('remoto mais novo vence a divergência e a versão local fica no snapshot', async () => {
    gravarLocal([
      svc('s-1', 'Corte', {
        preco: 50,
        atualizadoEm: '2026-01-01T00:00:00.000Z',
      }),
    ])
    remoto.linhas = [
      svc('s-1', 'Corte Premium', {
        preco: 80,
        atualizadoEm: '2026-06-06T00:00:00.000Z',
      }),
    ]

    montar()

    await waitFor(() => expect(ctx.servicos[0]?.nome).toBe('Corte Premium'))
    expect(repositorio.importarServicos).not.toHaveBeenCalled()
    expect((remoto.linhas[0] as Servico).nome).toBe('Corte Premium')
    expect(chavesBackup()).toHaveLength(1)
    expect(linhasSalvasNoBackup()[0]?.nome).toBe('Corte')
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Corte Premium'))
  })

  it('local mais novo vence a divergência, é enviado e preserva o remoto no snapshot', async () => {
    gravarLocal([
      svc('s-1', 'Corte Editado', {
        preco: 70,
        atualizadoEm: '2026-07-07T00:00:00.000Z',
      }),
    ])
    remoto.linhas = [
      svc('s-1', 'Corte', {
        preco: 50,
        atualizadoEm: '2026-06-06T00:00:00.000Z',
      }),
    ]

    montar()

    await waitFor(() => expect(ctx.servicos[0]?.nome).toBe('Corte Editado'))
    await waitFor(
      () => expect((remoto.linhas[0] as Servico).nome).toBe('Corte Editado'),
      { timeout: 3000 },
    )
    expect(chavesBackup()).toHaveLength(1)
    expect(linhasSalvasNoBackup()[0]?.nome).toBe('Corte')
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Corte Editado'))
  })

  it('leitura falha: mantém o local, não grava no remoto e avisa o envio incompleto', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gravarLocal([svc('s-1', 'Corte')])
    remoto.falhaLeitura = true
    remoto.falhaEscrita = true

    montar()

    await waitFor(() => expect(ctx.servicos).toHaveLength(1))
    expect(ctx.servicos[0]?.nome).toBe('Corte')
    expect(remoto.linhas).toHaveLength(0)
    await waitFor(() => expect(salvoLocal()).toHaveLength(1))
    expect(aviso).toHaveBeenCalledWith(
      expect.stringContaining('envio incompleto'),
    )
    aviso.mockRestore()
  })

  it('edição sem gravação remota persiste local e é reenviada na próxima carga', async () => {
    gravarLocal([svc('s-1', 'Corte')])
    remoto.linhas = [svc('s-1', 'Corte')]
    const primeira = montar()
    await waitFor(() => expect(ctx.servicos).toHaveLength(1))
    // nada avisado enquanto a sincronização funciona
    expect(avisosPersistencia()).toEqual([])

    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.atualizar('s-1', {
        nome: 'Corte Editado',
        preco: 70,
        duracaoMin: 45,
        categoria: '',
      })
    })
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Corte Editado'))
    expect((remoto.linhas[0] as Servico).nome).toBe('Corte')
    // a edição não foi confirmada no servidor: a tela precisa avisar
    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])

    primeira.unmount()
    remoto.falhaEscrita = false
    montar()

    await waitFor(() => expect(ctx.servicos[0]?.nome).toBe('Corte Editado'))
    await waitFor(
      () => expect((remoto.linhas[0] as Servico).nome).toBe('Corte Editado'),
      { timeout: 3000 },
    )
    expect(linhasSalvasNoBackup()[0]?.nome).toBe('Corte')
    await waitFor(() => expect(salvoLocal()[0]?.nome).toBe('Corte Editado'))
  })

  it('criação recusada pelo Supabase avisa e não perde o dado local', async () => {
    gravarLocal([svc('s-1', 'Corte')])
    remoto.linhas = [svc('s-1', 'Corte')]
    montar()
    await waitFor(() => expect(ctx.servicos).toHaveLength(1))
    expect(avisosPersistencia()).toEqual([])

    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.adicionar({
        nome: 'Luzes',
        preco: 120,
        duracaoMin: 60,
        categoria: 'Cabelo',
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
      expect(ctx.servicos.map((s) => s.nome)).toContain('Luzes'),
    )
    await waitFor(() =>
      expect(salvoLocal().map((s) => s.nome)).toContain('Luzes'),
    )
    expect(remoto.ids()).toEqual(['s-1'])
  })

  it('exclusão recusada pelo Supabase avisa que a remoção não foi confirmada', async () => {
    gravarLocal([svc('s-1', 'Corte')])
    remoto.linhas = [svc('s-1', 'Corte')]
    montar()
    await waitFor(() => expect(ctx.servicos).toHaveLength(1))

    remoto.falhaEscrita = true
    await act(async () => {
      await ctx.remover('s-1')
    })

    expect(avisosPersistencia().map((a) => a.tipo)).toEqual([
      'falha_sincronizacao',
    ])
    await waitFor(() => expect(ctx.servicos).toHaveLength(0))
    // a linha continua no Supabase — a exclusão não foi confirmada
    expect(remoto.ids()).toEqual(['s-1'])
  })

  it('criação durante a janela de carga não some nem do estado nem do localStorage', async () => {
    gravarLocal([svc('s-1', 'Corte')])
    remoto.linhas = [svc('s-1', 'Corte')]
    remoto.leituraCongelada = true

    montar()

    await act(async () => {
      await ctx.adicionar({
        nome: 'Luzes',
        preco: 120,
        duracaoMin: 60,
        categoria: 'Cabelo',
      })
    })
    expect(ctx.servicos).toHaveLength(2)

    await act(async () => {
      remoto.liberarLeitura?.()
    })

    await waitFor(() => expect(ctx.servicos).toHaveLength(2))
    expect(ctx.servicos.map((s) => s.nome)).toContain('Luzes')
    await waitFor(() =>
      expect(salvoLocal().map((s) => s.nome)).toContain('Luzes'),
    )
  })
})
