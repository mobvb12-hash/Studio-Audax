-- ============================================================================
-- 029_clube_pote_papeis.sql — quem pode calcular, fechar e reabrir o pote
-- ----------------------------------------------------------------------------
-- A 028 deixou as funções de escrita em `service_role` porque é onde mora a
-- chave do servidor. Só que o ADMIN do Studio Audax entra pelo PostgREST com o
-- JWT do usuário — ou seja, `authenticated` — do mesmo jeito que o Caixa e as
-- Comissões já funcionam. Sem esta migration a tela de fechamento não teria
-- porta de entrada nenhuma.
--
-- O QUE ESTA MIGRATION FAZ (e nada mais):
--   1. dá execute das funções de pote/Club para `authenticated`;
--   2. INSERE a checagem de papel dentro de cada uma delas.
--
-- POR QUE ISSO CONTINUA SENDO VALIDAÇÃO NO BACKEND (item 24):
--   A regra não é parâmetros que o app manda: `clube_atendimento_registrar`
--   REFaz a resolução do benefício a partir de `clube_assinaturas` e
--   `servicos`, `clube_pote_fechar` recalcula o rateio inteiro e recusa
--   período já fechado, e `clube_pote_calcular` é uma leitura. O frontend
--   continua sem poder forjar ficha, liberar benefício atrasado nem escolher
--   o próprio valor do pote — tudo é ignorado e recalculado aqui dentro.
--
--   A única coisa que o papel libera é QUEM CHEGA A PEDIR; o que ele obtém é
--   sempre o que o banco calculou.
--
-- CORPO IDÊNTICO AO DA 028:
--   As cinco funções abaixo foram geradas a partir da 028 com a guarda
--   inserida logo depois do `begin`. Nenhuma linha de regra mudou — o diff é
--   só a checagem de autorização. Isso é verificável: `supabase-schema.test.ts`
--   compara os dois arquivos.
--
-- Nenhuma tabela, policy ou dado é alterado.
-- ============================================================================

create or replace function public.clube_pote_calcular(
  p_inicio date,
  p_fim date,
  p_percentual numeric default null,
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
    (select valor -> 'pote'
       from public.configuracoes_sistema
      where chave = 'clube'),
    '{}'::jsonb);
  v_percentual numeric;
begin

  -- Autorização (item 24): a REGRA abaixo é exatamente a da 028, sem
  -- mudança. Entra apenas a checagem de papel do usuário da sessão.
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para ver o fechamento do pote.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe a data inicial e a data final do período.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data final precisa ser igual ou depois da data inicial.';
  end if;

  -- Percentual: o informado na tela ou o configurado. Nunca fixo no código.
  v_percentual := coalesce(
    p_percentual,
    nullif(trim(coalesce(v_cfg ->> 'percentual', '')), '')::numeric,
    0
  );

  return public.audax_clube_rateio(p_inicio, p_fim, v_percentual, p_profissionais)
    || jsonb_build_object(
      'periodoInicio', to_char(p_inicio, 'YYYY-MM-DD'),
      'periodoFim', to_char(p_fim, 'YYYY-MM-DD'),
      'percentualConfigurado',
        nullif(trim(coalesce(v_cfg ->> 'percentual', '')), '')::numeric,
      'poteAtivo', coalesce((v_cfg ->> 'ativo')::boolean, false),
      'participantesConfigurados', coalesce(v_cfg -> 'participantes', '[]'::jsonb),
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

create or replace function public.clube_pote_fechar(
  p_inicio date,
  p_fim date,
  p_percentual numeric default null,
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
    (select valor -> 'pote'
       from public.configuracoes_sistema
      where chave = 'clube'),
    '{}'::jsonb);
  v_rateio jsonb;
  v_partes jsonb;
  v_id text;
  v_divergencia boolean := false;
begin

  -- Autorização (item 24): a REGRA abaixo é exatamente a da 028, sem
  -- mudança. Entra apenas a checagem de papel do usuário da sessão.
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para fechar o pote.';
  end if;
  if p_inicio is null or p_fim is null then
    raise exception 'Informe a data inicial e a data final do período.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data final precisa ser igual ou depois da data inicial.';
  end if;
  if not coalesce((v_cfg ->> 'ativo')::boolean, false) then
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

  v_rateio := public.clube_pote_calcular(p_inicio, p_fim, p_percentual, p_profissionais);
  v_partes := coalesce(v_rateio -> 'partes', '[]'::jsonb);

  -- Trava contra rateio quebrado: a soma tem de bater com o pote.
  v_divergencia := abs(
    coalesce((v_rateio ->> 'somaPartes')::numeric, 0)
    - coalesce((v_rateio ->> 'pote')::numeric, 0)
  ) > 0.001;

  if v_divergencia then
    raise exception
      'O rateio não fecha: soma das partes R$ % difere do pote R$ %. Nada foi gravado.',
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
    partes, filtros, fechado_por
  )
  values (
    v_id, p_inicio, p_fim,
    (v_rateio ->> 'receita')::numeric,
    (v_rateio ->> 'percentual')::numeric,
    (v_rateio ->> 'pote')::numeric,
    (v_rateio ->> 'pote')::numeric,
    (v_rateio ->> 'fichasTotal')::numeric,
    v_partes,
    jsonb_build_object(
      'somaPartes', (v_rateio ->> 'somaPartes')::numeric,
      'percentualConfigurado', (v_rateio ->> 'percentualConfigurado')::numeric,
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
      || ' — pote R$ ' || to_char((v_rateio ->> 'pote')::numeric, 'FM999999999,0.00')
      || ' sobre receita R$ ' || to_char((v_rateio ->> 'receita')::numeric, 'FM999999999,0.00')
      || ' (' || to_char((v_rateio ->> 'fichasTotal')::numeric, 'FM999999999')
      || ' ficha(s))',
    null,
    jsonb_build_object(
      'fechamentoId', v_id,
      'percentual', (v_rateio ->> 'percentual')::numeric,
      'pote', (v_rateio ->> 'pote')::numeric,
      'receita', (v_rateio ->> 'receita')::numeric,
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

create or replace function public.clube_pote_reabrir(
  p_id text,
  p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_alvo public.clube_pote_fechamentos%rowtype;
  v_motivo text := trim(coalesce(p_motivo, ''));
begin

  -- Autorização (item 24): a REGRA abaixo é exatamente a da 028, sem
  -- mudança. Entra apenas a checagem de papel do usuário da sessão.
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para reabrir o fechamento.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  select * into v_alvo
    from public.clube_pote_fechamentos f
   where f.id = p_id;
  if not found then
    raise exception 'Fechamento não encontrado.';
  end if;
  if v_alvo.reaberto is not null then
    raise exception 'Este fechamento já está reaberto.';
  end if;

  update public.clube_pote_fechamentos
     set reaberto = jsonb_build_object(
           'em', to_char(now() at time zone 'America/Recife', 'YYYY-MM-DD"T"HH24:MI:SS'),
           'motivo', v_motivo
         ),
         atualizado_em = now()
   where id = p_id;

  -- Devolve as fichas do período ao pool: o novo fechamento recalcula.
  update public.clube_producao
     set fechamento_id = null,
         atualizado_em = now()
   where fechamento_id = p_id;

  insert into public.comissoes_auditoria (
    id, profissional_id, profissional_nome, acao,
    periodo_inicio, periodo_fim, descricao, motivo, dados
  )
  values (
    gen_random_uuid()::text,
    null,
    'Audax Club',
    'pote_reabertura',
    v_alvo.periodo_inicio,
    v_alvo.periodo_fim,
    'Reabertura do fechamento do pote de '
      || to_char(v_alvo.periodo_inicio, 'DD/MM/YYYY')
      || ' a ' || to_char(v_alvo.periodo_fim, 'DD/MM/YYYY'),
    v_motivo,
    jsonb_build_object(
      'fechamentoId', p_id,
      'pote', v_alvo.pote,
      'fichas', v_alvo.fichas_total
    )
  );

  return jsonb_build_object('ok', true, 'id', p_id, 'motivo', v_motivo);
end;
$$;

create or replace function public.clube_atendimento_registrar(
  p_cliente_id text,
  p_telefone text,
  p_servico text,
  p_profissional text,
  p_data date,
  p_horario text default '',
  p_duracao_min integer default 0,
  p_agendamento_id text default '',
  p_origem text default 'caixa',
  p_usar_beneficio boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_beneficio jsonb;
  v_tipo text;
  v_status text;
  v_periodo date;
  v_id text;
  v_cliente text;
  v_cliente_id text;
begin

  -- Autorização (item 24): a REGRA abaixo é exatamente a da 028, sem
  -- mudança. Entra apenas a checagem de papel do usuário da sessão.
  if not public.current_user_is_recepcao_ou_acima() then
    raise exception 'Você não tem permissão para registrar atendimento do Club.';
  end if;
  v_beneficio := public.audax_clube_beneficio(
    p_cliente_id, p_telefone, p_servico, p_data, p_usar_beneficio
  );

  -- Serviço desconhecido: a função recusou, nada é gravado.
  if not coalesce((v_beneficio ->> 'ok')::boolean, false) then
    return v_beneficio;
  end if;

  v_tipo := coalesce(v_beneficio ->> 'tipoBeneficio', 'avulso');
  v_status := coalesce(v_beneficio ->> 'statusAssinatura', '');
  v_cliente := coalesce(v_beneficio ->> 'cliente', '');
  v_cliente_id := nullif(v_beneficio ->> 'clienteId', '');

  -- Sem assinatura em dia, NUNCA entra ficha de Club: o atendimento é avulso
  -- e o pote não o enxerga (itens 4 e 6).
  if v_tipo = 'avulso' or v_status not in ('ativa', 'proxima_vencimento') then
    return v_beneficio || jsonb_build_object('registrado', false);
  end if;

  -- Período do pote: dia 1º do mês do atendimento, no fuso do Studio.
  v_periodo := date_trunc('month', coalesce(p_data, current_date))::date;
  v_id := gen_random_uuid()::text;

  insert into public.clube_producao (
    id, cliente_id, cliente, assinatura_id, plano,
    servico_id, servico, valor_tabela, valor_pago, beneficio,
    beneficio_tipo, desconto_percentual,
    profissional_id, profissional,
    data, horario, duracao_min, agendamento_id, origem,
    fichas, periodo_pote
  )
  select
    v_id,
    v_cliente_id,
    v_cliente,
    nullif(v_beneficio ->> 'assinaturaId', ''),
    coalesce(v_beneficio ->> 'plano', ''),
    v_beneficio ->> 'servicoId',
    coalesce(v_beneficio ->> 'servico', ''),
    (v_beneficio ->> 'valorTabela')::numeric,
    (v_beneficio ->> 'valorPago')::numeric,
    (v_beneficio ->> 'beneficio')::numeric,
    v_tipo,
    (v_beneficio ->> 'descontoPercentual')::numeric,
    pr.id,
    coalesce(nullif(trim(p_profissional), ''), pr.nome, ''),
    coalesce(p_data, current_date),
    coalesce(p_horario, ''),
    coalesce(p_duracao_min, 0),
    nullif(trim(p_agendamento_id), ''),
    case when p_origem in ('caixa', 'agenda', 'manual') then p_origem else 'caixa' end,
    1,
    v_periodo
    from (select 1) x
    left join public.profissionais pr
      on pr.ativo and pr.nome = trim(coalesce(p_profissional, ''));

  return v_beneficio || jsonb_build_object(
    'registrado', true,
    'id', v_id,
    'periodoPote', to_char(v_periodo, 'YYYY-MM-DD')
  );
end;
$$;

create or replace function public.clube_producao_estornar(
  p_id text,
  p_motivo text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin

  -- Autorização (item 24): a REGRA abaixo é exatamente a da 028, sem
  -- mudança. Entra apenas a checagem de papel do usuário da sessão.
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para estornar ficha de produção.';
  end if;
  if not exists (select 1 from public.clube_producao f where f.id = p_id) then
    raise exception 'Ficha de produção não encontrada.';
  end if;
  if exists (select 1 from public.clube_producao f where f.id = p_id and f.estornado) then
    raise exception 'Esta ficha já está estornada.';
  end if;

  update public.clube_producao
     set estornado = true,
         estornado_em = now(),
         atualizado_em = now(),
         dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object(
           'estornoMotivo', left(coalesce(trim(p_motivo), ''), 200)
         )
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- PRIVILÉGIOS: `authenticated` chega até as funções; o que ele obtém é o que o
-- banco calculou (ver cabeçalho). `anon` continua sem acesso nenhum.
-- ----------------------------------------------------------------------------
revoke execute on function public.clube_pote_calcular(date, date, numeric, text[])
  from public, anon, service_role;
grant execute on function public.clube_pote_calcular(date, date, numeric, text[])
  to authenticated, service_role;

revoke execute on function public.clube_pote_fechar(date, date, numeric, text[], text)
  from public, anon, service_role;
grant execute on function public.clube_pote_fechar(date, date, numeric, text[], text)
  to authenticated, service_role;

revoke execute on function public.clube_pote_reabrir(text, text)
  from public, anon, service_role;
grant execute on function public.clube_pote_reabrir(text, text)
  to authenticated, service_role;

revoke execute on function public.clube_pote_listar(date, date)
  from public, anon, service_role;
grant execute on function public.clube_pote_listar(date, date)
  to authenticated, service_role;

revoke execute on function public.clube_atendimento_registrar(text, text, text, text, date, text, integer, text, text, boolean)
  from public, anon, service_role;
grant execute on function public.clube_atendimento_registrar(text, text, text, text, date, text, integer, text, text, boolean)
  to authenticated, service_role;

revoke execute on function public.clube_producao_estornar(text, text)
  from public, anon, service_role;
grant execute on function public.clube_producao_estornar(text, text)
  to authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- 7) LEITURA COM PAPEL — `clube_pote_listar`
--
--    Esta função é `language sql`, então não aceita a guarda automática das
--    outras cinco. O corpo da CONSULTA é o mesmo da 028 palavra por palavra;
--    o que entra é o embrulho em plpgsql com a checagem de papel na entrada.
--
--    Sem isto, um usuário autenticado com papel de `profissional` leria a
--    receita e o rateio da casa inteira — porque SECURITY DEFINER ignora a
--    RLS das tabelas.
-- ----------------------------------------------------------------------------
create or replace function public.clube_pote_listar(
  p_inicio date default null,
  p_fim date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_gerente_ou_acima() then
    raise exception 'Você não tem permissão para ver os fechamentos do pote.';
  end if;

  return (
    select jsonb_build_object(
      'fechamentos', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'periodoInicio', to_char(f.periodo_inicio, 'YYYY-MM-DD'),
            'periodoFim', to_char(f.periodo_fim, 'YYYY-MM-DD'),
            'receita', f.receita,
            'percentual', f.percentual,
            'pote', f.pote,
            'producaoTotal', f.producao_total,
            'fichasTotal', f.fichas_total,
            'partes', f.partes,
            'fechadoPor', f.fechado_por,
            'fechadoEm', to_char(
              f.fechado_em at time zone 'America/Recife',
              'YYYY-MM-DD"T"HH24:MI:SS'),
            'reaberto', f.reaberto
          )
          order by f.periodo_fim desc, f.fechado_em desc
        )
        from public.clube_pote_fechamentos f
       where (p_inicio is null or f.periodo_fim >= p_inicio)
         and (p_fim is null or f.periodo_inicio <= p_fim)
      ), '[]'::jsonb),
      'fichas', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', cp.id,
            'clienteId', cp.cliente_id,
            'cliente', cp.cliente,
            'plano', cp.plano,
            'servico', cp.servico,
            'categoria', coalesce(
              (select s.categoria from public.servicos s where s.id = cp.servico_id), ''),
            'profissional', cp.profissional,
            'profissionalId', cp.profissional_id,
            'data', to_char(cp.data, 'YYYY-MM-DD'),
            'horario', cp.horario,
            'duracaoMin', cp.duracao_min,
            'valorTabela', cp.valor_tabela,
            'valorPago', cp.valor_pago,
            'beneficio', cp.beneficio,
            'tipoBeneficio', cp.beneficio_tipo,
            'descontoPercentual', cp.desconto_percentual,
            'fichas', cp.fichas,
            'periodoPote', to_char(cp.periodo_pote, 'YYYY-MM-DD'),
            'fechamentoId', cp.fechamento_id,
            'estornado', cp.estornado
          )
          order by cp.data desc, cp.criado_em desc
        )
        from public.clube_producao cp
       where (p_inicio is null or cp.data >= p_inicio)
         and (p_fim is null or cp.data <= p_fim)
      ), '[]'::jsonb),
      'config', coalesce((
        select valor -> 'pote'
          from public.configuracoes_sistema
         where chave = 'clube'
      ), '{}'::jsonb)
    )
  );
end;
$$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
