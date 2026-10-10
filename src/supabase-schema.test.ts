// Schema do Supabase × código do app. O C3 nasceu de um drift aqui: a
// migration 002 descreve uma base nova, mas a estrutura preliminar
// (`supabase/schema.sql`) criava as mesmas tabelas em outro formato e o app
// passava a gravar em colunas inexistentes e a falhar em `dados not null`.
// Estes testes travam as garantias que a migration 004 precisa manter.
import { describe, expect, it } from 'vitest'
import { permissoesDoPapel } from '@/modules/auth/permissoes'

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
  '../supabase/migrations/041_perfis_e_conta_do_cliente.sql',
  '../supabase/migrations/042_perfis_permissoes.sql',
  '../supabase/migrations/043_perfis_papel_check.sql',
      '../supabase/migrations/044_agendamento_dados_do_cliente.sql',
      '../supabase/migrations/045_confirmacao_automatica.sql',
      '../supabase/migrations/046_cron_processar_fila.sql',
      '../supabase/migrations/047_cron_credencial_server_to_server.sql',
      '../supabase/migrations/048_cron_credencial_vault.sql',
      '../supabase/migrations/049_cron_correcao_pg_net.sql',
      '../supabase/migrations/050_cron_schema_net.sql',
      '../supabase/migrations/051_cron_token_dedicado.sql',
      '../supabase/migrations/052_correcao_rpc_fila_pendentes.sql',
      '../supabase/migrations/053_horario_passado.sql',
      '../supabase/migrations/054_origem_publico.sql',
      '../supabase/migrations/055_correcao_typo_trigger.sql',
      '../supabase/migrations/056_cron_retry_notificacoes.sql',
      '../supabase/migrations/057_iniciado_em_notificacoes.sql',
      '../supabase/migrations/058_rls_alinhamento_permissoes.sql',
      '../supabase/migrations/059_rls_posse_agendamentos_comissoes.sql',
      '../supabase/migrations/060_profissionais_update_sem_autoedicao.sql',
      '../supabase/migrations/061_horario_passado_remarcacao.sql',
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
    const conflito = corpo.search(/if exists\s*\(\s*select 1\s+from agendamentos\b/)
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

/* ------------------------------------------------------------------ */
/* 041 - cliente com conta, sem ver a base                              */
/* ------------------------------------------------------------------ */

describe('041 · fecha o using (true) que a conta de cliente ainda conseguia ler', () => {
  const bruto = sql('../supabase/migrations/041_perfis_e_conta_do_cliente.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  /*
   * A versão anterior deste arquivo criava uma SEGUNDA tabela `perfis` com
   * `auth_uid` e papel ('equipe' | 'cliente') — e quebraria na primeira linha
   * que não é `create table if not exists`, porque o `perfis` real existe
   * desde a 001 com `user_id`. Este teste é a trava disso não voltar.
   *
   * Auditado: clientes/agendamentos já são fechados pela 018 (`_select_proprio`)
   * e a escrita já é por papel desde a 017 (`current_user_papel()` é NULL sem
   * linha em `perfis`, e NULL nega tudo). Repetir a regra aqui seria um
   * segundo modelo de papel ao lado do que já existe.
   */
  it('não cria tabela, coluna, política, função nem um segundo modelo de papel', () => {
    for (const proibido of [
      /\bcreate table\b/i,
      /\badd column\b/i,
      /\balter table\b/i,
      /\bcreate policy\b/i,
      /\bcreate or replace function\b/i,
      /\bgrant\b/i,
      /\brevoke\b/i,
      /\binsert into\b/i,
      /\bupdate\b/i,
      /\bdelete from\b/i,
      /\bdrop table\b/i,
      /\bdrop function\b/i,
      /\btruncate\b/i,
    ]) {
      expect(texto).not.toMatch(proibido)
    }
    // `eh_equipe()` e `perfis.auth_uid` são o modelo que já existe (017/001).
    expect(texto).not.toContain('eh_equipe')
    expect(texto).not.toContain('auth_uid')
    // Ninguém é promovido nem rebaixado: sem escrita em `perfis`.
    expect(texto).not.toMatch(/perfis/i)
  })

  it('fecha só o agenda_expediente_select — a política permissiva que sobrava', () => {
    expect(texto).toContain(
      'drop policy if exists agenda_expediente_select on public.agenda_expediente',
    )
    // É a ÚNICA política mexida neste arquivo.
    expect(texto.match(/drop policy if exists/g)).toHaveLength(1)
    // Nenhuma policy liberada a qualquer um pode sobrar nele.
    expect(texto).not.toContain('using (true)')
    expect(texto).not.toContain('with check (true)')
    // Remove a policy, não a tabela nem o dado do expediente.
    expect(texto).not.toMatch(/\bdrop table\b/i)
    expect(texto).not.toMatch(/\btruncate\b/i)
    expect(texto).not.toMatch(/\bdelete from\b/i)
  })

  it('um regresso da policy permissiva vira erro visível, não silêncio', () => {
    /*
     * `drop policy if exists` é idempotente por definição: se alguém
     * recriar `agenda_expediente_select ... using (true)`, a migration
     * seguinte corre sem reclamar. A checagem em `pg_policies` transforma
     * isso em exceção no primeiro SQL Editor.
     */
    expect(texto).toContain('from pg_policies')
    expect(texto).toContain("tablename = 'agenda_expediente'")
    expect(texto).toContain("policyname = 'agenda_expediente_select'")
    expect(texto).toContain('raise exception')
    expect(texto).toContain('agenda_expediente_select ainda existe')
  })

  it('documenta que reaproveita o que já existe, em vez de criar de novo', () => {
    // Os vínculos da conta de cliente são da 018 e continuam valendo.
    expect(bruto).toContain('clientes.auth_user_id')
    expect(bruto).toContain('agendamentos.cliente_id')
    // E o fechamento de acesso é das 014/017/018, não uma terceira via.
    expect(bruto).toContain('018')
    expect(bruto).toContain('017')
    expect(bruto).toContain('014')
    // Nenhuma tabela nova: nada é criado aqui.
    expect(bruto).toMatch(/Nenhuma tabela é criada/i)
  })

  it('o agendamento público continua security definer e não é reescrito', () => {
    // As RPCs do agendamento (012/021/040) não dependem de RLS nem mudam aqui.
    expect(texto).not.toContain(
      'create or replace function public.agendamento_publico_criar(',
    )
    expect(texto).not.toContain(
      'create or replace function public.agendamento_publico_slots(',
    )
  })

  it('recarrega o cache do PostgREST para a política nova valer na hora', () => {
    expect(texto).toContain("notify pgrst, 'reload schema';")
  })
})

/* ------------------------------------------------------------------ */
/* 042 - permissão individual por funcionário, na mesma fonte de antes  */
/* ------------------------------------------------------------------ */

describe('042 - exceção por pessoa sem criar um segundo modelo de papel', () => {
  const bruto = sql('../supabase/migrations/042_perfis_permissoes.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('uma tabela só de exceções, presa ao perfis que já existe', () => {
    expect(texto).toMatch(/create table if not exists public\.perfis_permissoes/)
    expect(texto).toContain('references public.perfis (id) on delete cascade')
    // uma linha por (pessoa, ação) — nada de lista duplicada por sessão
    expect(texto).toContain('primary key (perfil_id, acao)')
    expect(texto).toContain('enable row level security')
    // anon não lê exceção nenhuma
    expect(texto).toContain('revoke all on table public.perfis_permissoes from anon')
    // sem tabela paralela de equipe/usuário/acesso
    expect(texto).not.toMatch(
      /create table if not exists public\.(usuarios|equipe|acessos|permissoes)\b/i,
    )
    expect(texto).not.toContain('eh_equipe')
    expect(texto).not.toContain('auth_uid')
  })

  it('sem linha gravada nada muda: restrictive não restringe, permissive não concede', () => {
    // restrictive: coalesce(null, true) → deixa passar igual a hoje
    expect(texto).toMatch(
      /coalesce\(public\.current_user_permissao\([^)]*\), true\)/,
    )
    // permissive: null is true → false → não concede nada
    expect(texto).toMatch(/public\.current_user_permissao\([^)]*\) is true/)
    // E as policies existentes continuam intactas: só as novas são trocadas.
    expect(texto).not.toMatch(/drop policy if exists \w+_por_papel/)
    expect(texto).not.toMatch(
      /alter table public\.(clientes|servicos|profissionais|agendamentos|caixa_lancamentos|produtos|perfis)\b/i,
    )
    expect(texto).not.toMatch(/\bdelete from\b/i)
    expect(texto).not.toMatch(/\bdrop table\b/i)
    expect(texto).not.toMatch(/\btruncate\b/i)
  })

  it('revogar e conceder usam a MESMA ação, e é a ação do app', () => {
    expect(texto).toContain('as restrictive for')
    expect(texto).toContain('as permissive for')
    expect(texto).toContain('_limite_por_acao')
    // par por tabela/comando: um restrict que nega, um permissive que concede
    expect(texto).toContain("'clientes',             'delete', 'clientes:excluir'")
    expect(texto).toContain("'agendamentos',         'select', 'agenda:ver_propria'")
    expect(texto).toContain("'perfis',               'update', 'config:perfis_gerenciar'")
  })

  it('toda ação gravada no banco existe no mapa único de permissões do app', () => {
    const conhecidas = new Set<string>(permissoesDoPapel('dono'))
    const usadas = [...texto.matchAll(/'([a-z0-9_]+:[a-z0-9_]+)'/g)].map(
      (achado) => achado[1],
    )
    expect(usadas.length).toBeGreaterThan(20)
    for (const acao of usadas) {
      expect(conhecidas.has(acao), `ação desconhecida: ${acao}`).toBe(true)
    }
  })

  it('ninguém escreve nas próprias permissões (anti autoelevação)', () => {
    // escrita só de admin…
    expect(texto).toContain('public.current_user_is_admin()')
    // …com alvo diferente do perfil de quem está gravando…
    expect(texto.match(/perfil_id <> coalesce\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    // …e nunca apontando para o dono.
    expect(texto).toContain(") <> 'dono'")
  })

  it('dono é invariável: o helper devolve null e a própria linha não existe', () => {
    expect(texto).toContain("when public.current_user_papel() = 'dono' then null")
    expect(texto).toMatch(/pf\.papel = 'dono'/)
  })

  it('a função só devolve algo para sessão com uid: sem sessão, null', () => {
    // o filtro é por auth.uid() — sem sessão não há linha que case.
    expect(texto).toContain('where pf.user_id = auth.uid()')
    // e ela só é publicada para a sessão autenticada
    expect(texto).toContain(
      'grant execute on function public.current_user_permissao(text) to authenticated',
    )
  })

  it('auditoria na própria linha: quem alterou, quando e o valor anterior', () => {
    expect(texto).toContain('alterado_por uuid')
    expect(texto).toContain('anterior jsonb')
    expect(texto).toContain('atualizado_em timestamptz not null default now()')
    expect(texto).toContain(
      'create or replace function public.perfis_permissoes_auditar()',
    )
    // a trigger assina: o cliente não escolhe quem alterou nem o histórico
    expect(texto).toContain(
      'new.alterado_por := coalesce(auth.uid(), new.alterado_por);',
    )
    expect(texto).toContain('new.anterior := jsonb_build_object(')
    expect(texto).toContain("'permitido', old.permitido,")
    // primeira gravação não tem valor anterior
    expect(texto).toContain('new.anterior := null;')
  })

  it('a tabela da exceção tem RLS própria, e a checagem falha alto se faltar', () => {
    expect(texto).toContain('from pg_policies')
    expect(texto).toContain("policyname = 'perfis_permissoes_insert'")
    expect(texto).toContain("tablename = 'clientes'")
    expect(texto).toContain('raise exception')
    // se o dono algum dia ganhar linha, o push quebra em vez de segurar
    expect(texto).toMatch(/perfis_permissoes nao pode ter linha de dono/)
  })
})

/* ------------------------------------------------------------------ */
/* 043 - a check de perfis.papel que ficou para trás da 001 editada     */
/* ------------------------------------------------------------------ */

describe('043 - perfis.papel aceita os cinco papéis oficiais', () => {
  const bruto = sql('../supabase/migrations/043_perfis_papel_check.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('só troca a constraint de perfis, e ela vêm com os cinco valores', () => {
    expect(texto).toContain('alter table public.perfis drop constraint if exists perfis_papel_check')
    // os mesmos de PapelPerfil (modules/auth/tipos.ts) e do arquivo 001
    for (const papel of ['dono', 'admin', 'gerente', 'recepcao', 'profissional']) {
      expect(texto, papel).toContain(`'${papel}'`)
    }
    // nenhuma outra tabela, coluna ou política é tocada
    expect(texto).not.toMatch(/create table/i)
    expect(texto).not.toMatch(/add column/i)
    expect(texto).not.toMatch(/create policy|drop policy|enable row level security/i)
    expect(texto).not.toMatch(/alter table public\.(?!perfis\b)/i)
    // e nada destrutivo: nenhum dado e nenhuma tabela caem
    expect(texto).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b/i)
  })

  it('a verificação embutida falha alto se dono/gerente continuarem fora', () => {
    expect(texto).toContain("conname = 'perfis_papel_check'")
    expect(texto).toContain("like '%dono%'")
    expect(texto).toContain("like '%gerente%'")
    expect(texto).toContain('raise exception')
  })

  it('não cria regra entre papel e vínculo profissional', () => {
    expect(texto).not.toMatch(/profissionais|user_id\s*is\s+not\s+null/i)
  })
})

/* ------------------------------------------------------------------ */
/* 044 - e-mail e nascimento na etapa de dados do /agendar              */
/* ------------------------------------------------------------------ */

describe('044 - a etapa de dados do /agendar grava e-mail e nascimento', () => {
  const bruto = sql('../supabase/migrations/044_agendamento_dados_do_cliente.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('grava em `agendamentos.dados` sem alterar a estrutura', () => {
    expect(texto).toContain('dados = coalesce(dados')
    // nem coluna nova, nem tabela nova, e nada destrutivo
    expect(texto).not.toMatch(/\bcreate table\b|\badd column\b|\balter table\b/i)
    expect(texto).not.toMatch(/\bdelete from\b|\btruncate\b|\bdrop table\b|\bdrop column\b/i)
    // o merge preserva o que já estava no jsonb de outra origem
    expect(texto).toContain("|| jsonb_strip_nulls(")
    expect(texto).toContain("'email', nullif(v_email, '')")
    expect(texto).toContain("'nascimento', nullif(v_nasc, '')")
  })

  it('só o wrapper muda — `agendamento_publico_criar` continua a autoridade', () => {
    // As 019/024/027/036 chamam `agendamento_publico_criar` com sete
    // argumentos: redefinir aqui deixaria duas assinaturas e a chamada
    // passaria a ser ambígua.
    expect(texto).not.toContain('create or replace function public.agendamento_publico_criar(')
    expect(texto).toContain('select public.agendamento_publico_criar(')
    expect(texto).toContain(
      'create or replace function public.agendamento_publico_criar_complementos(',
    )
  })

  it('derruba a assinatura antiga antes de criar a nova (sem sobrecarga)', () => {
    expect(texto).toContain(
      'drop function if exists public.agendamento_publico_criar_complementos(',
    )
    expect(texto).toMatch(
      /drop function if exists public\.agendamento_publico_criar_complementos\(\s*text, text, text, text, date, text, text, text\[\]\s*\)/,
    )
    // e refaz o grant da assinatura nova, que morreu junto com o drop
    expect(texto).toMatch(
      /grant execute on function public\.agendamento_publico_criar_complementos\(\s*text, text, text, text, date, text, text, text\[\], text, text\s*\) to anon, authenticated, service_role/,
    )
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })

  it('quem não envia e-mail nem nascimento continua sendo aceito', () => {
    // Obrigatório é regra da tela; o servidor não pode travar o painel (019)
    // nem a IA/WhatsApp, que chamam sem esses dois.
    expect(texto).toContain("p_email text default ''")
    expect(texto).toContain("p_nascimento text default ''")
    // e quando vêm preenchidos, são validados — o formato e o futuro
    expect(texto).toContain("v_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$'")
    expect(texto).toContain('public.audax_nascimento_iso(p_nascimento)')
    expect(texto).toContain("to_char(current_date, 'YYYY-MM-DD')")
  })

  it('não toca em agenda, finanças, clube nem RLS', () => {
    expect(texto).not.toMatch(/create policy|drop policy|enable row level security/i)
    expect(texto).not.toMatch(/caixa|comiss|clube|pote|pagamento/i)
    expect(texto).not.toMatch(/insert into\s+(?!public\.agendamentos)|update public\.(?!agendamentos)/i)
  })
})

/* ------------------------------------------------------------------ */
/* 053 - no dia de hoje, só horário que ainda não passou               */
/* ------------------------------------------------------------------ */

describe('053 - hoje não aceita horário que já passou', () => {
  const bruto = sql('../supabase/migrations/053_horario_passado.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('redefine a AUTORIDADE (agendamento_publico_criar) sem mudar a assinatura', () => {
    expect(texto).toContain(
      'create or replace function public.agendamento_publico_criar(',
    )
    // 019/024/027/036 chamam com SETE argumentos: assinatura nova criaria
    // duas e a chamada passaria a ser ambígua.
    expect(texto).toMatch(
      /public\.agendamento_publico_criar\(\s*p_cliente text,\s*p_telefone text,\s*p_servico text,\s*p_profissional text,\s*p_data date,\s*p_horario text,\s*p_observacao text default ''\s*\)/,
    )
    // Só a autoridade muda: wrappers e painel continuam os das 019/027.
    expect(texto).not.toContain(
      'create or replace function public.agendamento_publico_criar_complementos(',
    )
    expect(texto).not.toContain(
      'create or replace function public.painel_agendamento_criar(',
    )
  })

  it('hoje e "agora" vêm de America/Sao_Paulo, não de current_date (UTC)', () => {
    expect(texto).toContain(
      "v_data_atual date := (now() at time zone 'America/Sao_Paulo')::date",
    )
    expect(texto).toContain(
      "extract(hour from now() at time zone 'America/Sao_Paulo')",
    )
    expect(texto).toContain(
      "extract(minute from now() at time zone 'America/Sao_Paulo')",
    )
    expect(texto).not.toContain('v_data_atual date := current_date')
  })

  it('recusa horário de hoje <= agora, só no dia de hoje, antes do INSERT', () => {
    expect(texto).toContain('if p_data = v_data_atual')
    expect(texto).toContain(
      'and public.audax_minutos(p_horario) <= v_agora_minutos then',
    )
    expect(texto).toContain(
      "raise exception 'Este horário já passou. Escolha um horário futuro.'",
    )
    // a recusa é a PRIMEIRA coisa depois de validar o formato do horário —
    // antes de ler serviço/profissional, do lock e de qualquer escrita
    const formato = texto.indexOf("raise exception 'Horário inválido.'")
    expect(formato).toBeGreaterThan(0)
    expect(texto.indexOf('raise exception', formato + 1)).toBe(
      texto.indexOf("raise exception 'Este horário já passou"),
    )
    expect(texto.indexOf("'Este horário já passou")).toBeLessThan(
      texto.indexOf('insert into agendamentos'),
    )
    // datas futuras: só a trava antiga de "a partir de hoje" continua
    expect(texto).toContain('if p_data is null or p_data < v_data_atual then')
  })

  it('o corpo é o da 040 (a 045 trouxe um corpo velho e derrubou a criação)', () => {
    // A tabela NUNCA teve `dia_semana` (007: chave/inicio/fim/almoco_*):
    // é exatamente a referência que a 045 usava e que quebrava Toda chamada.
    expect(texto).not.toContain('dia_semana')
    expect(texto).not.toContain('current_date')
    // O expediente é o DO DIA da 040, e o lock é o da 021 (reentrante no
    // trigger) — não o advisory avulso do corpo velho.
    expect(texto).toContain(
      'from jsonb_to_record(public.agenda_expediente_do_dia(p_data))',
    )
    expect(texto).toContain('perform public.agenda_lock_slot(p_profissional, p_data);')
    // e a sobreposição continua testando a DURAÇÃO real, não a igualdade
    expect(texto).toContain('+ greatest(coalesce(a.duracao_min, s.duracao_min, 30), 5)')
    // a regra da 045 que fica: nasce confirmado
    expect(texto).toContain("'confirmado'")
    // e o vínculo com a sessão (040/018) volta a existir
    expect(texto).toContain('public.current_cliente_id()')
  })

  it('nada de tabela, política ou trigger novo', () => {
    expect(texto).not.toMatch(/create table|add column|alter table/i)
    expect(texto).not.toMatch(/create policy|drop policy|enable row level security/i)
    expect(texto).not.toMatch(/\bdrop\b/i)
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })
})

/* ------------------------------------------------------------------ */
/* 054 - a reserva da vitrine volta a ser origem = 'publico'           */
/* ------------------------------------------------------------------ */

describe('054 - a vitrine volta a marcar origem publico', () => {
  const bruto = sql('../supabase/migrations/054_origem_publico.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('redefine o wrapper COM o update da 045 + origem publico', () => {
    expect(texto).toContain(
      'create or replace function public.agendamento_publico_criar_complementos(',
    )
    // o corpo é o implantado (045): delega para a autoridade e grava
    // duração total + e-mail/nascimento, com retorno 'confirmado'
    expect(texto).toMatch(
      /public\.agendamento_publico_criar\(\s*p_cliente, p_telefone, p_servico, p_profissional,\s*p_data, p_horario, v_obs\s*\)/,
    )
    expect(texto).toContain("'status', 'confirmado'")
    expect(texto).toContain('v_dur := v_dur + coalesce(v_compl.duracao_min, 0)')
    // E a marca da 036 que a 044/045 perdeu está de volta no update
    expect(texto).toMatch(
      /set duracao_min = v_dur,\s*origem = 'publico',/,
    )
    // sem ela o trigger da 045 não confirma ao cliente (só ao profissional)
    expect(texto).toContain("origem = 'publico'")
  })

  it('só o wrapper muda: autoridade e painel continuam intocados', () => {
    expect(texto).not.toContain(
      'create or replace function public.agendamento_publico_criar(',
    )
    expect(texto).not.toContain(
      'create or replace function public.painel_agendamento_criar(',
    )
    // assinatura igual = redefinition limpa, sem drop de grant
    expect(texto).not.toMatch(/\bdrop\b/i)
    expect(texto).not.toMatch(/create table|add column|alter table/i)
    expect(texto).toMatch(
      /grant execute on function public\.agendamento_publico_criar_complementos\(\s*text, text, text, text, date, text, text, text\[\], text, text\s*\) to anon, authenticated, service_role/,
    )
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })
})

/* ------------------------------------------------------------------ */
/* 055 - typo da 045 no DECLARE do trigger derrubava todo INSERT       */
/* ------------------------------------------------------------------ */

describe('055 - o trigger chama audax_hora_legivel (024), não a variante com E', () => {
  const bruto = sql('../supabase/migrations/055_correcao_typo_trigger.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('redefine ia_notificar_agendamento com o nome REAL da função da 024', () => {
    expect(texto).toContain('create or replace function public.ia_notificar_agendamento()')
    expect(texto).toContain('public.audax_hora_legivel(v_ag.horario)')
    // O typo da 045 ('legible') não existe em nenhum script: a variante
    // correta é 'legivel' — a 024 a cria, 026/037 já a chamavam certa.
    expect(texto).not.toContain('audax_hora_legible(')
    // create or replace sem troca de assinatura = grants e trigger intactos
    expect(texto).not.toMatch(/\bdrop\b/i)
    expect(texto).not.toMatch(/create trigger|create table|alter table/i)
  })

  it('o corpo continua o da 045: fila, flags, mensagens e swallow de erro', () => {
    expect(texto).toContain("'profissional_agendamento:' || v_ag.id")
    expect(texto).toContain("'confirmacao_cliente:' || v_ag.id")
    expect(texto).toContain('Estamos te esperando!')
    expect(texto).toContain('pos_atendimento:')
    expect(texto).toContain('avaliacao:')
    expect(texto).toContain('public.ia_flag_chave(')
    expect(texto).toContain('public.ia_notificar_com_seguranca(')
    // o contrato de não derrubar o INSERT continua: loga e devolve a linha
    expect(texto).toContain("insert into public.ia_eventos (fluxo, intencao, acao, executada, motivo)")
    expect((texto.match(/return v_ag;/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })
})

/* ------------------------------------------------------------------ */
/* 059 - a 017 recriou por_papel SEM a posse que a 014 declara          */
/* ------------------------------------------------------------------ */

describe('059 - posse em agendamentos, comissões, bloqueios e overrides', () => {
  const bruto = sql('../supabase/migrations/059_rls_posse_agendamentos_comissoes.sql')
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  function trecho(nome: string): string {
    const blocos = texto.split(/drop policy if exists/)
    return blocos.find((b) => b.includes(`create policy ${nome} `)) ?? ''
  }

  it('agendamentos volta a ter posse do profissional no papel e no override', () => {
    for (const nome of [
      'agendamentos_select_por_papel',
      'agendamentos_insert_por_papel',
      'agendamentos_update_por_papel',
    ]) {
      const bloco = trecho(nome)
      expect(bloco, nome).not.toBe('')
      expect(bloco, nome).toContain('current_profissional_id()')
      expect(bloco, nome).toContain('profissional = (')
    }
    for (const nome of [
      'agendamentos_select_por_acao',
      'agendamentos_insert_por_acao',
      'agendamentos_update_por_acao',
    ]) {
      const bloco = trecho(nome)
      expect(bloco, nome).not.toBe('')
      expect(bloco, nome).toContain('current_user_permissao(')
      expect(bloco, nome).toContain('current_profissional_id()')
    }
    // cancelamento real é UPDATE; DELETE continua admin/gerente (014)
    const deletePorAcao = trecho('agendamentos_delete_por_acao')
    expect(deletePorAcao).toContain("current_user_permissao('agenda:cancelar')")
    expect(deletePorAcao).toContain('current_user_is_admin()')
    expect(deletePorAcao).not.toContain('current_user_is_recepcao_ou_acima()')
  })

  it('comissões só se enxerga pelo vínculo (recepção e profissional)', () => {
    for (const nome of [
      'comissoes_configs_select_por_papel',
      'comissoes_fechamentos_select_por_papel',
      'comissoes_auditoria_select_por_papel',
      'comissoes_configs_select_por_acao',
      'comissoes_fechamentos_select_por_acao',
    ]) {
      const bloco = trecho(nome)
      expect(bloco, nome).not.toBe('')
      expect(bloco, nome).toContain('current_profissional_id()')
      expect(bloco, nome).not.toContain('current_user_is_recepcao_ou_acima()')
    }
  })

  it('bloqueios: só a branch do profissional muda; recepção fica como está', () => {
    for (const nome of [
      'bloqueios_select_por_papel',
      'bloqueios_insert_por_papel',
      'bloqueios_update_por_papel',
    ]) {
      const bloco = trecho(nome)
      expect(bloco, nome).not.toBe('')
      expect(bloco, nome).toContain('current_user_is_recepcao_ou_acima()')
      expect(bloco, nome).toContain('current_profissional_id()')
    }
  })

  it('override de perfil INATIVO deixa de valer', () => {
    expect(texto).toContain(
      'create or replace function public.current_user_permissao(p_acao text)',
    )
    expect(texto).toMatch(/where pf\.user_id = auth\.uid\(\)\s+and pf\.ativo/)
    expect(texto).toContain('security definer')
    expect(texto).toContain('set search_path = public')
  })

  it('só autorização: recria policy, não toca em tabela, coluna ou dado', () => {
    expect(texto).not.toMatch(/create table|add column|alter table|\btruncate\b/i)
    expect(texto).not.toMatch(/delete\s+from/i)
    // recriação idempotente (drop policy if exists + create policy)
    expect((texto.match(/drop policy if exists/g) || []).length).toBe(
      (texto.match(/create policy/g) || []).length,
    )
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })

  it('a verificação falha alto e avisa sobre profissional sem vínculo', () => {
    expect(texto).toContain('raise exception')
    expect(texto).toContain('raise warning')
    expect(texto).toContain('profissionais.user_id')
  })
})

/* ------------------------------------------------------------------ */
/* 060 - o profissional deixa de alterar o próprio registro            */
/* ------------------------------------------------------------------ */

describe('060 — profissionais não se auto-edita (migração válida e aplicada)', () => {
  const caminho = '../supabase/migrations/060_profissionais_update_sem_autoedicao.sql'
  const bruto = sql(caminho)
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('é migração de verdade: está em supabase/migrations e entrou na lista', () => {
    // Antes vivia em supabase/propostas/ com `STATUS: PROPOSTA` para que nenhum
    // `db push` a aplicasse por engano. A autorização veio, ela foi promovida
    // e a lista oficial da etapa "migrations" teve de mudar junto.
    expect(caminho).toContain('/migrations/')
    expect(bruto).toContain('STATUS: APLICÁVEL')
    expect(bruto).not.toContain('STATUS: PROPOSTA')
    // a 060 é a ÚNICA migration com o número, e ela está em migrations —
    // o teste da etapa "migrations" (lista oficial) falha se a lista não
    // mudar junto com o arquivo.
    expect(
      Object.keys(scripts).filter(
        (p) => p.includes('/migrations/') && p.includes('/060_'),
      ),
    ).toEqual([caminho])
    // nada mais em supabase/propostas: a pasta nem existe mais
    expect(Object.keys(scripts).some((p) => p.includes('/propostas/'))).toBe(
      false,
    )
  })

  it('recria as duas policies de UPDATE sem o ramo de auto-edição', () => {
    expect((texto.match(/drop policy if exists/g) || []).length).toBe(2)
    expect((texto.match(/create policy/g) || []).length).toBe(2)
    expect(texto).toMatch(/create policy "profissionais_update"/)
    expect(texto).toMatch(/create policy profissionais_update_por_acao/)
    // O corpo da policy não pode citar o ramo self-service. As menções a
    // `current_profissional_id` do arquivo vivem SÓ nas aserções E060_*,
    // que verificam justamente que o ramo saiu de lá.
    const policy =
      /create policy "profissionais_update"[\s\S]*?;/.exec(texto)?.[0] ?? ''
    expect(policy).toContain('on public.profissionais')
    expect(policy).not.toContain('current_profissional_id')
    expect(texto).toMatch(
      /using \(\s*public\.current_user_is_admin\(\)\s*or public\.current_user_is_gerente_ou_acima\(\)\s*\)/,
    )
    expect(texto).toMatch(
      /with check \(\s*public\.current_user_is_admin\(\)\s*or public\.current_user_is_gerente_ou_acima\(\)\s*\)/,
    )
  })

  it('a última definição de profissionais_update é a da 060', () => {
    // A 014 continua trazendo o ramo antigo como caminho de reversão, mas a
    // ordem das migrations decide quem vale: 060 tem de ser a última.
    const versao = (p: string): number => Number(/\/(\d+)_/.exec(p)?.[1] ?? 0)
    const recriacoes = Object.keys(scripts)
      .filter((p) => /create policy "profissionais_update"/.test(scripts[p]))
      .sort((a, b) => versao(a) - versao(b))
    expect(recriacoes.length).toBeGreaterThan(1)
    expect(recriacoes[recriacoes.length - 1]).toBe(caminho)
  })

  it('não toca em tabela, coluna, dado ou em outra policy', () => {
    expect(texto).not.toMatch(/create table|add column|alter table|\btruncate\b/i)
    expect(texto).not.toMatch(/delete\s+from/i)
    expect(texto).toMatch(/on public\.profissionais\b/)
    // nenhuma outra tabela recebe policy nesta migration
    const tabelas = [...texto.matchAll(/on public\.(\w+)/g)].map((a) => a[1])
    expect(new Set(tabelas)).toEqual(new Set(['profissionais']))
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })

  it('validação falha alto: onze asserções E060_ cobrem os lados da regra', () => {
    const assercoes = [...texto.matchAll(/raise exception 'E060_(\d+)/g)].map(
      (a) => a[1],
    )
    // E060_10 tem dois `raise` (um por lado) — o que importa é cobertura
    expect([...new Set(assercoes)]).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
    ])
    expect(assercoes.length).toBe(12)
    // garante que olha os DOIS lados (qual e with_check) antes de aceitar
    expect(texto).toMatch(/select qual, with_check into v_qual, v_check/)
    expect(texto).toMatch(/v_qual like '%current_profissional_id%'/)
    expect(texto).toMatch(/v_check like '%current_profissional_id%'/)
    // e que o SELECT de leitura do próprio cadastro é verificado como preservado
    expect(texto).toMatch(/policyname = 'profissionais_select'/)
  })

  it('USING e WITH CHECK são idênticos: ativo, user_id ou qualquer coluna caem na mesma regra', () => {
    // RLS decide por LINHA: não existe regra por coluna. Se os dois lados
    // forem o mesmo predicado, trocar `ativo` (auto-inativação), `user_id`
    // (troca de vínculo = posse no RLS) ou qualquer outro campo passa pelo
    // MESMO portão — não há como contornar mudando a coluna certa.
    const corpo = (abertura: string): { using: string; check: string } => {
      const bloco = new RegExp(`${abertura}[\\s\\S]*?;`).exec(texto)?.[0] ?? ''
      const usando = /using\s*\(([\s\S]*?)\)\s*with check/.exec(bloco)?.[1] ?? ''
      const checando = /with check\s*\(([\s\S]*?)\);/.exec(bloco)?.[1] ?? ''
      const normalizar = (s: string): string => s.replace(/\s+/g, ' ').trim()
      return { using: normalizar(usando), check: normalizar(checando) }
    }

    const principal = corpo('create policy "profissionais_update"')
    expect(principal.using).not.toBe('')
    expect(principal.using).toBe(principal.check)

    const porAcao = corpo('create policy profissionais_update_por_acao')
    expect(porAcao.using).not.toBe('')
    expect(porAcao.using).toBe(porAcao.check)

    // nenhuma das duas cita coluna: a regra é sobre quem é, não sobre o quê
    for (const regra of [principal.using, porAcao.using]) {
      expect(regra).not.toMatch(/\bativo\b|\buser_id\b|\bnome\b|\bpapel\b\s*=/)
    }
  })

  it('nenhum atalho (função, trigger ou RPC) escreve em profissionais fora da RLS', () => {
    // Se uma função SECURITY DEFINER passar a fazer `update profissionais`,
    // ela ignora as policies que esta migration acaba de fechar — o portão
    // precisa continuar sendo SÓ a RLS da tabela.
    const semComentario = (t: string): string =>
      t.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
    const atalhos = Object.entries(scripts)
      .filter(([, corpo]) =>
        /\b(update|insert\s+into|delete\s+from|merge\s+into)\s+(public\.)?profissionais\b/i.test(
          semComentario(corpo),
        ),
      )
      .map(([caminho]) => caminho)
    expect(atalhos).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/* 060 - regra EFETIVA de UPDATE em profissionais                       */
/* (as permissivas são OR entre si: qualquer uma reabre a escrita)      */
/* ------------------------------------------------------------------ */

describe('060 — nenhuma policy de UPDATE volta a conceder autoedição', () => {
  const p014 = '../supabase/migrations/014_rls_role_based.sql'
  const p042 = '../supabase/migrations/042_perfis_permissoes.sql'
  const p058 = '../supabase/migrations/058_rls_alinhamento_permissoes.sql'
  const p060 = '../supabase/migrations/060_profissionais_update_sem_autoedicao.sql'

  it('a única declaração com o ramo próprio é a da 014 (superada pela 060)', () => {
    const comAutoedicao = Object.entries(scripts)
      .filter(([, texto]) => {
        const declaracoes = texto.match(/create policy[\s\S]*?;/gi) || []
        return declaracoes.some(
          (declaracao) =>
            /\bon public\.profissionais\b/i.test(declaracao) &&
            /\bfor\s+update\b/i.test(declaracao) &&
            declaracao.includes('current_profissional_id'),
        )
      })
      .map(([caminho]) => caminho)
    expect(comAutoedicao).toEqual([p014])
  })

  it('a última definição de cada policy de UPDATE não cita o ramo próprio', () => {
    const ultima = (alvo: string): string | undefined =>
      Object.keys(scripts)
        .filter((caminho) =>
          new RegExp(`create policy "?${alvo}"?\\s`, 'i').test(scripts[caminho]),
        )
        .sort(
          (a, b) =>
            Number(/\/(\d+)_/.exec(a)?.[1] ?? 0) -
            Number(/\/(\d+)_/.exec(b)?.[1] ?? 0),
        )
        .pop()

    expect(ultima('profissionais_update')).toBe(p060)
    expect(ultima('profissionais_update_por_papel')).toBe(p058)
    expect(ultima('profissionais_update_por_acao')).toBe(p060)
    // `profissionais_update_limite_por_acao` não tem nome literal: a 042
    // monta <tabela>_<cmd>_limite_por_acao na execução e a 060 não mexe nela.
  })

  it('a 058 mantém _por_papel em gerente+ e a 014 mantém o SELECT próprio', () => {
    const bloco =
      /create policy profissionais_update_por_papel[\s\S]*?;/.exec(sql(p058))?.[0] ??
      ''
    expect(bloco).toContain('current_user_is_gerente_ou_acima()')
    expect(bloco).not.toContain('current_profissional_id')

    const select =
      /create policy "profissionais_select"[\s\S]*?;/.exec(sql(p014))?.[0] ?? ''
    expect(select).toContain('current_profissional_id()')
    expect(sql(p060)).not.toMatch(/drop policy if exists profissionais_select/i)
  })

  it('INSERT e DELETE de profissionais seguem admin/gerente+ — a 060 não os toca', () => {
    const t060 = sql(p060).replace(/--[^\n]*/g, ' ')
    // a 060 só derruba/recria UPDATE: nenhum drop de insert/delete/select
    expect(t060).not.toMatch(/drop policy if exists\s+profissionais_(insert|delete|select)/)
    expect(t060).not.toMatch(/create policy\s+"?profissionais_(insert|delete|select)"?\s/)

    const inserir =
      /create policy "profissionais_insert"[\s\S]*?;/.exec(sql(p014))?.[0] ?? ''
    expect(inserir).toContain('public.current_user_is_gerente_ou_acima()')
    expect(inserir).not.toContain('current_profissional_id')

    const apagar =
      /create policy "profissionais_delete"[\s\S]*?;/.exec(sql(p014))?.[0] ?? ''
    expect(apagar).toContain('public.current_user_is_admin()')
    expect(apagar).not.toContain('recepcao_ou_acima')

    // os pares por papel continuam no nível que a 058 fixou
    const inserirPapel =
      /create policy profissionais_insert_por_papel[\s\S]*?;/.exec(sql(p058))?.[0] ?? ''
    expect(inserirPapel).toContain('current_user_is_gerente_ou_acima()')
    const apagarPapel =
      /create policy profissionais_delete_por_papel[\s\S]*?;/.exec(sql(p058))?.[0] ?? ''
    expect(apagarPapel).toContain('current_user_is_admin()')

    // e a edição de perfil pessoal (tabela perfis) continua fora do alcance
    expect(t060).not.toMatch(/on public\.perfis\b/)
  })

  it('a 042 mantém o template genérico; o gate de papel vem da 060', () => {
    const t042 = sql(p042)
    // par gerado para profissionais/update: a permissive da 042 é só a
    // permissão — é exatamente por isso que ela precisou ser recriada.
    expect(t042).toMatch(/\('profissionais',\s*'update',\s*'profissionais:editar'\)/)
    expect(t042).toContain('public.current_user_permissao(%L) is true')
    // e a RESTRICTIVE é COALESCE(..., true): sem override ela não restringe
    // nada — não é ela que fecha a porta.
    expect(t042).toContain('coalesce(public.current_user_permissao(%L), true)')
    // o template da 042 nunca usa o ramo do próprio registro
    expect(t042).not.toContain('current_profissional_id')
    // nenhum arquivo declara autoedição em profissionais além da 014
    expect(sql(p060)).not.toMatch(/create policy[\s\S]{0,200}current_profissional_id/i)

    // a 060 recria o par com o envelope de papel (formato da 059) nos DOIS lados
    const porAcao =
      /create policy profissionais_update_por_acao[\s\S]*?;/.exec(sql(p060))?.[0] ??
      ''
    expect(porAcao).toContain(
      "public.current_user_permissao('profissionais:editar') is true",
    )
    expect(porAcao).toContain('public.current_user_is_gerente_ou_acima()')
    expect((porAcao.match(/current_user_is_gerente_ou_acima/g) || []).length).toBe(2)
    expect(porAcao).not.toContain('current_profissional_id')
    // a restrictive da 042 continua sendo a única a não ser tocada
    expect(sql(p060)).not.toMatch(
      /drop policy if exists profissionais_update_limite_por_acao/,
    )
    expect(sql(p060)).not.toMatch(
      /create policy profissionais_update_limite_por_acao/,
    )
  })
})

/* ------------------------------------------------------------------ */
/* 060 - o override `profissionais:editar` não concede UPDATE sozinho  */
/* ------------------------------------------------------------------ */

describe('060 — override profissionais:editar sem papel não abre UPDATE', () => {
  const p060 = '../supabase/migrations/060_profissionais_update_sem_autoedicao.sql'
  type Papel = 'dono' | 'admin' | 'gerente' | 'recepcao' | 'profissional'
  type Cenario = { papel: Papel; override: boolean | null; propria: boolean }

  /** Regra efetiva DEPOIS da 060: (qualquer permissiva) AND (todas as restrictives). */
  function updateDepois({ papel, override }: Cenario): boolean {
    const gerenteOuAcima = papel === 'dono' || papel === 'admin' || papel === 'gerente'
    const permissivas = [
      gerenteOuAcima, // profissionais_update (060)
      gerenteOuAcima, // profissionais_update_por_papel (058)
      override === true && gerenteOuAcima, // profissionais_update_por_acao (060)
      // O RAMO `profissional ∧ própria linha` da 014 NÃO entra aqui: ele é
      // justamente o que a 060 remove (o modelo sem ele é o teste).
    ]
    const restrictives = [override !== false] // coalesce(override, true) da 042
    return permissivas.some(Boolean) && restrictives.every(Boolean)
  }

  /** Estado ANTES da 060 (014 + 042) — só para provar que o cenário importa. */
  function updateAntes({ papel, override, propria }: Cenario): boolean {
    const gerenteOuAcima = papel === 'dono' || papel === 'admin' || papel === 'gerente'
    const permissivas = [
      gerenteOuAcima || (papel === 'profissional' && propria), // 014
      override === true, // 042: permissão sozinha concedia
    ]
    const restrictives = [override !== false]
    return permissivas.some(Boolean) && restrictives.every(Boolean)
  }

  it('sem override, quem muda é só quem já podia (dono/admin/gerente)', () => {
    const semOverride = (papel: Papel, propria = false): Cenario => ({
      papel,
      override: null,
      propria,
    })
    expect(updateDepois(semOverride('dono'))).toBe(true)
    expect(updateDepois(semOverride('admin'))).toBe(true)
    expect(updateDepois(semOverride('gerente'))).toBe(true)
    expect(updateDepois(semOverride('recepcao'))).toBe(false)
    expect(updateDepois(semOverride('profissional', true))).toBe(false)
    expect(updateDepois(semOverride('profissional', false))).toBe(false)
  })

  it('COM override concedido, profissional e recepção continuam sem UPDATE', () => {
    const comOverride = (papel: Papel, propria = true): Cenario => ({
      papel,
      override: true,
      propria,
    })
    // o cenário da auditoria: o override existe e a pessoa tem a linha em mãos
    expect(updateDepois(comOverride('profissional', true))).toBe(false)
    expect(updateDepois(comOverride('profissional', false))).toBe(false)
    expect(updateDepois(comOverride('recepcao', true))).toBe(false)
    // e o mesmo cenário, ANTES da 060, abria a porta pelos DOIS caminhos
    expect(updateAntes(comOverride('profissional', true))).toBe(true)
    expect(updateAntes(comOverride('recepcao', true))).toBe(true)
    // quem já podia continua podendo com o override em mãos
    expect(updateDepois(comOverride('gerente'))).toBe(true)
    expect(updateDepois(comOverride('admin'))).toBe(true)
    expect(updateDepois({ papel: 'dono', override: true, propria: true })).toBe(true)
  })

  it('a revogação (permitido = false) continua vetando até para gerente', () => {
    const vetado = (papel: Papel): Cenario => ({ papel, override: false, propria: true })
    expect(updateDepois(vetado('gerente'))).toBe(false)
    expect(updateDepois(vetado('admin'))).toBe(false)
    expect(updateDepois(vetado('profissional'))).toBe(false)
    // sem linha de override, o veto não existe e o papel volta a valer
    expect(updateDepois({ papel: 'gerente', override: null, propria: true })).toBe(true)
  })

  it('a regra modelada bate com o texto real das três policies', () => {
    const texto = sql(p060)
    // 1) a autoedição da 014 saiu — o ramo que o modelo deixou de considerar
    expect(texto).not.toMatch(/create policy "profissionais_update"[\s\S]{0,300}current_profissional_id/)
    // 2) o override agora exige papel nos DOIS lados
    const porAcao =
      /create policy profissionais_update_por_acao[\s\S]*?;/.exec(texto)?.[0] ?? ''
    expect(porAcao).toContain("public.current_user_permissao('profissionais:editar') is true")
    expect(porAcao).toContain('public.current_user_is_gerente_ou_acima()')
    // 3) a restrictive continua sendo a da 042 (coalesce → true sem override)
    const t042 = sql('../supabase/migrations/042_perfis_permissoes.sql')
    expect(t042).toContain('coalesce(public.current_user_permissao(%L), true)')
    // 4) e as aserções da migration cobrem exatamente esses três pontos
    for (const assercao of ['E060_3', 'E060_10', 'E060_11']) {
      expect(texto).toContain(`raise exception '${assercao}`)
    }
  })
})

/* ------------------------------------------------------------------ */
/* 061 - remarcar também não aceita horário de hoje que já passou      */
/* ------------------------------------------------------------------ */

describe('061 — remarcação não aceita horário de hoje que já passou', () => {
  const caminho = '../supabase/migrations/061_horario_passado_remarcacao.sql'
  const p015 = '../supabase/migrations/015_ia_agendamentos_whatsapp.sql'
  const bruto = sql(caminho)
  const texto = bruto.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')

  it('redefine SÓ ia_agendamento_remarcar, com a MESMA assinatura de 5 argumentos', () => {
    expect(texto).toContain(
      'create or replace function public.ia_agendamento_remarcar(',
    )
    expect(texto).toMatch(
      /p_id text,\s*p_telefone text,\s*p_data date,\s*p_horario text,\s*p_profissional text/,
    )
    // 019 e o webhook chamam com cinco: assinatura nova criaria DUAS e a
    // chamada passaria a ser ambígua.
    expect(texto).toMatch(
      /ia_agendamento_remarcar\(text, text, date, text, text\)/,
    )
    expect(
      [...texto.matchAll(/create or replace function public\.(\w+)/g)].map(
        (a) => a[1],
      ),
    ).toEqual(['ia_agendamento_remarcar'])
    // nenhuma tabela, policy, trigger ou coluna nova
    expect(texto).not.toMatch(
      /create table|create policy|create trigger|add column|alter table/i,
    )
    expect(texto).not.toMatch(/delete\s+from|drop\s+table|truncate/i)
  })

  it('é a ÚLTIMA definição da função — a ordem decide quem vale', () => {
    const versao = (p: string): number => Number(/\/(\d+)_/.exec(p)?.[1] ?? 0)
    const recriacoes = Object.keys(scripts)
      .filter((p) =>
        /create or replace function public\.ia_agendamento_remarcar\(/.test(
          scripts[p],
        ),
      )
      .sort((a, b) => versao(a) - versao(b))
    expect(recriacoes).toEqual([p015, caminho])
  })

  it('recusa horário de hoje <= agora, com a MESMA frase da 053', () => {
    const frase = 'Este horário já passou. Escolha um horário futuro.'
    expect(texto).toContain(
      "v_hoje date := (now() at time zone 'America/Recife')::date",
    )
    expect(texto).toContain('v_agora_minutos :=')
    expect(texto).toContain('if p_data = v_hoje')
    expect(texto).toContain(
      'and public.audax_minutos(p_horario) <= v_agora_minutos then',
    )
    expect(texto).toContain(`raise exception '${frase}'`)
    // a frase é LITERALMENTE a da 053 (mesma frase da tela nos dois caminhos)
    expect(sql('../supabase/migrations/053_horario_passado.sql')).toContain(
      `raise exception '${frase}'`,
    )
    // a definição anterior (015) validava data/formato mas NÃO o horário
    // de hoje — é a 061 que fecha o gap, e só ela tem o corte.
    expect(sql(p015)).not.toContain('v_agora_minutos')
    expect(sql(p015)).not.toContain(frase)
  })

  it('o corte vem depois do "nada mudou" e antes de QUALQUER escrita', () => {
    const noOp = texto.indexOf("json_build_object('ok', true, 'igual', true)")
    const corte = texto.indexOf("raise exception 'Este horário já passou")
    const escrita = texto.indexOf('update public.agendamentos a')
    expect(noOp).toBeGreaterThan(0)
    expect(corte).toBeGreaterThan(noOp)
    expect(escrita).toBeGreaterThan(corte)
    // datas futuras não passam pelo corte (só o dia igual a "hoje")
    expect(texto).toContain('if p_data = v_hoje')
    expect(texto).not.toContain('if p_data <= v_hoje')
  })

  it('todas as validações da 015 continuam: o corte é um ACRÉSCIMO', () => {
    for (const trecho of [
      "raise exception 'Identificador inválido.'",
      "raise exception 'Telefone inválido.'",
      "raise exception 'Escolha uma data a partir de hoje.'",
      "raise exception 'Horário inválido.'",
      "raise exception 'Profissional inválido.'",
      "raise exception 'Agendamento não encontrado.'",
      "raise exception 'Este agendamento não está mais ativo.'",
      "raise exception 'Profissional indisponível.'",
      "raise exception 'Horário fora do expediente (% às %).'",
      "raise exception 'Horário bloqueado pelo almoço (% às %).'",
      "raise exception 'Horário bloqueado: % (% às %).'",
      "raise exception 'Este horário acabou de ser ocupado. Escolha outro.'",
    ]) {
      expect(texto, trecho).toContain(trecho)
    }
    // a remarcação continua anexando o histórico em `remarcacoes`
    expect(texto).toContain('remarcacoes = coalesce(a.remarcacoes')
    // posse inalterada: só a linha com o MESMO telefone responde
    expect(texto).toContain('public.audax_digitos(a.telefone) = v_fone')
  })

  it('grants idênticos aos da 015: SOMENTE service_role', () => {
    expect(texto).toMatch(
      /revoke execute on function public\.ia_agendamento_remarcar\(text, text, date, text, text\)\s+from public, anon, authenticated/,
    )
    expect(texto).toMatch(
      /grant execute on function public\.ia_agendamento_remarcar\(text, text, date, text, text\)\s+to service_role/,
    )
    // anon/authenticated continuam sem acesso: quem é cliente entra pela 019
    expect(texto).not.toMatch(
      /grant execute on function public\.ia_agendamento_remarcar[^\n]*to (anon|authenticated)/,
    )
    expect(texto).toContain("notify pgrst, 'reload schema'")
  })

  it('a Agenda interna NÃO usa esta função: o corte não mexe na tela da equipe', () => {
    // `ia_agendamento_remarcar` só é alcançada pela 019 (Painel do cliente,
    // security definer) e pelo webhook com a chave secreta. Nenhum arquivo da
    // Agenda interna a chama.
    const chamadores = Object.entries(scripts)
      .filter(([p, corpo]) => p !== caminho && /perform public\.ia_agendamento_remarcar\(/.test(corpo))
      .map(([p]) => p)
    expect(chamadores).toEqual(['../supabase/migrations/019_painel_agendamento.sql'])
    // e o app só a alcança pela RPC do Painel
    expect(sql(p015)).toContain('revoke execute on function public.ia_agendamento_remarcar')
  })
})
