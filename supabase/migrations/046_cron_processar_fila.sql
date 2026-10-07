-- ============================================================================
-- 046_cron_processar_fila.sql — processamento automático da fila de notificações
-- ============================================================================
--
-- PROBLEMA
--
-- A fila `ia_notificacoes` é alimentada pelo trigger `agendamentos_notificar`
-- sempre que um agendamento é criado. Mas o processamento da fila dependia de
-- uma chamada manual:
--
--   POST /functions/v1/whatsapp-webhook
--   { "acao": "notificar-pendentes" }
--
-- Sem essa chamada, as mensagens ficam pendentes para sempre.
--
-- SOLUÇÃO
--
-- Usar o pg_cron (já incluído no Supabase) para chamar o webhook a cada minuto.
-- O pg_cron é nativo do Supabase, gratuito e não requer serviço externo.
--
-- SEGURANÇA
--
-- O cron chama o webhook com a secret key do Supabase (SUPABASE_SECRET_KEYS),
-- que já é usada pelo webhook para autenticar chamadas server-to-server.
-- Nenhuma credencial da Evolution API é exposta.
--
-- COMO FUNCIONA
--
-- 1. pg_cron executa um comando SQL a cada minuto
-- 2. O comando SQL chama a Edge Function `whatsapp-webhook` via pg_net
-- 3. A Edge Function processa a fila e envia as mensagens
--
-- REQUISITOS
--
-- - Extensão pg_cron habilitada no banco de dados
-- - Extensão pg_net habilitada no banco de dados
-- - Secret SUPABASE_SECRET_KEYS configurada no Supabase
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Habilitar extensões necessárias
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- 2) Criar função que chama o webhook
-- ----------------------------------------------------------------------------
-- Esta função é chamada pelo pg_cron e faz uma requisição HTTP para o webhook.
-- Ela usa a secret key do Supabase para autenticar a chamada.
create or replace function public.processar_fila_notificacoes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  v_resposta json;
begin
  begin
    v_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    v_url := null;
  end;

  begin
    v_secret := current_setting('app.settings.supabase_secret_keys', true);
  exception when others then
    v_secret := null;
  end;

  if v_url is null or v_secret is null then
    return;
  end if;

  v_url := v_url || '/functions/v1/whatsapp-webhook';

  select
    json_build_object(
      'status', status,
      'body', body
    )
  into v_resposta
  from
    pg_net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_secret,
        'Authorization', 'Bearer ' || v_secret
      ),
      body := '{"acao":"notificar-pendentes"}'::jsonb
    );

  raise notice 'Fila processada: %', v_resposta;
exception when others then
  raise notice 'Erro ao processar fila: %', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Agendar o job para rodar a cada minuto
-- ----------------------------------------------------------------------------
-- O job é agendado para rodar a cada minuto (* * * * *).
-- Isso é suficiente para notificações de agendamento.
select
  cron.schedule(
    'processar-fila-notificacoes',
    '* * * * *',
    $$select public.processar_fila_notificacoes()$$
  );

-- ----------------------------------------------------------------------------
-- 4) Grants
-- ----------------------------------------------------------------------------
grant execute on function public.processar_fila_notificacoes() to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
