-- ============================================================================
-- Studio Audax — Clientes (migração para Supabase)
-- ----------------------------------------------------------------------------
-- • Espelha o tipo `Cliente` de src/modules/clientes/types.ts: colunas para o
--   que é consultado/indexado (nome, telefone, e-mail, status) e jsonb para as
--   estruturas aninhadas (etiquetas, telefones, endereço, preferências).
-- • Ids em `text` para preservar exatamente os ids já existentes no
--   localStorage — nada é recriado nem renomeado.
-- • Não destrutivo: tabela/colunas/índices idempotentes (create if not exists)
--   no mesmo padrão de 001 e 002. Nenhum dado local é apagado por este script.
-- • RLS ligado: acesso somente para usuários autenticados (single-tenant, mesmo
--   modelo de profissionais/serviços). `anon` não recebe política alguma ⇒
--   negado por padrão. Nenhuma chave de serviço no frontend.
-- ============================================================================

create table if not exists public.clientes (
  id text primary key,
  nome text not null,
  telefone text not null default '',
  email text not null default '',
  observacao text not null default '',
  ativo boolean not null default true,
  genero text not null default 'nao_informado',
  cpf text not null default '',
  cnpj text not null default '',
  nascimento text not null default '',
  etiquetas jsonb not null default '[]'::jsonb,
  instagram text not null default '',
  como_nos_conheceu text not null default '',
  telefones jsonb not null default '[]'::jsonb,
  endereco jsonb,
  preferencias jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Compatível com a versão preliminar de supabase/schema.sql (tabela `clientes`
-- enxuta): completa as colunas que ainda não existem.
alter table public.clientes add column if not exists observacao text not null default '';
alter table public.clientes add column if not exists genero text not null default 'nao_informado';
alter table public.clientes add column if not exists cpf text not null default '';
alter table public.clientes add column if not exists cnpj text not null default '';
alter table public.clientes add column if not exists etiquetas jsonb not null default '[]'::jsonb;
alter table public.clientes add column if not exists instagram text not null default '';
alter table public.clientes add column if not exists como_nos_conheceu text not null default '';
alter table public.clientes add column if not exists telefones jsonb not null default '[]'::jsonb;
alter table public.clientes add column if not exists endereco jsonb;
alter table public.clientes add column if not exists preferencias jsonb not null default '{}'::jsonb;

-- Na versão preliminar `dados` (objeto completo) era obrigatório; a migração
-- passa a gravar coluna a coluna, então a coluna antiga vira opcional.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clientes' and column_name = 'dados'
  ) then
    execute 'alter table public.clientes alter column dados drop not null';
  end if;
end $$;

-- Consultas frequentes: listagem por nome, filtro de status, busca por
-- telefone (trava de duplicidade) e aniversariantes do dia.
create index if not exists idx_clientes_nome on public.clientes (nome);
create index if not exists idx_clientes_ativo on public.clientes (ativo);
create index if not exists idx_clientes_telefone on public.clientes (telefone);
create index if not exists idx_clientes_nascimento on public.clientes (nascimento);

alter table public.clientes enable row level security;

create policy "clientes_select_autenticado"
  on public.clientes for select
  to authenticated
  using (true);

create policy "clientes_insert_autenticado"
  on public.clientes for insert
  to authenticated
  with check (true);

create policy "clientes_update_autenticado"
  on public.clientes for update
  to authenticated
  using (true)
  with check (true);

create policy "clientes_delete_autenticado"
  on public.clientes for delete
  to authenticated
  using (true);
