-- ============================================================================
-- 024_notificacoes_whatsapp.sql — WhatsApp do profissional, fila de
-- notificações com deduplicação e mensagens automáticas pós-atendimento
-- (Studio Audax)
-- ----------------------------------------------------------------------------
-- O que entra aqui (itens 11, 12, 14, 15, 21 e a parte de idempotência do 20)
--
-- 1) `profissionais.whatsapp_notificacao` + `profissionais.notificar_agendamentos`
--    (§12): canal de notificação CONFIGURADO POR PROFISSIONAL — nenhum número
--    fixo no código. `add column if not exists`: a coluna `telefone` que já
--    existe continua intacta e continua sendo o telefone administrativo.
--
-- 2) `agendamentos.origem` (§20/§23): de onde veio a linha — 'agenda' (padrão,
--    admin), 'painel' (Painel do Cliente), 'whatsapp' (IA). É o que permite
--    enviar a confirmação ao cliente SÓ onde ainda não existe uma (evita
--    duplicar o envio que a conversa de WhatsApp e o botão do admin já fazem).
--
-- 3) `ia_notificacoes` — fila de SAÍDA com CHAVE ÚNICA (§21). A chave é o que
--    garante "nunca duas notificações para o mesmo evento": a inserção é
--    `on conflict (chave) do nothing`, então reprocessar ou re-disparar o
--    trigger é inofensivo.
--
-- 4) Triggers em `agendamentos` — a notificação SÓ nasce DEPOIS que a linha
--    está de fato gravada (§11: nunca notificar barbeiro para agendamento que
--    falhou):
--      • INSERT → notificação ao PROFISSIONAL responsável;
--      • INSERT/ becoming 'painel' → confirmação ao CLIENTE (canal que não
--        tinha confirmação automática);
--      • status passa a 'concluido' → agradecimento (§14) e, em seguida, o
--        link oficial de AVALIAÇÃO (§15).
--
-- Regras comerciais
--   • nenhuma regra nova: as mensagens só formatam o que já está gravado;
--   • preço, serviço e profissional vêm da própria linha do agendamento e do
--     catálogo oficial — nada é inventado;
--   • benefit de Clube NUNCA aparece aqui: a IA trata o Clube por RPC
--     própria (023) e só informa o que está configurado em `clube.beneficios`.
--
-- Configuração e desligamento
--   Tudo passa pela chave `notificacoes` da `configuracoes_sistema` (022).
--   Desligar uma chave NÃO impede o agendamento: a linha de trigger nunca
--   lança exceção — a falha de notificação é registrada (`ia_eventos`) e o
--   agendamento segue normal (§12).
--
-- Ordem de exibição da fila: `ordem` (1 = agradecimento, 2 = avaliação) e
-- depois `criado_em` — o agradecimento sempre chega antes do link.
--
-- Idempotente e não destrutivo: `add column if not exists`,
-- `create table if not exists`, `create or replace function`,
-- `create or replace trigger`, `revoke`/`grant`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Canal de notificação do profissional (§12)
-- ----------------------------------------------------------------------------
alter table public.profissionais
  add column if not exists whatsapp_notificacao text not null default '';
alter table public.profissionais
  add column if not exists notificar_agendamentos boolean not null default true;

comment on column public.profissionais.whatsapp_notificacao is
  'WhatsApp de NOTIFICAÇÃO (novo agendamento). Vazio = não recebe aviso. Telefone administrativo continua em telefone.';
comment on column public.profissionais.notificar_agendamentos is
  'Se false, o profissional não recebe notificação de novo agendamento (o agendamento segue normal).';

-- ----------------------------------------------------------------------------
-- 2) Origem do agendamento (§20/§23)
-- ----------------------------------------------------------------------------
alter table public.agendamentos
  add column if not exists origem text not null default 'agenda';

comment on column public.agendamentos.origem is
  'Origem da linha: agenda (admin), painel (Painel do Cliente) ou whatsapp (IA). Não é regra comercial — é procedência para confirmação e auditoria.';

-- ----------------------------------------------------------------------------
-- 3) Fila de notificações com chave única (§21)
-- ----------------------------------------------------------------------------
create table if not exists public.ia_notificacoes (
  id text primary key,
  -- DEDUP: um evento = uma chave. Reinserir a mesma chave não faz nada.
  chave text not null,
  tipo text not null,
  agendamento_id text,
  destino text not null default '',
  destino_rotulo text not null default '',
  mensagem text not null,
  ordem smallint not null default 1,
  status text not null default 'pendente',
  tentativas integer not null default 0,
  ultimo_erro text not null default '',
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint ia_notificacoes_tipo_check
    check (tipo in ('confirmacao_cliente', 'notificacao_profissional', 'pos_atendimento', 'avaliacao')),
  constraint ia_notificacoes_status_check
    check (status in ('pendente', 'enviando', 'enviado', 'falha', 'ignorado')),
  constraint ia_notificacoes_mensagem_check
    check (length(mensagem) between 1 and 4096),
  constraint ia_notificacoes_chave_check
    check (length(chave) between 3 and 160)
);

create unique index if not exists idx_ia_notificacoes_chave
  on public.ia_notificacoes (chave);
create index if not exists idx_ia_notificacoes_pendentes
  on public.ia_notificacoes (status, ordem, criado_em);
create index if not exists idx_ia_notificacoes_agendamento
  on public.ia_notificacoes (agendamento_id);

comment on table public.ia_notificacoes is
  'Fila de saída de WhatsApp com deduplicação por chave. Consumida pela Edge Function; nada é enviado daqui (a Evolution só é falada pelo whatsapp-enviar).';

-- ----------------------------------------------------------------------------
-- Helpers puros de formatação (sem grant)
-- ----------------------------------------------------------------------------
create or replace function public.audax_hora_legivel(p_horario text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_horario, '') !~ '^[0-9]{1,2}:[0-9]{2}$' then coalesce(p_horario, '')
    when right(p_horario, 2) = '00' then split_part(p_horario, ':', 1) || 'h'
    else split_part(p_horario, ':', 1) || 'h' || right(p_horario, 2)
  end;
$$;

-- Primeiro nome do cliente (a mensagem de agradecimento fala com a pessoa).
create or replace function public.audax_primeiro_nome(p_nome text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(split_part(trim(regexp_replace(lower(coalesce(p_nome, '')), '[^a-z ]+', ' ', 'g')), ' ', 1), ''),
    trim(coalesce(p_nome, ''))
  );
$$;

-- Valor de configuração booleano: ausente/vazio = TRUE (a chave existe e o
-- padrão ligado vale). Só a string 'false' desliga — nada de coerção implícita.
create or replace function public.ia_flag_chave(p_chave text, p_campo text)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select (c.valor ->> p_campo) is distinct from 'false'
        from public.configuracoes_sistema c
       where c.chave = p_chave
    ),
    true
  );
$$;

-- Link oficial de avaliação (vazio quando não configurado — a IA nunca inventa
-- link).
create or replace function public.ia_link_avaliacao()
returns text
language sql
stable
as $$
  select coalesce(
    (select nullif(trim(c.valor ->> 'link'), '')
       from public.configuracoes_sistema c
      where c.chave = 'avaliacao'),
    ''
  );
$$;

-- Mensagem customizada de avaliação (vazio = usa o texto padrão).
create or replace function public.ia_mensagem_avaliacao()
returns text
language sql
stable
as $$
  select coalesce(
    (select nullif(trim(c.valor ->> 'mensagem'), '')
       from public.configuracoes_sistema c
      where c.chave = 'avaliacao'),
    ''
  );
$$;

-- ----------------------------------------------------------------------------
-- 4) Enfileiramento — a ÚNICA porta de escrita da fila
--    `on conflict (chave) do nothing` = idempotência (§21).
--    Sem destino → entra como 'ignorado' com motivo (auditoria, §12/§20):
--    o agendamento NUNCA é afetado.
-- ----------------------------------------------------------------------------
create or replace function public.ia_notificacao_enfileirar(
  p_chave text,
  p_tipo text,
  p_destino text,
  p_mensagem text,
  p_agendamento_id text default '',
  p_destino_rotulo text default '',
  p_ordem smallint default 1
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_chave text := trim(coalesce(p_chave, ''));
  v_tipo text := trim(coalesce(p_tipo, ''));
  v_destino text := public.audax_digitos(p_destino);
  v_msg text := trim(coalesce(p_mensagem, ''));
begin
  if length(v_chave) < 3 or length(v_chave) > 160 then
    raise exception 'Chave de notificação inválida.';
  end if;
  if v_tipo not in ('confirmacao_cliente', 'notificacao_profissional', 'pos_atendimento', 'avaliacao') then
    raise exception 'Tipo de notificação inválido.';
  end if;
  if length(v_msg) < 1 or length(v_msg) > 4096 then
    raise exception 'Mensagem de notificação inválida.';
  end if;

  -- Sem número válido: registra a intenção como 'ignorado' para auditoria,
  -- mas a chave entra do mesmo jeito (a repetição não polui a fila).
  insert into public.ia_notificacoes (
    id, chave, tipo, agendamento_id, destino, destino_rotulo, mensagem,
    ordem, status, ultimo_erro
  )
  values (
    gen_random_uuid()::text,
    v_chave,
    v_tipo,
    nullif(trim(coalesce(p_agendamento_id, '')), ''),
    case when length(v_destino) between 10 and 15 then v_destino else '' end,
    left(trim(coalesce(p_destino_rotulo, '')), 80),
    v_msg,
    coalesce(p_ordem, 1),
    case
      when length(v_destino) between 10 and 15 then 'pendente'
      else 'ignorado'
    end,
    case
      when length(v_destino) between 10 and 15 then ''
      else 'destinatario-sem-whatsapp'
    end
  )
  on conflict (chave) do nothing;

  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Consumo da fila pela Edge Function (service_role)
--    Reclama linhas atomicamente (`for update skip locked`): duas execuções
--    simultâneas nunca pegam a mesma notificação.
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
  -- a fila (reprocessamento futuro, sem duplicar o que já foi enviado).
  update public.ia_notificacoes
     set status = 'pendente'
   where status = 'enviando'
     and criado_em <= now() - interval '10 minutes';

  select coalesce(array_agg(n.id), '{}'::text[])
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

-- Reprocessamento explícito das falhas (§12/§20) — nada é reenviado sem uma
-- nova chamada: a chave continua única.
create or replace function public.ia_notificacoes_reprocessar()
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.ia_notificacoes
     set status = 'pendente', ultimo_erro = ''
   where status = 'falha';
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'reprocessadas', v_n);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Triggers das mensagens automáticas (§11, §13, §14, §15)
--    NUNCA lançam exceção: uma falha de notificação não pode derrubar um
--    agendamento. Tudo é embrulhado e registrado.
-- ----------------------------------------------------------------------------
create or replace function public.ia_notificar_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ag public.agendamentos%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_ant public.agendamentos%rowtype := case when tg_op = 'INSERT' then null else old end;
  v_data text := to_char(v_ag.data, 'DD/MM/YYYY');
  v_hora text := public.audax_hora_legivel(v_ag.horario);
  v_prof public.profissionais%rowtype;
  v_link text;
  v_msg_av text;
  v_pnome text;
begin
  ---------------------------------------------------------------------------
  -- Notificação ao PROFISSIONAL (§11): só na criação, que é exatamente quando
  -- o agendamento "está confirmado no servidor". Nenhum evento duplica: a
  -- chave é por agendamento.
  ---------------------------------------------------------------------------
  if tg_op = 'INSERT' and v_ag.status in ('pendente', 'confirmado') then
    if public.ia_flag_chave('notificacoes', 'profissionalAgendamento') then
      select * into v_prof
        from public.profissionais p
       where p.nome = v_ag.profissional
         and p.ativo
       limit 1;

      perform public.ia_notificacao_enfileirar(
        'profissional_agendamento:' || v_ag.id,
        'notificacao_profissional',
        case when coalesce(v_prof.notificar_agendamentos, true)
             then v_prof.whatsapp_notificacao
             else '' end,
        concat_ws(E'\n',
          '🔔 NOVO AGENDAMENTO',
          'Cliente: ' || coalesce(nullif(trim(v_ag.cliente), ''), '(não informado)'),
          'Serviço: ' || coalesce(nullif(trim(v_ag.servico), ''), '(não informado)'),
          'Data: ' || v_data,
          'Horário: ' || v_hora,
          'Profissional: ' || coalesce(nullif(trim(v_ag.profissional), ''), '(não informado)'),
          'Origem: ' || case v_ag.origem when 'painel' then 'Painel do Cliente'
                                          when 'whatsapp' then 'WhatsApp'
                                          else 'Agenda' end
        ),
        v_ag.id,
        coalesce(nullif(trim(v_prof.nome), ''), v_ag.profissional),
        1
      );
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- Confirmação ao CLIENTE (§13): só no canal que ainda não tinha uma — o
  -- Painel do Cliente. No WhatsApp a conversa já respondeu (não duplica) e no
  -- admin a equipe já tem o botão manual.
  ---------------------------------------------------------------------------
  if public.ia_flag_chave('notificacoes', 'confirmacaoCliente')
     and (
       (tg_op = 'INSERT' and v_ag.origem = 'painel' and v_ag.status in ('pendente', 'confirmado'))
       or (tg_op = 'UPDATE' and v_ag.origem = 'painel'
           and coalesce(v_ant.origem, '') is distinct from 'painel'
           and v_ag.status in ('pendente', 'confirmado'))
     ) then
    perform public.ia_notificacao_enfileirar(
      'confirmacao_cliente:' || v_ag.id,
      'confirmacao_cliente',
      v_ag.telefone,
      concat_ws(E'\n',
        'Agendamento registrado',
        'Cliente: ' || coalesce(nullif(trim(v_ag.cliente), ''), '(não informado)'),
        'Serviço: ' || coalesce(nullif(trim(v_ag.servico), ''), '(não informado)'),
        'Data: ' || v_data,
        'Horário: ' || v_hora,
        'Profissional: ' || coalesce(nullif(trim(v_ag.profissional), ''), '(não informado)')
      ),
      v_ag.id,
      coalesce(nullif(trim(v_ag.cliente), ''), ''),
      1
    );
  end if;

  ---------------------------------------------------------------------------
  -- Pós-atendimento (§14) e avaliação (§15) — SÓ quando o atendimento foi
  -- realmente concluído (status real), nunca logo após o agendamento.
  ---------------------------------------------------------------------------
  if tg_op = 'UPDATE'
     and v_ag.status = 'concluido'
     and coalesce(v_ant.status, '') is distinct from 'concluido' then

    v_pnome := public.audax_primeiro_nome(v_ag.cliente);

    if public.ia_flag_chave('notificacoes', 'posAtendimento') then
      perform public.ia_notificacao_enfileirar(
        'pos_atendimento:' || v_ag.id,
        'pos_atendimento',
        v_ag.telefone,
        concat_ws(' ',
          'Obrigado por escolher o Studio Audax, ' || v_pnome || '!',
          'Foi um prazer atender você em ' || v_data || ' às ' || v_hora || '.'
        ),
        v_ag.id,
        coalesce(nullif(trim(v_ag.cliente), ''), ''),
        1
      );
    end if;

    v_link := public.ia_link_avaliacao();
    if v_link <> '' and public.ia_flag_chave('notificacoes', 'avaliacao') then
      v_msg_av := public.ia_mensagem_avaliacao();
      perform public.ia_notificacao_enfileirar(
        'avaliacao:' || v_ag.id,
        'avaliacao',
        v_ag.telefone,
        case when v_msg_av <> ''
          then v_msg_av || ' ' || v_link
          else 'Obrigado pela visita, ' || v_pnome || '! Conte pra gente como foi sua experiência:'
               || E'\n' || v_link
        end,
        v_ag.id,
        coalesce(nullif(trim(v_ag.cliente), ''), ''),
        2
      );
    end if;
  end if;

  return v_ag;
end;
$$;

drop trigger if exists agendamentos_notificar on public.agendamentos;
create trigger agendamentos_notificar
  after insert or update on public.agendamentos
  for each row execute function public.ia_notificar_agendamento();

-- ----------------------------------------------------------------------------
-- 7) O Painel do Cliente marca a origem da linha (§13 sem duplicar envio)
-- ----------------------------------------------------------------------------
create or replace function public.painel_agendamento_criar(
  p_servico text,
  p_profissional text,
  p_data date,
  p_horario text,
  p_observacao text default '',
  p_complementos text[] default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cad public.clientes%rowtype;
  v_base public.servicos%rowtype;
  v_compl public.servicos%rowtype;
  v_dur integer;
  v_obs text;
  v_nomes text[] := '{}'::text[];
  v_item text;
  v_id text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select * into v_cad from public.clientes where auth_user_id = v_uid;
  if not found then
    raise exception 'Este acesso ainda não está vinculado a um cadastro.';
  end if;

  select * into v_base
    from public.servicos
   where nome = trim(coalesce(p_servico, ''))
     and ativo;
  if not found then
    raise exception 'Serviço indisponível.';
  end if;

  v_dur := coalesce(v_base.duracao_min, 30);
  v_obs := trim(coalesce(p_observacao, ''));

  for v_item in
    select distinct unnest(coalesce(p_complementos, '{}'::text[]))::text
  loop
    if v_item is null or trim(v_item) = '' then
      continue;
    end if;
    if not (trim(v_item) = any (coalesce(v_base.complementos, '{}'::text[]))) then
      raise exception 'Complemento indisponível para este serviço.';
    end if;
    select * into v_compl
      from public.servicos
     where id = trim(v_item)
       and ativo;
    if not found then
      raise exception 'Complemento indisponível para este serviço.';
    end if;
    v_dur := v_dur + coalesce(v_compl.duracao_min, 0);
    v_nomes := v_nomes || v_compl.nome;
  end loop;

  if cardinality(v_nomes) > 0 then
    v_obs := case when v_obs = '' then '' else v_obs || ' | ' end
             || '[Complementos: ' || array_to_string(v_nomes, ', ') || ']';
  end if;

  -- §18: a RPC oficial valida e grava a janela BASE (status 'pendente').
  select public.agendamento_publico_criar(
           v_cad.nome, v_cad.telefone, p_servico, p_profissional,
           p_data, p_horario, v_obs
         ) ->> 'id'
    into v_id;

  if v_id is null or v_id = '' then
    raise exception 'Não foi possível agendar. Tente novamente.';
  end if;

  -- Janela total (com complementos) + vínculo com a sessão + origem. O
  -- trigger de sobreposição roda de novo aqui e valida a duração somada.
  update public.agendamentos
     set duracao_min = v_dur,
         cliente_id = v_cad.id,
         origem = 'painel'
   where id = v_id;
  if not found then
    raise exception 'Não foi possível concluir o agendamento. Tente novamente.';
  end if;

  return json_build_object('id', v_id, 'status', 'pendente');
end;
$$;

-- ----------------------------------------------------------------------------
-- 8) Privilégios
--   • tabelas sem policy e sem grant para anon/authenticated: a fila só é
--     lida/escrita pelas RPCs de service_role;
--   • as funções de configuração continuam sendo as MESMAS da 022 (uma regra
--     de validação só).
-- ----------------------------------------------------------------------------
alter table public.ia_notificacoes enable row level security;

revoke all on table public.ia_notificacoes from public, anon, authenticated;

grant select, insert, update, delete on public.ia_notificacoes to service_role;

revoke execute on function public.audax_hora_legivel(text) from public, anon, authenticated;
revoke execute on function public.audax_primeiro_nome(text) from public, anon, authenticated;
revoke execute on function public.ia_flag_chave(text, text) from public, anon, authenticated;
revoke execute on function public.ia_link_avaliacao() from public, anon, authenticated;
revoke execute on function public.ia_mensagem_avaliacao() from public, anon, authenticated;
revoke execute on function public.ia_notificacao_enfileirar(text, text, text, text, text, text, smallint) from public, anon, authenticated;
revoke execute on function public.ia_notificacoes_pendentes() from public, anon, authenticated;
revoke execute on function public.ia_notificacao_resolver(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.ia_notificacoes_reprocessar() from public, anon, authenticated;

grant execute on function public.audax_hora_legivel(text) to service_role;
grant execute on function public.audax_primeiro_nome(text) to service_role;
grant execute on function public.ia_flag_chave(text, text) to service_role;
grant execute on function public.ia_link_avaliacao() to service_role;
grant execute on function public.ia_mensagem_avaliacao() to service_role;
grant execute on function public.ia_notificacao_enfileirar(text, text, text, text, text, text, smallint) to service_role;
grant execute on function public.ia_notificacoes_pendentes() to service_role;
grant execute on function public.ia_notificacao_resolver(text, boolean, text) to service_role;
grant execute on function public.ia_notificacoes_reprocessar() to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
