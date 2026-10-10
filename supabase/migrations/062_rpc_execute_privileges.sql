-- Restringe RPCs SECURITY DEFINER aos papéis necessários para cada operação.
-- O processador da fila chama o webhook com credencial server-to-server.
revoke execute on function public.processar_fila_notificacoes() from public;
revoke execute on function public.processar_fila_notificacoes() from anon, authenticated;

-- Preserva o caminho operacional server-side já configurado.
grant execute on function public.processar_fila_notificacoes() to service_role;

-- A migration 045 reabriu esta RPC para anon, embora ela exija auth.uid().
-- Restaura o escopo originalmente definido na migration 019.
revoke execute on function public.painel_agendamento_criar(
  text, text, date, text, text, text[]
) from public, anon;
grant execute on function public.painel_agendamento_criar(
  text, text, date, text, text, text[]
) to authenticated, service_role;

notify pgrst, 'reload schema';
