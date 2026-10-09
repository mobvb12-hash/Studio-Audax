-- ============================================================================
-- Studio Audax — 058: alinhamento das policies da 017 ao mapa único
-- ----------------------------------------------------------------------------
-- PROBLEMA (auditoria final de encerramento da camada de autorização):
-- a 017 §6 recriou ~67 policies `_por_papel` que COEXISTEM com as da 014.
-- Policies permissivas são unidas por OR no Postgres: onde a 017 é mais
-- ampla, vence a mais ampla. Em 7 casos ela contradiz AO MESMO TEMPO a 014
-- e o mapa único de permissões (`src/modules/auth/permissoes.ts`) — o próprio
-- código documenta que "o mapa único é a mesma regra do RLS"
-- (src/pages/caixa-permissoes.test.ts:3).
--
-- As 7 policies corrigidas aqui (e apenas elas):
--
--   servicos_insert_por_papel        recepcao+  → gerente+   (014: gerente+)
--   servicos_update_por_papel        recepcao+  → gerente+   (014: gerente+)
--   servicos_delete_por_papel        gerente+   → admin      (014: admin)
--   profissionais_insert_por_papel   recepcao+  → gerente+   (014: gerente+)
--   profissionais_update_por_papel   recepcao+  → gerente+   (014: gerente+)
--   profissionais_delete_por_papel   gerente+   → admin      (014: admin)
--   caixa_fechamentos_update_...     recepcao+  → gerente+   (014: admin/gerente;
--     frontend `caixa:reabrir` = dono/admin/gerente — recepção não reabre caixa)
--
-- O que NÃO muda (decisão explícita da auditoria):
--   * nenhuma tabela, coluna, dado, função ou RPC;
--   * nenhuma regra de negócio de Caixa/Comissões/Pote/Clube/Agenda —
--     esta migration só ajusta AUTORIZAÇÃO de 7 policies;
--   * o restante das policies da 017 (inclusive os SELECTs de comissões e
--     as de agendamentos sem filtro de posse) permanece como está: essas
--     divergências ficaram registradas no diagnóstico como pendência;
--   * quem tem acesso hoje e NÃO perde: dono/admin/gerente continuam
--     passando por `current_user_is_gerente_ou_acima()`
--     (`current_user_is_admin()` onde o alvo é admin);
--   * overrides individuais da 042 continuam valendo: um par restrictive/
--     permissive explícito concede OU revoga além do papel.
--
-- Perdas de capability (exatamente o que o modelo de permissões já nega):
--   * recepção não insere/edita serviços e profissionais;
--   * gerente não apaga serviços e profissionais (admin só);
--   * recepção não reabre/altera fechamentos de caixa via API
--     (a UI já não tem botão de reabertura para recepção);
--   * efeito colissional documentado: o UPDATE-retry do upsert em
--     `criarFechamento` (`onConflict: 'id'`) falharia para recepção numa
--     corrida rara — o fluxo normal de fechar caixa é INSERT e segue íntegro.
--
-- Idempotente: `drop policy if exists` + `create policy`. Pode ser reaplicada.
-- ============================================================================

drop policy if exists servicos_insert_por_papel on public.servicos;
create policy servicos_insert_por_papel on public.servicos
  as permissive for insert to authenticated
  with check (public.current_user_is_gerente_ou_acima());

drop policy if exists servicos_update_por_papel on public.servicos;
create policy servicos_update_por_papel on public.servicos
  as permissive for update to authenticated
  using (public.current_user_is_gerente_ou_acima())
  with check (public.current_user_is_gerente_ou_acima());

drop policy if exists servicos_delete_por_papel on public.servicos;
create policy servicos_delete_por_papel on public.servicos
  as permissive for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists profissionais_insert_por_papel on public.profissionais;
create policy profissionais_insert_por_papel on public.profissionais
  as permissive for insert to authenticated
  with check (public.current_user_is_gerente_ou_acima());

drop policy if exists profissionais_update_por_papel on public.profissionais;
create policy profissionais_update_por_papel on public.profissionais
  as permissive for update to authenticated
  using (public.current_user_is_gerente_ou_acima())
  with check (public.current_user_is_gerente_ou_acima());

drop policy if exists profissionais_delete_por_papel on public.profissionais;
create policy profissionais_delete_por_papel on public.profissionais
  as permissive for delete to authenticated
  using (public.current_user_is_admin());

drop policy if exists caixa_fechamentos_update_por_papel on public.caixa_fechamentos;
create policy caixa_fechamentos_update_por_papel on public.caixa_fechamentos
  as permissive for update to authenticated
  using (public.current_user_is_gerente_ou_acima())
  with check (public.current_user_is_gerente_ou_acima());

-- ----------------------------------------------------------------------------
-- Verificação (mesma convenção das 041/042): se qualquer passo não pegou, o
-- push falha alto em vez de seguir com uma ilusão de controle.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'servicos'
       and policyname = 'servicos_insert_por_papel'
       and with_check like '%current_user_is_gerente_ou_acima%'
  ) then
    raise exception '058: servicos_insert_por_papel nao foi alinhada';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'servicos'
       and policyname = 'servicos_delete_por_papel'
       and qual like '%recepcao_ou_acima%'
  ) then
    raise exception '058: servicos_delete_por_papel ainda permite recepcao';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'profissionais'
       and policyname = 'profissionais_update_por_papel'
       and with_check like '%current_user_is_gerente_ou_acima%'
  ) then
    raise exception '058: profissionais_update_por_papel nao foi alinhada';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'profissionais'
       and policyname = 'profissionais_delete_por_papel'
       and qual like '%recepcao_ou_acima%'
  ) then
    raise exception '058: profissionais_delete_por_papel ainda permite recepcao';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'caixa_fechamentos'
       and policyname = 'caixa_fechamentos_update_por_papel'
       and with_check like '%current_user_is_gerente_ou_acima%'
  ) then
    raise exception '058: caixa_fechamentos_update_por_papel nao foi alinhada';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'caixa_fechamentos'
       and policyname = 'caixa_fechamentos_update_por_papel'
       and with_check like '%recepcao_ou_acima%'
  ) then
    raise exception '058: caixa_fechamentos_update_por_papel ainda permite recepcao';
  end if;
end $$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
