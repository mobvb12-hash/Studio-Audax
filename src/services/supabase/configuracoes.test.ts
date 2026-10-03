// Configurações — leitura/escrita pelas RPCs (a tabela não tem policy).
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Resposta = { data: unknown; error: { message: string } | null }

const banco = vi.hoisted(() => {
  const estado = {
    chamadas: [] as { nome: string; args: Record<string, unknown> | undefined }[],
    resposta: { data: null, error: null } as Resposta,
    semSupabase: false,
    reiniciar() {
      estado.chamadas = []
      estado.resposta = { data: null, error: null }
      estado.semSupabase = false
    },
  }

  function cliente() {
    return {
      rpc: vi.fn(async (nome: string, args?: Record<string, unknown>) => {
        estado.chamadas.push({ nome, args })
        return estado.resposta
      }),
    }
  }

  return { estado, cliente }
})

vi.mock('@/lib/supabase', () => ({
  supabase: () => (banco.estado.semSupabase ? null : banco.cliente()),
}))

import { carregarConfiguracoes, salvarConfiguracao, SEM_INTEGRACAO } from './configuracoes'
import { CONFIG_PADRAO } from '@/modules/configuracoes/types'

beforeEach(() => banco.estado.reiniciar())

describe('carregarConfiguracoes', () => {
  it('sem Supabase devolve o padrão e avisa', async () => {
    banco.estado.semSupabase = true
    const resultado = await carregarConfiguracoes()
    expect(resultado.dados).toEqual(CONFIG_PADRAO)
    expect(resultado.doBanco).toBe(false)
    expect(resultado.erro).toBe(SEM_INTEGRACAO)
  })

  it('lê pela RPC de administrador e normaliza', async () => {
    banco.estado.resposta = {
      data: { ia: { maxSugestoes: 3 }, links: { painel: 'https://p.exemplo/painel' } },
      error: null,
    }
    const resultado = await carregarConfiguracoes()
    expect(banco.estado.chamadas[0].nome).toBe('admin_configuracoes_ler')
    expect(resultado.doBanco).toBe(true)
    expect(resultado.dados.ia.maxSugestoes).toBe(3)
    expect(resultado.dados.links.painel).toBe('https://p.exemplo/painel')
    // o que não veio continua no padrão
    expect(resultado.dados.notificacoes.posAtendimento).toBe(true)
  })

  it('erro da RPC não derruba a tela', async () => {
    banco.estado.resposta = { data: null, error: { message: 'sem permissão' } }
    const resultado = await carregarConfiguracoes()
    expect(resultado.doBanco).toBe(false)
    expect(resultado.erro).toContain('sem permissão')
    expect(resultado.dados).toEqual(CONFIG_PADRAO)
  })
})

describe('salvarConfiguracao', () => {
  it('envia o valor como JSON em texto (contrato da RPC)', async () => {
    banco.estado.resposta = { data: { ok: true }, error: null }
    const erro = await salvarConfiguracao('links', { painel: 'https://x/painel' })
    expect(erro).toBeNull()
    expect(banco.estado.chamadas[0]).toEqual({
      nome: 'admin_configuracao_salvar',
      args: { p_chave: 'links', p_valor: '{"painel":"https://x/painel"}' },
    })
  })

  it('valor ausente vira objeto vazio, nunca undefined', async () => {
    banco.estado.resposta = { data: { ok: true }, error: null }
    await salvarConfiguracao('clube', undefined)
    expect(banco.estado.chamadas[0].args?.p_valor).toBe('{}')
  })

  it('erro do servidor volta como mensagem utilizável', async () => {
    banco.estado.resposta = { data: null, error: { message: 'Configuração desconhecida.' } }
    const erro = await salvarConfiguracao('links', {})
    expect(erro).toContain('Configuração desconhecida.')
  })

  it('sem Supabase avisa em vez de fingir que salvou', async () => {
    banco.estado.semSupabase = true
    const erro = await salvarConfiguracao('ia', { maxSugestoes: 1 })
    expect(erro).toBe(SEM_INTEGRACAO)
  })
})
