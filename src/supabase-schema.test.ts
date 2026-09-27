// Schema do Supabase × código do app. O C3 nasceu de um drift aqui: a
// migration 002 descreve uma base nova, mas a estrutura preliminar
// (`supabase/schema.sql`) criava as mesmas tabelas em outro formato e o app
// passava a gravar em colunas inexistentes e a falhar em `dados not null`.
// Estes testes travam as garantias que a migration 004 precisa manter.
import { describe, expect, it } from 'vitest'

// `?raw` traz o conteúdo como texto (sem executar e sem `node:fs`).
const scripts = import.meta.glob('../supabase/**/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const codigo = import.meta.glob(
  [
    '../src/services/supabase/profissionais.ts',
    '../src/services/supabase/servicos.ts',
    '../src/services/supabase/comissoes.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const sql = (caminho: string): string => scripts[caminho]

/** Comandos SQL: sem comentários, um por `;`, com espaços normalizados. */
function comandos(texto: string): string[] {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .split(';')
    .map((comando) => comando.replace(/\s+/g, ' ').trim())
    .filter((comando) => comando.length > 0)
}

/** Coluna não é restrição de tabela: `primary key (...)`, `unique`, `check`... */
const NAO_E_COLUNA = /^(primary|unique|check|constraint|foreign)\b/

type Declaracoes = {
  /** o script cria a tabela (`create table`) ou só a completa (`alter table`) */
  cria: boolean
  colunas: Array<[coluna: string, comando: string]>
}

/**
 * Colunas declaradas de uma tabela, por script: `create table` +
 * `alter table ... add column`, com o comando que declara cada coluna.
 */
function declaracoesPorScript(tabela: string): Map<string, Declaracoes> {
  const porScript = new Map<string, Declaracoes>()
  for (const [caminho, texto] of Object.entries(scripts)) {
    const declaracoes: Declaracoes = { cria: false, colunas: [] }
    const bloco = new RegExp(
      `create table if not exists (?:public\\.)?${tabela}\\s*\\(([\\s\\S]*?)\\n\\);`,
      'gi',
    )
    for (const achado of texto.matchAll(bloco)) {
      declaracoes.cria = true
      for (const linha of achado[1].split('\n')) {
        const comando = linha.replace(/--[^\n]*/g, ' ').trim()
        if (comando.length === 0 || NAO_E_COLUNA.test(comando)) continue
        declaracoes.colunas.push([
          comando.split(/\s+/)[0].replace(/^["`]|["`]$/g, ''),
          comando,
        ])
      }
    }
    const addColumn = new RegExp(
      `alter table (?:public\\.)?${tabela}\\s+add column if not exists (\\w+)([^\\n]*)`,
      'gi',
    )
    for (const achado of texto.matchAll(addColumn)) {
      declaracoes.colunas.push([achado[1], `${achado[0]};`])
    }
    if (declaracoes.colunas.length > 0) porScript.set(caminho, declaracoes)
  }
  return porScript
}

/**
 * Colunas declaradas de uma tabela em qualquer script (união). A coluna
 * guarda os comandos que a declaram — mais de um quando o schema.sql e as
 * migrations divergem entre si, que é o drift que o C3 elimina.
 */
function colunasDeclaradas(tabela: string): Map<string, string[]> {
  const colunas = new Map<string, string[]>()
  for (const { colunas: declaracoes } of declaracoesPorScript(tabela).values()) {
    for (const [coluna, comando] of declaracoes) {
      const lista = colunas.get(coluna) ?? []
      lista.push(comando)
      colunas.set(coluna, lista)
    }
  }
  return colunas
}

/** Colunas que o app lê do Supabase (tipo de linha do repositório). */
function camposLidosDoApp(chave: string, tipo: string): string[] {
  const texto = Object.entries(codigo).find(([caminho]) =>
    caminho.endsWith(chave),
  )?.[1]
  if (!texto) throw new Error(`repositório ${chave} não encontrado`)
  const bloco = new RegExp(`type ${tipo} = \\{([\\s\\S]*?)\\n\\}`).exec(texto)
  if (!bloco) throw new Error(`tipo ${tipo} não encontrado em ${chave}`)
  return [...bloco[1].matchAll(/^\s*(\w+):/gm)].map((achado) => achado[1])
}

describe('Supabase — migrations', () => {
  it('existe a migration de compatibilidade de profissionais/serviços', () => {
    const nomes = Object.keys(scripts)
      .filter((caminho) => caminho.includes('/migrations/'))
      .sort()
    expect(nomes).toEqual([
      '../supabase/migrations/001_perfis.sql',
      '../supabase/migrations/002_profissionais_servicos.sql',
      '../supabase/migrations/003_clientes.sql',
      '../supabase/migrations/004_profissionais_servicos_compat.sql',
      '../supabase/migrations/005_caixa.sql',
      '../supabase/migrations/006_produtos_estoque.sql',
      '../supabase/migrations/007_agenda.sql',
      '../supabase/migrations/008_comissoes.sql',
    ])
  })

  it('nenhum script apaga dado, derruba tabela ou remove coluna', () => {
    const destrutivo = /\b(drop\s+table|drop\s+column|truncate|delete\s+from)\b/i
    for (const [caminho, texto] of Object.entries(scripts)) {
      const achados = comandos(texto).filter((comando) =>
        destrutivo.test(comando),
      )
      expect(achados, `${caminho} não pode apagar dado`).toEqual([])
    }
  })

  it('tudo é idempotente (create table/create index/add column com if not exists)', () => {
    for (const [caminho, texto] of Object.entries(scripts)) {
      for (const comando of comandos(texto)) {
        if (/^create\s+table/i.test(comando)) {
          expect(comando, caminho).toMatch(/create table if not exists/i)
        }
        if (/^create\s+(unique\s+)?index/i.test(comando)) {
          expect(comando, caminho).toMatch(
            /create (unique )?index if not exists/i,
          )
        }
        if (/add column/i.test(comando)) {
          expect(comando, caminho).toMatch(/add column if not exists/i)
        }
      }
    }
  })

  it('coluna nova sempre tem default ou é anulável (linha existente continua válida)', () => {
    for (const [caminho, texto] of Object.entries(scripts)) {
      for (const comando of comandos(texto).filter((c) =>
        /add column/i.test(c),
      )) {
        const invalido = /not\s+null/i.test(comando) && !/default/i.test(comando)
        expect(
          invalido,
          `${caminho}: "${comando}" — not null sem default quebra linha existente`,
        ).toBe(false)
      }
    }
  })

  it('relaxar `dados` só acontece guardado por verificação de existência', () => {
    for (const [caminho, texto] of Object.entries(scripts)) {
      if (!/drop not null/i.test(texto)) continue
      expect(texto, caminho).toMatch(/information_schema\.columns/)
      const tabelas = [...texto.matchAll(/table_name = '(\w+)'/g)].map(
        (achado) => achado[1],
      )
      expect(tabelas.length, caminho).toBeGreaterThan(0)
      for (const tabela of tabelas) {
        expect(texto, caminho).toMatch(
          new RegExp(
            `alter table (?:public\\.)?${tabela} alter column dados drop not null`,
          ),
        )
      }
    }
  })
})

describe('Supabase — consistência entre código e migration', () => {
  it('nenhum script cria profissionais/serviços sem as colunas que o app usa', () => {
    // É o C3: `supabase/schema.sql` criava as duas tabelas sem telefone/
    // e-mail/foto (profissionais) e sem os carimbos de tempo (serviços), e o
    // app grava essas colunas. Se qualquer script divergir de novo, a base
    // criada por ele quebra a escrita. `clientes` fica de fora porque a
    // 003 já trata a versão preliminar com `add column if not exists`.
    const usadasPeloApp: Record<string, string[]> = {
      profissionais: camposLidosDoApp('profissionais.ts', 'ProfissionalRow'),
      servicos: camposLidosDoApp('servicos.ts', 'ServicoRow'),
    }
    for (const tabela of ['profissionais', 'servicos'] as const) {
      const criadores = [...declaracoesPorScript(tabela)].filter(
        ([, declaracoes]) => declaracoes.cria,
      )
      expect(criadores.length, tabela).toBeGreaterThan(0)
      for (const [caminho, { colunas }] of criadores) {
        const nomes = new Set(colunas.map(([coluna]) => coluna))
        expect(
          usadasPeloApp[tabela].filter((campo) => !nomes.has(campo)),
          `${caminho} cria ${tabela} sem as colunas usadas pelo app`,
        ).toEqual([])
      }
    }
  })

  it('toda coluna lida por Profissionais/Serviços existe no schema', () => {
    const declaradas = {
      profissionais: colunasDeclaradas('profissionais'),
      servicos: colunasDeclaradas('servicos'),
    }
    const lidos = {
      profissionais: camposLidosDoApp('profissionais.ts', 'ProfissionalRow'),
      servicos: camposLidosDoApp('servicos.ts', 'ServicoRow'),
    }
    for (const tabela of ['profissionais', 'servicos'] as const) {
      for (const campo of lidos[tabela]) {
        expect(
          declaradas[tabela].has(campo),
          `${tabela}.${campo} é lido pelo app e não existe no schema`,
        ).toBe(true)
      }
    }
  })

  it('colunas em que o app se apoia no default do banco têm default', () => {
    // `criar*` não envia ativo/criado_em/atualizado_em: sem default, o app
    // gravaria nulo (foi o que a coluna criado_em sem default fazia).
    for (const tabela of ['profissionais', 'servicos', 'clientes']) {
      const declaradas = colunasDeclaradas(tabela)
      for (const coluna of ['ativo', 'criado_em', 'atualizado_em']) {
        const comandos = declaradas.get(coluna)
        expect(comandos, `${tabela}.${coluna} não é declarada`).toBeTruthy()
        expect(
          (comandos ?? []).some((comando) => /default/i.test(comando)),
          `${tabela}.${coluna} precisa de default no banco`,
        ).toBe(true)
      }
    }
  })

  it('profissionais tem carimbo de edição igual a serviços e clientes', () => {
    // o desempate de conflito na carga dependia de uma coluna que só existia
    // em `servicos`/`clientes`
    for (const tabela of ['profissionais', 'servicos', 'clientes']) {
      expect(
        colunasDeclaradas(tabela).has('atualizado_em'),
        `${tabela} sem carimbo de edição`,
      ).toBe(true)
    }
  })

  it('a 004 completa exatamente as colunas que a versão preliminar perdeu', () => {
    const texto = sql('../supabase/migrations/004_profissionais_servicos_compat.sql')
    const completa = (tabela: string, coluna: string) =>
      new RegExp(
        `alter table (?:public\\.)?${tabela}\\s+add column if not exists ${coluna}\\b`,
        'i',
      ).test(texto)
    for (const coluna of ['telefone', 'email', 'foto', 'atualizado_em']) {
      expect(completa('profissionais', coluna), coluna).toBe(true)
    }
    for (const coluna of ['criado_em', 'atualizado_em']) {
      expect(completa('servicos', coluna), coluna).toBe(true)
    }
    // criado_em existia, mas sem default — a escrita do app depende dele
    expect(texto).toMatch(/alter column criado_em set default now\(\)/i)
    for (const tabela of ['profissionais', 'servicos']) {
      expect(texto, tabela).toMatch(
        new RegExp(`public\\.${tabela} alter column dados drop not null`),
      )
    }
  })
})

describe('Supabase — comissões (a 008 espelha o que o app grava)', () => {
  it('toda coluna lida pelo repositório de comissões existe no schema', () => {
    // A estrutura preliminar (`supabase/schema.sql`) não tinha `acao` na
    // auditoria nem os carimbos de sincronização. Se a 008 parar de completar
    // alguma coluna lida pelo app, a leitura quebra em produção.
    const declaradas = colunasDeclaradas('comissoes_auditoria')
    expect(declaradas.has('acao')).toBe(true)
    const lidos = camposLidosDoApp('comissoes.ts', 'AuditoriaRow')
    for (const campo of lidos) {
      expect(
        declaradas.has(campo),
        `comissoes_auditoria.${campo} é lido pelo app e não existe no schema`,
      ).toBe(true)
    }
    for (const [tabela, tipo] of [
      ['comissoes_configs', 'ConfigRow'],
      ['comissoes_fechamentos', 'FechamentoRow'],
    ] as const) {
      for (const campo of camposLidosDoApp('comissoes.ts', tipo)) {
        expect(
          colunasDeclaradas(tabela).has(campo),
          `${tabela}.${campo} é lido pelo app e não existe no schema`,
        ).toBe(true)
      }
    }
  })

  it('fechamento e auditoria têm a chave id do app (reenvio é o mesmo registro)', () => {
    // A comissão não pode ser paga duas vezes: o upsert do reenvio depende da
    // chave primária ser o MESMO id gerado pelo app.
    for (const tabela of ['comissoes_fechamentos', 'comissoes_auditoria']) {
      const cria = [...declaracoesPorScript(tabela)].find(
        ([, declaracoes]) => declaracoes.cria,
      )
      expect(cria, tabela).toBeTruthy()
      expect(
        (cria?.[1].colunas ?? [])
          .map(([coluna]) => coluna)
          .includes('id'),
        `${tabela} sem id do app`,
      ).toBe(true)
    }
  })

  it('a configuração é chaveada por profissional_id (uma config por profissional)', () => {
    const texto = sql('../supabase/migrations/008_comissoes.sql')
    expect(texto).toMatch(
      /profissional_id text primary key references public\.profissionais/i,
    )
  })

  it('a 008 completa as colunas ausentes na estrutura preliminar', () => {
    const texto = sql('../supabase/migrations/008_comissoes.sql')
    for (const [tabela, coluna] of [
      ['comissoes_auditoria', 'acao'],
      ['comissoes_configs', 'atualizado_em'],
      ['comissoes_fechamentos', 'atualizado_em'],
    ] as const) {
      expect(
        new RegExp(
          `alter table public\\.${tabela}\\s+add column if not exists ${coluna}\\b`,
          'i',
        ).test(texto),
        `${tabela}.${coluna} não é completada pela 008`,
      ).toBe(true)
    }
    for (const tabela of [
      'comissoes_configs',
      'comissoes_fechamentos',
      'comissoes_auditoria',
    ]) {
      expect(texto).toMatch(
        new RegExp(`public\\.${tabela} alter column dados drop not null`),
      )
    }
  })
})
