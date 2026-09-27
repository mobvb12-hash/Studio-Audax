create table if not exists public.profissionais (
  id text primary key,
  nome text not null,
  telefone text not null default '',
  email text not null default '',
  foto text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.servicos (
  id text primary key,
  nome text not null,
  preco numeric(10,2) not null default 0 check (preco >= 0),
  duracao_min integer not null default 30 check (duracao_min > 0),
  categoria text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.profissionais enable row level security;
alter table public.servicos enable row level security;

create policy "profissionais_select_autenticado"
  on public.profissionais for select
  to authenticated
  using (true);

create policy "profissionais_insert_autenticado"
  on public.profissionais for insert
  to authenticated
  with check (true);

create policy "profissionais_update_autenticado"
  on public.profissionais for update
  to authenticated
  using (true)
  with check (true);

create policy "profissionais_delete_autenticado"
  on public.profissionais for delete
  to authenticated
  using (true);

create policy "servicos_select_autenticado"
  on public.servicos for select
  to authenticated
  using (true);

create policy "servicos_insert_autenticado"
  on public.servicos for insert
  to authenticated
  with check (true);

create policy "servicos_update_autenticado"
  on public.servicos for update
  to authenticated
  using (true)
  with check (true);

create policy "servicos_delete_autenticado"
  on public.servicos for delete
  to authenticated
  using (true);
