create table if not exists public.perfis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null default 'admin' check (papel in ('admin', 'recepcao', 'profissional')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;

create policy "perfis_select_autenticado"
  on public.perfis for select
  to authenticated
  using (user_id = auth.uid());

create policy "perfis_insert_autenticado"
  on public.perfis for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "perfis_update_autenticado"
  on public.perfis for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "perfis_delete_autenticado"
  on public.perfis for delete
  to authenticated
  using (user_id = auth.uid());
