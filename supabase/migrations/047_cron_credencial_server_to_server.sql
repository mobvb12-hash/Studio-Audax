-- ============================================================================
-- 047_cron_credencial_server_to_server.sql
-- ============================================================================
--
-- CONTINUAÇÃO DA 046 (processamento automático da fila `ia_notificacoes`).
--
-- A 046 criou o job do pg_cron + a função `processar_fila_notificacoes()`,
-- mas as configurações lidas por ela (`app.settings.supabase_url` e
-- `app.settings.supabase_secret_keys`) NÃO existem no banco — sem elas a
-- função retorna silenciosamente e o cron não faz nada.
--
-- Esta migration:
--   1) recria a função lendo as configurações corretas:
--        • app.settings.supabase_url              → URL pública do projeto
--        • app.settings.supabase_service_role_key → credencial server-to-server
--   2) mantém o fail-safe: se qualquer setting faltar, a função apenas
--      registra um aviso e NÃO tenta chamada alguma.
--
-- CONFIGURAÇÃO FORA DO REPOSITÓRIO (credencial NUNCA versionada):
--
--   alter database postgres
--     set app.settings.supabase_url = 'https://<ref>.supabase.co';
--   alter database postgres
--     set app.settings.supabase_service_role_key = '<service_role key>';
--
-- No lado da Edge Function, `whatsapp-webhook` aceita este token SOMENTE
-- para a ação "notificar-pendentes" (comparação timing-safe contra o
-- segredo SUPABASE_SERVICE_ROLE_KEY do ambiente). Nenhuma outra ação aceita.
--
-- ============================================================================

create or replace function public.processar_fila_notificacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_chave text;
  v_resposta json;
begin
  begin
    v_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    v_url := null;
  end;

  begin
    v_chave := current_setting('app.settings.supabase_service_role_key', true);
  exception when others then
    v_chave := null;
  end;

  if v_url is null or v_url = '' or v_chave is null or v_chave = '' then
    raise notice 'processar_fila_notificacoes: configuração ausente (app.settings.supabase_url / app.settings.supabase_service_role_key)';
    return;
  end if;

  select json_build_object('status', status, 'body', body)
  into v_resposta
  from pg_net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/whatsapp-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave
    ),
    body := '{"acao":"notificar-pendentes"}'::jsonb
  );

  raise notice 'processar_fila_notificacoes: %', v_resposta;
exception when others then
  raise notice 'processar_fila_notificacoes falhou: %', sqlerrm;
end;
$$;

grant execute on function public.processar_fila_notificacoes() to service_role;

notify pgrst, 'reload schema';
