-- ============================================================================
-- 049_cron_correcao_pg_net.sql
-- ============================================================================
--
-- CORREÇÃO da função `processar_fila_notificacoes()` (criada na 046,
-- reescrita na 047/048).
--
-- BUG: a 046 montava
--
--     select json_build_object('status', status, 'body', body)
--     from pg_net.http_post(...)
--
-- mas `pg_net.http_post()` retorna UMA coluna bigint (o request_id), não
-- `status`/`body`. O SQL falhava na análise ANTES de executar a requisição,
-- o `exception when others` engolia o erro e o cron rodava "com sucesso"
-- sem enviar NADA — por isso a fila continuava intocada.
--
-- Correção: capturar apenas o request_id devolvido pelo pg_net. A resposta
-- HTTP fica em `net._http_response` (postgres pode conferir com select).
--
-- Fluxo permanece o mesmo:
--   pg_cron (1 min) → pg_net → whatsapp-webhook (valida token timing-safe)
--     → fila ia_notificacoes → whatsapp-enviar → Evolution API.
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

  select pg_net.http_post(
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
