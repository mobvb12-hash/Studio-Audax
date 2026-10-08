-- ============================================================================
-- 057_iniciado_em_notificacoes.sql — coluna iniciado_em para recuperação
--                                    segura de execuções mortas
-- ============================================================================
--
-- PROBLEMA
--
-- A recuperação de execuções mortas em `ia_notificacoes_pendentes()` usa
-- `criado_em <= now() - interval '10 minutes'` para detectar notificações
-- 'enviando' abandonadas. Isso é inseguro sob concorrência:
--   1. Processo A pega notificação N (status -> 'enviando')
--   2. Processo A trava/demora >10min
--   3. Processo B roda, vê N com criado_em > 10min atrás, NÃO reseta
--   4. Processo A termina e envia
--   5. Processo B roda de novo, agora criado_em > 10min, reseta N -> 'pendente'
--   6. Processo C pega N e envia de novo => DUPLICIDADE
--
-- SOLUÇÃO
--
-- Adicionar coluna `iniciado_em` que é preenchida QUANDO a notificação
-- entra em 'enviando'. A recuperação usa `iniciado_em` (momento real do
-- início do envio) e não `criado_em` (momento do enfileiramento).
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Coluna iniciado_em na tabela ia_notificacoes
-- ----------------------------------------------------------------------------
alter table public.ia_notificacoes
  add column if not exists iniciado_em timestamptz;

-- Índice para a query de recuperação
create index if not exists idx_ia_notificacoes_iniciado_em
  on public.ia_notificacoes (iniciado_em)
  where status = 'enviando';

-- ----------------------------------------------------------------------------
-- 2) Atualizar ia_notificacoes_pendentes() para usar iniciado_em
-- ----------------------------------------------------------------------------
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
  -- a fila. USA iniciado_em (momento real do início do envio), não criado_em.
  update public.ia_notificacoes
     set status = 'pendente',
         iniciado_em = null
   where status = 'enviando'
     and iniciado_em is not null
     and iniciado_em <= now() - interval '10 minutes';

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
         tentativas = tentativas + 1,
         iniciado_em = now()
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

-- ----------------------------------------------------------------------------
-- 3) Atualizar ia_notificacao_resolver() para limpar iniciado_em
--    PRESERVA: RETURNS json + formato exato de retorno original
-- ----------------------------------------------------------------------------
create or replace function public.ia_notificacao_resolver(
  p_id text,
  p_ok boolean,
  p_motivo text default ''
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_id is null or length(p_id) < 8 or length(p_id) > 64 then
    raise exception 'Identificador inválido.';
  end if;

  update public.ia_notificacoes
     set status = case when coalesce(p_ok, false) then 'enviado' else 'falha' end,
         iniciado_em = null,
         enviado_em = case when coalesce(p_ok, false) then now() else null end,
         ultimo_erro = case
           when coalesce(p_ok, false) then ''
           else left(coalesce(p_motivo, ''), 300)
         end
   where id = p_id
     and status = 'enviando';

  if not found then
    return json_build_object('ok', false, 'motivo', 'Notificação não estava em envio.');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.ia_notificacao_resolver(text, boolean, text) from public, anon, authenticated;
grant execute on function public.ia_notificacao_resolver(text, boolean, text) to service_role;

notify pgrst, 'reload schema';