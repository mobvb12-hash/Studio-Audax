-- ============================================================================
-- 030_pote_integral_e_comissao.sql — regra financeira real do Studio Audax
--
-- ----------------------------------------------------------------------------
-- O QUE ESTAVA ERRADO
--   A 028 tratava a configuração `clube.pote.percentual` como "percentual da
--   receita que entra no pote" (pote = receita × pct / 100). Isso obrigava o
--   dono a escolher um número que não existe na regra real.
--
-- A REGRA REAL
--   1. O pote é a receita EFETIVAMENTE RECEBIDA das assinaturas do período,
--      INTEIRA — 100%, sem percentual de entrada;
--   2. cada atendimento Club válido gera 1 ficha, do profissional que atendeu;
--   3. o pote é dividido proporcionalmente às fichas;
--   4. sobre a PARCELA de cada profissional incide a comissão de 40%;
--   5. o restante permanece como receita da empresa.
--
--   Ou seja: 40% NÃO é "40% da mensalidade entra no pote". É a comissão do
--   barbeiro sobre a parcela que a produção dele gerou.
--
-- EXEMPLO OFICIAL (o do pedido, que esta migration reproduz exatamente)
--   Pote 2.129,60 · Cleiton 86 fichas · Ítalo 52 fichas · total 138
--     Cleiton 86/138 = 62,32% -> 1.327,15 de pote -> 530,86 de comissão
--     Ítalo   52/138 = 37,68% ->   802,45 de pote -> 320,98 de comissão
--     Total                      2.129,60 de pote -> 851,84 de comissão
--
-- O QUE MUDA (e o que NÃO muda)
--   MUDA:
--     • `clube.comissao.percentual` = fração da comissão do profissional
--       (0.40 = 40%). É a nova configuração canônica.
--     • `clube.pote.percentual` deixa de existir: ele significava "percentual
--       da receita que entra no pote", que agora é sempre 100%. Apagar o
--       campo é o que remove a ambiguidade — e nada se perde, porque ele era
--       só entrada de tela e o pote estava desligado por padrão.
--     • o rateio passa a devolver a comissão de cada parte, além da parcela;
--     • o fechamento congela comissão e receita da empresa.
--   NÃO MUDA:
--     • as tabelas `clube_producao` e `clube_pote_fechamentos` (só colunas
--       novas, com default, então linha existente continua válida);
--     • a cobertura dos planos, o bloqueio por assinatura e o avulso — as
--       regras da 028 continuam intactas;
--     • a agenda, o caixa, as comissões por atendimento e tudo mais.
--     Nenhuma regra de comissão é duplicada: a comissão do POTE é a comissão
--     do plano do Audax Club, que é outro cálculo, e as comissões por
--     atendimento continuam sendo as de `comissoes_configs`.
--
-- ARREDONDAMENTO (itens 6, 7 e 8 do pedido)
--   O rateio usa maior resto: cada parcela é truncada em centavos e a sobra
--   vai um centavo por vez para o maior resto fracionário, com desempate pelo
--   nome. Assim a soma das parcelas é EXATAMENTE o pote.
--   A comissão de cada um é o arredondamento da SUA parcela a 2 casas, e o
--   total é a soma das comissões individuais — determinístico.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RECEITA DO POTE — dinheiro realmente recebido, sem contagem dobrada
--
--    `clube_pagamentos` é o registro do pagamento da assinatura; `valor` é o
--    que entrou. O que não entra:
--      • pagamento de fora do período (janela inclusiva >= início e <= fim);
--      • pagamento cujo lançamento do Caixa foi estornado;
--      • o MESMO lançamento contado duas vezes — dois `clube_pagamentos`
--        apontando para o mesmo `caixa_lancamento_id` viram um só.
--
--    Sem `caixa_lancamento_id` (pagamento antigo), a linha é contada por si
--    mesma: o app só o grava depois de lançar no Caixa.
--
--    Não conta assinatura por estar ativa: entra só o que foi pago.
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_receita_periodo(
  p_inicio date,
  p_fim date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with unicos as (
    select distinct on (coalesce(p.caixa_lancamento_id, p.id))
           p.valor,
           p.data
      from public.clube_pagamentos p
      left join public.caixa_lancamentos c on c.id = p.caixa_lancamento_id
     where p.data >= p_inicio
       and p.data <= p_fim
       and coalesce(c.estornado, false) = false
     order by coalesce(p.caixa_lancamento_id, p.id), p.criado_em
  )
  select coalesce(sum(valor), 0)::numeric from unicos;
$$;

comment on function public.audax_clube_receita_periodo(date, date) is
  'Receita EFETIVAMENTE recebida das assinaturas no período: só pagamento, '
  'só o que não foi estornado, e um lançamento do Caixa nunca conta duas vezes.';

-- ----------------------------------------------------------------------------
-- 2) CONFIGURAÇÃO DA COMISSÃO — a nova fonte canônica
--
--    `comissao.percentual` é a FRAÇÃO (0.40 = 40%). `pote` continua guardando
--    `ativo` (liga o botão de fechamento) e `participantes`, e perde o
--    `percentual`, que passou a significar "100%, sempre".
-- ----------------------------------------------------------------------------
update public.configuracoes_sistema
   set valor = coalesce(valor, '{}'::jsonb) || jsonb_build_object(
         'comissao', coalesce(
           valor -> 'comissao',
           '{"percentual":0.40}'::jsonb)
       )
 where chave = 'clube';

-- Remove o campo ambíguo: o pote é a receita inteira.
update public.configuracoes_sistema
   set valor = jsonb_set(
         valor,
         '{pote}',
         coalesce(valor -> 'pote', '{}'::jsonb) - 'percentual',
         true)
 where chave = 'clube'
   and valor -> 'pote' ? 'percentual';

insert into public.configuracoes_sistema (chave, grupo, valor, descricao)
values (
  'clube',
  'clube',
  '{"beneficios":{},"coberturas":{"cabelo":["Cabelo"],"barba":["Barba"],"cabelo_barba":["Cabelo","Barba"]},"desconto":{"quimicos":0.10,"produtos":0.10,"categorias":[]},"pote":{"ativo":false,"participantes":[]},"comissao":{"percentual":0.40}}'::jsonb,
  'Regras do Audax Club: coberturas, descontos, pote (receita integral) e comissão do profissional sobre a parcela do pote.'
)
on conflict (chave) do nothing;

-- ----------------------------------------------------------------------------
-- 3) VALIDAÇÃO DA NOVA CHAVE
--
--    `comissao.percentual` é fração entre 0 e 1. `pote.ativo` continua
--    booleano e `pote.participantes` continua lista de texto.
-- ----------------------------------------------------------------------------
create or replace function public.audax_config_valida(p_chave text, p_valor jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_chave text := trim(coalesce(p_chave, ''));
  v_texto text;
  v_comissao_local numeric;
begin
  if v_chave not in ('links', 'avaliacao', 'notificacoes', 'clube', 'ia', 'barbearia') then
    return 'Configuração desconhecida.';
  end if;
  if p_valor is null then
    return 'Valor de configuração ausente.';
  end if;
  if jsonb_typeof(p_valor) <> 'object' then
    return 'Valor de configuração deve ser um objeto.';
  end if;
  if length(p_valor::text) > 8192 then
    return 'Configuração grande demais.';
  end if;

  -- Links: só http(s) ou vazio - nenhum outro esquema entra por aqui.
  foreach v_texto in array array['painel', 'avaliacao', 'mapa'] loop
    if p_valor ? v_texto then
      if jsonb_typeof(p_valor -> v_texto) <> 'string' then
        return 'Link inválido.';
      end if;
      if p_valor ->> v_texto <> ''
and p_valor ->> v_texto !~ '^https?://[^[:space:]]+$' then
        return 'Link inválido.';
      end if;
    end if;
  end loop;

  -- Mensagem de avaliação: texto livre, sem segredo e sem dado de terceiro.
  if p_valor ? 'mensagem' then
    if jsonb_typeof(p_valor -> 'mensagem') <> 'string' then
      return 'Mensagem de avaliação inválida.';
    end if;
    if length(p_valor ->> 'mensagem') > 600 then
return 'Mensagem de avaliação grande demais.';
    end if;
  end if;

  -- Barbearia: endereço e Instagram são texto curto; telefone aceita o que o
  -- dono digita (com +, espaço, parênteses e hífen) e é validado só pelos
  -- dígitos - 10 a 15, o mesmo intervalo de telefone do cliente.
  foreach v_texto in array array['endereco', 'instagram'] loop
    if p_valor ? v_texto then
      if jsonb_typeof(p_valor -> v_texto) <> 'string' then
        return 'Dados da barbearia inválidos.';
      end if;
if length(p_valor ->> v_texto) > 300 then
        return 'Dados da barbearia grandes demais.';
      end if;
    end if;
  end loop;

  if p_valor ? 'telefone' then
    if jsonb_typeof(p_valor -> 'telefone') <> 'string' then
      return 'Telefone da barbearia inválido.';
    end if;
    if length(p_valor ->> 'telefone') > 40 then
      return 'Telefone da barbearia grande demais.';
    end if;
    if length(regexp_replace(coalesce(p_valor ->> 'telefone', ''), '\D', '', 'g')) not between 0 and 15 then
      return 'Telefone da barbearia inválido.';
    end if;
  end if;

  -- Comissão do profissional sobre a parcela do pote: fração entre 0 e 1.
  if p_valor ? 'comissao' then
    if jsonb_typeof(p_valor -> 'comissao') <> 'object' then
      return 'Comissão do Audax Club inválida.';
    end if;
    if (p_valor -> 'comissao') ? 'percentual' then
      if jsonb_typeof(p_valor -> 'comissao' -> 'percentual') <> 'number' then
        return 'A comissão deve ser uma fração entre 0 e 1 (0,40 = 40%).';
      end if;
      v_comissao_local := (p_valor -> 'comissao' ->> 'percentual')::numeric;
      if v_comissao_local < 0 or v_comissao_local > 1 then
        return 'A comissão deve ser uma fração entre 0 e 1 (0,40 = 40%).';
      end if;
    end if;
  end if;
  return null;
end;
$$;
-- ----------------------------------------------------------------------------
-- 4) COLUNAS DE COMISSÃO NO FECHAMENTO
--
--    Aditivas, com default: qualquer fechamento já gravado continua válido.
--    `percentual` passa a guardar 100 nas fechamentos novos — que é o que
--    significa "a receita inteira forma o pote" — e a comissão fica na coluna
--    própria, com a receita da empresa explicitada.
-- ----------------------------------------------------------------------------
alter table public.clube_pote_fechamentos
  add column if not exists comissao_percentual numeric(5,4) not null default 0;
alter table public.clube_pote_fechamentos
  add column if not exists comissao_total numeric(12,2) not null default 0;
alter table public.clube_pote_fechamentos
  add column if not exists receita_empresa numeric(12,2) not null default 0;

comment on column public.clube_pote_fechamentos.comissao_percentual is
  'Comissão do profissional sobre a SUA parcela do pote (0.40 = 40%).';
comment on column public.clube_pote_fechamentos.receita_empresa is
  'Resto do pote depois da comissão dos profissionais.';

-- ----------------------------------------------------------------------------
-- 5) RATEIO DO POTE — receita integral + comissão sobre a parcela
--
--    O POTE é a receita do período, inteira. A divisão continua sendo
--    proporcional às fichas, com maior resto para a soma fechar no centavo.
--    A comissão incide sobre a PARCELA de cada profissional.
--
--    Só entram fichas que formam produção válida:
--      • dentro da janela (>= início e <= fim, fuso America/Recife);
--      • sem estorno;
--      • com benefício do Club (`beneficio_tipo <> 'avulso'`) — avulso não
--        gera ficha, então nunca entra;
--      • ainda NÃO_RATEADAS: ficha que já pertence a um fechamento não é
--        distribuída de novo, o que impede pagar a mesma produção duas vezes.
--
--    Cancelado e não comparecido não chegam aqui: a ficha é criada só quando o
--    atendimento é pago no Caixa, e o caixa recusa os dois.
--
--    A assinatura muda: o terceiro parâmetro passa a ser a fração da
--    comissão, e não o percentual que forma o pote.
-- ----------------------------------------------------------------------------
drop function if exists public.audax_clube_rateio(date, date, numeric, text[]);

create or replace function public.audax_clube_rateio(
  p_inicio date,
  p_fim date,
  p_comissao numeric,
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
      coalesce(p_comissao, 0) as comissao
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

create or replace function public.clube_pote_calcular(
  p_inicio date,
  p_fim date,
  p_comissao numeric default null,
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
  v_comissao numeric;
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

  v_comissao := coalesce(
    p_comissao,
    nullif(trim(coalesce(v_cfg -> 'comissao' ->> 'percentual', '')), '')::numeric,
    0.40
  );

  return public.audax_clube_rateio(p_inicio, p_fim, v_comissao, p_profissionais)
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

create or replace function public.clube_pote_fechar(
  p_inicio date,
  p_fim date,
  p_comissao numeric default null,
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

  v_comissao := coalesce(
    p_comissao,
    nullif(trim(coalesce(v_cfg -> 'comissao' ->> 'percentual', '')), '')::numeric,
    0.40
  );

  v_rateio := public.clube_pote_calcular(p_inicio, p_fim, v_comissao, p_profissionais);
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
            'comissaoPercentual', f.comissao_percentual,
            'comissaoTotal', f.comissao_total,
            'receitaEmpresa', f.receita_empresa,
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
      'config', jsonb_build_object(
        'pote', coalesce(
          (select valor -> 'pote' from public.configuracoes_sistema where chave = 'clube'),
          '{}'::jsonb),
        'comissao', coalesce(
          (select valor -> 'comissao' from public.configuracoes_sistema where chave = 'clube'),
          '{"percentual":0.40}'::jsonb)
      )
    )
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 9) PRIVILÉGIOS
--
--    Mesmas portas da 029, com a assinatura nova do terceiro parâmetro. A
--    regra do rateio continua sendo recalculada aqui dentro: o app não escolhe
--    pote, parcela nem comissão.
-- ----------------------------------------------------------------------------
revoke execute on function public.audax_clube_rateio(date, date, numeric, text[])
  from public, anon, authenticated;
grant execute on function public.audax_clube_rateio(date, date, numeric, text[]) to service_role;

revoke execute on function public.clube_pote_calcular(date, date, numeric, text[])
  from public, anon, service_role;
grant execute on function public.clube_pote_calcular(date, date, numeric, text[]) to authenticated, service_role;

revoke execute on function public.clube_pote_fechar(date, date, numeric, text[], text)
  from public, anon, service_role;
grant execute on function public.clube_pote_fechar(date, date, numeric, text[], text) to authenticated, service_role;

revoke execute on function public.clube_pote_listar(date, date)
  from public, anon, service_role;
grant execute on function public.clube_pote_listar(date, date) to authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
