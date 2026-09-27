-- ============================================================================
-- Studio Audax — Audax Club (assinaturas e pagamentos)
-- ----------------------------------------------------------------------------
-- Objetivo: levar ao Supabase as assinaturas e os pagamentos do clube,
-- preservando exatamente o que o app já guarda: plano, mensalidade
-- contratada, datas, vencimento, cancelamento, vínculo com o cliente, o
-- lançamento do Caixa e o vencimento coberto.
--
-- • Espelha `src/modules/clube/types.ts`. A estrutura preliminar
--   (`supabase/schema.sql`) já tinha as duas tabelas com as mesmas colunas;
--   esta migration completa o que falta, sem reescrever dado existente.
-- • O STATUS NÃO É COLUNA: é sempre derivado de `proximo_vencimento` +
--   `cancelada` em `src/modules/clube/regras.ts`. Armazenar status criaria a
--   possibilidade de estado financeiro inconsistente, então não se cria.
-- • `valor_mensal` é o snapshot contratado na assinatura: preço de plano não
--   é regra deste script (planos e preços continuam no app, sem alteração).
-- • `atualizado_em` (assinaturas) é apenas o carimbo de conflito da
--   sincronização, mesmo papel de produtos/serviços/agenda/comissões: uma
--   assinatura muda quando o cadastro é editado, quando é cancelada ou quando
--   um pagamento renova o ciclo. Pagamento é histórico e não muda — o próprio
--   `criado_em` é o carimbo dele.
-- • Idempotência: a chave primária é o MESMO id gerado pelo app, então
--   reenviar assinatura ou pagamento continua sendo UM registro. A trava de
--   "cobrança do ciclo já paga" (inclusive quando o lançamento do caixa foi
--   estornado e a cobrança pode ser refeita) é regra do app, e por isso NÃO
--   vira índice único aqui: uma restrição nesse par recusaria um caso legítimo
--   de re-cobrança.
-- • `caixa_lancamento_id` e `cliente_id` ficam sem foreign key de propósito (o
--   app grava o pagamento depois do lançamento do Caixa; exigir a referência
--   no banco travaria o reenvio de um pagamento cujo lançamento ainda está
--   pendente). `assinatura_id` mantém a referência ao club, com
--   `on delete no action`, para o histórico de pagamento nunca sumir.
-- • RLS ligado: acesso somente para usuários autenticados. `anon` não recebe
--   política alguma.
-- • Drift-safe como 003–008: `create table if not exists` completa a base
--   criada por `supabase/schema.sql` e `add column if not exists` adiciona só
--   o que falta. Nenhuma linha é apagada ou reescrita.
-- ============================================================================

create table if not exists public.clube_assinaturas (
  id text primary key,
  cliente_id text references public.clientes (id) on delete set null,
  cliente text not null default '',
  plano text not null default 'cabelo',
  valor_mensal numeric(12,2) not null default 0,
  data_assinatura date not null,
  proximo_vencimento date not null,
  cancelada boolean not null default false,
  cancelada_em date,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.clube_pagamentos (
  id text primary key,
  assinatura_id text references public.clube_assinaturas (id) on delete no action,
  cliente_id text,                      -- texto puro: ver nota sobre o Caixa acima
  data date not null,
  valor numeric(12,2) not null default 0,
  forma_pagamento text not null default 'outro',
  caixa_lancamento_id text,
  vencimento_coberto date,
  criado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

-- Completa a base vinda da estrutura preliminar (supabase/schema.sql).
alter table public.clube_assinaturas
  add column if not exists atualizado_em timestamptz not null default now();
alter table public.clube_pagamentos
  add column if not exists criado_em timestamptz not null default now();

-- `dados jsonb not null` é herança da estrutura preliminar; o app grava coluna
-- a coluna (mesmo tratamento dado às demais tabelas).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clube_assinaturas'
      and column_name = 'dados'
  ) then
    execute 'alter table public.clube_assinaturas alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clube_pagamentos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.clube_pagamentos alter column dados drop not null';
  end if;
end $$;

-- Consultas do app: assinaturas do cliente, histórico da assinatura, cycle
-- coberto e lançamento do caixa ligado ao pagamento.
create index if not exists idx_clube_assinaturas_cliente
  on public.clube_assinaturas (cliente_id);
create index if not exists idx_clube_pagamentos_assinatura
  on public.clube_pagamentos (assinatura_id);
create index if not exists idx_clube_pagamentos_caixa
  on public.clube_pagamentos (caixa_lancamento_id);
create index if not exists idx_clube_pagamentos_vencimento
  on public.clube_pagamentos (assinatura_id, vencimento_coberto);

alter table public.clube_assinaturas enable row level security;
alter table public.clube_pagamentos enable row level security;

-- Re-executável: remove a política anterior antes de recriar (mesmo padrão de
-- 005–008 e de supabase/schema.sql).
do $$
declare
  t text;
begin
  foreach t in array array['clube_assinaturas', 'clube_pagamentos'] loop
    execute format('drop policy if exists acesso_autenticado on %I', t);
    execute format('drop policy if exists clube_acesso_autenticado on %I', t);
    execute format(
      'create policy clube_acesso_autenticado on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
