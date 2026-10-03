-- ============================================================================
-- 031_comissao_somente_do_dono.sql - a comissão NÃO é parâmetro de quem chama
-- ============================================================================
--
-- O QUE MUDOU E POR QUE
--
-- A 030 corrigiu a regra financeira (pote = receita inteira; comissão sobre a
-- parcela de cada profissional), mas deixou a comissão como PARÂMETRO das
-- funções: `coalesce(p_comissao, configuracao)`. Na prática, qualquer usuário
-- autenticado com permissão de gerente ou recepção podia chamar a RPC direto
-- com p_comissao = 1 e fechar o período entregando 100% do pote aos
-- profissionais — trocando a regra financeira oficial por um argumento.
--
-- Aqui a comissão deixa de ser entrada: as três portas do pote passam a lê-la
-- sozinhas de `configuracoes_sistema -> clube.comissao.percentual` (0.40 no
-- Studio Audax). O dono muda a comissão em Configurações, não na chamada.
--
-- A CORPO da regra é o mesmo da 030 — muda apenas de onde vem a comissão.
-- O fechamento continua congelando a comissão que foi realmente distribuída
-- (lida do próprio rateio), então o snapshot não pode divergir do pagamento.
--
-- Nada abre: as assinaturas antigas caem por `drop function` e as novas recebem
-- exatamente as mesmas permissões (service_role no rateio; authenticated nos
-- demais). `create or replace` não aceitaria renomear parâmetro, por isso as
-- duas portas são derrubadas antes.
--
-- ============================================================================

drop function if exists public.audax_clube_rateio(date, date, numeric, text[]);

create or replace function public.audax_clube_rateio(
  p_inicio date,
  p_fim date,
  p_profissionais text[] default '{}'::text[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with gate as (
    select
      public.audax_clube_receita_periodo(p_inicio, p_fim) as receita,
      -- O pote é a receita INTEIRA. Não existe percentual de entrada.
      public.audax_clube_receita_periodo(p_inicio, p_fim) as pote,
      -- A comissao NAO vem do chamador: e sempre a configuracao do dono.
      coalesce(
        (select nullif(trim(coalesce(valor -> 'comissao' ->> 'percentual', '')), '')::numeric
           from public.configuracoes_sistema
          where chave = 'clube'),
        0.40
      ) as comissao
  ),
  fichas as (
    select coalesce(sum(a.fichas), 0) as total
      from (
        select sum(cp.fichas) as fichas
          from public.clube_producao cp
         where cp.data >= p_inicio
           and cp.data <= p_fim
           and coalesce(cp.estornado, false) = false
           and cp.beneficio_tipo <> 'avulso'
           -- já paga uma vez: não entra em novo rateio
           and cp.fechamento_id is null
           and (
             cardinality(coalesce(p_profissionais, '{}'::text[])) = 0
             or cp.profissional = any (p_profissionais)
             or cp.profissional_id = any (p_profissionais)
           )
         group by cp.profissional_id
      ) a
  ),
  agregadas as (
    select
      cp.profissional_id,
      max(cp.profissional) as profissional,
      sum(cp.fichas) as fichas,
      sum(cp.valor_tabela) as referencia
      from public.clube_producao cp
     where cp.data >= p_inicio
       and cp.data <= p_fim
       and coalesce(cp.estornado, false) = false
       and cp.beneficio_tipo <> 'avulso'
       and cp.fechamento_id is null
       and (
         cardinality(coalesce(p_profissionais, '{}'::text[])) = 0
         or cp.profissional = any (p_profissionais)
         or cp.profissional_id = any (p_profissionais)
       )
     group by cp.profissional_id
  ),
  base as (
    select
      a.profissional_id,
      coalesce(nullif(a.profissional, ''), coalesce(a.profissional_id, 'Sem nome')) as nome,
      a.fichas,
      a.referencia,
      case when f.total > 0
           then round(a.fichas / f.total * 100, 4)
           else 0 end as participacao,
      case when f.total > 0
           then trunc(g.pote * a.fichas / f.total, 2)
           else 0 end as parte,
      case when f.total > 0
           then g.pote * a.fichas / f.total - trunc(g.pote * a.fichas / f.total, 2)
           else 0 end as resto
    from agregadas a
    cross join fichas f
    cross join gate g
  ),
  sobra as (
    select case when g.pote - coalesce(sum(b.parte), 0) <= 0
                then 0
                else round(g.pote - coalesce(sum(b.parte), 0), 2) end as centavos
      from base b
      cross join gate g
     group by g.pote
  ),
  ordenadas as (
    select b.*, row_number() over (order by b.resto desc, b.nome asc) as posicao
      from base b
  ),
  final as (
    select
      o.profissional_id,
      o.nome,
      o.fichas,
      o.referencia,
      o.participacao,
      case when o.posicao <= s.centavos then o.parte + 0.01 else o.parte end as valor,
      -- Comissão sobre a PRÓPRIA parcela, já arredondada em centavos.
      round(
        (case when o.posicao <= s.centavos then o.parte + 0.01 else o.parte end)
        * g.comissao,
        2
      ) as comissao
    from ordenadas o
    cross join sobra s
    cross join gate g
  )
  select jsonb_build_object(
    'ok', f.total > 0,
    'motivo', case when f.total <= 0 then 'Nenhuma ficha de Club no período.' end,
    'receita', g.receita,
    -- O pote é a receita inteira.
    'pote', g.pote,
    -- 100% da receita entra no pote; fica registrado para o relatório.
    'percentualPote', 100,
    'comissaoPercentual', g.comissao,
    'fichasTotal', f.total,
    'partes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'profissionalId', profissional_id,
          'profissional', nome,
          'fichas', fichas,
          'producaoReferencia', referencia,
          'participacao', participacao,
          'valor', valor,
          'comissao', comissao
        )
        order by nome asc
      )
        from final
    ), '[]'::jsonb),
    'somaPartes', coalesce((select sum(valor) from final), 0),
    'comissaoTotal', coalesce((select sum(comissao) from final), 0),
    'receitaEmpresa', g.pote - coalesce((select sum(comissao) from final), 0)
  )
  from gate g
  cross join fichas f;
$$;

comment on function public.audax_clube_rateio is
  'Rateio do pote: pote = receita integral do período, dividida por produção '
  'com maior resto (soma exata), e comissão do profissional sobre a sua '
  'parcela. Puro — não grava nada.';

-- ----------------------------------------------------------------------------
-- 6) CALCULAR (dry run) — a tela mostra os QUATRO valores separados
--
--    receita da assinatura · pote · parcela do profissional · comissão.
--    A comissão vem da configuração `clube.comissao.percentual` (0.40).
-- ----------------------------------------------------------------------------
--    `create or replace` não aceita renomear parâmetro, então as duas portas
--    são derrubadas e recriadas com o nome certo. Nenhuma dependência quebra:
--    os corpos são plpgsql e não registram dependência de função.
drop function if exists public.clube_pote_calcular(date, date, numeric, text[]);
drop function if exists public.clube_pote_calcular(date, date, text[]);

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

  return public.audax_clube_rateio(p_inicio, p_fim, p_profissional)
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
drop function if exists public.clube_pote_fechar(date, date, numeric, text[], text);
drop function if exists public.clube_pote_fechar(date, date, text[], text);

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
    (v_rateio ->> 'pote')::numeric,
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

-- ----------------------------------------------------------------------------
-- 8) LEITURA — traz parcela e comissão de cada profissional
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- PERMISSÕES: as assinaturas novas recebem exatamente o mesmo acesso.
-- ----------------------------------------------------------------------------



revoke execute on function public.clube_pote_listar(date, date)
  from public, anon, service_role;
grant execute on function public.audax_clube_rateio(date, date, text[]) to service_role;
grant execute on function public.clube_pote_calcular(date, date, text[]) to authenticated, service_role;
grant execute on function public.clube_pote_fechar(date, date, text[], text) to authenticated, service_role;
grant execute on function public.clube_pote_listar(date, date) to authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
