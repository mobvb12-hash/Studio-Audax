-- ============================================================================
-- 045_confirmacao_automatica.sql — agendamento público nasce CONFIRMADO
-- ============================================================================
--
-- REGRA DE NEGÓCIO
--
-- Se o horário está disponível para aquele profissional e o sistema permitiu
-- que o cliente o selecionasse, então o cliente está agendando naquele horário.
-- Após a criação bem-sucedida, o agendamento é confirmado automaticamente.
--
--   disponível + cliente confirmou o agendamento = agendamento confirmado.
--
-- NÃO confundir:
--   • confirmação do agendamento pelo cliente (automática)
--   • confirmação manual pela equipe (não existe mais para agendamento público)
--
-- O QUE MUDA
--
--   • `agendamento_publico_criar`: INSERT usa 'confirmado' em vez de 'pendente'
--   • `agendamento_publico_criar_complementos`: retorno usa 'confirmado'
--   • `painel_agendamento_criar`: retorno usa 'confirmado'
--   • Trigger `ia_notificar_agendamento`: mensagens melhoradas
--
-- O QUE NÃO MUDA
--
--   • Nenhuma regra de Agenda, preço, Club ou notificação
--   • A fila de notificações continua a mesma (deduplicação por chave)
--   • O caminho de notificação ao profissional e cliente continua o mesmo
--   • Nenhuma tabela nova, nenhuma política nova
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Status inicial: 'confirmado' em vez de 'pendente'
-- ----------------------------------------------------------------------------

-- 1.1) agendamento_publico_criar (migration 040)
create or replace function public.agendamento_publico_criar(
  p_cliente text,
  p_telefone text,
  p_servico text,
  p_profissional text,
  p_data date,
  p_horario text,
  p_observacao text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := trim(coalesce(p_cliente, ''));
  v_servico text := trim(coalesce(p_servico, ''));
  v_profissional text := trim(coalesce(p_profissional, ''));
  v_horario text := trim(coalesce(p_horario, ''));
  v_duracao integer;
  v_id text;
  v_cliente_id text;
  v_base public.servicos%rowtype;
  v_ocupacao integer;
  v_bloqueio integer;
  v_expediente record;
  v_inicio time;
  v_fim time;
  v_almoco_inicio time;
  v_almoco_fim time;
  v_dia_semana integer;
  v_data_atual date := current_date;
begin
  if length(v_nome) < 2 then
    raise exception 'Informe o nome do cliente.';
  end if;
  if length(trim(coalesce(p_telefone, ''))) < 10 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  if v_servico = '' then
    raise exception 'Informe o serviço.';
  end if;
  if v_profissional = '' then
    raise exception 'Informe o profissional.';
  end if;
  if p_data is null or p_data < v_data_atual then
    raise exception 'Escolha uma data a partir de hoje.';
  end if;
  if v_horario !~ '^[0-9]{1,2}:[0-9]{2}$' then
    raise exception 'Horário inválido.';
  end if;

  select * into v_base
    from public.servicos
   where nome = v_servico
     and ativo;
  if not found then
    raise exception 'Serviço indisponível.';
  end if;

  v_duracao := coalesce(v_base.duracao_min, 30);

  select id into v_cliente_id
    from public.clientes
   where nome = v_nome
     and telefone = trim(coalesce(p_telefone, ''))
   limit 1;

  perform pg_advisory_xact_lock(hashtext(v_profissional), hashtext(v_horario));

  select count(*) into v_ocupacao
    from public.agendamentos
   where profissional = v_profissional
     and data = p_data
     and horario = v_horario
     and status not in ('cancelado', 'nao_compareceu');
  if v_ocupacao > 0 then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;

  select count(*) into v_bloqueio
    from public.bloqueios
   where profissional = v_profissional
     and data = p_data
     and horario = v_horario;
  if v_bloqueio > 0 then
    raise exception 'Este horário está bloqueado.';
  end if;

  v_dia_semana := extract(dow from p_data)::integer;

  select * into v_expediente
    from public.agenda_expediente
   where dia_semana = v_dia_semana
     and ativo;
  if not found then
    raise exception 'A barbearia não atende neste dia.';
  end if;

  v_inicio := v_expediente.inicio;
  v_fim := v_expediente.fim;
  v_almoco_inicio := v_expediente.almoco_inicio;
  v_almoco_fim := v_expediente.almoco_fim;

  if v_horario::time < v_inicio or v_horario::time >= v_fim then
    raise exception 'Horário fora do expediente.';
  end if;

  if v_almoco_inicio is not null and v_almoco_fim is not null then
    if v_horario::time >= v_almoco_inicio and v_horario::time < v_almoco_fim then
      raise exception 'Horário de almoço.';
    end if;
  end if;

  v_id := gen_random_uuid()::text;
  insert into agendamentos (
    id, cliente, telefone, servico, profissional, data, horario,
    status, duracao_min, observacao, remarcacoes, criado_em, atualizado_em,
    cliente_id
  ) values (
    v_id, v_nome, trim(coalesce(p_telefone, '')), v_servico, v_profissional,
    p_data, v_horario, 'confirmado', v_duracao,
    coalesce(trim(p_observacao), ''), '[]'::jsonb, now(), now(),
    v_cliente_id
  );

  return json_build_object('id', v_id);
end;
$$;

-- 1.2) agendamento_publico_criar_complementos (migration 044)
create or replace function public.agendamento_publico_criar_complementos(
  p_cliente text,
  p_telefone text,
  p_servico text,
  p_profissional text,
  p_data date,
  p_horario text,
  p_observacao text default '',
  p_complementos text[] default '{}',
  p_email text default '',
  p_nascimento text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base public.servicos%rowtype;
  v_compl public.servicos%rowtype;
  v_dur integer;
  v_obs text := trim(coalesce(p_observacao, ''));
  v_nomes text[] := '{}'::text[];
  v_item text;
  v_id text;
  v_email text := trim(coalesce(p_email, ''));
  v_nasc text := trim(coalesce(p_nascimento, ''));
begin
  select * into v_base
    from public.servicos
   where nome = trim(coalesce(p_servico, ''))
     and ativo;
  if not found then
    raise exception 'Serviço indisponível.';
  end if;

  v_dur := coalesce(v_base.duracao_min, 30);

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

  select public.agendamento_publico_criar(
           p_cliente, p_telefone, p_servico, p_profissional,
           p_data, p_horario, v_obs
         ) ->> 'id'
    into v_id;

  if v_id is null or v_id = '' then
    raise exception 'Não foi possível agendar. Tente novamente.';
  end if;

  update public.agendamentos
     set duracao_min = v_dur,
         dados = coalesce(dados, '{}'::jsonb)
                || jsonb_strip_nulls(
                     jsonb_build_object(
                       'email', nullif(v_email, ''),
                       'nascimento', nullif(v_nasc, '')
                     )
                   )
   where id = v_id;
  if not found then
    raise exception 'Não foi possível concluir o agendamento. Tente novamente.';
  end if;

  return json_build_object('id', v_id, 'status', 'confirmado');
end;
$$;

-- 1.3) painel_agendamento_criar (migration 024)
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

  select public.agendamento_publico_criar(
           v_cad.nome, v_cad.telefone, p_servico, p_profissional,
           p_data, p_horario, v_obs
         ) ->> 'id'
    into v_id;

  if v_id is null or v_id = '' then
    raise exception 'Não foi possível agendar. Tente novamente.';
  end if;

  update public.agendamentos
     set duracao_min = v_dur,
         cliente_id = v_cad.id,
         origem = 'painel'
   where id = v_id;
  if not found then
    raise exception 'Não foi possível concluir o agendamento. Tente novamente.';
  end if;

  return json_build_object('id', v_id, 'status', 'confirmado');
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Mensagens melhoradas no trigger de notificação
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
  v_hora text := public.audax_hora_legible(v_ag.horario);
  v_prof public.profissionais%rowtype;
  v_link text := '';
  v_msg_av text := '';
  v_pnome text := '';
  v_complementos text := '';
  v_casa jsonb := '{}'::jsonb;
begin
  ---------------------------------------------------------------------------
  -- Notificação ao PROFISSIONAL: só na criação, quando o agendamento está
  -- confirmado. Mensagem profissional e organizada.
  ---------------------------------------------------------------------------
  if tg_op = 'INSERT' and v_ag.status in ('pendente', 'confirmado') then
    if public.ia_flag_chave('notificacoes', 'profissionalAgendamento') then
      select * into v_prof
        from public.profissionais p
       where p.nome = v_ag.profissional
         and p.ativo
       limit 1;

      perform public.ia_notificar_com_seguranca(
        'profissional_agendamento:' || v_ag.id,
        'notificacao_profissional',
        'notificacoes',
        'profissionalAgendamento',
        case when coalesce(v_prof.notificar_agendamentos, true)
             then v_prof.whatsapp_notificacao
             else '' end,
        concat_ws(E'\n',
          'Studio Audax — Novo agendamento',
          '',
          'Um novo horário foi confirmado:',
          '',
          'Cliente: ' || coalesce(nullif(trim(v_ag.cliente), ''), '(não informado)'),
          'Serviço: ' || coalesce(nullif(trim(v_ag.servico), ''), '(não informado)'),
          'Data: ' || v_data,
          'Horário: ' || v_hora,
          '',
          'Profissional: ' || coalesce(nullif(trim(v_ag.profissional), ''), '(não informado)'),
          '',
          'O horário já está confirmado na Agenda.'
        ),
        v_ag.id,
        coalesce(nullif(trim(v_prof.nome), ''), v_ag.profissional),
        1
      );
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- Confirmação ao CLIENTE: mensagem profissional e organizada.
  ---------------------------------------------------------------------------
  if (
    tg_op = 'INSERT' and v_ag.origem in ('painel', 'publico')
    and v_ag.status in ('pendente', 'confirmado')
  )
  or (
    tg_op = 'UPDATE' and v_ag.origem in ('painel', 'publico')
    and coalesce(v_ant.origem, '') is distinct from v_ag.origem
    and v_ag.status in ('pendente', 'confirmado')
  ) then
    if v_ag.observacao ~ '\[Complementos:[^\]]*\]' then
      v_complementos := btrim(regexp_replace(
        (regexp_match(v_ag.observacao, '\[Complementos:([^\]]*)\]'))[1],
        '^\s+|\s+$', '', 'g'));
    end if;

    select coalesce(valor, '{}'::jsonb) into v_casa
      from public.configuracoes_sistema
     where chave = 'barbearia';

    perform public.ia_notificar_com_seguranca(
      'confirmacao_cliente:' || v_ag.id,
      'confirmacao_cliente',
      'notificacoes',
      'confirmacaoCliente',
      v_ag.telefone,
      concat_ws(E'\n',
        'Olá, ' || public.audax_primeiro_nome(v_ag.cliente) || '!',
        '',
        'Seu horário no Studio Audax está confirmado!',
        '',
        'Data: ' || v_data,
        'Horário: ' || v_hora,
        'Serviço: ' || coalesce(nullif(trim(v_ag.servico), ''), '(não informado)'),
        nullif('Complementos: ' || nullif(v_complementos, ''), 'Complementos: '),
        'Profissional: ' || coalesce(nullif(trim(v_ag.profissional), ''), '(não informado)'),
        '',
        'Studio Audax Barbearia',
        '',
        'Estamos te esperando!',
        '',
        'Se precisar remarcar ou cancelar, fale conosco pelo WhatsApp.'
      ),
      v_ag.id,
      coalesce(nullif(trim(v_ag.cliente), ''), ''),
      1
    );
  end if;

  ---------------------------------------------------------------------------
  -- Pós-atendimento e avaliação — só com status 'concluido'.
  ---------------------------------------------------------------------------
  if tg_op = 'UPDATE'
     and v_ag.status = 'concluido'
     and coalesce(v_ant.status, '') is distinct from 'concluido' then

    v_pnome := public.audax_primeiro_nome(v_ag.cliente);

    if public.ia_flag_chave('notificacoes', 'posAtendimento') then
      perform public.ia_notificar_com_seguranca(
        'pos_atendimento:' || v_ag.id,
        'pos_atendimento',
        'notificacoes',
        'posAtendimento',
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

    begin
      v_link := public.ia_link_avaliacao();
      v_msg_av := public.ia_mensagem_avaliacao();
    exception when others then
      v_link := '';
      v_msg_av := '';
    end;

    if v_link <> '' then
      perform public.ia_notificar_com_seguranca(
        'avaliacao:' || v_ag.id,
        'avaliacao',
        'notificacoes',
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

exception when others then
  begin
    insert into public.ia_eventos (fluxo, intencao, acao, executada, motivo)
    values (
      'notificacao',
      'agendamento',
      left(coalesce(v_ag.status, ''), 40),
      false,
      left('trigger de notificação falhou: ' || coalesce(sqlerrm, 'erro'), 290)
    );
  exception when others then
    null;
  end;

  return v_ag;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Grants (mantém os mesmos)
-- ----------------------------------------------------------------------------
grant execute on function public.agendamento_publico_criar(
  text, text, text, text, date, text, text
) to anon, authenticated, service_role;

grant execute on function public.agendamento_publico_criar_complementos(
  text, text, text, text, date, text, text, text[], text, text
) to anon, authenticated, service_role;

grant execute on function public.painel_agendamento_criar(
  text, text, date, text, text, text[]
) to anon, authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
