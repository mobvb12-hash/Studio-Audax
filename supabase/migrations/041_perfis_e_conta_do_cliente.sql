-- ============================================================================
-- 041_perfis_e_conta_do_cliente.sql - cliente com conta, sem ver a base
-- ============================================================================
--
-- O QUE ESTE SCRIPT FAZ
--
-- Deixa existir CONTA DE CLIENTE (e-mail + senha) sem que essa conta veja a
-- base de clientes.
--
-- POR QUE ERA OBRIGATÓRIO ANTES DA TELA DE CADASTRO
--
-- As políticas de RLS eram `using (true)`:
--
--   • `clientes`    (003) — select/insert/update/delete liberado a QUALQUER
--     usuário autenticado;
--   • `agendamentos`, `bloqueios`, `agenda_expediente` (007) — `for all to
--     authenticated using (true) with check (true)`.
--
-- Isso era inofensivo porque a única conta autenticada era a da EQUIPE. No
-- minuto em que um cliente se cadastrasse, ele passaria a ler a tabela
-- `clientes` inteira — nome, telefone, e-mail e nascimento de todo mundo — e
-- ainda poderia alterar e apagar qualquer linha. E a ver todos os agendamentos,
-- com nome e telefone de todos os clientes.
--
-- Por isso a tela de cadastro NÃO podia vir antes disto.
--
-- QUEM É QUEM
--
-- `public.perfis` liga `auth.uid()` a um papel. Só dois:
--
--   • `equipe`  — a equipe da casa: vê e escreve em tudo, como hoje.
--   • `cliente` — o dono do agendamento: lê a PRÓPRIA linha de `clientes` e os
--     PRÓPRIOS agendamentos, e não escreve em nada.
--
-- `public.eh_equipe()` responde "esta sessão é da equipe?". Sem ela, toda
-- política repetiria a mesma subconsulta.
--
-- POR QUE `eh_equipe()` É `security definer`
--
-- Porque a política de `perfis` precisa consultar `perfis`, e um `select`
-- normal dentro de uma política de `perfis` entraria em RECURSÃO DE RLS: a
-- política pergunta o papel, a pergunta relê a tabela, que aciona a política de
-- novo, para sempre. A função roda como dono da tabela, que não é submetida a
-- RLS, e o ciclo fecha em uma passada.
--
-- QUEM É EQUIPE AGORA
--
-- Todo usuário que EXISTE no momento desta migration vira equipe. É a única
-- inferência honesta: hoje não existe outra forma de ter conta, então quem tem
-- conta é a equipe.
--
-- ⚠ QUEM CRIAR CONTA DEPOIS DESTA MIGRATION PRECISA SER PROMOVIDO:
--
--     insert into public.perfis (auth_uid, papel, nome)
--     values ('<uuid>', 'equipe', '<nome>');
--
-- Sem isso o usuário novo entra e NÃO vê o painel — por desenho: sem papel
-- explícito, ninguém é equipe. Uma conta cadastrada pelo cliente final nunca
-- entra nessa lista; ela entra como `cliente`, pela Edge Function.
--
-- O QUE NÃO MUDA
--
--   • A equipe continua vendo e fazendo exatamente o que via antes.
--   • O agendamento público não depende de RLS: `agendamento_publico_slots` e
--     `agendamento_publico_criar` são `security definer` e seguem idênticas.
--   • Nenhuma tabela de cliente é apagada; `clientes.auth_uid` só liga a conta.
--   • Nenhum preço, nenhuma regra de vaga, nenhum aviso.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Quem é quem
-- ---------------------------------------------------------------------------

create table if not exists public.perfis (
  auth_uid  uuid primary key references auth.users (id) on delete cascade,
  papel     text not null default 'cliente',
  nome      text not null default '',
  criado_em timestamptz not null default now(),
  constraint perfis_papel check (papel in ('equipe', 'cliente'))
);

comment on table public.perfis is
  'Vínculo entre uma conta do Supabase Auth e o papel no Studio Audax. '
  'Sem linha aqui, NINGUÉM é equipe — é o que impede conta nova de nascer '
  'com acesso de equipe.';

create index if not exists idx_perfis_papel on public.perfis (papel);

-- Todo usuário que já existia é da equipe (ver o comentário do cabeçalho).
insert into public.perfis (auth_uid, papel, nome)
select u.id, 'equipe', coalesce(u.email, '')
  from auth.users u
on conflict (auth_uid) do nothing;

-- ---------------------------------------------------------------------------
-- 2. "Esta sessão é da equipe?"
-- ---------------------------------------------------------------------------

create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.perfis p
     where p.auth_uid = auth.uid()
       and p.papel = 'equipe'
  );
$$;

revoke execute on function public.eh_equipe() from public;
grant execute on function public.eh_equipe() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. As políticas de `perfis`
-- ---------------------------------------------------------------------------

alter table public.perfis enable row level security;

drop policy if exists perfis_select on public.perfis;
drop policy if exists perfis_write_equipe on public.perfis;

-- Cada um lê o próprio perfil; a equipe lê todos (para promover alguém).
create policy perfis_select on public.perfis
  for select to authenticated
  using (auth_uid = auth.uid() or public.eh_equipe());

-- Perfil NÃO nasce por INSERT do próprio usuário: quem cria é a Edge Function
-- (service_role), no cadastro. Sem isso, qualquer conta nova poderia se
-- promover a `equipe` com um insert.
create policy perfis_write_equipe on public.perfis
  for all to authenticated
  using (public.eh_equipe())
  with check (public.eh_equipe());

-- ---------------------------------------------------------------------------
-- 4. `clientes`: a conta é dona da própria linha
-- ---------------------------------------------------------------------------

alter table public.clientes
  add column if not exists auth_uid uuid references auth.users (id) on delete set null;

-- Um cliente, uma conta. Índice parcial porque `null` se repete à vontade:
-- quem ainda não tem conta é a maioria.
create unique index if not exists clientes_auth_uid_unico
  on public.clientes (auth_uid)
  where auth_uid is not null;

drop policy if exists clientes_select_autenticado on public.clientes;
drop policy if exists clientes_insert_autenticado on public.clientes;
drop policy if exists clientes_update_autenticado on public.clientes;
drop policy if exists clientes_delete_autenticado on public.clientes;

-- Cliente lê a PRÓPRIA ficha. Equipe lê todas.
create policy clientes_select on public.clientes
  for select to authenticated
  using (public.eh_equipe() or auth_uid = auth.uid());

-- INSERT, UPDATE e DELETE são da EQUIPE.
--
-- O cadastro do cliente final passa pela Edge Function `cadastro-cliente`, que
-- usa `service_role` e ignora RLS de propósito: é o único caminho em que uma
-- conta nova cria a própria ficha. Uma policy de insert "para o próprio"
-- permitiria a qualquer conta autenticada inserir linha com o
-- `auth_uid` de outra pessoa.
create policy clientes_write_equipe on public.clientes
  for all to authenticated
  using (public.eh_equipe())
  with check (public.eh_equipe());

-- ---------------------------------------------------------------------------
-- 5. `agendamentos`: o cliente vê os próprios
-- ---------------------------------------------------------------------------

alter table public.agendamentos
  add column if not exists cliente_auth_uid uuid
  references auth.users (id) on delete set null;

create index if not exists idx_agendamentos_cliente_auth
  on public.agendamentos (cliente_auth_uid)
  where cliente_auth_uid is not null;

-- Reaproveita o que já existe: a conta é ligada pelo telefone, que é a mesma
-- coisa que a Agenda já usa para achar o cliente. Telefone com o mesmo
-- dígitos conta como o mesmo cliente.
update public.agendamentos a
   set cliente_auth_uid = c.auth_uid
  from public.clientes c
 where a.cliente_auth_uid is null
   and c.auth_uid is not null
   and regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g')
     = regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g');

drop policy if exists agenda_acesso_autenticado on public.agendamentos;
drop policy if exists agenda_acesso_equipe on public.agendamentos;

create policy agenda_acesso on public.agendamentos
  for select to authenticated
  using (public.eh_equipe() or cliente_auth_uid = auth.uid());

create policy agenda_acesso_equipe on public.agendamentos
  for all to authenticated
  using (public.eh_equipe())
  with check (public.eh_equipe());

-- ---------------------------------------------------------------------------
-- 6. `bloqueios` e `agenda_expediente`: só da equipe
-- ---------------------------------------------------------------------------
--
-- São dados de operação da casa, não do cliente. E a vitrine não depende de
-- RLS para lê-los: `agendamento_publico_slots` é `security definer`.

do $$
declare
  t text;
begin
  foreach t in array array['bloqueios', 'agenda_expediente'] loop
    execute format('drop policy if exists agenda_acesso_autenticado on %I', t);
    execute format('drop policy if exists agenda_acesso_equipe on %I', t);
    execute format('drop policy if exists operacao_acesso_equipe on %I', t);
    execute format(
      'create policy operacao_acesso_equipe on %I for all to authenticated '
      || 'using (public.eh_equipe()) with check (public.eh_equipe())',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. O que a conta pode ler de bate-pronto
-- ---------------------------------------------------------------------------
--
-- `clientes` e `agendamentos` mudaram de política; nada mais precisa de
-- grant novo. As tabelas do painel (caixa, produtos, serviços) continuam com as
-- políticas que já existiam — e são de leitura da EQUIPE, que segue com o mesmo
-- acesso de antes.

notify pgrst, 'reload schema';
