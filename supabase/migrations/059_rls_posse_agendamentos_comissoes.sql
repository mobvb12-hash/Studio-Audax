-- ============================================================================
-- Studio Audax — 059: posse em agendamentos, comissões, bloqueios e overrides
-- ----------------------------------------------------------------------------
-- PROBLEMA (auditoria final da camada de autorização):
-- a 017 recriou policies `_por_papel` SEM a lógica de posse que a 014
-- declara. Policies permissivas são unidas por OR no Postgres — onde a
-- versão frouxa existe, ela vence a mais restrita. Resultado:
--
--   agendamentos_{select,insert,update}_por_papel
--     profissional vê e cria agendamentos de TODOS
--     (014: "Profissional: somente os agendamentos em que `profissional` é
--      o próprio nome"; a 017 removeu a condição de posse)
--   comissoes_{configs,fechamentos,auditoria}_select_por_papel
--     recepção e profissional enxergam configs/fechamentos/auditoria de
--     todos os profissionais
--     (014: admin/gerente + profissional somente do próprio vínculo;
--      recepção nem constava)
--   bloqueios_{select,insert,update}_por_papel
--     profissional gerencia os bloqueios de todos os colegas
--     (014: "Profissional: somente os próprios bloqueios")
--   pares `*_por_acao` da 042 (overrides) herdam o mesmo defeito: sem
--     envelope de posse, `permitido = true` concede acesso geral.
--
-- O QUE MUDA (somente autorização — nenhuma tabela, coluna, dado, função de
-- negócio, RPC ou regra de preço/comissão/agenda é tocada):
--
--   1. posse do profissional restaurada em agendamentos e bloqueios e em
--      comissões (recepção e profissional) — expressão idêntica à da 014;
--   2. envelope de posse adicionado aos pares `*_por_acao` de agendamentos e
--      comissões (o par restrictive continua intacto: revogação continua
--      funcionando por `COALESCE(current_user_permissao(...), false)`);
--   3. `current_user_permissao()` passa a ignorar overrides de perfil
--      INATIVO (um perfil desativado não tem papel — 017 filtra `ativo` —
--      mas os overrides sobreviviam e concediam acesso via par permissive);
--   4. NADA muda para dono/admin/gerente (continuam passando pelos helpers
--      `current_user_is_admin()` / `current_user_is_gerente_ou_acima()`).
--
-- O que NÃO é alterado (decisão explícita da auditoria — classificado como
-- pendência de produto, relatado no relatório final):
--   * a permissão de recepção em estoque/clube/caixa que a 014 declara mas o
--     mapa único nega (e o inverso em bloqueios para recepção);
--   * a ausência de gates de ação em Produtos, Clube e Estoque;
--   * ~42 ações do mapa que não têm par `*_por_acao` no banco.
--
-- PRÉ-CONDIÇÃO DE DADO (a auditoria não tem permissão de leitura em tabelas,
-- então não pôde verificar em produção): todo perfil com `papel =
-- 'profissional'` precisa de `profissionais.user_id` preenchido com o seu
-- `user_id`. Sem o vínculo, o profissional perde a posse e passa a ver
-- apenas a própria agenda vazia. A migration EMITE UM WARNING se houver
-- algum perfil assim (não bloqueia o push — veja o relatório).
--
-- Idempotente: `drop policy if exists` + `create policy` e
-- `create or replace function`. Pode ser reaplicada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Overrides valem somente para perfil ATIVO.
--    Um perfil inativo já perde o papel (`current_user_papel()` filtra
--    `ativo = true`, 017) e com ele todas as policies `_por_papel`; os
--    overrides, porém, não olhavam `ativo` e ainda concediam acesso pelo
--    par permissive da 042. Mesmo assinatura → `create or replace`.
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
         and pf.ativo
         and pp.acao = p_acao
       limit 1
    )
  end;
$$;

grant execute on function public.current_user_permissao(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) agendamentos — posse do profissional (014) e envelope nos pares 042.
-- ----------------------------------------------------------------------------
drop policy if exists agendamentos_select_por_papel on public.agendamentos;
create policy agendamentos_select_por_papel on public.agendamentos
  as permissive for select to authenticated
  using (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  );

drop policy if exists agendamentos_insert_por_papel on public.agendamentos;
create policy agendamentos_insert_por_papel on public.agendamentos
  as permissive for insert to authenticated
  with check (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  );

drop policy if exists agendamentos_update_por_papel on public.agendamentos;
create policy agendamentos_update_por_papel on public.agendamentos
  as permissive for update to authenticated
  using (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  )
  with check (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  );

drop policy if exists agendamentos_select_por_acao on public.agendamentos;
create policy agendamentos_select_por_acao on public.agendamentos
  as permissive for select to authenticated
  using (
    public.current_user_permissao('agenda:ver_propria') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
      or public.current_user_is_recepcao_ou_acima()
      or (
        public.current_user_papel() = 'profissional'
        and profissional = (
          select p.nome from public.profissionais p
           where p.id = public.current_profissional_id()
        )
      )
    )
  );

drop policy if exists agendamentos_insert_por_acao on public.agendamentos;
create policy agendamentos_insert_por_acao on public.agendamentos
  as permissive for insert to authenticated
  with check (
    public.current_user_permissao('agenda:criar') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
      or public.current_user_is_recepcao_ou_acima()
      or (
        public.current_user_papel() = 'profissional'
        and profissional = (
          select p.nome from public.profissionais p
           where p.id = public.current_profissional_id()
        )
      )
    )
  );

drop policy if exists agendamentos_update_por_acao on public.agendamentos;
create policy agendamentos_update_por_acao on public.agendamentos
  as permissive for update to authenticated
  using (
    public.current_user_permissao('agenda:editar') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
      or public.current_user_is_recepcao_ou_acima()
      or (
        public.current_user_papel() = 'profissional'
        and profissional = (
          select p.nome from public.profissionais p
           where p.id = public.current_profissional_id()
        )
      )
    )
  )
  with check (
    public.current_user_permissao('agenda:editar') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
      or public.current_user_is_recepcao_ou_acima()
      or (
        public.current_user_papel() = 'profissional'
        and profissional = (
          select p.nome from public.profissionais p
           where p.id = public.current_profissional_id()
        )
      )
    )
  );

-- DELETE continua admin/gerente (014): o "cancelar" do sistema é um UPDATE
-- de status e passa por `agenda:editar`; o par restrictive continua
-- revogando por `agenda:cancelar`.
drop policy if exists agendamentos_delete_por_acao on public.agendamentos;
create policy agendamentos_delete_por_acao on public.agendamentos
  as permissive for delete to authenticated
  using (
    public.current_user_permissao('agenda:cancelar') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
    )
  );

-- ----------------------------------------------------------------------------
-- 3) comissões — posse por vínculo (014) para recepção e profissional.
--    014: admin/gerente + profissional próprio; recepção nem constava.
--    O par restrictive (`comissoes_*_select_limite_por_acao`) fica intacto.
-- ----------------------------------------------------------------------------
drop policy if exists comissoes_configs_select_por_papel on public.comissoes_configs;
create policy comissoes_configs_select_por_papel on public.comissoes_configs
  as permissive for select to authenticated
  using (
    public.current_user_papel() in ('recepcao', 'profissional')
    and profissional_id = public.current_profissional_id()
  );

drop policy if exists comissoes_fechamentos_select_por_papel on public.comissoes_fechamentos;
create policy comissoes_fechamentos_select_por_papel on public.comissoes_fechamentos
  as permissive for select to authenticated
  using (
    public.current_user_papel() in ('recepcao', 'profissional')
    and profissional_id = public.current_profissional_id()
  );

drop policy if exists comissoes_auditoria_select_por_papel on public.comissoes_auditoria;
create policy comissoes_auditoria_select_por_papel on public.comissoes_auditoria
  as permissive for select to authenticated
  using (
    public.current_user_papel() in ('recepcao', 'profissional')
    and profissional_id = public.current_profissional_id()
  );

drop policy if exists comissoes_configs_select_por_acao on public.comissoes_configs;
create policy comissoes_configs_select_por_acao on public.comissoes_configs
  as permissive for select to authenticated
  using (
    public.current_user_permissao('comissoes:ver_proprias') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
      or (
        public.current_user_papel() in ('recepcao', 'profissional')
        and profissional_id = public.current_profissional_id()
      )
    )
  );

drop policy if exists comissoes_fechamentos_select_por_acao on public.comissoes_fechamentos;
create policy comissoes_fechamentos_select_por_acao on public.comissoes_fechamentos
  as permissive for select to authenticated
  using (
    public.current_user_permissao('comissoes:ver_proprias') is true
    and (
      public.current_user_is_admin()
      or public.current_user_is_gerente_ou_acima()
      or (
        public.current_user_papel() in ('recepcao', 'profissional')
        and profissional_id = public.current_profissional_id()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 4) bloqueios — só a branch do profissional muda (014: próprios).
--    A branch de recepção permanece exatamente como está (014 a declara).
-- ----------------------------------------------------------------------------
drop policy if exists bloqueios_select_por_papel on public.bloqueios;
create policy bloqueios_select_por_papel on public.bloqueios
  as permissive for select to authenticated
  using (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  );

drop policy if exists bloqueios_insert_por_papel on public.bloqueios;
create policy bloqueios_insert_por_papel on public.bloqueios
  as permissive for insert to authenticated
  with check (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  );

drop policy if exists bloqueios_update_por_papel on public.bloqueios;
create policy bloqueios_update_por_papel on public.bloqueios
  as permissive for update to authenticated
  using (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  )
  with check (
    public.current_user_is_recepcao_ou_acima()
    or (
      public.current_user_papel() = 'profissional'
      and profissional = (
        select p.nome from public.profissionais p
         where p.id = public.current_profissional_id()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5) Verificação (mesmo padrão da 041/042/058): falha alto em vez de seguir
--    com uma ilusão de controle.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc
     where proname = 'current_user_permissao'
       and pronamespace = 'public'::regnamespace
       and prosrc like '%pf.ativo%'
  ) then
    raise exception '059: current_user_permissao nao filtra perfil inativo';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'agendamentos'
       and policyname in ('agendamentos_select_por_papel',
                          'agendamentos_insert_por_papel',
                          'agendamentos_update_por_papel')
       and coalesce(qual, with_check, '') not like '%current_profissional_id%'
  ) then
    raise exception '059: agendamentos por papel continua sem posse do profissional';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'agendamentos'
       and policyname in ('agendamentos_select_por_acao',
                          'agendamentos_insert_por_acao',
                          'agendamentos_update_por_acao')
       and coalesce(qual, with_check, '') not like '%current_profissional_id%'
  ) then
    raise exception '059: par por_acao de agendamentos continua sem envelope de posse';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'agendamentos'
       and policyname = 'agendamentos_delete_por_acao'
       and qual not like '%current_user_is_admin%'
  ) then
    raise exception '059: delete por_acao de agendamentos deixou de ser admin/gerente';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('comissoes_configs', 'comissoes_fechamentos',
                         'comissoes_auditoria')
       and policyname = tablename || '_select_por_papel'
       and (qual not like '%current_profissional_id%'
            or qual like '%recepcao_ou_acima%')
  ) then
    raise exception '059: comissoes por papel continua sem posse por vinculo';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('comissoes_configs', 'comissoes_fechamentos')
       and policyname = tablename || '_select_por_acao'
       and qual not like '%current_profissional_id%'
  ) then
    raise exception '059: par por_acao de comissoes continua sem envelope de posse';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bloqueios'
       and policyname in ('bloqueios_select_por_papel',
                          'bloqueios_insert_por_papel',
                          'bloqueios_update_por_papel')
       and coalesce(qual, with_check, '') not like '%current_profissional_id%'
  ) then
    raise exception '059: bloqueios por papel continua sem posse do profissional';
  end if;

  -- Pré-condição de DADO (não bloqueia o push): sem o vínculo
  -- `profissionais.user_id`, o profissional não tem posse nenhuma.
  if exists (
    select 1 from public.perfis pf
     where pf.papel = 'profissional'
       and pf.ativo
       and not exists (
         select 1 from public.profissionais pr
          where pr.user_id = pf.user_id
       )
  ) then
    raise warning '059: ha perfil profissional ativo sem vinculo em profissionais.user_id - ele veria apenas a propria agenda (vazia). Vincule o cadastro do profissional antes de liberar o acesso.';
  end if;
end $$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
