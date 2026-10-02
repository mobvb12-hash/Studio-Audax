-- ============================================================================
-- Studio Audax — 017: hardening de segurança e alinhamento com produção
-- ----------------------------------------------------------------------------
-- 1) `current_user_papel()` deixa de assumir 'recepcao' quando não há perfil
--    ou o perfil está inativo: o fallback concedia leitura de recepção a
--    qualquer sessão autenticada sem perfil ativo (fail-open em TODAS as
--    policies que usam os helpers da 014). Com o papel nulo as policies
--    falham fechado — produção hoje tem 0 usuários sem perfil e 0 perfis
--    inativos, então ninguém perde acesso.
-- 2) Trigger `perfis_guardar_papel`: `perfis_insert`/`perfis_update` permitem
--    ao próprio usuário inserir/atualizar a própria linha e o with_check não
--    impedia trocar `papel` para um papel privilegiado (escalação de
--    privilégio). O trigger exige admin para criar papel privilegiado ou
--    alterar user_id/papel/ativo. Escrita sem sessão (service role ou
--    aplicação da migration) segue livre.
-- 3) Remove a política ampla residual da 006 em `produtos`
--    (`estoque_acesso_autenticado`, for all using (true)): a 014 derrubava
--    outro nome (`produtos_acesso_autenticado`) e em produção o efeito foi
--    limpo fora do versionamento — em replay limpo das migrations a política
--    ampla voltaria a existir.
-- 4) Policies UPDATE espelhando as INSERT em caixa_auditoria,
--    comissoes_auditoria, clube_pagamentos e estoque_movimentacoes: o reenvio
--    de pendência é upsert pelo mesmo id do app e, sem UPDATE, falhava
--    quando a linha já tinha chegado ao servidor.
-- 5) Trigger `agendamentos_sem_sobreposicao`: a trava de conflito existia
--    só no app (duas telas liam antes de escrever). Produção está com 0
--    sobreposições, então o banco passa a recusar agendamento em horário já
--    ocupado do mesmo profissional no mesmo dia — 'cancelado' e
--    'nao_compareceu' continuam fora da conta, igual ao app.
-- 6) As 67 policies que existem apenas no banco de produção (criadas
--    direto no painel, sem commit) são reproduzidas aqui: sem isso, um banco
--    criado só pelas migrations teria controle de acesso DIFERENTE do que
--    está em produção. Aplicar em produção é no-op (mesmo nome e conteúdo).
--
-- Idempotente: create or replace, drop policy if exists + create policy,
-- drop trigger if exists + create trigger.
-- ============================================================================

-- 1) papel sem fallback: sem perfil ativo → sem papel → policies fechadas.
create or replace function public.current_user_papel()
returns text
language sql
security definer
set search_path = public
as $$
  select papel from public.perfis
  where user_id = auth.uid()
    and ativo = true;
$$;

-- 2) escalação de privilégio em perfis bloqueada no banco.
create or replace function public.perfis_guardar_papel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- sem sessão (service role ou aplicação da migration) não há papel a julgar
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.papel in ('dono', 'admin', 'gerente')
       and not public.current_user_is_admin() then
      raise exception 'perfil: papel privilegiado exige admin';
    end if;
    return new;
  end if;
  if not public.current_user_is_admin() then
    if new.user_id is distinct from old.user_id
       or new.papel is distinct from old.papel
       or new.ativo is distinct from old.ativo then
      raise exception 'perfil: user_id, papel e ativo so mudam com admin';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_guardar_papel on public.perfis;
create trigger perfis_guardar_papel
  before insert or update on public.perfis
  for each row execute function public.perfis_guardar_papel();

-- 3) política ampla residual da 006 (a 014 derrubava outro nome).
drop policy if exists estoque_acesso_autenticado on public.produtos;
drop policy if exists produtos_acesso_autenticado on public.produtos;
drop policy if exists estoque_acesso_autenticado on public.estoque_movimentacoes;

-- 4) UPDATE para o reenvio idempotente (upsert pelo mesmo id do app),
--    espelhando exatamente o who-pode-INSERT de cada tabela.
drop policy if exists caixa_auditoria_update on public.caixa_auditoria;
create policy caixa_auditoria_update on public.caixa_auditoria
  as permissive for UPDATE to authenticated
  using ((current_user_is_admin() OR current_user_is_gerente_ou_acima()))
  with check ((current_user_is_admin() OR current_user_is_gerente_ou_acima()));

drop policy if exists comissoes_auditoria_update on public.comissoes_auditoria;
create policy comissoes_auditoria_update on public.comissoes_auditoria
  as permissive for UPDATE to authenticated
  using ((current_user_is_admin() OR current_user_is_gerente_ou_acima()))
  with check ((current_user_is_admin() OR current_user_is_gerente_ou_acima()));

drop policy if exists clube_pagamentos_update on public.clube_pagamentos;
create policy clube_pagamentos_update on public.clube_pagamentos
  as permissive for UPDATE to authenticated
  using ((current_user_is_admin() OR current_user_is_gerente_ou_acima() OR current_user_is_recepcao_ou_acima()))
  with check ((current_user_is_admin() OR current_user_is_gerente_ou_acima() OR current_user_is_recepcao_ou_acima()));

drop policy if exists estoque_movimentacoes_update on public.estoque_movimentacoes;
create policy estoque_movimentacoes_update on public.estoque_movimentacoes
  as permissive for UPDATE to authenticated
  using ((current_user_is_admin() OR current_user_is_gerente_ou_acima() OR current_user_is_recepcao_ou_acima()))
  with check ((current_user_is_admin() OR current_user_is_gerente_ou_acima() OR current_user_is_recepcao_ou_acima()));

-- 5) sobreposição travada no banco (duas telas gravando ao mesmo tempo).
create or replace function public.agendamentos_sem_sobreposicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelado', 'nao_compareceu') then
    return new;
  end if;
  if exists (
    select 1
    from public.agendamentos a
    where a.id != new.id
      and a.profissional = new.profissional
      and a.data = new.data
      and a.status not in ('cancelado', 'nao_compareceu')
      and (a.horario::time,
           a.horario::time + coalesce(a.duracao_min, 30) * interval '1 minute')
          overlaps
          (new.horario::time,
           new.horario::time + coalesce(new.duracao_min, 30) * interval '1 minute')
  ) then
    raise exception 'agendamento: horario ja ocupado para este profissional';
  end if;
  return new;
end;
$$;

drop trigger if exists agendamentos_sem_sobreposicao on public.agendamentos;
create trigger agendamentos_sem_sobreposicao
  before insert or update on public.agendamentos
  for each row execute function public.agendamentos_sem_sobreposicao();

-- ----------------------------------------------------------------------------
-- 6) policies reproduzidas de produção (drift: criadas direto no banco, fora
--    do versionamento). Mesmo nome, papel e expressão do que está em produção.
-- ----------------------------------------------------------------------------
drop policy if exists "agenda_expediente_insert_por_papel" on public.agenda_expediente;
create policy "agenda_expediente_insert_por_papel" on public.agenda_expediente as permissive for INSERT to authenticated with check (current_user_is_gerente_ou_acima());
drop policy if exists "agenda_expediente_select_por_papel" on public.agenda_expediente;
create policy "agenda_expediente_select_por_papel" on public.agenda_expediente as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "agenda_expediente_update_por_papel" on public.agenda_expediente;
create policy "agenda_expediente_update_por_papel" on public.agenda_expediente as permissive for UPDATE to authenticated using (current_user_is_gerente_ou_acima()) with check (current_user_is_gerente_ou_acima());
drop policy if exists "agendamentos_delete_por_papel" on public.agendamentos;
create policy "agendamentos_delete_por_papel" on public.agendamentos as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "agendamentos_insert_por_papel" on public.agendamentos;
create policy "agendamentos_insert_por_papel" on public.agendamentos as permissive for INSERT to authenticated with check ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "agendamentos_select_por_papel" on public.agendamentos;
create policy "agendamentos_select_por_papel" on public.agendamentos as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "agendamentos_update_por_papel" on public.agendamentos;
create policy "agendamentos_update_por_papel" on public.agendamentos as permissive for UPDATE to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text))) with check ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "bloqueios_delete_por_papel" on public.bloqueios;
create policy "bloqueios_delete_por_papel" on public.bloqueios as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "bloqueios_insert_por_papel" on public.bloqueios;
create policy "bloqueios_insert_por_papel" on public.bloqueios as permissive for INSERT to authenticated with check ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "bloqueios_select_por_papel" on public.bloqueios;
create policy "bloqueios_select_por_papel" on public.bloqueios as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "bloqueios_update_por_papel" on public.bloqueios;
create policy "bloqueios_update_por_papel" on public.bloqueios as permissive for UPDATE to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text))) with check ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "caixa_auditoria_insert_admin" on public.caixa_auditoria;
create policy "caixa_auditoria_insert_admin" on public.caixa_auditoria as permissive for INSERT to authenticated with check (current_user_is_admin());
drop policy if exists "caixa_auditoria_select_por_papel" on public.caixa_auditoria;
create policy "caixa_auditoria_select_por_papel" on public.caixa_auditoria as permissive for SELECT to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "caixa_fechamentos_insert_por_papel" on public.caixa_fechamentos;
create policy "caixa_fechamentos_insert_por_papel" on public.caixa_fechamentos as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "caixa_fechamentos_select_por_papel" on public.caixa_fechamentos;
create policy "caixa_fechamentos_select_por_papel" on public.caixa_fechamentos as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "caixa_fechamentos_update_por_papel" on public.caixa_fechamentos;
create policy "caixa_fechamentos_update_por_papel" on public.caixa_fechamentos as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "caixa_lancamentos_delete_por_papel" on public.caixa_lancamentos;
create policy "caixa_lancamentos_delete_por_papel" on public.caixa_lancamentos as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "caixa_lancamentos_insert_por_papel" on public.caixa_lancamentos;
create policy "caixa_lancamentos_insert_por_papel" on public.caixa_lancamentos as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "caixa_lancamentos_select_por_papel" on public.caixa_lancamentos;
create policy "caixa_lancamentos_select_por_papel" on public.caixa_lancamentos as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "caixa_lancamentos_update_por_papel" on public.caixa_lancamentos;
create policy "caixa_lancamentos_update_por_papel" on public.caixa_lancamentos as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "clientes_delete_por_papel" on public.clientes;
create policy "clientes_delete_por_papel" on public.clientes as permissive for DELETE to authenticated using (current_user_is_admin());
drop policy if exists "clientes_insert_por_papel" on public.clientes;
create policy "clientes_insert_por_papel" on public.clientes as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "clientes_select_por_papel" on public.clientes;
create policy "clientes_select_por_papel" on public.clientes as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "clientes_update_por_papel" on public.clientes;
create policy "clientes_update_por_papel" on public.clientes as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "clube_assinaturas_delete_admin" on public.clube_assinaturas;
create policy "clube_assinaturas_delete_admin" on public.clube_assinaturas as permissive for DELETE to authenticated using (current_user_is_admin());
drop policy if exists "clube_assinaturas_insert_por_papel" on public.clube_assinaturas;
create policy "clube_assinaturas_insert_por_papel" on public.clube_assinaturas as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "clube_assinaturas_select_por_papel" on public.clube_assinaturas;
create policy "clube_assinaturas_select_por_papel" on public.clube_assinaturas as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "clube_assinaturas_update_por_papel" on public.clube_assinaturas;
create policy "clube_assinaturas_update_por_papel" on public.clube_assinaturas as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "clube_pagamentos_insert_por_papel" on public.clube_pagamentos;
create policy "clube_pagamentos_insert_por_papel" on public.clube_pagamentos as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "clube_pagamentos_select_por_papel" on public.clube_pagamentos;
create policy "clube_pagamentos_select_por_papel" on public.clube_pagamentos as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "comissoes_auditoria_insert_admin" on public.comissoes_auditoria;
create policy "comissoes_auditoria_insert_admin" on public.comissoes_auditoria as permissive for INSERT to authenticated with check (current_user_is_admin());
drop policy if exists "comissoes_auditoria_select_por_papel" on public.comissoes_auditoria;
create policy "comissoes_auditoria_select_por_papel" on public.comissoes_auditoria as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "comissoes_configs_insert_admin_gerente" on public.comissoes_configs;
create policy "comissoes_configs_insert_admin_gerente" on public.comissoes_configs as permissive for INSERT to authenticated with check (current_user_is_gerente_ou_acima());
drop policy if exists "comissoes_configs_select_por_papel" on public.comissoes_configs;
create policy "comissoes_configs_select_por_papel" on public.comissoes_configs as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "comissoes_configs_update_admin_gerente" on public.comissoes_configs;
create policy "comissoes_configs_update_admin_gerente" on public.comissoes_configs as permissive for UPDATE to authenticated using (current_user_is_gerente_ou_acima()) with check (current_user_is_gerente_ou_acima());
drop policy if exists "comissoes_fechamentos_insert_gerente" on public.comissoes_fechamentos;
create policy "comissoes_fechamentos_insert_gerente" on public.comissoes_fechamentos as permissive for INSERT to authenticated with check (current_user_is_gerente_ou_acima());
drop policy if exists "comissoes_fechamentos_select_por_papel" on public.comissoes_fechamentos;
create policy "comissoes_fechamentos_select_por_papel" on public.comissoes_fechamentos as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "comissoes_fechamentos_update_gerente" on public.comissoes_fechamentos;
create policy "comissoes_fechamentos_update_gerente" on public.comissoes_fechamentos as permissive for UPDATE to authenticated using (current_user_is_gerente_ou_acima()) with check (current_user_is_gerente_ou_acima());
drop policy if exists "crm_interacoes_insert_por_papel" on public.crm_interacoes;
create policy "crm_interacoes_insert_por_papel" on public.crm_interacoes as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "crm_interacoes_select_por_papel" on public.crm_interacoes;
create policy "crm_interacoes_select_por_papel" on public.crm_interacoes as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "crm_interacoes_update_por_papel" on public.crm_interacoes;
create policy "crm_interacoes_update_por_papel" on public.crm_interacoes as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "espera_pedidos_delete_admin_gerente" on public.espera_pedidos;
create policy "espera_pedidos_delete_admin_gerente" on public.espera_pedidos as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "espera_pedidos_insert_por_papel" on public.espera_pedidos;
create policy "espera_pedidos_insert_por_papel" on public.espera_pedidos as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "espera_pedidos_select_por_papel" on public.espera_pedidos;
create policy "espera_pedidos_select_por_papel" on public.espera_pedidos as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "espera_pedidos_update_por_papel" on public.espera_pedidos;
create policy "espera_pedidos_update_por_papel" on public.espera_pedidos as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "estoque_movimentacoes_insert_por_papel" on public.estoque_movimentacoes;
create policy "estoque_movimentacoes_insert_por_papel" on public.estoque_movimentacoes as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "estoque_movimentacoes_select_por_papel" on public.estoque_movimentacoes;
create policy "estoque_movimentacoes_select_por_papel" on public.estoque_movimentacoes as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "estoque_movimentacoes_update_gerente" on public.estoque_movimentacoes;
create policy "estoque_movimentacoes_update_gerente" on public.estoque_movimentacoes as permissive for UPDATE to authenticated using (current_user_is_gerente_ou_acima()) with check (current_user_is_gerente_ou_acima());
drop policy if exists "perfis_delete_admin" on public.perfis;
create policy "perfis_delete_admin" on public.perfis as permissive for DELETE to authenticated using (current_user_is_admin());
drop policy if exists "perfis_insert_admin" on public.perfis;
create policy "perfis_insert_admin" on public.perfis as permissive for INSERT to authenticated with check (current_user_is_admin());
drop policy if exists "perfis_select_por_papel" on public.perfis;
create policy "perfis_select_por_papel" on public.perfis as permissive for SELECT to authenticated using ((current_user_is_admin() OR (user_id = auth.uid())));
drop policy if exists "perfis_update_admin_ou_proprio" on public.perfis;
create policy "perfis_update_admin_ou_proprio" on public.perfis as permissive for UPDATE to authenticated using ((current_user_is_admin() OR (user_id = auth.uid()))) with check ((current_user_is_admin() OR (user_id = auth.uid())));
drop policy if exists "produtos_delete_gerente" on public.produtos;
create policy "produtos_delete_gerente" on public.produtos as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "produtos_insert_gerente" on public.produtos;
create policy "produtos_insert_gerente" on public.produtos as permissive for INSERT to authenticated with check (current_user_is_gerente_ou_acima());
drop policy if exists "produtos_select_por_papel" on public.produtos;
create policy "produtos_select_por_papel" on public.produtos as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "produtos_update_gerente" on public.produtos;
create policy "produtos_update_gerente" on public.produtos as permissive for UPDATE to authenticated using (current_user_is_gerente_ou_acima()) with check (current_user_is_gerente_ou_acima());
drop policy if exists "profissionais_delete_por_papel" on public.profissionais;
create policy "profissionais_delete_por_papel" on public.profissionais as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "profissionais_insert_por_papel" on public.profissionais;
create policy "profissionais_insert_por_papel" on public.profissionais as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "profissionais_select_por_papel" on public.profissionais;
create policy "profissionais_select_por_papel" on public.profissionais as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "profissionais_update_por_papel" on public.profissionais;
create policy "profissionais_update_por_papel" on public.profissionais as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "servicos_delete_por_papel" on public.servicos;
create policy "servicos_delete_por_papel" on public.servicos as permissive for DELETE to authenticated using (current_user_is_gerente_ou_acima());
drop policy if exists "servicos_insert_por_papel" on public.servicos;
create policy "servicos_insert_por_papel" on public.servicos as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "servicos_select_por_papel" on public.servicos;
create policy "servicos_select_por_papel" on public.servicos as permissive for SELECT to authenticated using ((current_user_is_recepcao_ou_acima() OR (current_user_papel() = 'profissional'::text)));
drop policy if exists "servicos_update_por_papel" on public.servicos;
create policy "servicos_update_por_papel" on public.servicos as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
drop policy if exists "whatsapp_mensagens_insert_por_papel" on public.whatsapp_mensagens;
create policy "whatsapp_mensagens_insert_por_papel" on public.whatsapp_mensagens as permissive for INSERT to authenticated with check (current_user_is_recepcao_ou_acima());
drop policy if exists "whatsapp_mensagens_select_por_papel" on public.whatsapp_mensagens;
create policy "whatsapp_mensagens_select_por_papel" on public.whatsapp_mensagens as permissive for SELECT to authenticated using (current_user_is_recepcao_ou_acima());
drop policy if exists "whatsapp_mensagens_update_por_papel" on public.whatsapp_mensagens;
create policy "whatsapp_mensagens_update_por_papel" on public.whatsapp_mensagens as permissive for UPDATE to authenticated using (current_user_is_recepcao_ou_acima()) with check (current_user_is_recepcao_ou_acima());
