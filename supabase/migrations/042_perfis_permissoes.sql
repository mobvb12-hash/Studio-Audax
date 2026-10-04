-- ============================================================================
-- Studio Audax — 042: permissões individuais por funcionário
-- ----------------------------------------------------------------------------
-- O painel já tinha UMA camada de permissão (o papel: dono/admin/gerente/
-- recepcao/profissional, em `src/modules/auth/permissoes.ts`) e uma RLS que
-- espelhava esse papel (014/017). Faltava o terceiro nível: conceder OU
-- revogar UMA ação para UMA pessoa, sem trocar o papel dela.
--
-- O que esta migration NÃO faz (de propósito):
--   * não cria outro modelo de papel, não mexe em `perfis.papel` e não
--     substitui `permissoes.ts` — o papel continua sendo o padrão;
--   * não altera nenhuma policy existente: só acrescenta pares novos;
--   * não mexe em Agendamento/Clube/Financeiro além do par de policies.
--
-- Como fica sem nenhuma linha gravada (o caso de produção HOJE):
--   * `current_user_permissao()` devolve NULL;
--   * a restrictive vira `coalesce(NULL, true)`  → não restringe nada;
--   * a permissive vira `NULL is true`           → não concede nada;
--   * e nenhuma policy permissive existente foi tocada.
--   ⇒ comportamento 100% idêntico ao atual. Zero regressão.
--
-- Com uma linha `(perfil, acao, permitido)`:
--   * permitido = false → restrictive nega (revogação) mesmo que o papel
--     permita — é o nível de BANCO que a UI sozinha não tem;
--   * permitido = true  → permissive concede além do papel (OR com as
--     policies permissive já existentes).
--
-- Regras de segurança embutidas:
--   * `dono` nunca é afetado: o helper devolve NULL para o dono e o próprio
--     dono não pode ter linha gravada (a escrita da tabela bloqueia alvo dono);
--   * ninguém escreve nas PRÓPRIAS permissões (anti autoelevação, igual ao
--     trigger `perfis_guardar_papel` da 017) — escrita exige admin E alvo
--     diferente do próprio perfil;
--   * quem alterou fica gravado no banco (`alterado_por` forçado por trigger,
--     com o valor anterior antes da mudança) — auditoria sem tabela nova.
--
-- Idempotente: create table if not exists, create or replace function,
-- drop policy if exists + create policy, drop trigger if exists + create trigger.
-- ============================================================================

create table if not exists public.perfis_permissoes (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  acao text not null check (acao ~ '^[a-z0-9_]+:[a-z0-9_]+$'),
  permitido boolean not null,
  -- quem fez a última alteração; forçado pela trigger para a sessão real.
  alterado_por uuid,
  -- estado anterior da permissão antes da última troca (null = primeira vez).
  anterior jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (perfil_id, acao)
);

alter table public.perfis_permissoes enable row level security;

-- A tabela nasce com os privilégios padrão do schema: eles valem para a
-- sessão autenticada e para o service role. `anon` não lê override nenhum.
revoke all on table public.perfis_permissoes from anon;

-- ----------------------------------------------------------------------------
-- 1) A função única que a UI e a RLS consultam.
--    Devolve:
--      * NULL  → não há override (a regra é a do papel) ou o usuário é dono;
--      * true  → ação concedida a esta pessoa, mesmo que o papel negue;
--      * false → ação revogada desta pessoa, mesmo que o papel permita.
-- ----------------------------------------------------------------------------
create or replace function public.current_user_permissao(p_acao text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- dono é invariável: acesso completo, nunca limitado por override
    when public.current_user_papel() = 'dono' then null
    else (
      select pp.permitido
        from public.perfis_permissoes pp
        join public.perfis pf on pf.id = pp.perfil_id
       where pf.user_id = auth.uid()
         and pp.acao = p_acao
       limit 1
    )
  end;
$$;

grant execute on function public.current_user_permissao(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) RLS da própria tabela de overrides.
--    leitura: a própria linha (a UI precisa saber o que o usuário tem) e admin;
--    escrita: admin, alvo ≠ dono, alvo ≠ o próprio perfil.
-- ----------------------------------------------------------------------------
drop policy if exists perfis_permissoes_select on public.perfis_permissoes;
create policy perfis_permissoes_select on public.perfis_permissoes
  as permissive for SELECT to authenticated
  using (
    public.current_user_is_admin()
    or perfil_id in (select p.id from public.perfis p where p.user_id = auth.uid())
  );

drop policy if exists perfis_permissoes_insert on public.perfis_permissoes;
create policy perfis_permissoes_insert on public.perfis_permissoes
  as permissive for INSERT to authenticated
  with check (
    public.current_user_is_admin()
    and perfil_id <> coalesce(
      (select p.id from public.perfis p where p.user_id = auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and coalesce((select p.papel from public.perfis p where p.id = perfis_permissoes.perfil_id), '') <> 'dono'
  );

drop policy if exists perfis_permissoes_update on public.perfis_permissoes;
create policy perfis_permissoes_update on public.perfis_permissoes
  as permissive for UPDATE to authenticated
  using (
    public.current_user_is_admin()
    and perfil_id <> coalesce(
      (select p.id from public.perfis p where p.user_id = auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and coalesce((select p.papel from public.perfis p where p.id = perfis_permissoes.perfil_id), '') <> 'dono'
  )
  with check (
    public.current_user_is_admin()
    and perfil_id <> coalesce(
      (select p.id from public.perfis p where p.user_id = auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and coalesce((select p.papel from public.perfis p where p.id = perfis_permissoes.perfil_id), '') <> 'dono'
  );

drop policy if exists perfis_permissoes_delete on public.perfis_permissoes;
create policy perfis_permissoes_delete on public.perfis_permissoes
  as permissive for DELETE to authenticated
  using (
    public.current_user_is_admin()
    and perfil_id <> coalesce(
      (select p.id from public.perfis p where p.user_id = auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid
    )
    and coalesce((select p.papel from public.perfis p where p.id = perfis_permissoes.perfil_id), '') <> 'dono'
  );

-- ----------------------------------------------------------------------------
-- 3) Auditoria na própria linha: quem alterou, quando e o valor anterior.
--    A trigger é a autoridade — o cliente não escolhe quem assina nem o
--    histórico, então a coluna `anterior` não pode ser forjada na escrita.
-- ----------------------------------------------------------------------------
create or replace function public.perfis_permissoes_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- a sessão real assina a alteração (service role mantém o valor informado)
  new.alterado_por := coalesce(auth.uid(), new.alterado_por);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    -- primeira gravação: não há valor anterior a registrar
    new.anterior := null;
    return new;
  end if;
  new.anterior := jsonb_build_object(
    'permitido', old.permitido,
    'alterado_por', old.alterado_por,
    'atualizado_em', old.atualizado_em
  );
  return new;
end;
$$;

drop trigger if exists perfis_permissoes_auditar on public.perfis_permissoes;
create trigger perfis_permissoes_auditar
  before insert or update on public.perfis_permissoes
  for each row execute function public.perfis_permissoes_auditar();

-- ----------------------------------------------------------------------------
-- 4) O par restrictive + permissive de cada tabela/ação.
--
--    restrictive (AND):  coalesce(override, true) → só age quando há override
--                        com false, e aí nega a operação inteira.
--    permissive  (OR):   override is true → concede a operação mesmo sem
--                        policy de papel que a permita.
--
--    Sem linha gravada nenhuma das duas muda o resultado — é por isso que
--    esta migration é segura de aplicar com produção rodando.
--
--    Cada ação é a MESMA que o app já usa (`modulo:acao` em permissoes.ts):
--    o mesmo rótulo em UI, em rota e aqui no banco.
-- ----------------------------------------------------------------------------
do $$
declare
  alvo record;
  restritiva text;
  permissiva text;
  expr_restritiva text;
  expr_permissiva text;
begin
  for alvo in
    select * from (values
      ('clientes',             'select', 'clientes:ver'),
      ('clientes',             'insert', 'clientes:criar'),
      ('clientes',             'update', 'clientes:editar'),
      ('clientes',             'delete', 'clientes:excluir'),
      ('servicos',             'select', 'servicos:ver'),
      ('servicos',             'insert', 'servicos:criar'),
      ('servicos',             'update', 'servicos:editar'),
      ('servicos',             'delete', 'servicos:excluir'),
      ('profissionais',        'select', 'profissionais:ver'),
      ('profissionais',        'insert', 'profissionais:criar'),
      ('profissionais',        'update', 'profissionais:editar'),
      ('profissionais',        'delete', 'profissionais:excluir'),
      ('agendamentos',         'select', 'agenda:ver_propria'),
      ('agendamentos',         'insert', 'agenda:criar'),
      ('agendamentos',         'update', 'agenda:editar'),
      ('agendamentos',         'delete', 'agenda:cancelar'),
      ('caixa_lancamentos',    'select', 'caixa:ver'),
      ('caixa_lancamentos',    'insert', 'caixa:lancar_receita'),
      ('caixa_fechamentos',    'select', 'caixa:ver'),
      ('caixa_fechamentos',    'insert', 'caixa:fechar'),
      ('produtos',             'select', 'estoque:ver'),
      ('estoque_movimentacoes','select', 'estoque:movimentacoes_ver'),
      ('estoque_movimentacoes','insert', 'estoque:entrada'),
      ('comissoes_configs',    'select', 'comissoes:ver_proprias'),
      ('comissoes_fechamentos','select', 'comissoes:ver_proprias'),
      ('clube_assinaturas',    'select', 'clube:ver'),
      ('clube_pagamentos',     'select', 'clube:ver'),
      ('crm_interacoes',       'select', 'crm:ver'),
      ('espera_pedidos',       'select', 'espera:ver'),
      ('perfis',               'insert', 'config:perfis_gerenciar'),
      ('perfis',               'update', 'config:perfis_gerenciar'),
      ('perfis',               'delete', 'config:perfis_gerenciar')
    ) as t(tabela, cmd, acao)
  loop
    restritiva := alvo.tabela || '_' || alvo.cmd || '_limite_por_acao';
    permissiva := alvo.tabela || '_' || alvo.cmd || '_por_acao';
    expr_restritiva := format('coalesce(public.current_user_permissao(%L), true)', alvo.acao);
    expr_permissiva := format('public.current_user_permissao(%L) is true', alvo.acao);

    execute format(
      'drop policy if exists %I on public.%I',
      restritiva, alvo.tabela
    );
    if alvo.cmd = 'insert' then
      -- INSERT não aceita USING: o restrictive entra só com WITH CHECK,
      -- que é o que vale na hora de inserir a linha.
      execute format(
        'create policy %I on public.%I as restrictive for %s to authenticated with check (%s)',
        restritiva, alvo.tabela, alvo.cmd, expr_restritiva
      );
    elsif alvo.cmd = 'update' then
      execute format(
        'create policy %I on public.%I as restrictive for %s to authenticated using (%s) with check (%s)',
        restritiva, alvo.tabela, alvo.cmd, expr_restritiva, expr_restritiva
      );
    else
      execute format(
        'create policy %I on public.%I as restrictive for %s to authenticated using (%s)',
        restritiva, alvo.tabela, alvo.cmd, expr_restritiva
      );
    end if;

    execute format(
      'drop policy if exists %I on public.%I',
      permissiva, alvo.tabela
    );
    if alvo.cmd = 'insert' then
      execute format(
        'create policy %I on public.%I as permissive for %s to authenticated with check (%s)',
        permissiva, alvo.tabela, alvo.cmd, expr_permissiva
      );
    elsif alvo.cmd = 'update' then
      execute format(
        'create policy %I on public.%I as permissive for %s to authenticated using (%s) with check (%s)',
        permissiva, alvo.tabela, alvo.cmd, expr_permissiva, expr_permissiva
      );
    else
      execute format(
        'create policy %I on public.%I as permissive for %s to authenticated using (%s)',
        permissiva, alvo.tabela, alvo.cmd, expr_permissiva
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5) Verificação automática: se qualquer passo acima não pegou, o push falha
--    em vez de seguir com uma ilusão de controle de acesso.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.perfis_permissoes') is null then
    raise exception '042: tabela perfis_permissoes nao foi criada';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'perfis_permissoes'
       and policyname = 'perfis_permissoes_insert'
  ) then
    raise exception '042: policy perfis_permissoes_insert nao existe (RLS ausente)';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'clientes'
       and policyname = 'clientes_select_limite_por_acao'
       and qual like '%current_user_permissao%'
  ) then
    raise exception '042: restrictive de clientes nao foi criada';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'clientes'
       and policyname = 'clientes_select_por_acao'
       and qual like '%current_user_permissao%'
  ) then
    raise exception '042: permissive de clientes nao foi criada';
  end if;

  if exists (
    select 1
      from public.perfis_permissoes pp
      join public.perfis pf on pf.id = pp.perfil_id
     where pf.papel = 'dono'
  ) then
    raise exception '042: perfis_permissoes nao pode ter linha de dono';
  end if;
end $$;
