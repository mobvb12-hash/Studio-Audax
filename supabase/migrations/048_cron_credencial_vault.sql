-- ============================================================================
-- 048_cron_credencial_vault.sql
-- ============================================================================
--
-- FINALIZAÇÃO DO PROCESSAMENTO AUTOMÁTICO DA FILA `ia_notificacoes`.
--
-- Contexto:
--   • 046 criou o job do pg_cron (a cada minuto) + a função
--     `processar_fila_notificacoes()`;
--   • 047 apontou a função para `app.settings.*`, mas o papel `postgres` do
--     projeto gerenciado NÃO é superuser e não pode executar
--     `alter database ... set` — as configurações nunca puderam ser criadas.
--
-- Esta migration corrige a função para ler as credenciais do VAULT do
-- Supabase (`vault.decrypted_secrets`), que é o mecanismo oficial de
-- segredos do Postgres e não exige superuser.
--
-- Secrets usados (criados MANUALMENTE no banco de produção — a credencial
-- NUNCA é versionada em repositório):
--
--   • cron_webhook_url        → URL pública do projeto
--   • cron_service_role_key   → credencial service_role server-to-server
--
-- Fluxo completo:
--
--   pg_cron (1 min) → pg_net.http_post(webhook, {"acao":"notificar-pendentes"})
--     → whatsapp-webhook valida o token (timing-safe, SÓ nesta ação)
--       → processa fila ia_notificacoes → whatsapp-enviar → Evolution API
--
-- Fail-safe: se faltar qualquer secret, a função avisa no log e NÃO faz
-- nenhuma chamada. Deduplicação por `chave` única impede mensagem repetida.
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
