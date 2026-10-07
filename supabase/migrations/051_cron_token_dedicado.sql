-- ============================================================================
-- 051_cron_token_dedicado.sql
-- ============================================================================
--
-- AJUSTE FINAL da autenticação do cron → whatsapp-webhook.
--
-- Contexto: nas Edge Functions deste projeto, `SUPABASE_SERVICE_ROLE_KEY`
-- não é injetado no ambiente (projeto usa chaves novas sb_secret_*), então a
-- comparação com essa env nunca casava → HTTP 401 persistente.
--
-- Solução: token DEDICADO, criado fora do repositório e gravado em DOIS
-- lugares controlados:
--
--   • Edge Function  → segredo `CRON_WEBHOOK_TOKEN` (supabase secrets set)
--   • banco (vault)  → secret `cron_webhook_token` (vault.create_secret)
--
-- O webhook aceita o token SOMENTE na ação `notificar-pendentes`
-- (comparação timing-safe em auth.ts). Nenhuma outra ação o aceita.
--
-- Obs.: a secret `cron_service_role_key` criada na 048 permanece no vault,
-- mas a função deixa de usá-la.
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
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'cron_webhook_url';

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'cron_webhook_token';

  if v_url is null or v_url = '' or v_token is null or v_token = '' then
    raise notice 'processar_fila_notificacoes: secret ausente no vault (cron_webhook_url / cron_webhook_token)';
    return;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/whatsapp-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body := '{"acao":"notificar-pendentes"}'::jsonb
  ) into v_request_id;

  raise notice 'processar_fila_notificacoes: request_id=%', v_request_id;
exception when others then
  raise notice 'processar_fila_notificacoes falhou: %', sqlerrm;
end;
$$;

grant execute on function public.processar_fila_notificacoes() to service_role;

notify pgrst, 'reload schema';
