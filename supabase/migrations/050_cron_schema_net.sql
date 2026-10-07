-- ============================================================================
-- 050_cron_schema_net.sql
-- ============================================================================
--
-- CORREÇÃO FINAL da função `processar_fila_notificacoes()`.
--
-- BUG (segunda causa do cron silencioso): a função chamava
-- `pg_net.http_post(...)` mas, no Supabase gerenciado, a extensão `pg_net`
-- cria o schema `net` — não existe `schema "pg_net"`. A chamada falhava com
-- `3F000: schema "pg_net" does not exist`, o `exception when others` engolia
-- o erro e o cron executava "com sucesso" sem NUNCA enviar requisição.
--
-- Correção: `net.http_post(...)` (mesmo nome usado com sucesso em testes
-- manuais contra o banco de produção).
--
-- Sequência de correções desta fila:
--   046 → job do cron + primeira versão da função
--   047 → leitura por app.settings.* (bloqueado: postgres sem superuser)
--   048 → leitura pelo vault (secret legível ✓)
--   049 → captura correta do retorno de http_post (bigint)
--   050 → schema correto da extensão: net.* (ESTA)
--
-- Fluxo final:
--   pg_cron (1 min) → net.http_post → whatsapp-webhook (token timing-safe)
--     → fila ia_notificacoes (dedup por chave) → whatsapp-enviar → Evolution.
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
  v_request_id bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'cron_webhook_url';

  select decrypted_secret into v_chave
  from vault.decrypted_secrets
  where name = 'cron_service_role_key';

  if v_url is null or v_url = '' or v_chave is null or v_chave = '' then
    raise notice 'processar_fila_notificacoes: secret ausente no vault (cron_webhook_url / cron_service_role_key)';
    return;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/whatsapp-webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave
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
