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
    '../src/services/supabase/clube.ts',
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
      '../supabase/migrations/009_clube.sql',
      '../supabase/migrations/010_caixa_fechamento_conta.sql',
      '../supabase/migrations/011_caixa_valores_pagamento.sql',
      '../supabase/migrations/012_agendamento_publico.sql',
      '../supabase/migrations/013_caixa_servicos_profissional.sql',
      '../supabase/migrations/014_rls_role_based.sql',
      '../supabase/migrations/015_ia_agendamentos_whatsapp.sql',
      '../supabase/migrations/016_ia_contexto_whatsapp.sql',
      '../supabase/migrations/017_rls_hardening.sql',
      '../supabase/migrations/018_painel_cliente.sql',
      '../supabase/migrations/019_painel_agendamento.sql',
      '../supabase/migrations/020_painel_clube.sql',
      '../supabase/migrations/021_agenda_lock_concorrencia.sql',
      '../supabase/migrations/022_configuracoes_e_auditoria_ia.sql',
      '../supabase/migrations/023_identidade_cliente_e_clube.sql',
      '../supabase/migrations/024_notificacoes_whatsapp.sql',
      '../supabase/migrations/025_catalogo_complementos.sql',
      '../supabase/migrations/026_notificacao_agendamento_seguro.sql',
      '../supabase/migrations/027_barbearia_e_complementos_publicos.sql',
      '../supabase/migrations/028_clube_producao_e_pote.sql',
  '../supabase/migrations/029_clube_pote_papeis.sql',
  '../supabase/migrations/030_pote_integral_e_comissao.sql',
  '../supabase/migrations/031_comissao_somente_do_dono.sql',
  '../supabase/migrations/032_permissoes_public_e_typo_calcular.sql',
  '../supabase/migrations/033_producao_total_do_snapshot.sql',
  '../supabase/migrations/034_clube_beneficios_publicos.sql',
  '../supabase/migrations/035_clube_categorias_e_beneficios.sql',
  '../supabase/migrations/036_vitrine_publica_e_whatsapp.sql',
  '../supabase/migrations/037_confirmacao_whatsapp_publico.sql',
  '../supabase/migrations/038_config_destaques.sql',
  '../supabase/migrations/039_vitrine_galeria_e_categoria.sql',
  '../supabase/migrations/040_expediente_por_dia.sql',
])
  })

  it('nenhum script apaga dado, derruba tabela ou remove coluna', () => {
    // Exceção da 016: a limpeza de TTL das tabelas EFÊMERAS da IA do
    // WhatsApp (contexto 30 min / dedup 15 min) apaga somente linhas
    // próprias — sem isso as tabelas cresceriam sem fim. Qualquer outro
    // delete/drop/truncate continua proibido em qualquer script.
    // Exceção da 022: a MESMA natureza para `ia_eventos`, que é registro
    // operacional da IA com retenção de 180 dias (janela de análise do
    // aprendizado). Nenhuma tabela de negócio entra nesta lista — e a
    // exceção continua sendo por NOME de tabela, não por trecho genérico.
    const limpezaTtl =
      /\bdelete\s+from\s+(?:public\.)?(?:ia_contexto_whatsapp|ia_mensagens_whatsapp|ia_eventos)\b/i
    const destrutivo = /\b(drop\s+table|drop\s+column|truncate|delete\s+from)\b/i
    for (const [caminho, texto] of Object.entries(scripts)) {
      const achados = comandos(texto).filter(
        (comando) => destrutivo.test(comando) && !limpezaTtl.test(comando),
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

describe('Supabase — Audax Club (a 009 espelha o que o app grava)', () => {
  it('toda coluna lida pelo repositório do clube existe no schema', () => {
    for (const [tabela, tipo] of [
      ['clube_assinaturas', 'AssinaturaRow'],
      ['clube_pagamentos', 'PagamentoRow'],
    ] as const) {
      for (const campo of camposLidosDoApp('clube.ts', tipo)) {
        expect(
          colunasDeclaradas(tabela).has(campo),
          `${tabela}.${campo} é lido pelo app e não existe no schema`,
        ).toBe(true)
      }
    }
  })

  it('assinatura e pagamento têm a chave id do app (reenvio é o mesmo registro)', () => {
    // Nenhuma mensalidade pode entrar duas vezes: o upsert do reenvio depende
    // da chave primária ser o MESMO id gerado pelo app.
    for (const tabela of ['clube_assinaturas', 'clube_pagamentos']) {
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

  it('status da assinatura não vira coluna (é sempre derivado)', () => {
    // `statusAssinatura()` deriva de `proximo_vencimento` + `cancelada`.
    // Guardar status no banco criaria a chance de estado financeiro
    // inconsistente entre dispositivos.
    for (const tabela of ['clube_assinaturas', 'clube_pagamentos']) {
      const declaradas = colunasDeclaradas(tabela)
      for (const coluna of ['status', 'status_assinatura']) {
        expect(declaradas.has(coluna), `${tabela}.${coluna} não pode existir`).toBe(
          false,
        )
      }
    }
  })

  it('a trava de cobrança duplicada NÃO vira índice único no banco', () => {
    // O app permite re-cobrar um ciclo cujo lançamento do Caixa foi estornado
    // (o dinheiro voltou). Um unique em (assinatura, vencimento) recusaria
    // esse caso legítimo, então a trava continua no app.
    const texto = sql('../supabase/migrations/009_clube.sql')
    expect(texto).not.toMatch(/unique/i)
  })

  it('a 009 completa as colunas ausentes na estrutura preliminar', () => {
    const texto = sql('../supabase/migrations/009_clube.sql')
    for (const [tabela, coluna] of [
      ['clube_assinaturas', 'atualizado_em'],
      ['clube_pagamentos', 'criado_em'],
    ] as const) {
      expect(
        new RegExp(
          `alter table public\\.${tabela}\\s+add column if not exists ${coluna}\\b`,
          'i',
        ).test(texto),
        `${tabela}.${coluna} não é completada pela 009`,
      ).toBe(true)
    }
    for (const tabela of ['clube_assinaturas', 'clube_pagamentos']) {
      expect(texto).toMatch(
        new RegExp(`public\\.${tabela} alter column dados drop not null`),
      )
      // preço dos planos e regra comercial continuam no app: a migration não
      // inventa tabela de planos nem valor de mensalidade
      expect(texto, tabela).not.toMatch(/create table if not exists public\.clube_planos/i)
    }
  })

  it('a referência ao Caixa do pagamento não é foreign key (o lançamento pode estar pendente)', () => {
    // O app grava o pagamento depois do lançamento do Caixa; exigir a
    // referência no banco travaria o reenvio de um pagamento cujo lançamento
    // ainda está pendente de envio.
    const texto = sql('../supabase/migrations/009_clube.sql')
    const bloco = /create table if not exists public\.clube_pagamentos \(([\s\S]*?)\n\);/.exec(
      texto,
    )
    expect(bloco).toBeTruthy()
    const linhas = (bloco?.[1] ?? '').split('\n')
    const lancamento = linhas.find((linha) => linha.trim().startsWith('caixa_lancamento_id'))
    expect(lancamento, 'caixa_lancamento_id não declarado').toBeTruthy()
    expect(lancamento).not.toMatch(/references/i)
  })
})

describe('Supabase — painel do cliente (018)', () => {
  const texto = sql('../supabase/migrations/018_painel_cliente.sql')

  it('identidade é o vínculo autenticado — telefone nunca vira identidade única', () => {
    expect(texto).toMatch(/add column if not exists auth_user_id uuid/)
    expect(texto).toMatch(
      /create unique index if not exists idx_clientes_auth_user/,
    )
    expect(texto).toMatch(/add column if not exists cliente_id text/)
    // dois cadastros podem ter o mesmo telefone: nenhuma unique em telefone
    expect(texto).not.toMatch(/unique[^;\n]*\(.*telefone/i)
    // FK preserva histórico quando algo é apagado
    expect(texto).toMatch(/on delete set null/)
  })

  it('posse: SELECT por RLS própria e escrita só por RPC com sessão', () => {
    for (const tabela of [
      'clientes',
      'agendamentos',
      'clube_assinaturas',
      'clube_pagamentos',
    ]) {
      expect(texto, tabela).toMatch(
        new RegExp(`\\w+_select_proprio on public\\.${tabela}`),
      )
    }
    // nenhuma policy de escrita para o cliente — escrita é só via RPC
    expect(texto).not.toMatch(/_insert_proprio|_update_proprio|_delete_proprio/)
    // toda RPC do painel recusa sessão ausente e é revogada do anon
    expect(texto).toMatch(/if v_uid is null then/)
    expect(texto).toMatch(
      /revoke execute on function public\.painel_cliente_vincular\(text, text, text\)\s+from public, anon/,
    )
    expect(texto).toMatch(
      /revoke execute on function public\.painel_cliente_atualizar\(text, text, text, text\)\s+from public, anon/,
    )
  })

  it('vínculo devolve só estados — nunca dados de outro cadastro', () => {
    expect(texto).toMatch(
      /json_build_object\('estado', 'ambiguo'\)/,
    )
    expect(texto).toMatch(
      /json_build_object\('estado', 'precisa_dados'\)/,
    )
    expect(texto).toMatch(
      /json_build_object\('estado', 'nao_confirmado'\)/,
    )
    // histórico só entra quando o par nome+telefone é único entre cadastros
    expect(texto).toMatch(/and not exists \(\s*select 1 from public\.clientes c2/)
  })

  it('escalação em perfis fechada: escrita com sessão exige admin', () => {
    expect(texto).toMatch(
      /create or replace function public\.perfis_guardar_papel/,
    )
    expect(texto).toMatch(
      /if public\.current_user_is_admin\(\) is not true then/,
    )
    expect(texto).toMatch(/perfis: somente admin cria ou altera perfis/)
    // o ramo que deixava papel não-privilegiado inserir a própria linha saiu
    expect(texto).not.toMatch(/papel in \('dono'/)
  })
})

describe('Supabase — agendamento pelo painel (019)', () => {
  const texto = sql('../supabase/migrations/019_painel_agendamento.sql')

  it('complemento é coluna nova com default (linha existente continua válida)', () => {
    expect(texto).toMatch(
      /add column if not exists complementos text\[\] not null default '\{\}'/,
    )
    // config aponta para serviços — nenhuma cópia de preço/duração na coluna
    expect(texto).toMatch(/complementos text\[\]/)
    expect(texto).not.toMatch(/complementos.*numeric/i)
  })

  it('criação envolve a RPC oficial da 012 e o vínculo com a sessão', () => {
    expect(texto).toMatch(/select public\.agendamento_publico_criar\(/)
    // duração somada + cliente_id aplicados na MESMA linha da Agenda
    expect(texto).toMatch(/set duracao_min = v_dur/)
    expect(texto).toMatch(/cliente_id = v_cad\.id/)
    // complemento fora da configuração do serviço base é recusado
    expect(texto).toMatch(
      /Complemento indisponível para este serviço\./,
    )
    // nunca escreve nome/telefone do cliente: vêm do cadastro vinculado
    expect(texto).toMatch(/select \* into v_cad from public\.clientes where auth_user_id/)
    expect(texto).not.toMatch(/p_cliente text/)
  })

  it('RPC só para sessão autenticada (anon/public fora)', () => {
    expect(texto).toMatch(/if v_uid is null then/)
    expect(texto).toMatch(/security definer/)
    expect(texto).toMatch(/set search_path = public/)
    expect(texto).toMatch(
      /grant execute on function public\.painel_agendamento_criar\(\s*text, text, date, text, text, text\[\]\s*\) to authenticated/,
    )
    expect(texto).toMatch(
      /revoke execute on function public\.painel_agendamento_criar\(\s*text, text, date, text, text, text\[\]\s*\) from public, anon/,
    )
  })

  it('cancelar/remarcar envolvem as RPCs oficiais da 015 com posse antes', () => {
    // nada de lógica comercial nova: só wrap das funções já validadas
    expect(texto).toMatch(
      /perform public\.ia_agendamento_cancelar\(p_id, v_fone\)/,
    )
    expect(texto).toMatch(/perform public\.ia_agendamento_remarcar\(/)
    // posse por cliente_id da sessão; mensagem única nunca vaza linha alheia
    expect(texto).toMatch(/and cliente_id = v_cad\.id/)
    expect(texto).toMatch(/Agendamento não encontrado\./)
    // remarcação mantém o profissional da linha (cliente só muda data/horário)
    expect(texto).toMatch(/p_id, v_fone, p_data, p_horario, v_ag\.profissional/)
    // EXECUTE só da sessão autenticada
    expect(texto).toMatch(
      /revoke execute on function public\.painel_agendamento_cancelar\(text\)\s+from public, anon/,
    )
    expect(texto).toMatch(
      /revoke execute on function public\.painel_agendamento_remarsar\(text, date, text\)\s+from public, anon/,
    )
  })
})

describe('Supabase — clube do painel (020)', () => {
  const texto = sql('../supabase/migrations/020_painel_clube.sql')

  it('é só RPC de leitura: não cria tabela nem mexe em policy do Club', () => {
    expect(texto).not.toMatch(/create table/)
    expect(texto).not.toMatch(/create policy/)
    expect(texto).not.toMatch(/alter table/)
    expect(texto).not.toMatch(/drop policy/)
  })

  it('posse: só a assinatura e os pagamentos do PRÓPRIO cliente', () => {
    expect(texto).toMatch(/a\.cliente_id = v_cli/)
    expect(texto).toMatch(/p\.cliente_id = v_cli/)
    // sem cadastro vinculado devolve null — nunca dado de terceiro
    expect(texto).toMatch(/return null;/)
    // histórico limitado aos últimos 5 pagamentos próprios
    expect(texto).toMatch(/limit 5/)
  })

  it('security definer + grants só da sessão autenticada', () => {
    expect(texto).toMatch(/if v_uid is null then/)
    expect(texto).toMatch(/security definer/)
    expect(texto).toMatch(/set search_path = public/)
    expect(texto).toMatch(
      /grant execute on function public\.painel_clube_minha\(\) to authenticated/,
    )
    expect(texto).toMatch(
      /revoke execute on function public\.painel_clube_minha\(\) from public/,
    )
    expect(texto).toMatch(
      /revoke execute on function public\.painel_clube_minha\(\) from anon/,
    )
  })
})

describe('Supabase — lock de concorrência da Agenda (021)', () => {
  const texto = sql('../supabase/migrations/021_agenda_lock_concorrencia.sql')

  it('não mexe em RLS, policies, tabelas nem dados da Agenda', () => {
    expect(texto).not.toMatch(/create policy/i)
    expect(texto).not.toMatch(/drop policy/i)
    expect(texto).not.toMatch(/alter table/i)
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/delete from/i)
    expect(texto).not.toMatch(/update public\./i)
    // migration só de estrutura: nenhum dado de teste embutido
    expect(texto).not.toMatch(/CONC TESTE|'TESTE|TESTE FASE/i)
  })

  it('usa advisory transaction lock com a chave profissional:data', () => {
    expect(texto).toMatch(/pg_advisory_xact_lock/)
    expect(texto).toMatch(
      /hashtextextended\(p_profissional \|\| ':' \|\| coalesce\(to_char\(p_data,'YYYY-MM-DD'\),''\), 0\)/,
    )
  })

  it('o trigger de sobreposição trava ANTES do EXISTS (fecha o TOCTOU)', () => {
    const corpo = texto.slice(
      texto.indexOf('create or replace function public.agendamentos_sem_sobreposicao()'),
      texto.indexOf('$$;', texto.indexOf('create or replace function public.agendamentos_sem_sobreposicao()')),
    )
    const trava = corpo.indexOf('perform public.agenda_lock_slot')
    const conflito = corpo.indexOf('if exists')
    expect(trava).toBeGreaterThan(-1)
    expect(conflito).toBeGreaterThan(-1)
    expect(trava).toBeLessThan(conflito)
  })

  it('a criação oficial trava antes do teste de conflito (mensagem amigável preservada)', () => {
    const corpo = texto.slice(
      texto.indexOf('create or replace function public.agendamento_publico_criar('),
      texto.indexOf('$$;', texto.indexOf('create or replace function public.agendamento_publico_criar(')),
    )
    const trava = corpo.indexOf('perform public.agenda_lock_slot')
    const conflito = corpo.indexOf('if exists (\n    select 1\n      from agendamentos')
    expect(trava).toBeGreaterThan(-1)
    expect(trava).toBeLessThan(conflito)
    // a frase que o cliente recebe continua a mesma de antes
    expect(corpo).toMatch(
      /raise exception 'Este horário acabou de ser ocupado\. Escolha outro\.'/,
    )
  })

  it('remarcação: trava os dois slots em ordem determinística e devolve NEW', () => {
    expect(texto).toMatch(/perform public\.agenda_lock_slots\(\s*old\.profissional, old\.data,\s*new\.profissional, new\.data\)/)
    // devolver NULL num trigger BEFORE UPDATE cancelaria a remarcação
    const corpo = texto.slice(
      texto.indexOf('create or replace function public.agendamentos_lock_remarcacao()'),
      texto.indexOf('$$;', texto.indexOf('create or replace function public.agendamentos_lock_remarcacao()')),
    )
    expect(corpo).not.toMatch(/return null;/)
    expect(corpo).toMatch(/return new;/)
  })

  it('ordena as chaves antes de travar (evita deadlock)', () => {
    expect(texto).toMatch(/if v1 > v2 then/)
    expect(texto).toMatch(/if v1 = v2 then/)
  })

  it('mantém os dois triggers instalados em agendamentos', () => {
    expect(texto).toMatch(
      /create trigger agendamentos_sem_sobreposicao\s+before insert or update on public\.agendamentos/,
    )
    expect(texto).toMatch(
      /create trigger agendamentos_lock_remarcacao\s+before update on public\.agendamentos/,
    )
  })

  it('helpers sem EXECUTE para o cliente e sem drop de função com grant', () => {
    expect(texto).toMatch(
      /revoke execute on function public\.agenda_lock_slot\(text, date\) from public, anon, authenticated/,
    )
    expect(texto).not.toMatch(/drop function/i)
  })

  it('preserva RLS e search_path das funções recriadas', () => {
    expect(texto).toMatch(/set search_path = public/)
    expect(texto).toMatch(/security definer/)
  })
})

// ============================================================================
// 026 — a falha que apagava agendamento válido
//
// Regressão do incidente de produção: `ia_notificacao_enfileirar` foi criada
// com `p_ordem smallint`, mas o trigger chamava com o literal `1` (integer).
// Como `int4 -> int2` é cast de ATRIBUIÇÃO, a resolução de funções não achava
// candidata e o trigger AFTER INSERT subia a exceção — desfazendo o agendamento
// que já tinha sido gravado.
// ============================================================================
describe('026 — notificação nunca pode derrubar o agendamento', () => {
  const texto = sql(
    '../supabase/migrations/026_notificacao_agendamento_seguro.sql',
  )

  it('usa `p_ordem integer`, a única assinatura compatível com o literal', () => {
    // A assinatura antiga (smallint) precisa sair, senão sobraria sobrecarga.
    expect(texto).toMatch(
      /drop function if exists public\.ia_notificacao_enfileirar\(\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*smallint\s*\)/,
    )
expect(texto).toMatch(
      /create or replace function public\.ia_notificacao_enfileirar\([\s\S]*?p_ordem integer default 1/,
    )
    // Sem comentários: o cabeçalho do arquivo CITA o `smallint` para explicar
    // o incidente, e essa citação não pode ser confundida com código vivo.
    expect(comandos(texto).join('\n')).not.toMatch(/p_ordem smallint/)
  })

  it('o trigger chama a porta segura, nunca a enfileiramento direto', () => {
    const corpoTrigger = texto.slice(texto.indexOf('ia_notificar_agendamento()'))
    expect(corpoTrigger).toMatch(/perform public\.ia_notificar_com_seguranca\(/)
    expect(corpoTrigger).not.toMatch(
      /perform public\.ia_notificacao_enfileirar\(/,
    )
  })

  it('a porta segura tem barreira de exceção e devolve o registro', () => {
    const corpo = texto.slice(
      texto.indexOf('create or replace function public.ia_notificar_com_seguranca'),
      texto.indexOf('-- 3) Trigger tolerante'),
    )
    // Enfileirar fica dentro de um `exception when others`…
    expect(corpo).toMatch(/exception when others then/)
    // …e a gravação da falha também tem a sua, para nunca propagar erro.
    expect(corpo.match(/exception when others then/g)?.length).toBe(2)
    // A falha é registrada para reprocessamento, com o motivo.
    expect(corpo).toMatch(/'falha'/)
    expect(corpo).toMatch(/ultimo_erro/)
  })

  it('idempotência: nada é duplicado quando o mesmo evento repete', () => {
    expect(texto.match(/on conflict \(chave\) do nothing/g)?.length).toBe(2)
  })

  it('o trigger tem barreira final e devolve o agendamento, sem abortar', () => {
    const corpo = texto.slice(
      texto.indexOf('create or replace function public.ia_notificar_agendamento'),
      texto.indexOf('-- 4) Privil'),
    )
    expect(corpo).toMatch(/exception when others then/)
    // O registro volta em TODOS os caminhos: o AFTER trigger nunca derruba.
    expect(corpo.match(/return v_ag;/g)?.length).toBe(2)
    expect(corpo).not.toMatch(/raise exception/)
  })

  it('não altera regra comercial: nem policy, nem tabela, nem trigger', () => {
    expect(texto).not.toMatch(/create policy/i)
    expect(texto).not.toMatch(/alter table/i)
    expect(texto).not.toMatch(/create trigger/i)
    expect(texto).not.toMatch(/drop table/i)
  })

  it('as funções continuam restritas ao service_role', () => {
    expect(texto).toMatch(
      /revoke execute on function public\.ia_notificar_com_seguranca\(text, text, text, text, text, text, text, text, integer\) from public, anon, authenticated/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.ia_notificar_com_seguranca\(text, text, text, text, text, text, text, text, integer\) to service_role/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.ia_notificacao_enfileirar\(text, text, text, text, text, text, integer\) to service_role/,
    )
  })
})

// ============================================================================
// 027 — barbearia oficial e agendamento público com complementos
//
// Duas garantias que a tela e a IA dependem:
//   1. os dados da casa (endereço/telefone/Instagram) são CONFIGURAÇÃO, não
//      texto no código — e o telefone nasce vazio, porque o número oficial
//      não existe em nenhuma migration deste repositório;
//   2. agendar com complemento NÃO abre uma segunda regra de agenda: a
//      função nova valida os ids contra `servicos.complementos` e delega a
//      criação para `agendamento_publico_criar`, que continua sendo a
//      autoridade sobre expediente, almoço, bloqueio, lock e conflito.
// ============================================================================
describe('027 — barbearia oficial e complementos públicos', () => {
  const texto = sql('../supabase/migrations/027_barbearia_e_complementos_publicos.sql')
  const comandosSemComentario = comandos(texto).join('\n')

  it('os dados da casa são configuração editável, com `on conflict do nothing`', () => {
    expect(texto).toMatch(
      /insert into public\.configuracoes_sistema \(chave, grupo, valor, descricao\)/,
    )
    expect(comandosSemComentario).toMatch(
      /insert into public\.configuracoes_sistema[\s\S]*'barbearia'[\s\S]*on conflict \(chave\) do nothing/,
    )
    // Endereço e Instagram vêm da tarefa; o TELEFONE nasce vazio — inventar
    // número publicaria um telefone falso em nome da casa.
    expect(texto).toMatch(/"endereco":"Rua Ecoporanga, 60/)
    expect(texto).toMatch(/"instagram":"@studioaudax__"/)
    expect(texto).toMatch(/"telefone":""/)
  })

  it('a chave entra na lista branca do validador e da porta do servidor', () => {
    expect(texto).toMatch(
      /v_chave not in \('links', 'avaliacao', 'notificacoes', 'clube', 'ia', 'barbearia'\)/,
    )
    expect(texto).toMatch(
      /ia_configuracoes_ler[\s\S]*where c\.chave in \('links', 'avaliacao', 'notificacoes', 'clube', 'ia', 'barbearia'\)/,
    )
    // Telefone é validado só pelos dígitos (10–15), como o do cliente.
    expect(texto).toMatch(/regexp_replace\(coalesce\(p_valor ->> 'telefone', ''\), '\\D', '', 'g'\)/)
  })

  it('o catálogo público devolve a barbearia no MESMO retorno (sem RPC nova)', () => {
    expect(texto).toMatch(/create or replace function public\.agendamento_publico_catalogo\(\)/)
    expect(texto).toMatch(/'barbearia', coalesce\(\(/)
    // Continua expondo os complementos por id (025) — nada foi perdido.
    expect(texto).toMatch(/'complementos', \(/)
    expect(texto).toMatch(/'profissionais', coalesce\(\(/)
  })

  it('agendar com complemento delega à criação oficial, sem reescrever a regra', () => {
    expect(texto).toMatch(
      /create or replace function public\.agendamento_publico_criar_complementos\(/,
    )
    // Complemento fora da lista oficial da casa é RECUSADO.
    expect(texto).toMatch(
      /if not \(trim\(v_item\) = any \(coalesce\(v_base\.complementos, '\{\}'::text\[\]\)\)\) then/,
    )
    // A criação continua vindo da função que já existe.
    expect(texto).toMatch(
      /select public\.agendamento_publico_criar\([\s\S]*?\) ->> 'id'/,
    )
    // E a duração total é gravada depois, como o painel já fazia.
    expect(texto).toMatch(/update public\.agendamentos\s+set duracao_min = v_dur/)
    // Nenhuma regra nova de disponibilidade: nenhuma verificação de
    // expediente/almoço/bloqueio/conflito foi reescrita aqui.
    expect(comandosSemComentario).not.toMatch(/agenda_lock_slot/)
    expect(comandosSemComentario).not.toMatch(/audax_minutos/)
    expect(comandosSemComentario).not.toMatch(/raise exception 'Horário fora do expediente/)
  })

  it('a página pública pode chamar a criação com complementos', () => {
    expect(texto).toMatch(
      /grant execute on function public\.agendamento_publico_criar_complementos\(\s*text, text, text, text, date, text, text, text\[\]\s*\) to anon, authenticated, service_role/,
    )
  })

  it('não mexe em policy, trigger, tabela da agenda nem migration anterior', () => {
    expect(texto).not.toMatch(/create policy/i)
    expect(texto).not.toMatch(/alter table/i)
    expect(texto).not.toMatch(/create trigger/i)
    expect(texto).not.toMatch(/drop table/i)
    expect(texto).not.toMatch(/revoke .* from public, anon, authenticated/)
  })
})

// ============================================================================
// 028 e 029 — Club: produção, benefício e pote
//
// Travas que o dinheiro do pote depende:
//   • nenhum status de assinatura vira COLUNA (continua derivado);
//   • nenhum preço de serviço é escrito no script (`servicos.preco` é a fonte);
//   • a escrita das fichas e do fechamento é só por SECURITY DEFINER, e o
//     benefitso é revalidado dentro do SQL;
//   • o corpo da regra é o MESMO na 028 e na 029 — a 029 só acrescenta a
//     checagem de papel.
// ============================================================================
describe('028 · produção do Club e pote', () => {
  const texto = sql('../supabase/migrations/028_clube_producao_e_pote.sql')
  const comandosSemComentario = comandos(texto).join('\n')

  it('a ficha guarda valor de TABELA e valor PAGO (itens 1 e 7)', () => {
    for (const coluna of [
      'cliente_id',
      'assinatura_id',
      'plano',
      'servico',
      'valor_tabela',
      'valor_pago',
      'beneficio',
      'beneficio_tipo',
      'desconto_percentual',
      'profissional_id',
      'data',
      'horario',
      'duracao_min',
      'fichas',
      'periodo_pote',
      'origem',
      'fechamento_id',
    ]) {
      const declaradas = colunasDeclaradas('clube_producao')
      expect(declaradas.has(coluna), `clube_producao.${coluna}`).toBe(true)
    }
    // beneficio_tipo só aceita os três desfechos oficiais.
    expect(texto).toMatch(
      /beneficio_tipo text not null default 'avulso'\s+check \(beneficio_tipo in \('ilimitado', 'desconto', 'avulso'\)\)/,
    )
  })

  it('o fechamento do pote é por PERÍODO e guarda o rateio (item 21)', () => {
    const declaradas = colunasDeclaradas('clube_pote_fechamentos')
    for (const coluna of [
      'periodo_inicio',
      'periodo_fim',
      'receita',
      'percentual',
      'pote',
      'producao_total',
      'fichas_total',
      'partes',
      'fechado_por',
      'fechado_em',
      'reaberto',
    ]) {
      expect(declaradas.has(coluna), `clube_pote_fechamentos.${coluna}`).toBe(true)
    }
  })

  it('status da assinatura continua DERIVADO, nunca coluna', () => {
    expect(colunasDeclaradas('clube_assinaturas').has('status')).toBe(false)
    expect(colunasDeclaradas('clube_assinaturas').has('status_assinatura')).toBe(false)
    // E o cálculo é o MESMO do app: cancelada > vencida > atrasada > próxima.
    expect(texto).toMatch(/create or replace function public\.audax_clube_status\(/)
    expect(texto).toMatch(/when coalesce\(p_cancelada, false\) then 'cancelada'/)
    expect(texto).toMatch(/p_proximo_vencimento < p_hoje - 7 then 'vencida'/)
    expect(texto).toMatch(/p_proximo_vencimento < p_hoje then 'atrasada'/)
    // Benefício válido só para ativa e próxima do vencimento.
    expect(texto).toMatch(/in \('ativa', 'proxima_vencimento'\)/)
  })

  it('a cobertura do plano vem da CONFIGURAÇÃO, não de preço no código', () => {
    // As coberturas ficam em configuracoes_sistema.clube (chave que já existe).
    expect(texto).toMatch(/'coberturas', coalesce\(/)
    expect(texto).toMatch(/"cabelo":\["Cabelo"\]/)
// Nenhum preço de serviço escrito à mão. Só o CÓDIGO — o cabeçalho do
// arquivo cita R$ 30 e R$ 0,00 para explicar a regra, e essa citação não
// pode ser confundida com preço fixo.
    expect(comandosSemComentario).not.toMatch(/R\$ ?\d/)
    // E o preço vem da tabela oficial.
    expect(texto).toMatch(/from public\.servicos s/)
    expect(texto).toMatch(/coalesce\(s\.preco, 0\) as preco/)
  })

  it('pote e desconto NÃO são fixados no código (itens 9 e 14)', () => {
    expect(texto).toMatch(/'pote', coalesce\(/)
    // O padrão é inativo e sem desconto: nada acontece sem configuração.
    expect(texto).toMatch(/"pote":\{"ativo":false,"percentual":0/)
    // O percentual vem da configuração, com a tela podendo sobrescrever.
    expect(texto).toMatch(/v_percentual := coalesce\(\s*p_percentual,/)
    expect(texto).toMatch(/Percentual do pote não configurado\./)
  })

  it('o rateio usa maior resto e a soma bate com o pote (itens 26 e 27)', () => {
    // Resto ordenado, com desempate pelo nome (determinístico).
expect(texto).toMatch(/trunc\(g\.pote \* a\.fichas \/ f\.total, 2\)/)
    expect(texto).toMatch(/row_number\(\) over \(order by b\.resto desc, b\.nome asc\)/)
    expect(texto).toMatch(/case when o\.posicao <= s\.centavos then o\.parte \+ 0\.01 else o\.parte end/)
    // E o fechamento RECUSA gravar se a soma não bater.
    expect(texto).toMatch(/O rateio não fecha: soma das partes/)
  })

  it('o período é sempre explícito e inclusivo (item 16)', () => {
    expect(texto).toMatch(/cp\.data >= p_inicio\s+and cp\.data <= p_fim/)
    expect(texto).toMatch(/p\.data >= p_inicio\s+and p\.data <= p_fim/)
    expect(texto).toMatch(/Informe a data inicial e a data final do período\./)
    expect(texto).toMatch(/A data final precisa ser igual ou depois da data inicial\./)
  })

  it('a escrita das fichas é SÓ pelo servidor (item 24)', () => {
    // RLS ligada e sem policy de escrita para `authenticated`.
    expect(texto).toMatch(/alter table public\.clube_producao enable row level security/)
    expect(texto).toMatch(/alter table public\.clube_pote_fechamentos enable row level security/)
    expect(texto).toMatch(
      /create policy clube_producao_leitura[\s\S]*?for select to authenticated/,
    )
    expect(texto).not.toMatch(/for insert to authenticated[\s\S]{0,400}?on public\.clube_producao/)
    expect(texto).not.toMatch(/for update to authenticated[\s\S]{0,400}?on public\.clube_producao/)
    // Registrar/atendimento revalida o benefício DENTRO do SQL.
    expect(texto).toMatch(
      /v_beneficio := public\.audax_clube_beneficio\(\s*p_cliente_id, p_telefone, p_servico, p_data, p_usar_beneficio\s*\)/,
    )
    expect(texto).toMatch(/if v_tipo = 'avulso' or v_status not in \('ativa', 'proxima_vencimento'\) then/)
  })

  it('a auditoria do pote reusa a de comissões (item 21)', () => {
    expect(texto).toMatch(/drop constraint if exists comissoes_auditoria_acao_check/)
    expect(texto).toMatch(
      /acao in \('fechamento', 'reabertura', 'pote_fechamento', 'pote_reabertura', 'pote_ajuste'\)/,
    )
    expect(texto).toMatch(/insert into public\.comissoes_auditoria/)
  })

  it('não mexe em policy, trigger ou migration anterior (item 26)', () => {
    expect(texto).not.toMatch(/create trigger/i)
    expect(texto).not.toMatch(/drop table/i)
    expect(texto).not.toMatch(/truncate/i)
    expect(texto).not.toMatch(/delete from/i)
    // Não altera a agenda nem a caixa.
    expect(texto).not.toMatch(/alter table public\.agendamentos/)
    expect(texto).not.toMatch(/alter table public\.caixa_lancamentos/)
  })
})

describe('029 · quem pode tocar no pote', () => {
  const texto028 = sql('../supabase/migrations/028_clube_producao_e_pote.sql')
  const texto029 = sql('../supabase/migrations/029_clube_pote_papeis.sql')

  const PORTAS = [
    'clube_pote_calcular',
    'clube_pote_fechar',
    'clube_pote_reabrir',
    'clube_pote_listar',
    'clube_atendimento_registrar',
    'clube_producao_estornar',
  ]

  it('toda porta do pote tem checagem de papel (item 24)', () => {
    for (const porta of PORTAS) {
      expect(texto029, porta).toMatch(
        new RegExp(`create or replace function public\\.${porta}\\(`),
      )
    }
    expect(texto029).toMatch(/if not public\.current_user_is_gerente_ou_acima\(\) then/)
    // Registrar atendimento é operação de recepção, não só de gerente.
    expect(texto029).toMatch(/if not public\.current_user_is_recepcao_ou_acima\(\) then/)
  })

  it('authenticated chega às funções; anon nunca', () => {
    for (const porta of PORTAS) {
      expect(texto029, porta).toMatch(
        new RegExp(`revoke execute on function public\\.${porta}\\([^)]*\\)\\s*\\n\\s*from public, anon`),
      )
    }
    expect(texto029).toMatch(/to authenticated, service_role/)
    expect(texto029).not.toMatch(/to anon/)
  })

it('o CORPO da regra é o mesmo da 028 (a 029 só guarda o papel)', () => {
    // A guarda que a 029 insere logo depois do `begin`. Removê-la do corpo de
    // 029 tem de deixar exatamente o corpo de 028.
    const GUARDA = [
      '  -- Autorização (item 24): a REGRA abaixo é exatamente a da 028, sem',
      '  -- mudança. Entra apenas a checagem de papel do usuário da sessão.',
      '  if not public.current_user_is_gerente_ou_acima() then',
      "    raise exception 'Você não tem permissão para ver o fechamento do pote.';",
      '  end if;',
      '  if not public.current_user_is_gerente_ou_acima() then',
      "    raise exception 'Você não tem permissão para fechar o pote.';",
      '  end if;',
      '  if not public.current_user_is_gerente_ou_acima() then',
      "    raise exception 'Você não tem permissão para reabrir o fechamento.';",
      '  end if;',
      '  if not public.current_user_is_recepcao_ou_acima() then',
      "    raise exception 'Você não tem permissão para registrar atendimento do Club.';",
      '  end if;',
      '  if not public.current_user_is_gerente_ou_acima() then',
      "    raise exception 'Você não tem permissão para estornar ficha de produção.';",
      '  end if;',
      '  if not public.current_user_is_gerente_ou_acima() then',
      "    raise exception 'Você não tem permissão para ver os fechamentos do pote.';",
      '  end if;',
    ]

    const corpo = (origem: string, porta: string): string => {
      const inicio = origem.indexOf(`create or replace function public.${porta}(`)
      const abre = origem.indexOf('$$', inicio)
      const fecha = origem.indexOf('$$', abre + 2)
      return origem
        .slice(abre, fecha)
        .split('\n')
        .filter((linha) => !GUARDA.includes(linha.trimEnd()) && !GUARDA.includes(linha))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim()
    }

    for (const porta of [
      'clube_pote_calcular',
      'clube_pote_fechar',
      'clube_pote_reabrir',
      'clube_atendimento_registrar',
      'clube_producao_estornar',
    ]) {
      expect(corpo(texto029, porta), `${porta}: corpo divergiu da 028`).toBe(
        corpo(texto028, porta),
      )
    }
  })

  it('a regra continua sendo recalculada, nunca enviada pelo frontend', () => {
    // Fechar recalcula o rateio inteiro e recusa o que já está fechado.
    expect(texto029).toMatch(/v_rateio := public\.clube_pote_calcular\(p_inicio, p_fim, p_percentual, p_profissionais\);/)
    expect(texto029).toMatch(/Já existe fechamento do pote para este período\./)
    // Não aceita valor de pote vindo do chamador.
    expect(texto029).not.toMatch(/p_pote/)
  })
})

/* ------------------------------------------------------------------ */
/* 030 - pote integral e comissão sobre a parcela                      */
/* ------------------------------------------------------------------ */

describe('030 · o pote é a receita inteira e a comissão é sobre a parcela', () => {
  const texto = sql('../supabase/migrations/030_pote_integral_e_comissao.sql')

  it('a receita do período não conta o mesmo lançamento duas vezes', () => {
    // Um pagamento por lançamento do Caixa: `distinct on` pelo
    // `caixa_lancamento_id` (ou pelo id quando não há lançamento).
    expect(texto).toMatch(/select distinct on \(coalesce\(p\.caixa_lancamento_id, p\.id\)\)/)
    expect(texto).toMatch(/order by coalesce\(p\.caixa_lancamento_id, p\.id\), p\.criado_em/)
  })

  it('a configuração passa a ser `comissao.percentual` e o pote perde o percentual', () => {
    expect(texto).toMatch(/'comissao', coalesce\(/)
    expect(texto).toMatch(/"percentual":0\.40/)
    // Remove `pote.percentual` — ele significava "percentual da receita que
    // entra no pote", que foi exatamente o que o dono mandou mudar.
    expect(texto).toMatch(/coalesce\(valor -> 'pote', '\{\}'::jsonb\) - 'percentual'/)
    // E some com ele da configuração já gravada.
    expect(texto).toMatch(/and valor -> 'pote' \? 'percentual'/)
  })

  it('o servidor valida a comissão como fração entre 0 e 1', () => {
    expect(texto).toMatch(/if p_valor \? 'comissao' then/)
    expect(texto).toMatch(/v_comissao_local := \(p_valor -> 'comissao' ->> 'percentual'\)::numeric;/)
    expect(texto).toMatch(/if v_comissao_local < 0 or v_comissao_local > 1 then/)
  })

  it('o fechamento congela pote, comissão e receita da empresa', () => {
    for (const coluna of [
      'add column if not exists comissao_percentual numeric(5,4)',
      'add column if not exists comissao_total numeric(12,2)',
      'add column if not exists receita_empresa numeric(12,2)',
    ]) {
      expect(texto, coluna).toContain(coluna)
    }
    // Os três valores entram no snapshot do fechamento.
    expect(texto).toMatch(/receita, percentual, pote, producao_total, fichas_total,/)
    expect(texto).toMatch(/comissao_percentual, comissao_total, receita_empresa,/)
  })

  it('a comissão incide sobre a PARCELA de cada profissional', () => {
    // `comissao = round(parcela × comissao)`, nunca sobre o pote inteiro: o
    // fator é `g.comissao` multiplicado pela PARCELA (`o.parte`), não pelo pote.
    expect(texto).toMatch(
      /round\(\s*\(case when o\.posicao <= s\.centavos then o\.parte \+ 0\.01 else o\.parte end\)\s*\*\s*g\.comissao,\s*2\s*\)\s*as comissao/,
    )
    // A comissão não pode ser calculada a partir de `g.pote`.
    expect(texto).not.toMatch(/round\([^)]*g\.pote[^)]*g\.comissao/)
    // E o total é a soma das comissões individuais.
    expect(texto).toMatch(
      /'comissaoTotal', coalesce\(\(select sum\(comissao\) from final\), 0\)/,
    )
    // O que sobra do pote é receita da empresa.
    expect(texto).toMatch(
      /'receitaEmpresa', g\.pote - coalesce\(\(select sum\(comissao\) from final\), 0\)/,
    )
  })

  it('as parcelas fecham no centavo, com maior resto', () => {
    expect(texto).toMatch(/trunc\(g\.pote \* a\.fichas \/ f\.total, 2\)/)
    expect(texto).toMatch(/row_number\(\) over \(order by b\.resto desc, b\.nome asc\)/)
  })

  it('produção já distribuída por um fechamento anterior não entra de novo', () => {
    expect(texto.match(/and cp\.fechamento_id is null/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('o pote é a receita inteira, sem percentual de entrada', () => {
    expect(texto).toMatch(/'percentualPote', 100/)
    // Nenhuma multiplicação da receita por "percentual do pote" sobreviveu.
    expect(texto).not.toMatch(/pote \* v_percentual/)
    expect(texto).not.toMatch(/percentual \* v_receita/)
  })

  it('a receita do pote vem da deduplicada, não de uma soma solta', () => {
    // Guarda explícita: a receita vem de `audax_clube_receita_periodo`.
    expect(texto).toMatch(/audax_clube_receita_periodo\(p_inicio, p_fim\)/)
  })

  it('as permissões da 029 continuam valendo (nada foi aberto)', () => {
    expect(texto).toMatch(/grant execute on function public\.audax_clube_rateio\(date, date, numeric, text\[\]\) to service_role;/)
    expect(texto).toMatch(
      /grant execute on function public\.clube_pote_calcular\(date, date, numeric, text\[\]\) to authenticated, service_role;/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.clube_pote_fechar\(date, date, numeric, text\[\], text\) to authenticated, service_role;/,
    )
    expect(texto).not.toMatch(/to anon/)
  })
})

/* ------------------------------------------------------------------ */
/* 031 - a comissão é do dono, não um argumento de quem chama          */
/* ------------------------------------------------------------------ */

describe('031 · a comissão não é parâmetro da chamada', () => {
  const bruto = sql('../supabase/migrations/031_comissao_somente_do_dono.sql')
  // O que importa é o CÓDIGO: o cabeçalho cita o nome do parâmetro removido
  // para explicar a mudança, e comentário não vira porta de entrada.
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('nenhuma porta do pote aceita mais a comissão como entrada', () => {
    // `p_comissao` não pode existir em lugar nenhum: era o vetor que
    // permitia a qualquer gerente/recepção escolher a própria comissão.
    expect(texto).not.toMatch(/p_comissao/)
    expect(texto).not.toMatch(/coalesce\(\s*p_comissao/)

    // A assinatura nova não tem mais o terceiro parâmetro.
    for (const nome of ['audax_clube_rateio', 'clube_pote_calcular', 'clube_pote_fechar']) {
      expect(
        texto,
        `${nome} sem p_comissao`,
      ).toMatch(
        new RegExp(
          `create or replace function public\\.${nome}\\(\\s*p_inicio date,\\s*p_fim date,\\s*p_profissionais text\\[\\]`,
        ),
      )
    }
  })

  it('a comissão vem da configuração do dono', () => {
    expect(texto).toMatch(
      /\(select nullif\(trim\(coalesce\(valor -> 'comissao' ->> 'percentual', ''\)\), ''\)::numeric\s*\n\s*from public\.configuracoes_sistema\s*\n\s*where chave = 'clube'\)/,
    )
    // O padrão do Studio Audax continua 40% se a configuração vier vazia.
    expect(texto).toMatch(/0\.40/)
  })

  it('as assinaturas antigas caem antes das novas', () => {
    // `create or replace` não renomeia parâmetro: as duas portas são derrubadas.
    for (const [antiga, nova] of [
      [
        'drop function if exists public.audax_clube_rateio(date, date, numeric, text[]);',
        'drop function if exists public.clube_pote_calcular(date, date, numeric, text[]);',
      ],
      [
        'drop function if exists public.clube_pote_calcular(date, date, numeric, text[]);',
        'drop function if exists public.clube_pote_calcular(date, date, text[]);',
      ],
      [
        'drop function if exists public.clube_pote_fechar(date, date, numeric, text[], text);',
        'drop function if exists public.clube_pote_fechar(date, date, text[], text);',
      ],
    ]) {
      expect(texto, antiga).toContain(antiga)
      expect(texto, `${antiga} -> ${nova}`).toContain(nova)
    }
  })

  it('nenhuma permissão sobra sobre as assinaturas que caíram', () => {
    // `grant`/`revoke` em função inexistente é erro 42883: as linhas da 030 que
    // citavam as assinaturas antigas precisam ter saído com elas.
    expect(texto).not.toMatch(/grant execute on function public\.\w+\([^)]*numeric/)
    expect(texto).not.toMatch(/revoke execute on function public\.\w+\([^)]*numeric/)
  })

  it('o fechamento congela a comissão que foi distribuída, não outra leitura', () => {
    // Uma segunda leitura da configuração poderia divergir do pagamento.
    expect(texto).toMatch(
      /v_comissao := coalesce\(\(v_rateio ->> 'comissaoPercentual'\)::numeric, 0\.40\);/,
    )
    expect(texto).not.toMatch(/v_comissao := coalesce\(\s*\n\s*p_comissao/)
  })

  it('nada abre: as assinaturas novas recebem o mesmo acesso', () => {
    expect(texto).toMatch(
      /grant execute on function public\.audax_clube_rateio\(date, date, text\[\]\) to service_role;/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.clube_pote_calcular\(date, date, text\[\]\) to authenticated, service_role;/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.clube_pote_fechar\(date, date, text\[\], text\) to authenticated, service_role;/,
    )
    // Nenhum grant para anon — os `from ... anon` são revokes.
    expect(texto).not.toMatch(/grant\s[^;]*\bto\b[^;]*\banon\b/i)
    // E o guard de gerente continua no corpo das duas portas que a 031
    // recria (`clube_producao_*` não é redefinida aqui: segue a 029).
    expect(texto.match(/if not public\.current_user_is_gerente_ou_acima\(\) then/g)?.length).toBe(2)
  })

  it('o corpo da regra é o da 030: só muda de onde vem a comissão', () => {
    // A trava contra rateio quebrado continua intacta.
    expect(texto).toMatch(/O rateio não fecha: soma das parcelas R\$ % difere do pote R\$ %/)
    expect(texto).toMatch(/Já existe fechamento do pote para este período\./)
    // E a fórmula continua sendo sobre a parcela.
    expect(texto).toMatch(
      /round\(\s*\(case when o\.posicao <= s\.centavos then o\.parte \+ 0\.01 else o\.parte end\)\s*\*\s*g\.comissao,\s*2\s*\)\s*as comissao/,
    )
  })
})

/* ------------------------------------------------------------------ */
/* 032 - o nome do parâmetro e o EXECUTE TO PUBLIC do Postgre          */
/* ------------------------------------------------------------------ */

describe('032 · revoga o PUBLIC que o PostgreLab dá por padrão', () => {
  const bruto = sql('../supabase/migrations/032_permissoes_public_e_typo_calcular.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('o cálculo repassa o parâmetro com o nome certo', () => {
    // O bug da 031: `p_profissional` — sem "eis" — quebrava com 42703.
    expect(texto).toMatch(
      /return public\.audax_clube_rateio\(p_inicio, p_fim, p_profissionais\)/,
    )
    expect(texto).not.toMatch(/p_profissional\)/)
    expect(texto).not.toMatch(/p_profissional\b(?!eis)/)
  })

  it('toda porta do pote é revogada de PUBLIC antes de ser regrada', () => {
    // Função nova nasce com EXECUTE para PUBLIC: sem o revoke, anon lê o rateio.
    for (const assinatura of [
      'audax_clube_rateio(date, date, text[])',
      'clube_pote_calcular(date, date, text[])',
      'clube_pote_fechar(date, date, text[], text)',
    ]) {
      expect(texto, `revoke de ${assinatura}`).toMatch(
        new RegExp(
          `revoke execute on function public\\.${assinatura.replace(/[()[\]]/g, '\\$&')}\\s*from public, anon, authenticated;`,
        ),
      )
    }
    expect(texto).toMatch(
      /revoke execute on function public\.clube_pote_listar\(date, date\)\s*from public, anon;/,
    )
  })

  it('cada porta continua regrada para quem pode usar', () => {
    expect(texto).toMatch(
      /grant execute on function public\.audax_clube_rateio\(date, date, text\[\]\)\s*to service_role;/,
    )
    // O rateio NÃO volta para authenticated: é leitura de dinheiro.
    expect(texto).not.toMatch(
      /grant execute on function public\.audax_clube_rateio\(date, date, text\[\]\)\s*to authenticated/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.clube_pote_calcular\(date, date, text\[\]\)\s*to authenticated, service_role;/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.clube_pote_fechar\(date, date, text\[\], text\)\s*to authenticated, service_role;/,
    )
    // Nenhum grant para anon em lugar nenhum.
    expect(texto).not.toMatch(/grant\s[^;]*\bto\b[^;]*\banon\b/i)
  })

  it('a guarda de papel do corpo continua intacta', () => {
    expect(texto).toMatch(/if not public\.current_user_is_gerente_ou_acima\(\) then/)
    // E a comissão continua vindo da configuração, não de parâmetro.
    expect(texto).not.toMatch(/p_comissao/)
  })
})

/* ------------------------------------------------------------------ */
/* 034 - o conteúdo público do Clube, e só ele                          */
/* ------------------------------------------------------------------ */

describe('034 · benefícios do Clube são públicos e vazam nada', () => {
  const bruto = sql('../supabase/migrations/034_clube_beneficios_publicos.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('é só uma projeção do config oficial: não cria tabela nem policy', () => {
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/create policy/i)
    expect(texto).not.toMatch(/alter table/i)
    expect(texto).not.toMatch(/insert into/i)
    expect(texto).not.toMatch(/update /i)
    expect(texto).not.toMatch(/delete /i)
    // Lê a MESMA chave que o `audax_clube_beneficio` (028) usa no atendimento.
    expect(texto).toMatch(/cfg -> 'coberturas'/)
    expect(texto).toMatch(/cfg -> 'desconto' ->> 'quimicos'/)
    expect(texto).toMatch(/cfg -> 'desconto' ->> 'produtos'/)
  })

  it('NÃO devolve assinatura, pagamento, cliente nem dinheiro', () => {
    // A Area do Cliente lê a assinatura pela `painel_clube_minha` (020), que
    // garante a posse. Esta função é só conteúdo de plano: se alguém pedir
    // assinatura aqui, é vazamento.
    for (const proibido of [
      'clube_assinaturas',
      'clube_pagamentos',
      'clientes',
      'agendamentos',
      'caixa_lancamentos',
      'comissoes',
      'clube_pote_fechamentos',
      'auth.uid',
      'current_cliente_id',
    ]) {
      expect(texto, proibido).not.toMatch(new RegExp(proibido, 'i'))
    }
  })

  it('não depende de sessão: é a tela de planos, pública de propósito', () => {
    expect(texto).toMatch(/grant execute on function public\.clube_beneficios_publicos\(\)\s*to anon, authenticated, service_role;/)
    // E o PUBLIC é revogado explicitamente (função nova nasce com ele).
    expect(texto).toMatch(/revoke execute on function public\.clube_beneficios_publicos\(\) from public;/)
    expect(texto).toMatch(/revoke execute on function public\.clube_beneficios_publicos\(\) from anon;/)
    expect(texto).toMatch(/security definer/)
    expect(texto).toMatch(/set search_path = public/)
  })

  it('sem config gravado, devolve vazio em vez de erro', () => {
    expect(texto).toMatch(/coalesce\(\s*\(\s*select jsonb_build_object/)
    expect(texto).toMatch(/'\{\}'::jsonb/)
  })
})

/* ------------------------------------------------------------------ */
/* 033 - o snapshot congela a PRODUÇÃO, não o pote                     */
/* ------------------------------------------------------------------ */

describe('033 · producao_total do snapshot é a produção', () => {
  const bruto = sql('../supabase/migrations/033_producao_total_do_snapshot.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('a coluna producao_total recebe a referência da produção', () => {
    // A 030 gravava o pote duas vezes: na coluna pote e na producao_total.
    expect(texto).toMatch(/\(v_rateio ->> 'producaoReferencia'\)::numeric/)
  })

  it('os valores gravados saem na ordem das colunas', () => {
    const valores = texto.slice(texto.indexOf('values ('))
    const ordem = [...valores.matchAll(/\(v_rateio ->> '(\w+)'\)/g)].map((m) => m[1])
    // insert: receita, percentual(100), pote, producao_total, fichas_total,
    //         comissao_percentual, comissao_total, receita_empresa, partes...
    expect(ordem.slice(0, 5)).toEqual([
      'receita',
      'pote',
      'producaoReferencia',
      'fichasTotal',
      'comissaoTotal',
    ])
  })

  it('a trava contra rateio quebrado e as guardas continuam no corpo', () => {
    expect(texto).toMatch(/O rateio não fecha: soma das parcelas R\$ % difere do pote R\$ %/)
    expect(texto).toMatch(/Já existe fechamento do pote para este período\./)
    expect(texto).toMatch(/Não há ficha de Club no período para distribuir\./)
    expect(texto).toMatch(/if not public\.current_user_is_gerente_ou_acima\(\) then/)
    // E o rateio ainda recebe a comissão da configuração, não de parâmetro.
    expect(texto).toMatch(
      /v_comissao := coalesce\(\(v_rateio ->> 'comissaoPercentual'\)::numeric, 0\.40\);/,
    )
    expect(texto).not.toMatch(/p_comissao/)
  })
})

/* ------------------------------------------------------------------ */
/* 035 - a configuração que a casa nunca preencheu                       */
/* ------------------------------------------------------------------ */

describe('035 · categorias, químicos e texto dos benefícios', () => {
  const bruto = sql('../supabase/migrations/035_clube_categorias_e_beneficios.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('corrige só o que estava errado, usando a taxonomia da casa', () => {
    // "Alisamento Americano" estava como "Cabelo" — químico entrando como
    // corte ilimitado. Passa para "Tratamento", que a casa já usava.
    expect(texto).toMatch(/set categoria = 'Tratamento'/)
    expect(texto).toMatch(/= 'alisamento americano'/)
    // E a guarda garante que só mexe se ainda estiver errado.
    expect(texto).toMatch(/and btrim\(coalesce\(categoria, ''\)\) = 'Cabelo';/)
  })

  it('NÃO inventa taxonomia: reusa "Tratamento", que já existia', () => {
    // O app já sugere Cabelo/Barba/Cabelo e barba/Tratamento/Outro, e a casa
    // já tinha "Tratamento" em Luzes, Platinado e Limpeza de Pele.
    expect(texto).toMatch(/'\["Tratamento"\]'::jsonb/)
    expect(texto).not.toMatch(/'\["Quimico"\]'::jsonb/)
    expect(texto).not.toMatch(/Cabelo e barba/)
  })

  it('"Corte + Barba" fica como está: decisão do dono', () => {
    // O dono optou por manter 'Cabelo' — Audax Corte e Audax Corte + Barba
    // continuam com o combo de graça. Por isso a migration não toca nas
    // coberturas dos planos.
    expect(texto).not.toMatch(/'\{coberturas,cabelo_barba\}'/)
    expect(texto).not.toMatch(/'\{coberturas,cabelo\}'/)
    expect(texto).not.toMatch(/'\{coberturas,barba\}'/)
  })

  it('Sobrancelha NÃO entra como cobertura', () => {
    expect(texto).toMatch(/'sobrancelha'/)
    expect(texto).toMatch(/NÃO é cobertura do Club/)
  })

  it('os químicos entram com 10% e sem mexer no preço de tabela', () => {
    expect(texto).toMatch(/'\{desconto,categorias\}'/)
    // `servicos.preco` é a tabela oficial: esta migration não o altera.
    expect(texto).not.toMatch(/set\s+preco/)
    expect(texto).not.toMatch(/update public\.servicos\s+set\s+preco/)
  })

  it('a comissão oficial vai PARA A CONFIGURAÇÃO (não fica só no SQL)', () => {
    // Em produção o bloco `comissao` não existia: as funções caíam no padrão
    // 0.40 do próprio SQL. A regra oficial tem que estar no lugar onde o dono
    // configura — e `jsonb_set` só cria o último passo, então o objeto
    // intermediário precisa ser criado antes.
    expect(texto).toMatch(/jsonb_set\(cfg, '\{comissao\}'/)
    expect(texto).toMatch(/'\{comissao,percentual\}'/)
    expect(texto).toMatch(/'0\.40'::jsonb/)
  })

  it('tira o pote.percentual que reapareceu, sem mexer no pote.ativo', () => {
    // `pote.percentual` era "percentual da receita que entra no pote" — a
    // ambiguidade que a 030 removeu. Nenhuma função o lê, mas deixá-lo gravado
    // faz quem lê a configuração achar que o pote é 40% das mensalidades.
    expect(texto).toMatch(/cfg -> 'pote' \? 'percentual'/)
    expect(texto).toMatch(/- 'percentual'/)
    // O botão de fechamento é do dono: a migration não mexe nele.
    expect(texto).not.toMatch(/'\{pote,ativo\}'/)
  })

  it('é idempotente: nada duplica na segunda execução', () => {
    expect(texto).toMatch(
      /when jsonb_array_length\(\s*coalesce\(cfg -> 'desconto' -> 'categorias', '\[\]'::jsonb\)\) > 0/,
    )
    expect(texto).toMatch(/when cfg -> 'beneficios' -> 'cabelo' is not null/)
    expect(texto).toMatch(/and cfg -> 'beneficios' -> 'barba' is not null/)
    expect(texto).toMatch(/and cfg -> 'beneficios' -> 'cabelo_barba' is not null/)
  })

  it('ABORTA se a casa não estiver como o dono pediu', () => {
    expect(texto).toMatch(/Configuração do Club divergente/)
    expect(texto).toMatch(/A comissão do Club não está em 40/)
    expect(texto).toMatch(/Os químicos não estão configurados/)
    expect(texto).toMatch(/O campo pote\.percentual voltou a existir/)
    // E barra o erro que motivou a migration: químico como cobertura.
    expect(texto).toMatch(/entrou como COBERTURA de algum plano/)
  })

  it('a RPC pública passa a devolver o texto oficial dos benefícios', () => {
    expect(texto).toMatch(/create or replace function public\.clube_beneficios_publicos\(\)/)
    expect(texto).toMatch(/'textos', coalesce\(/)
    expect(texto).toMatch(/jsonb_each\(coalesce\(cfg -> 'beneficios', '\{\}'::jsonb\)\)/)
    expect(texto).toMatch(/where jsonb_typeof\(e\.valor\) = 'array'/)
  })

  it('a migration não cria regra de negócio nenhuma', () => {
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/create policy/i)
    expect(texto).not.toMatch(/alter table/i)
    // Nada da fórmula do pote é tocado aqui.
    expect(texto).not.toMatch(/audax_clube_rateio/)
    expect(texto).not.toMatch(/clube_pote_fechar/)
    expect(texto).not.toMatch(/clube_pote_calcular/)
    expect(texto).not.toMatch(/update public\.clube_producao/)
    expect(texto).not.toMatch(/update public\.clube_assinaturas/)
  })
})
/* ------------------------------------------------------------------ */
/* 036/037/038 - vitrine pública e confirmação no WhatsApp             */
/* ------------------------------------------------------------------ */

describe('036 · vitrine: foto do profissional e destaques do dono', () => {
  const bruto = sql('../supabase/migrations/036_vitrine_publica_e_whatsapp.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('o catálogo devolve a foto do PROFISSIONAL, não do serviço', () => {
    // `servicos` NÃO tem coluna de imagem — a foto existe em `profissionais`.
    // Inventar `s.foto` quebraria a migration inteira.
    expect(texto).not.toMatch(/s\.foto/)
    expect(texto).toMatch(/'foto', case when btrim\(coalesce\(p\.foto, ''\)\) = '' then '' else p\.foto end/)
    // E a foto vazia não vira imagem quebrada na tela.
    expect(texto).toMatch(/case when btrim\(coalesce\(p\.foto, ''\)\) = '' then ''/)
  })

  it('os destaques vêm da configuração do dono, filtrados pelo catálogo', () => {
    expect(texto).toMatch(/'destaques', coalesce\(/)
    expect(texto).toMatch(/valor -> 'destaques'/)
    // Serviço fora do catálogo não vira destaque quebrado.
    expect(texto).toMatch(/where exists \(select 1 from servicos s where s\.nome = x\.nome and s\.ativo\)/)
    // A ordem é a que o dono gravou.
    expect(texto).toMatch(/with ordinality as x\(nome, ordem\)/)
    expect(texto).toMatch(/jsonb_agg\(x\.nome order by x\.ordem\)/)
  })

  it('os destaques vivem na configuração que a casa já edita', () => {
    expect(texto).toMatch(/from configuracoes_sistema b\s*\n\s*where b\.chave = 'barbearia'/)
  })

  it('a criação pública marca a origem — e só o wrapper muda', () => {
    expect(texto).toMatch(/set duracao_min = v_dur,\s*\n\s*origem = 'publico'/)
    // A REGRA de vaga é intocada: quem continua autoritativa é
    // `agendamento_publico_criar`, que este script NÃO redefine.
    expect(texto).not.toMatch(/create or replace function public\.agendamento_publico_criar\(/)
    expect(texto).toMatch(/create or replace function public\.agendamento_publico_criar_complementos\(/)
  })

  it('a validação dos complementos é a mesma da 027', () => {
    for (const intacto of [
      "if not (trim(v_item) = any (coalesce(v_base.complementos, '{}'::text[]))) then",
      "raise exception 'Complemento indisponível para este serviço.';",
      'v_dur := v_dur + coalesce(v_compl.duracao_min, 0);',
      "'[Complementos: ' || array_to_string(v_nomes, ', ') || ']';",
    ]) {
      expect(texto, intacto).toContain(intacto)
    }
  })

  it('não mexe em preço, tabela nem política', () => {
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/create policy/i)
    expect(texto).not.toMatch(/update public\.servicos\s+set\s+preco/)
    expect(texto).not.toMatch(/agendamento_publico_slots/)
  })
})

describe('037 · o cliente recebe a confirmação no WhatsApp', () => {
  const bruto = sql('../supabase/migrations/037_confirmacao_whatsapp_publico.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('a confirmação ao cliente cobre também o agendamento público', () => {
    expect(texto).toMatch(/tg_op = 'INSERT' and v_ag\.origem in \('painel', 'publico'\)/)
    expect(texto).toMatch(/tg_op = 'UPDATE' and v_ag\.origem in \('painel', 'publico'\)/)
  })

  it('a falha de WhatsApp NÃO desfaz o agendamento', () => {
    // A porta é a MESMA tolerante a falha da 026 — o agendamento já está
    // gravado quando o AFTER trigger roda.
    expect(texto).toMatch(/ia_notificar_com_seguranca/)
    expect(texto).not.toMatch(/raise exception/)
    expect(texto).toMatch(/'confirmacao_cliente:' \|\| v_ag\.id/)
  })

  it('a deduplicação continua por agendamento', () => {
    // Uma reserva não recebe duas confirmações, mesmo que o trigger dispare
    // mais de uma vez.
    expect(texto.match(/'confirmacao_cliente:' \|\| v_ag\.id/g)?.length).toBe(1)
  })

  it('a mensagem traz complemento, endereço e WhatsApp oficial', () => {
    // O complemento é lido do marcador que o sistema já grava na observação.
    // O `\[` é o escape do literal de regex do próprio PostgreSQL.
    expect(texto).toContain('[Complementos:')
    expect(texto).toMatch(/regexp_match\(v_ag\.observacao/)
    expect(texto).toMatch(/v_casa ->> 'endereco'/)
    expect(texto).toMatch(/v_casa ->> 'telefone'/)
    expect(texto).toMatch(/Agendamento confirmado/)
  })

  it('campo vazio da casa NÃO vira linha na mensagem', () => {
    // "Nunca inventar endereço": sem endereço configurado, a linha some.
    expect(texto).toMatch(
      /nullif\('Endereço: ' \|\| nullif\(btrim\(coalesce\(v_casa ->> 'endereco', ''\)\), ''\), 'Endereço: '\)/,
    )
    expect(texto).toMatch(
      /nullif\('WhatsApp: ' \|\| nullif\(btrim\(coalesce\(v_casa ->> 'telefone', ''\)\), ''\), 'WhatsApp: '\)/,
    )
  })

  it('o aviso ao profissional e o pós-atendimento seguem intactos', () => {
    expect(texto).toMatch(/'profissional_agendamento:' \|\| v_ag\.id/)
    expect(texto).toMatch(/when 'publico' then 'Agendamento online'/)
    expect(texto).toMatch(/'pos_atendimento:' \|\| v_ag\.id/)
    expect(texto).toMatch(/'avaliacao:' \|\| v_ag\.id/)
  })
})

describe('038 · o dono escolhe os destaques da vitrine', () => {
  const bruto = sql('../supabase/migrations/038_config_destaques.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('valida `destaques` na chave barbearia', () => {
    expect(texto).toMatch(/v_chave = 'barbearia' and p_valor \? 'destaques'/)
    expect(texto).toMatch(/jsonb_typeof\(p_valor -> 'destaques'\) <> 'array'/)
    expect(texto).toMatch(/jsonb_array_length\(p_valor -> 'destaques'\) > 12/)
    expect(texto).toMatch(/Destaques inválidos/)
  })

  it('o resto da validação da 030 continua igual', () => {
    // As regras do Club e a rejeição de chave desconhecida não podem sumir.
    expect(texto).toMatch(/v_comissao_local < 0 or v_comissao_local > 1/)
    expect(texto).toMatch(/if p_valor \? 'comissao' then/)
    expect(texto).toMatch(/foreach v_texto in array array\['endereco', 'instagram'\] loop/)
    expect(texto).toMatch(/Configuração desconhecida/)
  })
})

/* ------------------------------------------------------------------ */
/* 039 - a vitrine no formato de uma vitrine                          */
/* ------------------------------------------------------------------ */

describe('039 · a categoria do serviço e a galeria da casa', () => {
  const bruto = sql('../supabase/migrations/039_vitrine_galeria_e_categoria.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('o serviço expõe a CATEGORIA que a casa já usa no cadastro', () => {
    // `servicos.categoria` existe (036+) — a vitrine agrupa por ela em vez de
    // inventar taxonomia própria.
    expect(texto).toMatch(/'categoria', btrim\(coalesce\(s\.categoria, ''\)\)/)
    // Vazio vira string vazia, nunca null: o frontend decide o rótulo.
    expect(texto).not.toMatch(/'categoria', s\.categoria,/)
  })

  it('a galeria vem da mesma configuração que endereço e telefone', () => {
    expect(texto).toMatch(/'fotos', coalesce\(/)
    expect(texto).toMatch(/from configuracoes_sistema b\s*\n\s*where b\.chave = 'barbearia'/)
    // A ordem é a que o dono gravou.
    expect(texto).toMatch(/with ordinality as f\(foto, ord\)/)
    expect(texto).toMatch(/jsonb_agg\(f order by ord\)/)
  })

  it('casa sem foto configurada devolve lista vazia, não erro', () => {
    expect(texto).toMatch(/coalesce\(b\.valor -> 'fotos', '\[\]'::jsonb\)/)
    expect(texto).toMatch(/'\[\]'::jsonb\),\s*\n\s*'endereco'/)
  })

  it('preço, duração, complementos, profissionais e destaques ficam IGUAIS', () => {
    // O agrupamento e a galeria são ACRESCENTOS: nada do que já existia pode
    // ter mudado de nome, de forma ou de lugar.
    for (const intacto of [
      "'id', s.id",
      "'nome', s.nome",
      "'preco', s.preco",
      "'duracaoMin', s.duracao_min",
      "'complementos', (",
      "'id', p.id",
      "'foto', case when btrim(coalesce(p.foto, '')) = ''",
      "'destaques', coalesce(",
      "where exists (select 1 from servicos s where s.nome = x.nome and s.ativo)",
      "jsonb_agg(x.nome order by x.ordem)",
    ]) {
      expect(texto).toContain(intacto)
    }
    // A ordem do catálogo continua sendo por nome.
    expect(texto).toMatch(/\) order by s\.nome/)
  })

  it('a regra de Agenda e a de criação pública NÃO são redefinidas', () => {
    // Este script só mexe no catálogo e na validação de configuração. Se ele
    // redefinisse a criação, estaríamos trocando a regra que garante a vaga.
    expect(texto).not.toMatch(/create or replace function public\.agendamento_publico_criar\(/)
    expect(texto).not.toMatch(/create or replace function public\.agendamento_publico_slots\(/)
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/create or replace trigger/i)
  })

  it('a galeria só aceita link http(s) — é o que segura a página', () => {
    // A foto entra como `<img src>`: esquema errado na configuração seria
    // javascript: no lugar da imagem.
    expect(texto).toMatch(/v_chave = 'barbearia' and p_valor \? 'fotos'/)
    expect(texto).toMatch(/jsonb_typeof\(p_valor -> 'fotos'\) <> 'array'/)
    expect(texto).toMatch(/jsonb_array_length\(p_valor -> 'fotos'\) > 8/)
    expect(texto).toMatch(/Fotos da barbearia inválidas/)
    expect(texto).toMatch(/Foto da barbearia precisa ser um link http\(s\)\./)
    expect(texto).toContain("and v_texto !~ '^https?://[^[:space:]]+$' then")
  })

  it('foto vazia é liberada, para o dono limpar sem quebrar o registro', () => {
    expect(texto).toMatch(/if btrim\(v_texto\) <> '' and length\(v_texto\) > 2000 then/)
  })

  it('a validação do 038 (destaques) e as regras do Club seguem idênticas', () => {
    expect(texto).toMatch(/v_chave = 'barbearia' and p_valor \? 'destaques'/)
    expect(texto).toMatch(/jsonb_array_length\(p_valor -> 'destaques'\) > 12/)
    expect(texto).toMatch(/v_comissao_local < 0 or v_comissao_local > 1/)
    expect(texto).toMatch(/if p_valor \? 'comissao' then/)
    expect(texto).toMatch(/foreach v_texto in array array\['endereco', 'instagram'\] loop/)
    expect(texto).toMatch(/Configuração desconhecida/)
  })
})

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* 040 - a casa abre em horarios diferentes por dia da semana          */
/* ------------------------------------------------------------------ */

describe('040 · expediente por dia da semana', () => {
  const bruto = sql('../supabase/migrations/040_expediente_por_dia.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('cria UM resolver, e é ele quem decide o expediente', () => {
    expect(texto).toMatch(
      /create or replace function public\.agenda_expediente_do_dia\(p_data date\)/,
    )
    // O dia da semana é o do PostgreSQL: 0 = domingo.
    expect(texto).toMatch(/v_dow := extract\(dow from p_data\)::int;/)
    // E ele lê `barbearia.horarios` da mesma configuração do endereço.
    expect(texto).toMatch(/where c\.chave = 'barbearia'/)
    expect(texto).toMatch(
      /v_dia := coalesce\(v_barb -> 'horarios', '\{\}'::jsonb\) -> v_dow::text;/,
    )
  })

  it('não usa `record` sem linha — cai no padrão em vez de estourar', () => {
    // `select into record` sem linha deixa o record NÃO ATRIBUÍDO, e
    // `v_base.inicio` estoura em plpgsql. Uma casa sem a linha 'padrao' tem
    // que continuar funcionando.
    expect(texto).not.toMatch(/v_base\s+record/)
    expect(texto).toContain('v_base_inicio text;')
    expect(texto).toContain("coalesce(v_base_inicio, '08:00')")
    expect(texto).toContain("coalesce(v_base_fim, '20:00')")
  })

  it('o almoço é por dia, e ausente é sem almoço — nunca o de outro dia', () => {
    expect(texto).toContain(
      "v_ai     := btrim(coalesce(v_dia ->> 'almocoInicio', ''));",
    )
    expect(texto).toContain(
      "v_af     := btrim(coalesce(v_dia ->> 'almocoFim', ''));",
    )
    // Almoço pela metade ou invertido não é pausa.
    expect(texto).toContain("if v_ai = '' or v_af = '' or v_ai >= v_af then")
  })

  it('a GRADE pública devolve o expediente do dia, não o da semana', () => {
    expect(texto).toContain(
      "'expediente', public.agenda_expediente_do_dia(p_data),",
    )
    // E não consulta mais a linha solta do expediente.
    expect(texto).not.toContain("'inicio', e.inicio,")
  })

  it('a CRIAÇÃO valida contra o mesmo expediente do dia', () => {
    // `jsonb_to_record` e não `from func(...)`: uma função que devolve jsonb,
    // no FROM, vira uma coluna só — `d.inicio` não existiria.
    expect(texto).toContain('from jsonb_to_record(public.agenda_expediente_do_dia(p_data))')
    expect(texto).toContain(
      'as d(inicio text, fim text, almoco_inicio text, almoco_fim text);',
    )
    // E o servidor parou de ler a linha 'padrao' direto.
    expect(texto).not.toContain(
      'into v_exp_inicio, v_exp_fim, v_alm_inicio, v_alm_fim\n    from agenda_expediente e',
    )
  })

  it('a regra de vaga da 021 continua INTEIRA', () => {
    /*
     * O que muda é QUAL expediente ela compara. Lock, sobreposição, bloqueio,
     * conflito e a origem precisam continuar palavra por palavra — é a regra
     * que garante a vaga.
     */
    for (const intacto of [
      'perform public.agenda_lock_slot(p_profissional, p_data);',
      'Profissional indisponível.',
      'Este horário está bloqueado para o profissional escolhido.',
      'insert into agendamentos (',
    ]) {
      expect(texto).toContain(intacto)
    }
    // O lock continua sendo serializado ANTES do teste de conflito.
    const lock = texto.indexOf('perform public.agenda_lock_slot(p_profissional, p_data);')
    const conflito = texto.indexOf('for update')
    expect(lock).toBeGreaterThan(-1)
    if (conflito > -1) expect(lock).toBeLessThan(conflito)
  })

  it('o horário de funcionamento vai para o catálogo público', () => {
    expect(texto).toContain(
      "'horarios', coalesce(b.valor -> 'horarios', '{}'::jsonb),",
    )
    // A vitrine continua levando o resto dos dados da casa.
    for (const intacto of [
      "'fotos', coalesce(",
      "'endereco', btrim(coalesce(b.valor ->> 'endereco', ''))",
      "'telefone', btrim(coalesce(b.valor ->> 'telefone', ''))",
    ]) {
      expect(texto).toContain(intacto)
    }
  })

  it('valida `barbearia.horarios` só com dia 0 a 6 e HH:MM', () => {
    expect(texto).toContain("if v_chave = 'barbearia' and p_valor ? 'horarios' then")
    expect(texto).toContain("par.key !~ '^[0-6]$'")
    expect(texto).toContain(
      "if (v_horario ->> 'inicio') !~ '^[0-2][0-9]:[0-5][0-9]$'",
    )
    expect(texto).toContain(
      "or (v_horario ->> 'inicio') >= (v_horario ->> 'fim') then",
    )
    expect(texto).toContain('Horário de funcionamento inválido.')
    expect(texto).toContain('Horário de almoço inválido.')
  })

  it('qualquer serviço ATIVO pode entrar como extra', () => {
    /*
     * Regressão: a etapa de extras vinha da lista que a casa configurava, e
     * ela estava vazia — não oferecia nada. O servidor barra o que não é
     * serviço ativo e o próprio base; o excesso é barrado pela regra de vaga.
     */
    expect(texto).toContain("if not found or v_compl.id = v_base.id then")
    // A whitelist saiu de cena.
    expect(texto).not.toContain(
      "if not (trim(v_item) = any (coalesce(v_base.complementos",
    )
    // E a soma das durações e a delegação continuam como eram.
    for (const intacto of [
      'v_dur := v_dur + coalesce(v_compl.duracao_min, 0);',
      "'[Complementos: ' || array_to_string(v_nomes, ', ') || ']';",
      'select public.agendamento_publico_criar(',
    ]) {
      expect(texto).toContain(intacto)
    }
  })

  it('a regra de criação da 021 NÃO é redefinida aqui', () => {
    // Só o WRAPPER de extras é redefinido. `agendamento_publico_criar` continua
    // sendo a autoridade, chamada por delegação.
    expect(texto).toContain(
      'create or replace function public.agendamento_publico_criar(',
    )
    expect(texto).toContain(
      'create or replace function public.agendamento_publico_criar_complementos(',
    )
    // Nenhuma tabela nova: `barbearia.horarios` é jsonb na configuração.
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/create or replace trigger/i)
    expect(texto).not.toMatch(/\bdrop\b/i)
  })
})
