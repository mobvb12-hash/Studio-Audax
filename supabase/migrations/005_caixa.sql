-- ============================================================================
-- Studio Audax — Caixa (lançamentos, fechamentos, auditoria)
-- ----------------------------------------------------------------------------
-- Objetivo: levar o Caixa ao Supabase como fonte oficial, preservando
-- exatamente os ids, valores, datas, formas de pagamento e descrições que já
-- existem no localStorage (nada é renomeado, recalculado ou recriado).
--
-- • Espelha os tipos de `src/modules/caixa/types.ts`. Colunas para o que é
--   consultado/indexado e `jsonb` para o que é estrutura (itens da venda,
--   resumo do fechamento, reabertura).
-- • Drift-safe como 003 e 004: `create table if not exists` completa a base
--   criada por `supabase/schema.sql` (que não tem `servico`, `produto`,
--   `quantidade`, `itens`, `categoria`, `observacao`, `estornado_em` e deixa
--   `dados` obrigatório) e `add column if not exists` adiciona só o que falta.
-- • Não destrutivo: nenhuma linha é apagada, reescrita ou recriada. Base já
--   no formato novo não muda de forma (idempotente: pode rodar quantas vezes).
-- • Idempotência financeira: a chave primária é o MESMO id gerado pelo app,
--   então reenviar uma pendência faz `upsert` (atualiza) e nunca duplica
--   lançamento, fechamento ou evento de auditoria.
-- • Integridade: os vínculos são apenas indexados (o app liga cliente e
--   assinatura por nome, então FK por nome não existe — ver o comentário de
--   `supabase/schema.sql`).
-- • RLS ligado: acesso somente para usuários autenticados (mesmo modelo de
--   clientes/profissionais/serviços). `anon` não recebe política alguma.
-- ============================================================================

create table if not exists public.caixa_lancamentos (
  id text primary key,
  tipo text not null check (tipo in ('receita', 'despesa')),
  origem text not null check (origem in ('atendimento', 'produto', 'clube', 'despesa')),
  data date not null,                   -- 'YYYY-MM-DD'
  hora text not null default '',        -- 'HH:MM'
  descricao text not null default '',
  valor numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  valor_liquido numeric(12,2) not null default 0,
  forma_pagamento text not null check (
    forma_pagamento in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')
  ),
  cliente text,                         -- nome no momento (histórico)
  cliente_id text references public.clientes (id) on delete set null,
  profissional text,                    -- nome no momento (histórico)
  servico text,
  agendamento_id text,                  -- liga o recebimento ao agendamento
  assinatura_id text,
  produto text,
  quantidade integer,
  itens jsonb not null default '[]'::jsonb,
  categoria text not null default '',   -- despesas
  observacao text not null default '',
  estornado boolean not null default false,
  estornado_em timestamptz,
  criado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.caixa_fechamentos (
  id text primary key,
  data date not null,
  fechado_em timestamptz not null default now(),
  resumo jsonb not null,                -- ResumoFechamento completo
  reaberto jsonb,                       -- { em, motivo } | null
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.caixa_auditoria (
  id text primary key,
  acao text not null check (acao in ('estorno', 'reabertura')),
  data date not null,
  descricao text not null default '',
  motivo text,
  criado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

-- Completa a base vinda da estrutura preliminar (supabase/schema.sql): campos
-- usados pelo app que aquela versão não tinha. Default preserva a linha
-- existente — nada se perde.
alter table public.caixa_lancamentos
  add column if not exists servico text not null default '';
alter table public.caixa_lancamentos
  add column if not exists produto text not null default '';
alter table public.caixa_lancamentos
  add column if not exists quantidade integer;
alter table public.caixa_lancamentos
  add column if not exists itens jsonb not null default '[]'::jsonb;
alter table public.caixa_lancamentos
  add column if not exists categoria text not null default '';
alter table public.caixa_lancamentos
  add column if not exists observacao text not null default '';
alter table public.caixa_lancamentos
  add column if not exists estornado_em timestamptz;

-- `dados jsonb not null` é herança da estrutura preliminar; o app grava
-- coluna a coluna (mesmo tratamento dado a clientes/profissionais/serviços).
-- Valores já gravados são preservados.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'caixa_lancamentos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.caixa_lancamentos alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'caixa_fechamentos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.caixa_fechamentos alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'caixa_auditoria'
      and column_name = 'dados'
  ) then
    execute 'alter table public.caixa_auditoria alter column dados drop not null';
  end if;
end $$;

-- Consultas do app: resumo do dia e trava de pagamento duplicado.
create index if not exists idx_lancamentos_data on public.caixa_lancamentos (data);
create index if not exists idx_lancamentos_agendamento
  on public.caixa_lancamentos (agendamento_id);

alter table public.caixa_lancamentos enable row level security;
alter table public.caixa_fechamentos enable row level security;
alter table public.caixa_auditoria enable row level security;

-- Re-executável: remove a política anterior antes de recriar (mesmo padrão de
-- supabase/schema.sql), valendo tanto para a base nova quanto para a que já
-- tinha a policy `acesso_autenticado`.
do $$
declare
  t text;
begin
  foreach t in array array[
    'caixa_lancamentos', 'caixa_fechamentos', 'caixa_auditoria'
  ] loop
    execute format('drop policy if exists acesso_autenticado on %I', t);
    execute format('drop policy if exists caixa_acesso_autenticado on %I', t);
    execute format(
      'create policy caixa_acesso_autenticado on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
