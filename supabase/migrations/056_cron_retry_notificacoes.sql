-- ============================================================================
-- 056_cron_retry_notificacoes.sql — retry automático de notificações falhadas
-- ============================================================================
--
-- PROBLEMA
--
-- A função `ia_notificacoes_reprocessar()` existe desde a 024 mas nunca teve
-- chamador automático. Notificações que falham (status 'falha') ficam paradas
-- para sempre, porque o cron da 046 só consome status 'pendente'.
--
-- SOLUÇÃO
--
-- Criar job do pg_cron que roda a cada 10 minutos e chama
-- `ia_notificacoes_reprocessar()` para mover 'falha' -> 'pendente'.
-- Isso permite que falhas temporárias (rede, Evolution indisponível) sejam
-- recuperadas automaticamente sem intervenção manual.
--
-- SEGURANÇA
--
-- A função `ia_notificacoes_reprocessar()` é SECURITY DEFINER com grant
-- apenas para service_role (024:638-640). O cron usa a mesma credencial
-- server-to-server do job de processamento (051: cron_webhook_token).
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Job do pg_cron: a cada 10 minutos reprocessa falhas
-- ----------------------------------------------------------------------------
select
  cron.schedule(
    'reprocessar-falhas-notificacoes',
    '*/10 * * * *',
    $$select public.ia_notificacoes_reprocessar()$$
  );

-- ----------------------------------------------------------------------------
-- 2) Grant (já existe na 024/052, reafirmado por segurança)
-- ----------------------------------------------------------------------------
grant execute on function public.ia_notificacoes_reprocessar() to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';