-- ============================================================================
-- 052_correcao_rpc_fila_pendentes.sql
-- ============================================================================
--
-- BUG na RPC `ia_notificacoes_pendentes()` (migration 024, nunca executada
-- em produção até o cron da 046 passar a chamá-la):
--
--     select coalesce(array_agg(n.id), '{}'::text[])
--       into v_ids
--       from ( select n.id from public.ia_notificacoes n ... ) escolhido;
--
-- O alias `n` só existe DENTRO da subquery; no escopo externo o FROM é
-- `escolhido`. O PostgreSQL rejeita com:
--
--     42P01: missing FROM-clause entry for table "n"
--
-- que o webhook devolvia como HTTP 502 — e a fila nunca avançava.
--
-- Correção: agregar pelo alias correto do escopo externo (`escolhido.id`).
-- O restante da RPC (for update skip locked, marcação 'enviando', montagem
-- do json) permanece idêntico.
--
-- ============================================================================

create or replace function public.ia_notificacoes_pendentes()
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_limite integer := 20;
  v_ids text[];
begin
  -- recuperação de execuções mortas: 'enviando' há mais de 10 min volta para
  -- a fila (reprocessamento futuro, sem duplicar o que já foi enviado).
  update public.ia_notificacoes
     set status = 'pendente'
   where status = 'enviando'
     and criado_em <= now() - interval '10 minutes';

  select coalesce(array_agg(escolhido.id), '{}'::text[])
    into v_ids
    from (
      select n.id
        from public.ia_notificacoes n
       where n.status = 'pendente'
       order by n.ordem, n.criado_em
       limit v_limite
       for update skip locked
    ) escolhido;

  if cardinality(v_ids) = 0 then
    return '[]'::json;
  end if;

  update public.ia_notificacoes
     set status = 'enviando',
         tentativas = tentativas + 1
   where id = any (v_ids);

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'id', n.id,
          'chave', n.chave,
          'tipo', n.tipo,
          'destino', n.destino,
          'mensagem', n.mensagem,
          'tentativas', n.tentativas
        ) order by n.ordem, n.criado_em
      )
        from public.ia_notificacoes n
       where n.id = any (v_ids)
    ),
    '[]'::json
  );
end;
$$;

revoke execute on function public.ia_notificacoes_pendentes() from public, anon, authenticated;
grant execute on function public.ia_notificacoes_pendentes() to service_role;

notify pgrst, 'reload schema';
