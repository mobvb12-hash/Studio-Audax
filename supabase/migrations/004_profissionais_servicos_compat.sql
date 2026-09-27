-- ============================================================================
-- Studio Audax — Profissionais/Serviços: compatibilidade de schema
-- ----------------------------------------------------------------------------
-- Motivo (C3): `002_profissionais_servicos.sql` só descreve uma base nova. A
-- estrutura preliminar `supabase/schema.sql` cria as mesmas duas tabelas em
-- outro formato:
--   • profissionais: sem `telefone`, `email` e `foto`, com `dados jsonb not null`;
--   • servicos:      sem `criado_em` e `atualizado_em`, com `dados jsonb not null`.
-- O app grava coluna a coluna (nunca envia `dados`) e depende dessas colunas:
-- numa base vinda do `schema.sql`
--   • toda escrita falha com "null value in column dados violates not-null";
--   • `criarProfissional` grava `criado_em` nulo (a coluna existe sem default);
--   • `listar*` devolve linhas sem telefone/e-mail/foto, que a tela não mostra.
-- Esta migration é o mesmo caminho que `003_clientes.sql` já usa para
-- `clientes`: completar o que falta e neutralizar o `dados` obrigatório.
--
-- Não destrutivo: só `add column if not exists`, `alter column ... set default`
-- e `alter column ... drop not null` — nada apaga, reescreve ou recria linha.
-- `drop not null` apenas amplia o que o banco aceita e preserva todos os
-- valores já gravados. Bases criadas por 002 já nascem corretas e aqui não
-- mudam de forma (idempotente: pode rodar quantas vezes).
--
-- Fora do escopo: paridade de tipos/checks (numeric(10,2), duracao_min > 0)
-- não é retro-aplicada em base antiga — o app valida esses valores e 002 já os
-- garante em base nova; mexer nisso exigiria validar linhas legadas.
-- ============================================================================

-- profissionais: colunas lidas e gravadas pelo app que a versão preliminar
-- não tinha. Default '' preenche as linhas existentes (nada fica nulo).
alter table public.profissionais
  add column if not exists telefone text not null default '';
alter table public.profissionais
  add column if not exists email text not null default '';
alter table public.profissionais
  add column if not exists foto text not null default '';

-- A versão preliminar não define default em criado_em e `criarProfissional`
-- não envia a coluna: sem isto o app recebe criadoEm nulo.
alter table public.profissionais
  alter column criado_em set default now();

-- Carimbo de edição: a mesma coluna de `servicos` e `clientes`. Base nova já
-- nasce com ela; aqui completa base antiga (desempate de conflito na carga).
alter table public.profissionais
  add column if not exists atualizado_em timestamptz not null default now();

-- servicos: a versão preliminar não tem os carimbos de tempo.
alter table public.servicos
  add column if not exists criado_em timestamptz not null default now();
alter table public.servicos
  add column if not exists atualizado_em timestamptz not null default now();

-- `dados jsonb not null` é herança da estrutura preliminar. O app grava
-- coluna a coluna, então a coluna deixa de ser obrigatória — mesmo
-- tratamento dado a `clientes` em 003. Valores já gravados são preservados.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profissionais'
      and column_name = 'dados'
  ) then
    execute 'alter table public.profissionais alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'servicos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.servicos alter column dados drop not null';
  end if;
end $$;
