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