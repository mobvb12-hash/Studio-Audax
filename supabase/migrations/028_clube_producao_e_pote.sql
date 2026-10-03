-- ============================================================================
-- 028_clube_producao_e_pote.sql — produção do Club (fichas) + fechamento do
--                                   pote por proporcionalidade de produção
-- ----------------------------------------------------------------------------
-- ANÁLISE DO QUE JÁ EXISTE (nada aqui duplica estrutura):
--
--   clube_assinaturas .... assinatura viva: `plano` em texto,
--                          `valor_mensal` como snapshot, ciclo por
--                          `proximo_vencimento`. O STATUS NÃO É COLUNA e
--                          continua não sendo: é derivado de `cancelada` +
--                          `proximo_vencimento` (regra de clube/regras.ts).
--   clube_pagamentos ..... receita das assinaturas + `caixa_lancamento_id`.
--   caixa_lancamentos .... valor / desconto / valor_liquido, `assinatura_id`,
--                          `profissional_id`, `servicos jsonb`, `estornado`.
--   servicos ............. `preco` é a TABELA OFICIAL; `categoria` é texto
--                          livre e nunca tinha sido lido por cálculo.
--   comissoes_fechamentos . precedent de período (`periodo_inicio`/`_fim`).
--   comissoes_auditoria ... acao check em ('fechamento','reabertura').
--
-- O QUE FALTAVA (e é o que esta migration cria):
--   1. A FICHA de produção do Club. Hoje "cobertura" é inferida ao contrário
--      por um lançamento de R$ 0,00 digitado à mão, e a produção é contada a
--      partir do Caixa — o que perde o VALOR DE TABELA quando o benefício zera
--      o preço. Serviço ilimitado precisa continuar valendo R$ 30 de
--      REFERÊNCIA mesmo com R$ 0,00 pago, senão o pote não tem o que dividir.
--   2. Uma regra de cobertura decidida no BACKEND. Não existia nenhuma.
--   3. O fechamento do pote, que é por PERÍODO E CASA INTEIRA — comissões
--      fecham por profissional, que é outra coisa.
--
-- DECISÕES QUE NÃO INVENTAM REGRA FINANCEIRA:
--   • Percentual do pote, coberturas por plano, desconto químico e desconto de
--     produto ficam em `configuracoes_sistema.clube` — a chave JÁ existente e
--     JÁ na lista branca de 022/027. Este script só completa o PADRÃO, sem
--     sobrescrever o que o dono configurou.
--   • Nenhum preço de serviço é escrito aqui: Corte/Barba/Sobrancelha vêm de
--     `servicos.preco`, que segue sendo a fonte da verdade.
--   • Nenhum status de assinatura é gravado: é sempre derivado, como a 009
--     decidiu. A trava em `supabase-schema.test.ts` continua valendo.
--   • Pote e desconto só acontecem se o dono CONFIGURAR. O padrão é
--     inativo/desconto zero — nada de pote inventado.
--
-- SEGURANÇA (item 24):
--   `clube_producao` e `clube_pote_fechamentos` NÃO têm escrita direta para
--   `authenticated`. Só funções SECURITY DEFINER gravam, e cada uma
--   revalida a assinatura dentro do próprio SQL. O frontend não tem como
--   forjar ficha nem liberar benefício.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FICHAS DE PRODUÇÃO DO CLUB
--
--    Uma linha por ATENDIMENTO realizado com benefício válido (item 1: o
--    cliente paga R$ 0, a produção é 1 ficha de R$ 30 de referência).
--
--    `periodo_pote` é preenchido na gravação: o dia 1º do mês do atendimento,
--    para o fechamento do pote não depender de recalcular.
-- ----------------------------------------------------------------------------
create table if not exists public.clube_producao (
  id text primary key,
  -- quem e o quê
  cliente_id text references public.clientes (id) on delete set null,
  cliente text not null default '',
  assinatura_id text references public.clube_assinaturas (id) on delete set null,
  plano text not null default '',
  -- qual serviço, quanto valia de tabela e quanto foi pago
  servico_id text,
  servico text not null default '',
  valor_tabela numeric(12,2) not null default 0,
  valor_pago numeric(12,2) not null default 0,
  beneficio numeric(12,2) not null default 0,
  -- como o benefício foi aplicado (regra oficial, não texto livre)
  beneficio_tipo text not null default 'avulso'
    check (beneficio_tipo in ('ilimitado', 'desconto', 'avulso')),
  desconto_percentual numeric(5,2) not null default 0,
  -- quem atendeu (itens 7 e 12: a produção nunca vai para o profissional errado)
  profissional_id text references public.profissionais (id) on delete set null,
  profissional text not null default '',
  -- quando e onde
  data date not null,
  horario text not null default '',
  duracao_min integer not null default 0,
  agendamento_id text,
  origem text not null default 'caixa'
    check (origem in ('caixa', 'agenda', 'manual')),
  -- ficha: 1 = um atendimento. A coluna existe separada do 1 para permitir
  -- quantidade no futuro (item 11) sem mudar a regra de hoje.
  fichas numeric(10,2) not null default 1,
  -- período do pote ao qual esta ficha pertence
  periodo_pote date not null,
  estornado boolean not null default false,
  estornado_em timestamptz,
  -- snapshot do fechamento: preenchido quando o pote do período é fechado
  fechamento_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  dados jsonb
);

comment on table public.clube_producao is
  'Produção do Audax Club: uma ficha por atendimento com benefício válido. '
  'valor_tabela é a referência usada pelo pote; valor_pago é o que o cliente '
  'pagou. Gravada só por SECURITY DEFINER — o app não insere linha aqui.';

create index if not exists idx_clube_producao_periodo
  on public.clube_producao (periodo_pote, data);
create index if not exists idx_clube_producao_profissional
  on public.clube_producao (profissional_id);
create index if not exists idx_clube_producao_cliente
  on public.clube_producao (cliente_id);
create index if not exists idx_clube_producao_fechamento
  on public.clube_producao (fechamento_id);
create index if not exists idx_clube_producao_agendamento
  on public.clube_producao (agendamento_id);

-- ----------------------------------------------------------------------------
-- 2) FECHAMENTO DO POTE — um por período, snapshot IMUTÁVEL (itens 21 e 22)
--
--    Mesma forma de `comissoes_fechamentos` (período + `reaberto` jsonb),
--    porém por PERÍODO E CASA INTEIRA. `partes` guarda o rateio JÁ
--    arredondado, então o resultado não muda mesmo que a produção mude depois.
--    Erro não se edita: reabre com motivo e fecha de novo.
-- ----------------------------------------------------------------------------
create table if not exists public.clube_pote_fechamentos (
  id text primary key,
  periodo_inicio date not null,
  periodo_fim date not null,
  -- receita considerada (pagamentos de assinatura do período, sem estorno)
  receita numeric(12,2) not null default 0,
  -- percentual do pote CONFIGURADO no momento do fechamento
  percentual numeric(5,2) not null default 0,
  pote numeric(12,2) not null default 0,
  producao_total numeric(12,2) not null default 0,
  fichas_total numeric(12,2) not null default 0,
  -- rateio por profissional já fechado:
  -- [{profissionalId, profissional, fichas, producaoReferencia, participacao, valor}]
  partes jsonb not null default '[]'::jsonb,
  -- como o cálculo foi feito, para o relatório explicar o que entrou
  filtros jsonb not null default '{}'::jsonb,
  fechado_por text not null default '',
  fechado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  reaberto jsonb,
  dados jsonb
);

comment on table public.clube_pote_fechamentos is
  'Fechamento do pote do Audax Club por período. Imutável depois de fechado: '
  'correção é reabrir com motivo e fechar de novo, preservando o histórico.';

create index if not exists idx_clube_pote_fechamentos_periodo
  on public.clube_pote_fechamentos (periodo_inicio, periodo_fim);

-- ----------------------------------------------------------------------------
-- 3) AUDITORIA DO POTE — reusa a auditoria de comissões
--
--    `comissoes_auditoria.acao` só aceitava ('fechamento','reabertura').
--    Ampliar um CHECK é o mesmo caminho usado pela 013 com
--    `caixa_auditoria` ('vinculo'). `profissional_id` fica nulo numa auditoria
--    de pote, porque o evento é da casa inteira — e a coluna já permite nulo.
-- ----------------------------------------------------------------------------
alter table public.comissoes_auditoria
  drop constraint if exists comissoes_auditoria_acao_check;

alter table public.comissoes_auditoria
  add constraint comissoes_auditoria_acao_check check (
    acao in ('fechamento', 'reabertura', 'pote_fechamento', 'pote_reabertura', 'pote_ajuste')
  );

-- ----------------------------------------------------------------------------
-- 4) CONFIGURAÇÃO OFICIAL DAS REGRAS DO CLUB
--
--    Mesma chave `clube` que já existe — nenhuma chave nova entra na lista
--    branca. O `update` preserva o que já foi configurado e completa só o que
--    falta; o `insert` é só para base nova. `on conflict do nothing` aqui
--    apagaria o que o dono cadastrou.
--
--    coberturas .... categorias de serviço cobertas por plano (ilimitado).
--                    Categoria vazia NUNCA é coberta: sobrancelha, químicos e
--                    produtos ficam de fora por padrão. Os nomes precisam
--                    bater com `servicos.categoria`.
--    desconto ...... fração por tipo (0.10 = 10%), só para assinante vigente.
--                    `categorias` diz QUAIS categorias são "procedimento
--                    químico" — vazio significa que ainda não foi definido,
--                    e então nenhum desconto químico acontece.
--    pote .......... percentual da receita de assinaturas que vai para o pote;
--                    `ativo` liga o botão de fechamento; `participantes`
--                    vazio = todos os profissionais com produção.
-- ----------------------------------------------------------------------------
update public.configuracoes_sistema
   set valor = coalesce(valor, '{}'::jsonb) || jsonb_build_object(
         'coberturas', coalesce(
           valor -> 'coberturas',
           '{"cabelo":["Cabelo"],"barba":["Barba"],"cabelo_barba":["Cabelo","Barba"]}'::jsonb),
         'desconto', coalesce(
           valor -> 'desconto',
           '{"quimicos":0.10,"produtos":0.10,"categorias":[]}'::jsonb),
         'pote', coalesce(
           valor -> 'pote',
           '{"ativo":false,"percentual":0,"participantes":[]}'::jsonb)
       )
 where chave = 'clube';

insert into public.configuracoes_sistema (chave, grupo, valor, descricao)
values (
  'clube',
  'clube',
  '{"beneficios":{},"coberturas":{"cabelo":["Cabelo"],"barba":["Barba"],"cabelo_barba":["Cabelo","Barba"]},"desconto":{"quimicos":0.10,"produtos":0.10,"categorias":[]},"pote":{"ativo":false,"percentual":0,"participantes":[]}}'::jsonb,
  'Regras do Audax Club: coberturas por plano, descontos e configuração do pote.'
)
on conflict (chave) do nothing;

-- ----------------------------------------------------------------------------
-- 5) RLS — leitura pelo papel, escrita SÓ pelas funções de negócio
--
--    `authenticated` lê (o admin precisa reler o histórico) mas NÃO insere,
--    não atualiza e não apaga: ficha e fechamento só nascem da RPC, que
--    revalida a assinatura. Mesmo padrão de `comissoes_fechamentos`.
-- ----------------------------------------------------------------------------
alter table public.clube_producao enable row level security;
alter table public.clube_pote_fechamentos enable row level security;

do $$
begin
  drop policy if exists clube_producao_leitura on public.clube_producao;
  create policy clube_producao_leitura on public.clube_producao
    as permissive for select to authenticated
    using (public.current_user_is_gerente_ou_acima());

  drop policy if exists clube_pote_fechamentos_leitura on public.clube_pote_fechamentos;
  create policy clube_pote_fechamentos_leitura on public.clube_pote_fechamentos
    as permissive for select to authenticated
    using (public.current_user_is_gerente_ou_acima());

  drop policy if exists clube_pote_auditoria_insere on public.comissoes_auditoria;
  create policy clube_pote_auditoria_insere on public.comissoes_auditoria
    as permissive for insert to authenticated
    with check (public.current_user_is_gerente_ou_acima());
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) STATUS DERIVADO DA ASSINATURA — a MESMA regra, agora no servidor
--
--    `clube/regras.ts` já deriva: cancelada > vencida > atrasada > próxima >
--    ativa. Aqui é a MESMA conta, com a MESMA tolerância de 7 dias, para a
--    validação no servidor e a da interface nunca discordarem.
--
--    'proxima_vencimento' CONTINUA sendo benefício válido: a assinatura foi
--    paga, só está perto do vencimento. 'atrasada', 'vencida' e 'cancelada'
--    bloqueiam o benefício (item 3).
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_status(
  p_cancelada boolean,
  p_proximo_vencimento date,
  p_hoje date
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_cancelada, false) then 'cancelada'
    when p_proximo_vencimento is null then 'vencida'
    when p_proximo_vencimento < p_hoje - 7 then 'vencida'
    when p_proximo_vencimento < p_hoje then 'atrasada'
    when p_proximo_vencimento <= p_hoje + 3 then 'proxima_vencimento'
    else 'ativa'
  end;
$$;

comment on function public.audax_clube_status(boolean, date, date) is
  'Status DERIVADO da assinatura (nunca coluna): espelha clube/regras.ts. '
  'Benefício vale para ativa e proxima_vencimento; bloqueia atrasada, '
  'vencida e cancelada.';

-- ----------------------------------------------------------------------------

-- 7) ASSINATURA EFETIVA DE UM CLIENTE
--
--    Um helper só: resolve a assinatura e o status derivado. `p_cliente_id`
--    tem precedência; quando não vem, cai para o telefone pelos dígitos.
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_assinatura(
  p_cliente_id text,
  p_telefone text,
  p_data date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (
    select c.id
      from public.clientes c
     where case
             when coalesce(trim(p_cliente_id), '') <> ''
               then c.id = trim(p_cliente_id)
             else public.audax_telefone_chave(c.telefone) is not null
              and public.audax_telefone_chave(c.telefone)
                = public.audax_telefone_chave(p_telefone)
           end
     order by c.criado_em
     limit 1
  ),
  assinatura as (
    select a.*
      from public.clube_assinaturas a
      join alvo t on t.id = a.cliente_id
     order by a.cancelada asc, a.criado_em desc
     limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'assinaturaId', a.id,
      'clienteId', a.cliente_id,
      'cliente', a.cliente,
      'plano', a.plano,
      'valorMensal', a.valor_mensal,
      'proximoVencimento', to_char(a.proximo_vencimento, 'YYYY-MM-DD'),
      'status', public.audax_clube_status(
        a.cancelada, a.proximo_vencimento, coalesce(p_data, current_date)),
      -- Benefício válido só para assinatura em dia (item 3).
      'beneficioLiberado', public.audax_clube_status(
        a.cancelada, a.proximo_vencimento, coalesce(p_data, current_date))
        in ('ativa', 'proxima_vencimento')
    )
      from assinatura a
  ), null::jsonb);
$$;

comment on function public.audax_clube_assinatura(text, text, date) is
  'Assinatura vigente do cliente com status DERIVADO. null = não é assinante.';

-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 9) STATUS A PARTIR DO JSON DA ASSINATURA — atalho interno
--
--     Vem antes de `audax_clube_beneficio` porque o corpo SQL é validado na
--     criação da função: a dependência precisa existir antes.
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_status_assinatura(p_assinatura jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_assinatura is null then null
    else p_assinatura ->> 'status'
  end;
$$;

-- 8) RESOLVER BENEFÍCIO DE UM SERVIÇO — a regra oficial, no BACKEND
--
--    É esta função que decide se o atendimento é ilimitado, tem desconto ou
--    é avulso. Ela é a ÚNICA fonte dessa resposta: interface, WhatsApp e PDV
--    leem daqui, e a gravação da ficha revalida chamando de novo.
--
--    Regras, todas configuráveis em `configuracoes_sistema.clube`:
--      • `categoria` listada nas coberturas do plano → ILIMITADO: valor pago
--        0, benefício = valor de tabela, 1 ficha (itens 1, 5 e 7);
--      • senão, se a categoria estiver na lista de procedimentos químicos e
--        houver desconto configurado → DESCONTO percentual (item 14);
--      • senão → AVULSO a preço de tabela (itens 6 e 13).
--
--    Quando existe assinatura mas ela está irregular, devolve
--    `beneficioLiberado: false`, o valor CHEIO a pagar e a `motivo` que o
--    WhatsApp mostra (itens 3 e 4). O cliente continua podendo agendar avulso.
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_beneficio(
  p_cliente_id text,
  p_telefone text,
  p_servico text,
  p_data date,
  p_usar_beneficio boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(
      (select valor from public.configuracoes_sistema where chave = 'clube'),
      '{}'::jsonb) as v
  ),
  servico_alvo as (
    select s.id, s.nome, coalesce(s.preco, 0) as preco,
           coalesce(s.categoria, '') as categoria
      from public.servicos s
     where s.ativo and s.nome = trim(coalesce(p_servico, ''))
     order by s.criado_em
     limit 1
  ),
  dados as (
    select
      cfg.v as config,
      sa.id as servico_id, sa.nome as servico_nome,
      sa.preco as valor_tabela, sa.categoria,
      (select * from public.audax_clube_assinatura(p_cliente_id, p_telefone, p_data)) as ass
      from cfg
      left join servico_alvo sa on true
  ),
  resolvido as (
    select
      d.*,
      public.audax_clube_status_assinatura(d.ass) as status_assinatura,
      coalesce(d.ass ->> 'plano', '') as plano,
      d.ass ->> 'assinaturaId' as assinatura_id,
      d.ass ->> 'clienteId' as cliente_id_resolvido,
      coalesce(d.ass ->> 'cliente', '') as cliente_nome,
      coalesce((d.ass ->> 'beneficioLiberado')::boolean, false) as liberado
      from dados d
  ),
  classificado as (
    select r.*,
case
        when r.status_assinatura in ('ativa', 'proxima_vencimento')
          and r.categoria in (
            select jsonb_array_elements_text(
              coalesce(r.config -> 'coberturas' -> r.plano, '[]'::jsonb))
          )
          then 'ilimitado'
        when r.status_assinatura in ('ativa', 'proxima_vencimento')
          and r.categoria in (
            select jsonb_array_elements_text(
              coalesce(r.config -> 'desconto' -> 'categorias', '[]'::jsonb))
          )
          and coalesce((r.config -> 'desconto' ->> 'quimicos')::numeric, 0) > 0
          then 'desconto'
        else 'avulso'
      end as tipo
      from resolvido r
  )
  select case
    when c.servico_id is null then jsonb_build_object(
      'ok', false,
      'servicoEncontrado', false,
      'motivo', 'Serviço indisponível.'
    )
    else jsonb_build_object(
      'ok', true,
      'servicoEncontrado', true,
      'clienteId', c.cliente_id_resolvido,
      'assinaturaId', c.assinatura_id,
      'cliente', c.cliente_nome,
      'plano', nullif(c.plano, ''),
      'statusAssinatura', nullif(c.status_assinatura, ''),
      'beneficioLiberado', c.liberado,
      -- `usarBeneficio` falso = o chamador pediu atendimento avulso.
      'usarBeneficio',
        coalesce(p_usar_beneficio, true)
        and c.liberado
        and c.tipo = 'ilimitado',
      'servicoId', c.servico_id,
      'servico', c.servico_nome,
      'categoria', c.categoria,
      'valorTabela', c.valor_tabela,
      'valorPago',
        -- ILIMITADO: o cliente não paga. O valor de tabela continua registrado
        -- e é o que o pote divide.
        case when coalesce(p_usar_beneficio, true) and c.liberado
                  and c.tipo = 'ilimitado'
             then 0
             when coalesce(p_usar_beneficio, true) and c.liberado
                  and c.tipo = 'desconto'
             then round(c.valor_tabela * (1 - coalesce(
                    (c.config -> 'desconto' ->> 'quimicos')::numeric, 0)), 2)
             else c.valor_tabela
        end,
      'beneficio',
        case when coalesce(p_usar_beneficio, true) and c.liberado
                  and c.tipo = 'ilimitado'
             then c.valor_tabela
             when coalesce(p_usar_beneficio, true) and c.liberado
                  and c.tipo = 'desconto'
             then round(c.valor_tabela * coalesce(
                    (c.config -> 'desconto' ->> 'quimicos')::numeric, 0), 2)
             else 0
        end,
      'tipoBeneficio',
        case when coalesce(p_usar_beneficio, true) and c.liberado
                  and c.tipo <> 'avulso'
             then c.tipo
             else 'avulso'
        end,
      'descontoPercentual',
        case when coalesce(p_usar_beneficio, true) and c.liberado
                  and c.tipo = 'desconto'
             then coalesce((c.config -> 'desconto' ->> 'quimicos')::numeric, 0) * 100
             else 0
        end,
      -- Mensagem do item 4: existe assinatura, mas o benefício está fora.
      'motivo',
        case
          when c.ass is null then null
          when not coalesce(p_usar_beneficio, true) then null
          when c.status_assinatura = 'cancelada'
            then 'Sua assinatura do Audax Club está cancelada.'
          when c.status_assinatura = 'atrasada'
            then 'Sua assinatura do Audax Club está em atraso.'
          when c.status_assinatura = 'vencida'
            then 'Sua assinatura do Audax Club está vencida.'
          else null
        end
    )
  end
    from classificado c;
$$;

comment on function public.audax_clube_beneficio(text, text, text, date, boolean) is
  'Regra oficial de benefício, no servidor: ilimitado (categoria na cobertura '
  'do plano) | desconto (procedimento químico configurado) | avulso. '
  'Benefício bloqueado quando a assinatura não está em dia — mas o '
  'agendamento avulso continua permitido.';

-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 10) GRAVAR A FICHA DE PRODUÇÃO
--
--     Única porta de escrita de `clube_producao`. Revalida TUDO aqui dentro:
--     refaz a resolução do benefício (não confia em nada que veio do app),
--     recusa assinatura irregular e devolve a mensagem para a interface.
--
--     Devolve os mesmos campos da resolução mais o `id` da ficha, para o
--     chamador lançar no Caixa exatamente o mesmo número.
-- ----------------------------------------------------------------------------
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

comment on function public.clube_atendimento_registrar is
  'Grava a ficha de produção do Club. Revalida a assinatura no servidor e '
  'devolve os valores de tabela/pago para o Caixa lançar o mesmo número.';

-- ----------------------------------------------------------------------------
-- 11) RECEITA DE ASSINATURAS DO PERÍODO — base do pote
--
--     Soma `clube_pagamentos` com a data DENTRO do intervalo (>= início e
--     <= fim), ignorando o que foi estornado no Caixa. Um pagamento de
--     assinatura não tem profissional, então nunca entra em produção: receita
--     do pote não é receita de nenhum barbeiro.
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
  select coalesce(sum(p.valor), 0)::numeric
    from public.clube_pagamentos p
    left join public.caixa_lancamentos c on c.id = p.caixa_lancamento_id
   where p.data >= p_inicio
     and p.data <= p_fim
     and coalesce(c.estornado, false) = false;
$$;

-- ----------------------------------------------------------------------------
-- 12) PRODUÇÃO DO PERÍODO, POR PROFISSIONAL — insumo do rateio e do relatório
--
--     Fichas de `clube_producao` do período, com a MESMA janela inclusiva do
--     item 16 (>= início e <= fim) e sem estorno. `fichas` alimenta a
--     proporção; `producaoReferencia` é o valor de tabela acumulado.
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_producao_periodo(
  p_inicio date,
  p_fim date,
  p_plano text default '',
  p_servico text default '',
  p_profissional text default '',
  p_somente_club boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtrado as (
    select cp.*
      from public.clube_producao cp
     where cp.data >= p_inicio
       and cp.data <= p_fim
       and coalesce(cp.estornado, false) = false
       and (nullif(trim(p_plano), '') is null or cp.plano = trim(p_plano))
       and (nullif(trim(p_servico), '') is null or cp.servico = trim(p_servico))
       and (
         nullif(trim(p_profissional), '') is null
         or cp.profissional = trim(p_profissional)
         or cp.profissional_id = trim(p_profissional)
       )
       and (not coalesce(p_somente_club, true) or cp.beneficio_tipo <> 'avulso')
  ),
  por_profissional as (
    select f.profissional_id,
           max(f.profissional) as profissional,
           sum(f.fichas) as fichas,
           count(*) as atendimentos,
           sum(f.valor_tabela) as referencia,
           sum(f.valor_pago) as pago,
           sum(f.beneficio) as beneficio
      from filtrado f
     group by f.profissional_id
  )
  select jsonb_build_object(
    'fichasTotal', coalesce((select sum(fichas) from filtrado), 0),
    'atendimentosTotal', (select count(*) from filtrado),
    'producaoReferencia', coalesce((select sum(valor_tabela) from filtrado), 0),
    'valorPagoTotal', coalesce((select sum(valor_pago) from filtrado), 0),
    'beneficioTotal', coalesce((select sum(beneficio) from filtrado), 0),
    'porServico', coalesce((
      select jsonb_object_agg(
        chave,
        jsonb_build_object(
          'atendimentos', atendimentos,
          'fichas', fichas,
          'producaoReferencia', referencia
        )
      )
      from (
        select f.servico as chave,
               count(*) as atendimentos,
               sum(f.fichas) as fichas,
               sum(f.valor_tabela) as referencia
          from filtrado f
         group by f.servico
      ) s
    ), '{}'::jsonb),
    'porProfissional', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'profissionalId', profissional_id,
          'profissional',
            coalesce(nullif(profissional, ''), coalesce(profissional_id, 'Sem nome')),
          'fichas', fichas,
          'atendimentos', atendimentos,
          'producaoReferencia', referencia,
          'valorPago', pago,
          'beneficio', beneficio
        )
        order by fichas desc, profissional
      )
      from por_profissional
    ), '[]'::jsonb)
  );
$$;

-- 13) RATEIO DO POTE — proporcional à produção, sem sobra de centavo
--
--     Regra do item 10: receita destinada ÷ produção total, proporcional às
--     fichas de cada profissional.
--
--     Arredondamento de MAIOR RESTO: cada parte é truncada em centavos e a
--     sobra vai um centavo por vez para quem tem o maior resto fracionário —
--     empates resolvidos pelo nome, para ser determinístico. Assim a soma das
--     partes é EXATAMENTE o pote (itens 26 e 27).
--
--     Função pura: não grava nada. É usada pelo "calcular" e pelo "fechar",
--     que só persiste o resultado dela.
-- ----------------------------------------------------------------------------
create or replace function public.audax_clube_rateio(
  p_inicio date,
  p_fim date,
  p_percentual numeric,
  p_profissionais text[] default '{}'::text[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with config as (
    select p_percentual as percentual
  ),
  gate as (
    select
      public.audax_clube_receita_periodo(p_inicio, p_fim) as receita,
      coalesce(c.percentual, 0) as percentual,
      case
        when coalesce(c.percentual, 0) <= 0 then 0
        else round(public.audax_clube_receita_periodo(p_inicio, p_fim)
                   * c.percentual / 100, 2)
      end as pote
    from config c
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
      case when o.posicao <= s.centavos then o.parte + 0.01 else o.parte end as valor
    from ordenadas o
    cross join sobra s
  )
  select jsonb_build_object(
    'ok', g.percentual > 0,
    'motivo', case
      when g.percentual <= 0 then 'Percentual do pote não configurado.'
      when f.total <= 0 then 'Nenhuma ficha de Club no período.'
      else null
    end,
    'receita', g.receita,
    'percentual', g.percentual,
    'pote', g.pote,
    'fichasTotal', f.total,
    'partes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'profissionalId', profissional_id,
          'profissional', nome,
          'fichas', fichas,
          'producaoReferencia', referencia,
          'participacao', participacao,
          'valor', valor
        )
        order by nome asc
      )
        from final
    ), '[]'::jsonb),
    -- a soma tem de bater com o pote, no centavo (itens 26 e 27)
    'somaPartes', coalesce((select sum(valor) from final), 0)
  )
  from gate g
  cross join fichas f;
$$;

comment on function public.audax_clube_rateio is
  'Rateio do pote por produção, com arredondamento de maior resto: a soma das '
  'partes é exatamente igual ao pote. Puro — não grava nada.';

-- ----------------------------------------------------------------------------
-- 14) CALCULAR (dry run) — o que a tela mostra antes de fechar
--
--     O período é sempre EXPLÍCITO: data inicial e data final informadas pelo
--     usuário, com janela inclusiva (>= início e <= fim, item 16).
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 15) FECHAR O PERÍODO — snapshot imutável + auditoria (item 21)
--
--     Recusa período já fechado (a mesma produção não pode ser paga duas
--     vezes) e grava o rateio JÁ ARREDONDADO, então o resultado não muda
--     depois mesmo que a produção mude.
-- ----------------------------------------------------------------------------
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

comment on function public.clube_pote_fechar is
  'Fecha o pote do período: snapshot imutável do rateio + auditoria. '
  'Recusa período já fechado e rateio que não fecha na soma.';

-- ----------------------------------------------------------------------------
-- 16) REABRIR — correção controlada, preservando o histórico (item 22)
--
--     Não altera produção nem valor: acrescenta `{ em, motivo }`, devolve as
--     fichas do período ao pool e registra auditoria. O snapshot original
--     continua na linha.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 17) ESTORNAR FICHA — corrige produção sem apagar histórico
-- ----------------------------------------------------------------------------
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
-- 18) LEITURA — ficha, produção do período e fechamentos
-- ----------------------------------------------------------------------------
create or replace function public.clube_pote_listar(
  p_inicio date default null,
  p_fim date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
  );
$$;

-- ----------------------------------------------------------------------------
-- 19) PRIVILÉGIOS
--
--     Leitura e cálculo abrem para `authenticated` (a tela precisa deles).
--     As de ESCRITA — registrar ficha, fechar, reabrir, estornar — ficam em
--     `service_role`: só quem tem a chave do servidor as executa, e é lá que
--     a regra crítica é revalidada.
-- ----------------------------------------------------------------------------
revoke execute on function public.audax_clube_status(boolean, date, date)
  from public, anon;
grant execute on function public.audax_clube_status(boolean, date, date) to service_role;

revoke execute on function public.audax_clube_status_assinatura(jsonb)
  from public, anon, authenticated;
grant execute on function public.audax_clube_status_assinatura(jsonb) to service_role;

revoke execute on function public.audax_clube_assinatura(text, text, date)
  from public, anon, authenticated;
grant execute on function public.audax_clube_assinatura(text, text, date) to service_role;

revoke execute on function public.audax_clube_beneficio(text, text, text, date, boolean)
  from public, anon, authenticated;
grant execute on function public.audax_clube_beneficio(text, text, text, date, boolean) to service_role;

revoke execute on function public.audax_clube_receita_periodo(date, date)
  from public, anon, authenticated;
grant execute on function public.audax_clube_receita_periodo(date, date) to service_role;

revoke execute on function public.audax_clube_producao_periodo(date, date, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.audax_clube_producao_periodo(date, date, text, text, text, boolean) to service_role;

revoke execute on function public.audax_clube_rateio(date, date, numeric, text[])
  from public, anon, authenticated;
grant execute on function public.audax_clube_rateio(date, date, numeric, text[]) to service_role;

revoke execute on function public.clube_atendimento_registrar(text, text, text, text, date, text, integer, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.clube_atendimento_registrar(text, text, text, text, date, text, integer, text, text, boolean) to service_role;

revoke execute on function public.clube_producao_estornar(text, text)
  from public, anon, authenticated;
grant execute on function public.clube_producao_estornar(text, text) to service_role;

revoke execute on function public.clube_pote_calcular(date, date, numeric, text[])
  from public, anon, authenticated;
grant execute on function public.clube_pote_calcular(date, date, numeric, text[]) to authenticated, service_role;

revoke execute on function public.clube_pote_fechar(date, date, numeric, text[], text)
  from public, anon, authenticated;
grant execute on function public.clube_pote_fechar(date, date, numeric, text[], text) to service_role;

revoke execute on function public.clube_pote_reabrir(text, text)
  from public, anon, authenticated;
grant execute on function public.clube_pote_reabrir(text, text) to service_role;

revoke execute on function public.clube_pote_listar(date, date)
  from public, anon, authenticated;
grant execute on function public.clube_pote_listar(date, date) to authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
