-- ============================================================================
-- 020_painel_clube.sql — Clube do PAINEL DO CLIENTE (Studio Audax)
-- ----------------------------------------------------------------------------
-- Contexto
--   O painel do cliente (FASES A–Y) ganha a aba "Clube" mostrando a PRÓPRIA
--   assinatura e os PRÓPRIOS pagamentos. As tabelas `clube_assinaturas` e
--   `clube_pagamentos` mantêm a política da área admin
--   (`clube_acesso_autenticado ... for all to authenticated using (true)`):
--   qualquer sessão autenticada leria TODAS as linhas — inaceitável para o
--   painel, onde uma conta de cliente não pode enxergar dados de outro
--   cliente (regra: RLS com acesso cruzado = negado).
--
-- Estratégia (mesma da 018/019: NÃO mexer nas políticas existentes)
--   RPC SECURITY DEFINER única `painel_clube_minha()` que:
--     • valida a sessão (auth.uid());
--     • resolve o cadastro do PRÓPRIO usuário (current_cliente_id());
--     • devolve a assinatura mais recente DELE (ativa primeiro) + os
--       últimos 5 pagamentos DELE — nunca de terceiros;
--     • `null` = sem assinatura (não é erro).
--   Grants só para `authenticated`; anon/public fora.
--
-- Idempotente (create or replace) — pode ser reexecutada.
-- ============================================================================

create or replace function public.painel_clube_minha()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cli text;
  v_ass jsonb;
  v_pags jsonb;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  v_cli := public.current_cliente_id();
  if v_cli is null then
    -- sessão autenticada mas ainda sem cadastro vinculado: sem clube
    return null;
  end if;

  -- assinatura própria: ativa primeiro; entre ativas, a mais recente;
  -- se só houver cancelada, mostra a mais recente cancelada
  select to_jsonb(a) into v_ass
    from clube_assinaturas a
   where a.cliente_id = v_cli
   order by a.cancelada asc, a.criado_em desc
   limit 1;

  if v_ass is null then
    return null;
  end if;

  -- últimos 5 pagamentos do PRÓPRIO cliente (histórico do ciclo)
  select coalesce(jsonb_agg(x order by data desc, criado_em desc), '[]'::jsonb)
    into v_pags
    from (
      select to_jsonb(p) as x, p.data, p.criado_em
        from clube_pagamentos p
       where p.cliente_id = v_cli
       order by p.data desc, p.criado_em desc
       limit 5
    ) ultimos;

  return jsonb_build_object('assinatura', v_ass, 'pagamentos', v_pags);
end;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE: só sessão autenticada (anon/public fora — como as RPCs da 018/019)
-- ----------------------------------------------------------------------------
revoke execute on function public.painel_clube_minha() from public;
revoke execute on function public.painel_clube_minha() from anon;
grant execute on function public.painel_clube_minha() to authenticated;
