-- ============================================================================
-- 033_producao_total_do_snapshot.sql - a coluna producao_total freezes produção
-- ============================================================================
--
-- O QUE ESTAVA ERRADO
--
-- `clube_pote_fechar` gravava o POT na coluna `producao_total` do snapshot:
--
--     pote            -> (v_rateio ->> 'pote')::numeric,
--     producao_total  -> (v_rateio ->> 'pote')::numeric,   <-- o pote de novo
--
-- A coluna existe para congelar a PRODUÇÃO do período (o valor de referência
-- das fichas, `producaoReferencia` do rateio). Com o pote no lugar, o
-- histórico mostrava "valor de referência" igual ao pote — e as duas
-- grandezas, que precisam ser comparáveis, ficavam indistinguíveis.
--
-- Só o INSERT muda. A trava contra rateio quebrado, o snapshot de
-- commissions, a auditoria e as guardas de papel continuam idênticos.
--
-- NÃO há o que backfillar: o pote nunca foi fechado em produção (o
-- `pote.ativo` nasce desligado), então a tabela está vazia. A correção vale
-- para todo fechamento feito a partir daqui.
--
-- ============================================================================

create or replace function public.clube_pote_fechar(
  p_inicio date,
  p_fim date,
  p_profissionais text[] default '{}'::text[],
  p_responsavel text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cfg jsonb := coalesce(
    (select valor
       from public.configuracoes_sistema
      where chave = 'clube'),
    '{}'::jsonb);
  v_rateio jsonb;
  v_partes jsonb;
  v_id text;
  v_comissao numeric;
begin
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para fechar o pote.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe a data inicial e a data final do período.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data final precisa ser igual ou depois da data inicial.';
  end if;
  if not coalesce((v_cfg -> 'pote' ->> 'ativo')::boolean, false) then
    raise exception 'O fechamento do pote está desligado nas Configurações.';
  end if;

  if exists (
    select 1
      from public.clube_pote_fechamentos f
     where f.periodo_inicio = p_inicio
       and f.periodo_fim = p_fim
       and f.reaberto is null
  ) then
    raise exception 'Já existe fechamento do pote para este período.';
  end if;

  v_rateio := public.clube_pote_calcular(p_inicio, p_fim, p_profissionais);
  -- A comissao gravada no snapshot e a MESMA que foi distribuida, lida do
  -- proprio rateio: nao ha segunda leitura da configuracao para divergir.
  v_comissao := coalesce((v_rateio ->> 'comissaoPercentual')::numeric, 0.40);
  v_partes := coalesce(v_rateio -> 'partes', '[]'::jsonb);

  -- Trava contra rateio quebrado: a soma tem de bater com o pote, no centavo.
  if abs(
    coalesce((v_rateio ->> 'somaPartes')::numeric, 0)
    - coalesce((v_rateio ->> 'pote')::numeric, 0)
  ) > 0.001 then
    raise exception
      'O rateio não fecha: soma das parcelas R$ % difere do pote R$ %. Nada foi gravado.',
      to_char((v_rateio ->> 'somaPartes')::numeric, 'FM999999999,0.00'),
      to_char((v_rateio ->> 'pote')::numeric, 'FM999999999,0.00');
  end if;

  if coalesce((v_rateio ->> 'fichasTotal')::numeric, 0) <= 0 then
    raise exception 'Não há ficha de Club no período para distribuir.';
  end if;

  v_id := gen_random_uuid()::text;

  insert into public.clube_pote_fechamentos (
    id, periodo_inicio, periodo_fim,
    receita, percentual, pote, producao_total, fichas_total,
    comissao_percentual, comissao_total, receita_empresa,
    partes, filtros, fechado_por
  )
  values (
    v_id, p_inicio, p_fim,
    (v_rateio ->> 'receita')::numeric,
    -- 100%: a receita inteira forma o pote.
    100,
    (v_rateio ->> 'pote')::numeric,
    -- A PRODUÇÃO congelada: valor de referência das fichas do período.
    -- (ia recebia o pote aqui — mesma soma,duplicava o pote e a coluna mentia.)
    (v_rateio ->> 'producaoReferencia')::numeric,
    (v_rateio ->> 'fichasTotal')::numeric,
    v_comissao,
    (v_rateio ->> 'comissaoTotal')::numeric,
    (v_rateio ->> 'receitaEmpresa')::numeric,
    v_partes,
    jsonb_build_object(
      'somaPartes', (v_rateio ->> 'somaPartes')::numeric,
      'comissaoTotal', (v_rateio ->> 'comissaoTotal')::numeric,
      'receitaEmpresa', (v_rateio ->> 'receitaEmpresa')::numeric,
      'comissaoConfigurada', (v_rateio ->> 'comissaoConfigurada')::numeric,
      'participantes', coalesce(p_profissionais, '{}'::text[]),
      'responsavel', coalesce(nullif(trim(p_responsavel), ''), 'sistema')
    ),
    coalesce(nullif(trim(p_responsavel), ''), 'sistema')
  );

  -- As fichas do período passam a apontar para este fechamento: o que já foi
  -- pago não pode entrar em um novo rateio.
  update public.clube_producao
     set fechamento_id = v_id,
         atualizado_em = now()
   where data >= p_inicio
     and data <= p_fim
     and fechamento_id is null
     and coalesce(estornado, false) = false;

  insert into public.comissoes_auditoria (
    id, profissional_id, profissional_nome, acao,
    periodo_inicio, periodo_fim, descricao, motivo, dados
  )
  values (
    gen_random_uuid()::text,
    null,
    'Audax Club',
    'pote_fechamento',
    p_inicio,
    p_fim,
    'Fechamento do pote de ' || to_char(p_inicio, 'DD/MM/YYYY')
      || ' a ' || to_char(p_fim, 'DD/MM/YYYY')
      || ' — receita R$ ' || to_char((v_rateio ->> 'receita')::numeric, 'FM999999999,0.00')
      || ', pote R$ ' || to_char((v_rateio ->> 'pote')::numeric, 'FM999999999,0.00')
      || ', comissão R$ ' || to_char((v_rateio ->> 'comissaoTotal')::numeric, 'FM999999999,0.00')
      || ' (' || to_char((v_rateio ->> 'fichasTotal')::numeric, 'FM999999999')
      || ' ficha(s), ' || to_char(v_comissao * 100, 'FM9999999999') || '% por ficha de produção)',
    null,
    jsonb_build_object(
      'fechamentoId', v_id,
      'receita', (v_rateio ->> 'receita')::numeric,
      'pote', (v_rateio ->> 'pote')::numeric,
      'comissaoPercentual', v_comissao,
      'comissaoTotal', (v_rateio ->> 'comissaoTotal')::numeric,
      'receitaEmpresa', (v_rateio ->> 'receitaEmpresa')::numeric,
      'fichas', (v_rateio ->> 'fichasTotal')::numeric,
      'somaPartes', (v_rateio ->> 'somaPartes')::numeric,
      'responsavel', coalesce(nullif(trim(p_responsavel), ''), 'sistema')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'fechadoEm', to_char(now() at time zone 'America/Recife', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'rateio', v_rateio
  );
end;
$$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
