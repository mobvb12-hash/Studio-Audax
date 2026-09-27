-- ============================================================================
-- Studio Audax — Produtos + Estoque (movimentações)
-- ----------------------------------------------------------------------------
-- Objetivo: levar ao Supabase o cadastro de produtos e o histórico de
-- movimentações de estoque, preservando exatamente os ids, quantidades,
-- saldos, custos e rótulos que já existem no localStorage.
--
-- • Espelha os tipos de `src/modules/produtos/types.ts` e
--   `src/modules/estoque/types.ts`. `estoque_movimentacoes` é histórico
--   imutável: `estoque_antes`/`estoque_depois` ficam gravados, então o saldo
--   atual continua sendo o campo `produtos.estoque` (mesma regra do app).
-- • Drift-safe como 003/004/005: `create table if not exists` completa a base
--   criada por `supabase/schema.sql` (que não tem `foto`, `criado_em`,
--   `atualizado_em` em produtos nem `fornecedor`, `motivo`, `observacao` em
--   movimentações) e `add column if not exists` adiciona só o que falta.
-- • Não destrutivo: nenhuma linha é apagada, reescrita ou recriada; toda
--   coluna nova entra com default, preservando as linhas existentes.
-- • Idempotência de estoque: a chave primária é o MESMO id gerado pelo app, e
--   toda escrita é `upsert` por `id`. Reenviar a mesma movimentação (ou a
--   mesma venda inteira) atualiza a linha e NUNCA cria uma segunda
--   movimentação — é o que garante que uma venda repetida não baixe o
--   estoque duas vezes.
-- • O vínculo histórico é o `produto_id`; a FK usa `on delete set null` para
--   nunca apagar movimento quando o cadastro sai.
-- • RLS ligado: acesso somente para usuários autenticados (mesmo modelo das
--   demais tabelas). `anon` não recebe política alguma.
-- ============================================================================

create table if not exists public.produtos (
  id text primary key,
  nome text not null,
  preco numeric(12,2) not null default 0 check (preco > 0),
  custo numeric(12,2) not null default 0 check (custo >= 0),
  estoque integer not null default 0 check (estoque >= 0),
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  categoria text not null default '',
  foto text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.estoque_movimentacoes (
  id text primary key,
  produto_id text references public.produtos (id) on delete set null,
  produto text not null,                -- rótulo no momento (histórico)
  tipo text not null check (tipo in ('inicial', 'entrada', 'venda', 'estorno', 'ajuste')),
  quantidade integer not null,          -- positivo = entrou, negativo = saiu
  estoque_antes integer,
  estoque_depois integer,
  custo_unitario numeric(12,2) not null default 0,
  data date not null,
  hora text not null default '',
  origem text not null check (origem in ('cadastro', 'pdv', 'estorno', 'manual')),
  venda_id text,                        -- lançamento do Caixa (venda/estorno)
  fornecedor text not null default '',
  motivo text not null default '',
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

-- Completa a base vinda da estrutura preliminar (supabase/schema.sql).
alter table public.produtos
  add column if not exists foto text not null default '';
alter table public.produtos
  add column if not exists criado_em timestamptz not null default now();
alter table public.produtos
  add column if not exists atualizado_em timestamptz not null default now();

alter table public.estoque_movimentacoes
  add column if not exists fornecedor text not null default '';
alter table public.estoque_movimentacoes
  add column if not exists motivo text not null default '';
alter table public.estoque_movimentacoes
  add column if not exists observacao text not null default '';

-- `dados jsonb not null` é herança da estrutura preliminar; o app grava coluna
-- a coluna (mesmo tratamento dado a clientes/profissionais/serviços/caixa).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'produtos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.produtos alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'estoque_movimentacoes'
      and column_name = 'dados'
  ) then
    execute 'alter table public.estoque_movimentacoes alter column dados drop not null';
  end if;
end $$;

-- Consultas do app: histórico por produto, baixa por venda e relatórios por dia.
create index if not exists idx_movimentacoes_produto
  on public.estoque_movimentacoes (produto_id);
create index if not exists idx_movimentacoes_venda
  on public.estoque_movimentacoes (venda_id);
create index if not exists idx_movimentacoes_data
  on public.estoque_movimentacoes (data);
create index if not exists idx_produtos_nome on public.produtos (lower(nome));

alter table public.produtos enable row level security;
alter table public.estoque_movimentacoes enable row level security;

-- Re-executável: remove a política anterior antes de recriar (mesmo padrão de
-- 005 e de supabase/schema.sql).
do $$
declare
  t text;
begin
  foreach t in array array['produtos', 'estoque_movimentacoes'] loop
    execute format('drop policy if exists acesso_autenticado on %I', t);
    execute format('drop policy if exists estoque_acesso_autenticado on %I', t);
    execute format(
      'create policy estoque_acesso_autenticado on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
