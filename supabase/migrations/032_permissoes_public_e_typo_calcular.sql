-- ============================================================================
-- 032_permissoes_public_e_typo_calcular.sql
-- ============================================================================
--
-- O QUE ESTAVA ERRADO (achado testando a RPC de verdade, como anon)
--
-- 1) PERMISSÃO. A 031 recriou as três portas do pote com assinatura nova. Em
--    PostgreSQL, função nova nasce com EXECUTE para PUBLIC, e os `revoke` que
--    a 030 fazia eram das assinaturas ANTIGAS — que a 031 derrubou. Resultado:
--    `audax_clube_rateio` respondia para anon com a receita do período e a
--    parcela e a comissão de cada profissional. Dinheiro exposto.
--
-- 2) TYPO. `clube_pote_calcular` chamava o rateio com `p_profissional`
--    (sem o "eis"), então qualquer cálculo quebrava com
--    42703 column "p_profissional" does not exist.
--
-- O QUE MUDA
--   • as três portas são revogadas de PUBLIC/anon/authenticated e regradas
--     somente para quem pode: service_role no rateio, authenticated em
--     calcular, fechar e listar;
--   • `clube_pote_calcular` é recriado (mesma assinatura, `create or replace`)
--     passando `p_profissionais` para o rateio.
--
-- A REGRA NÃO MUDA: é o mesmo corpo da 031, com a comissão lida da
-- configuração do dono e as guardas de papel intactas.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CÁLCULO — recriado só para corrigir o nome do parâmetro repassado
-- ----------------------------------------------------------------------------
create or replace function public.clube_pote_calcular(
  p_inicio date,
  p_fim date,
  p_profissionais text[] default '{}'::text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := coalesce(
    (select valor
       from public.configuracoes_sistema
      where chave = 'clube'),
    '{}'::jsonb);
begin
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para ver o fechamento do pote.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe a data inicial e a data final do período.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data final precisa ser igual ou depois da data inicial.';
  end if;

  return public.audax_clube_rateio(p_inicio, p_fim, p_profissionais)
    || jsonb_build_object(
      'periodoInicio', to_char(p_inicio, 'YYYY-MM-DD'),
      'periodoFim', to_char(p_fim, 'YYYY-MM-DD'),
      'comissaoConfigurada',
        nullif(trim(coalesce(v_cfg -> 'comissao' ->> 'percentual', '')), '')::numeric,
      'poteAtivo', coalesce((v_cfg -> 'pote' ->> 'ativo')::boolean, false),
      'participantesConfigurados', coalesce(v_cfg -> 'pote' -> 'participantes', '[]'::jsonb),
      'jaFechado', exists (
        select 1
          from public.clube_pote_fechamentos f
         where f.periodo_inicio = p_inicio
           and f.periodo_fim = p_fim
           and f.reaberto is null
      )
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) FECHAR O PERÍODO — snapshot com parcela E comissão congeladas
--
--    Grava receita, pote, fichas, participação, parcela e comissão de cada
--    profissional. Recusa se a soma das parcelas não bater com o pote — a
--    trava é a mesma da 028 e continua valendo.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- PERMISSÕES: nada além do que cada papel pode fazer
--
-- PostgreSQL dá EXECUTE para PUBLIC em toda função nova. Recriar a função com
-- outra assinatura devolve esse padrão, então o revoke precisa vir JUNTO —
-- foi o que faltou na 031 e o que esta migration corrige.
-- ----------------------------------------------------------------------------

-- O rateio é leitura de dinheiro: só o servidor (service_role).
revoke execute on function public.audax_clube_rateio(date, date, text[])
  from public, anon, authenticated;
grant execute on function public.audax_clube_rateio(date, date, text[])
  to service_role;

-- Calcular e fechar são do gerente: a guarda de papel dentro do corpo continua
-- valendo, e agora o banco também nega antes de executar.
revoke execute on function public.clube_pote_calcular(date, date, text[])
  from public, anon, authenticated;
grant execute on function public.clube_pote_calcular(date, date, text[])
  to authenticated, service_role;

revoke execute on function public.clube_pote_fechar(date, date, text[], text)
  from public, anon, authenticated;
grant execute on function public.clube_pote_fechar(date, date, text[], text)
  to authenticated, service_role;

-- Listar volta a ser leitura da própria equipe, como na 029.
revoke execute on function public.clube_pote_listar(date, date)
  from public, anon;
grant execute on function public.clube_pote_listar(date, date)
  to authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
