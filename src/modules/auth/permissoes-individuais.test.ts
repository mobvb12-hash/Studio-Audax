// Permissões individuais — os 6 cenários de segurança da camada da UI.
//
// A promessa testada aqui: com ZERO exceção gravada o comportamento é
// EXATAMENTE o de antes (nenhuma regressão para quem ainda não usa a
// feature), e com exceção gravada ela manda em UMA ação — nunca cria acesso
// sem papel e nunca passa por cima do dono.
import { describe, expect, it } from 'vitest'
import type { AcaoPermissao } from './permissoes'
import {
  podeAcessarPagina,
  podeAcessarPaginaEfetiva,
  permissoesDoPapel,
  papelTemPermissao,
  usuarioTemPermissao,
  usuarioTemPermissaoEfetiva,
} from './permissoes'
import type { PapelPerfil } from './tipos'

const PAPEIS: PapelPerfil[] = ['dono', 'admin', 'gerente', 'recepcao', 'profissional']

const AMOSTRA_ACOES: AcaoPermissao[] = [
  'caixa:ver',
  'caixa:fechar',
  'caixa:estornar',
  'clientes:excluir',
  'servicos:criar',
  'agenda:ver_todas',
  'config:permissoes_ver',
  'relatorios:ver',
]

const PAGINAS = ['painel', 'agenda', 'caixa', 'clientes', 'configuracoes', 'usuarios', 'relatorios']

describe('1) sem exceção gravada — nada muda (regressão zero)', () => {
  it('a permissão efetiva é idêntica à do papel para toda a amostra', () => {
    for (const papel of PAPEIS) {
      for (const acao of AMOSTRA_ACOES) {
        expect(
          usuarioTemPermissaoEfetiva(papel, acao),
          `${papel} + ${acao}`,
        ).toBe(usuarioTemPermissao(papel, acao))
      }
    }
  })

  it('objeto de exceções vazio também não muda nada', () => {
    for (const papel of PAPEIS) {
      for (const acao of AMOSTRA_ACOES) {
        expect(usuarioTemPermissaoEfetiva(papel, acao, {})).toBe(
          usuarioTemPermissao(papel, acao),
        )
      }
    }
  })

  it('o acesso às páginas continua o mesmo', () => {
    for (const papel of PAPEIS) {
      for (const pagina of PAGINAS) {
        expect(podeAcessarPaginaEfetiva(papel, pagina), `${papel} + ${pagina}`).toBe(
          podeAcessarPagina(papel, pagina),
        )
      }
    }
  })

  it('todas as ações seguem o papel: nenhuma começa negada sem exceção', () => {
    const todas = permissoesDoPapel('admin')
    for (const acao of todas) {
      expect(usuarioTemPermissaoEfetiva('recepcao', acao)).toBe(
        papelTemPermissao('recepcao', acao),
      )
    }
  })
})

describe('2) revogar — exceção false nega mesmo que o papel permita', () => {
  it('recepção sem caixa:fechar mesmo tendo o papel', () => {
    expect(papelTemPermissao('recepcao', 'caixa:fechar')).toBe(true)
    expect(
      usuarioTemPermissaoEfetiva('recepcao', 'caixa:fechar', { 'caixa:fechar': false }),
    ).toBe(false)
  })

  it('admin sem clientes:excluir mesmo sendo o papel mais forte', () => {
    expect(papelTemPermissao('admin', 'clientes:excluir')).toBe(true)
    expect(
      usuarioTemPermissaoEfetiva('admin', 'clientes:excluir', { 'clientes:excluir': false }),
    ).toBe(false)
  })

  it('a revogação de UMA ação não derruba as vizinhas', () => {
    const excecao = { 'caixa:fechar': false }
    expect(usuarioTemPermissaoEfetiva('recepcao', 'caixa:fechar', excecao)).toBe(false)
    expect(usuarioTemPermissaoEfetiva('recepcao', 'caixa:ver', excecao)).toBe(true)
    expect(usuarioTemPermissaoEfetiva('recepcao', 'caixa:lancar_receita', excecao)).toBe(true)
  })

  it('a página só cai quando a ação que a abre é revogada', () => {
    expect(podeAcessarPaginaEfetiva('recepcao', 'caixa', { 'caixa:ver': false })).toBe(false)
    expect(podeAcessarPaginaEfetiva('recepcao', 'caixa', { 'caixa:fechar': false })).toBe(true)
    expect(podeAcessarPaginaEfetiva('recepcao', 'clientes', { 'caixa:ver': false })).toBe(true)
  })
})

describe('3) conceder — exceção true libera mesmo que o papel negue', () => {
  it('profissional pode fechar o caixa se o admin conceder', () => {
    expect(papelTemPermissao('profissional', 'caixa:fechar')).toBe(false)
    expect(
      usuarioTemPermissaoEfetiva('profissional', 'caixa:fechar', { 'caixa:fechar': true }),
    ).toBe(true)
  })

  it('recepção gerencia permissões se concedido', () => {
    expect(papelTemPermissao('recepcao', 'config:permissoes_ver')).toBe(false)
    expect(
      usuarioTemPermissaoEfetiva('recepcao', 'config:permissoes_ver', {
        'config:permissoes_ver': true,
      }),
    ).toBe(true)
  })

  it('a concessão abre a página correspondente', () => {
    expect(podeAcessarPaginaEfetiva('profissional', 'usuarios')).toBe(false)
    expect(
      podeAcessarPaginaEfetiva('profissional', 'usuarios', { 'config:permissoes_ver': true }),
    ).toBe(true)
  })
})

describe('4) dono é invariável — exceção nenhuma limita', () => {
  it('dono mantém tudo marcado mesmo com revogações explícitas', () => {
    for (const acao of AMOSTRA_ACOES) {
      expect(
        usuarioTemPermissaoEfetiva('dono', acao, { [acao]: false }),
        `dono + ${acao}`,
      ).toBe(true)
    }
  })

  it('dono continua acessando qualquer página sob revogação', () => {
    const bloqueio = Object.fromEntries(
      AMOSTRA_ACOES.map((acao) => [acao, false] as const),
    )
    for (const pagina of PAGINAS) {
      expect(podeAcessarPaginaEfetiva('dono', pagina, bloqueio), pagina).toBe(true)
    }
  })
})

describe('5) exceção nunca cria acesso sem sessão/papel', () => {
  it('sem papel continua negando, mesmo com concessão gravada', () => {
    expect(
      usuarioTemPermissaoEfetiva(null, 'caixa:ver', { 'caixa:ver': true }),
    ).toBe(false)
    expect(
      usuarioTemPermissaoEfetiva(undefined, 'config:permissoes_ver', {
        'config:permissoes_ver': true,
      }),
    ).toBe(false)
    expect(podeAcessarPaginaEfetiva(null, 'caixa', { 'caixa:ver': true })).toBe(false)
    expect(podeAcessarPaginaEfetiva(null, 'usuarios', { 'config:permissoes_ver': true })).toBe(false)
  })

  it('exceção em ação de outro módulo não abre página alheia', () => {
    expect(
      podeAcessarPaginaEfetiva('profissional', 'usuarios', { 'agenda:ver_todas': true }),
    ).toBe(false)
  })
})

describe('6) menu e rota leem a MESMA regra', () => {
  // Se um dos dois voltar a chamar a regra do papel direto, o item some da
  // barra mas a URL digitada continua abrindo — exatamente o furo que esta
  // camada existe para fechar.
  const fontes = import.meta.glob(
    ['../../App.tsx', '../../layouts/AppLayout.tsx'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>

  it('App (rota) e AppLayout (menu) usam o hook de permissão efetiva', () => {
    const caminhos = Object.keys(fontes)
    expect(caminhos).toHaveLength(2)
    for (const [caminho, texto] of Object.entries(fontes)) {
      expect(texto, caminho).toContain('usePodeAcessarPagina')
      expect(texto, `${caminho} não pode chamar a regra do papel direto`).not.toContain(
        'podeAcessarPagina(',
      )
    }
  })

  it('nenhuma página é liberada sem restrição quando o papel não existe', () => {
    expect(podeAcessarPaginaEfetiva(null, 'usuarios')).toBe(false)
    expect(podeAcessarPagina(null, 'usuarios')).toBe(false)
  })
})
