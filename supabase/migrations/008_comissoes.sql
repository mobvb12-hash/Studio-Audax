-- ============================================================================
-- Studio Audax — Comissões (configurações, fechamentos, auditoria)
-- ----------------------------------------------------------------------------
-- Objetivo: levar ao Supabase as comissões dos profissionais, preservando
-- exatamente percentual, produção, período, valor de comissão e trilha de
-- auditoria que já existem no localStorage.
--
-- • Espelha `src/modules/comissoes/types.ts`. A configuração é indexada pelo
--   próprio `profissional_id` (chave natural no app: um percentual por
--   profissional) — por isso o `upsert` é por `profissional_id`.
-- • O MÓDULO NÃO ARMAZENA PRODUÇÃO: a produção do período é calculada na hora
--   do fechamento a partir dos lançamentos do Caixa (função pura em
--   `producao.ts`) e o resultado fica gravado no próprio fechamento. Não há
--   vale/bônus nem valor fixo no módulo hoje, então nada é inventado aqui.
-- • Drift-safe como 003–007: `create table if not exists` completa a base criada
--   por `supabase/schema.sql` e `add column if not exists` adiciona só o que
--   falta. Nenhuma linha é apagada ou reescrita.
-- • `atualizado_em` (configurações) é apenas o carimbo de conflito da
--   sincronização, mesmo papel de produtos/serviços/agenda. Para fechamento e
--   auditoria o carimbo já existe no próprio registro (`fechado_em` /
--   `reaberto.em` / `criado_em`).
-- • Idempotência: a chave primária é o MESMO id gerado pelo app (ou o
--   `profissional_id` da config), então reenviar o mesmo fechamento continua
--   sendo UM fechamento — a comissão não é paga duas vezes.
-- • Imutabilidade preservada: o app só acrescenta `reaberto`; a trigger/regra
--   de negócio continua no módulo, nada é gravado aqui fora do espelho.
-- • Vínculo com o cadastro: `profissional_id` referencia `profissionais` (que já
--   está no Supabase). Fechamento e auditoria usam `on delete set null` para
--   nunca apagar histórico de comissão quando o cadastro sai.
-- • RLS ligado: acesso somente para usuários autenticados. `anon` não recebe
--   política alguma.
-- ============================================================================

create table if not exists public.comissoes_configs (
  profissional_id text primary key references public.profissionais (id) on delete cascade,
  percentual numeric(5,2) not null default 0 check (percentual >= 0 and percentual <= 100),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.comissoes_fechamentos (
  id text primary key,
  profissional_id text references public.profissionais (id) on delete set null,
  profissional_nome text not null default '',
  periodo_inicio date not null,
  periodo_fim date not null,
  qtd_atendimentos integer not null default 0,
  producao numeric(12,2) not null default 0,
  percentual numeric(5,2) not null default 0,
  comissao numeric(12,2) not null default 0,
  fechado_em timestamptz not null default now(),
  atualizado_em timestamptz,             -- carimbo da sincronização (rename/reabertura)
  reaberto jsonb,                       -- { em, motivo } | null
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.comissoes_auditoria (
  id text primary key,
  profissional_id text references public.profissionais (id) on delete set null,
  profissional_nome text not null default '',
  acao text not null default 'fechamento' check (acao in ('fechamento', 'reabertura')),
  periodo_inicio date not null,
  periodo_fim date not null,
  descricao text not null default '',
  motivo text,
  criado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

-- Completa a base vinda da estrutura preliminar (supabase/schema.sql): a
-- versão preliminar não guardava o tipo do evento nem os carimbos usados
-- apenas pela sincronização.
alter table public.comissoes_auditoria
  add column if not exists acao text not null default 'fechamento';
alter table public.comissoes_configs
  add column if not exists atualizado_em timestamptz not null default now();
alter table public.comissoes_fechamentos
  add column if not exists atualizado_em timestamptz;

-- `dados jsonb not null` é herança da estrutura preliminar; o app grava coluna
-- a coluna (mesmo tratamento dado às demais tabelas).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comissoes_configs'
      and column_name = 'dados'
  ) then
    execute 'alter table public.comissoes_configs alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comissoes_fechamentos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.comissoes_fechamentos alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'comissoes_auditoria'
      and column_name = 'dados'
  ) then
    execute 'alter table public.comissoes_auditoria alter column dados drop not null';
  end if;
end $$;

-- Consultas do app: histórico por profissional, por período e auditoria.
create index if not exists idx_comissoes_fechamentos_profissional
  on public.comissoes_fechamentos (profissional_id);
create index if not exists idx_comissoes_fechamentos_periodo
  on public.comissoes_fechamentos (periodo_inicio, periodo_fim);
create index if not exists idx_comissoes_auditoria_profissional
  on public.comissoes_auditoria (profissional_id);

alter table public.comissoes_configs enable row level security;
alter table public.comissoes_fechamentos enable row level security;
alter table public.comissoes_auditoria enable row level security;

-- Re-executável: remove a política anterior antes de recriar (mesmo padrão de
-- 005–007 e de supabase/schema.sql).
do $$
declare
  t text;
begin
  foreach t in array array[
    'comissoes_configs', 'comissoes_fechamentos', 'comissoes_auditoria'
  ] loop
    execute format('drop policy if exists acesso_autenticado on %I', t);
    execute format('drop policy if exists comissoes_acesso_autenticado on %I', t);
    execute format(
      'create policy comissoes_acesso_autenticado on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
