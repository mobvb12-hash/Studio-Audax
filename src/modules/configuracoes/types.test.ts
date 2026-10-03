// Configurações do sistema — normalização e validação (espelho do servidor).
//
// A tela valida para dar retorno imediato, mas quem decide é o banco: estas
// regras existem para o usuário não descobrir a recusa só depois de salvar, e
// para o teste travar o comportamento sem depender de rede.
import { describe, expect, it } from 'vitest'
import {
  CHAVES_CONFIG,
  CONFIG_PADRAO,
  DESCRICAO_CHAVE,
  ROTULO_CHAVE,
  linkValido,
  normalizarConfiguracoes,
  problemaNaConfig,
  valorDaChave,
  type ChaveConfig,
} from './types'

describe('chaves de configuração', () => {
  it('cobre exatamente as chaves que o servidor valida', () => {
    expect(CHAVES_CONFIG).toEqual([
      'links',
      'avaliacao',
      'notificacoes',
      'clube',
      'ia',
      'barbearia',
    ])
  })

  it('toda chave tem rótulo e descrição', () => {
    for (const chave of CHAVES_CONFIG) {
      expect(ROTULO_CHAVE[chave]).toBeTruthy()
      expect(DESCRICAO_CHAVE[chave]).toBeTruthy()
    }
  })
})

describe('linkValido', () => {
  it('aceita vazio, http e https', () => {
    expect(linkValido('')).toBe(true)
    expect(linkValido('https://studioaudax.com.br/painel')).toBe(true)
    expect(linkValido('http://localhost:5173')).toBe(true)
  })

  it('recusa esquema perigoso e espaço', () => {
    expect(linkValido('javascript:alert(1)')).toBe(false)
    expect(linkValido('data:text/html,x')).toBe(false)
    expect(linkValido('https://a b.com')).toBe(false)
    expect(linkValido('studioaudax.com.br')).toBe(false)
  })
})

describe('normalizarConfiguracoes', () => {
  it('lê o que vem do banco', () => {
    const config = normalizarConfiguracoes({
      links: { painel: 'https://studioaudax.com.br/painel', avaliacao: '' },
      avaliacao: { ativa: true, link: 'https://avalia.exemplo/x', mensagem: 'Opine' },
      notificacoes: { confirmacaoCliente: false },
      clube: { beneficios: { cabelo: ['Corte mensal', '  '] } },
      ia: { maxSugestoes: 3, botoesInterativos: true, nomeAtendente: 'Ana' },
    })
    expect(config.links.painel).toBe('https://studioaudax.com.br/painel')
    expect(config.avaliacao.link).toBe('https://avalia.exemplo/x')
    expect(config.notificacoes.confirmacaoCliente).toBe(false)
    expect(config.notificacoes.posAtendimento).toBe(true)
    expect(config.clube.beneficios.cabelo).toEqual(['Corte mensal'])
    expect(config.ia.maxSugestoes).toBe(3)
  })

  it('entrada ausente, vazia ou bizarra devolve o padrão', () => {
    for (const entrada of [null, undefined, 0, 'texto', [], {}]) {
      expect(normalizarConfiguracoes(entrada)).toEqual(CONFIG_PADRAO)
    }
  })

  it('número fora de faixa cai no padrão (não vira 0 sem querer)', () => {
    expect(normalizarConfiguracoes({ ia: { maxSugestoes: 99 } }).ia.maxSugestoes).toBe(2)
    expect(normalizarConfiguracoes({ ia: { maxSugestoes: -5 } }).ia.maxSugestoes).toBe(2)
    expect(normalizarConfiguracoes({ ia: { maxSugestoes: 3 } }).ia.maxSugestoes).toBe(3)
  })

  it('padrão não promete benefício nem link de avaliação', () => {
    expect(CONFIG_PADRAO.clube.beneficios).toEqual({})
    expect(CONFIG_PADRAO.avaliacao.link).toBe('')
    expect(CONFIG_PADRAO.avaliacao.ativa).toBe(false)
  })

  it('link malicioso é apagado, não propagado', () => {
    const config = normalizarConfiguracoes({
      links: { painel: 'javascript:alert(1)' },
      avaliacao: { link: 'javascript:alert(2)' },
    })
    expect(config.links.painel).toBe('')
    expect(config.avaliacao.link).toBe('')
  })

  it('benefício que não é texto é ignorado', () => {
    const config = normalizarConfiguracoes({
      clube: { beneficios: { cabelo: [1, null, { a: 1 }, 'ok'], barba: 'não é lista' } },
    })
    expect(config.clube.beneficios.cabelo).toEqual(['ok'])
    expect(config.clube.beneficios.barba).toBeUndefined()
  })
})

describe('problemaNaConfig', () => {
  it('aceita a configuração padrão', () => {
    for (const chave of CHAVES_CONFIG) {
      expect(problemaNaConfig(chave, valorDaChave(chave, CONFIG_PADRAO))).toBeNull()
    }
  })

  it('recusa link inválido', () => {
    expect(problemaNaConfig('links', { painel: 'javascript:alert(1)' })).toBe('Link inválido.')
    expect(problemaNaConfig('avaliacao', { link: 'ftp://x' })).toBe('Link inválido.')
  })

  it('recusa mensagem de avaliação gigante ou de tipo errado', () => {
    expect(problemaNaConfig('avaliacao', { mensagem: 'x'.repeat(700) })).toMatch(/grande demais/)
    expect(problemaNaConfig('avaliacao', { mensagem: 42 })).toBe('Mensagem de avaliação inválida.')
  })

  it('recusa valor que não é objeto', () => {
    expect(problemaNaConfig('ia', null)).toBe('Configuração inválida.')
    expect(problemaNaConfig('ia', 'texto')).toBe('Configuração inválida.')
    expect(problemaNaConfig('ia', [])).toBe('Configuração inválida.')
  })
})

describe('valorDaChave', () => {
  it('devolve o bloco exato da chave, sem as outras', () => {
    const dados = {
      ...CONFIG_PADRAO,
      ia: { ...CONFIG_PADRAO.ia, maxSugestoes: 1 },
    }
    expect(valorDaChave('ia', dados)).toEqual({
      maxSugestoes: 1,
      botoesInterativos: false,
      nomeAtendente: 'Audax',
    })
    for (const chave of CHAVES_CONFIG) {
      const valor = valorDaChave(chave, dados)
      expect(Object.keys(valor).sort()).toEqual(Object.keys(dados[chave]).sort())
    }
  })

  it('não compartilha referência com o estado', () => {
    const dados = CONFIG_PADRAO
    const valor = valorDaChave('links', dados) as { painel: string }
    valor.painel = 'https://alterado'
    expect(dados.links.painel).toBe('')
  })
})

describe('tipos', () => {
  it('toda chave de ChaveConfig está em CHAVES_CONFIG', () => {
    const chaves: ChaveConfig[] = [
      'links',
      'avaliacao',
      'notificacoes',
      'clube',
      'ia',
      'barbearia',
    ]
    expect(chaves).toEqual(CHAVES_CONFIG)
  })
})
