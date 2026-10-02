-- ============================================================================
-- Studio Audax — Painel do cliente (FASE F): complementos e criação de
-- agendamento pelo painel
-- ----------------------------------------------------------------------------
-- 1) `servicos.complementos text[]`: quais serviços podem ser sugeridos como
--    complemento daquele serviço (ex.: Corte → [Barba, Sobrancelha]). Editado
--    pela tela de Serviços do admin; preço exibido é o do próprio catálogo.
--    Ids de serviços — nunca preço/duração escritos à mão no painel.
--
-- 2) `painel_agendamento_criar`: cria o agendamento do CLIENTE LOGADO
--    envolvendo a RPC oficial `agendamento_publico_criar` (§18 — MESMA
--    validação de expediente/almoço/bloqueio/conflito, revalidada no
--    servidor, status 'pendente'):
--    • nome/telefone vêm do CADASTRO vinculado (identidade autenticada —
--      o cliente não envia dados de terceiros);
--    • complementos são validados contra a configuração do serviço base
--      (id existe, está ativo e está na lista `complementos` do serviço);
--    • duração total = base + complementos, aplicada num UPDATE posterior —
--      o trigger `agendamentos_sem_sobreposicao` (017) roda DE NOVO no
--      UPDATE e valida a janela estendida (antes disso a RPC pública já
--      validou a janela base);
--    • o complemento fica anotado na observação (`[Complementos: …]`) —
--      a linha continua sendo UM serviço na Agenda oficial;
--    • `cliente_id` liga a linha à sessão para "meus agendamentos".
--
-- Idempotente e não destrutivo: `add column if not exists` e
-- `create or replace function`. Nada existente é apagado.
-- ============================================================================

alter table public.servicos
  add column if not exists complementos text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- RPC: cria agendamento pelo painel (wrap da RPC oficial pública)
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

  -- Janela total (com complementos) + vínculo com a sessão. O trigger de
  -- sobreposição roda de novo aqui e valida a duração somada.
  update public.agendamentos
     set duracao_min = v_dur,
         cliente_id = v_cad.id
   where id = v_id;
  if not found then
    raise exception 'Não foi possível concluir o agendamento. Tente novamente.';
  end if;

  return json_build_object('id', v_id, 'status', 'pendente');
end;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE: painel só para sessão autenticada (anon/public fora)
-- ----------------------------------------------------------------------------
grant execute on function public.painel_agendamento_criar(
  text, text, date, text, text, text[]
) to authenticated;

revoke execute on function public.painel_agendamento_criar(
  text, text, date, text, text, text[]
) from public, anon;

-- ============================================================================
-- FASE L — cancelar e remarcar pelo painel: envolvem as RPCs OFICIAIS da 015
-- (mesmas regras da IA/admin: pagamento não estornado bloqueia, status ativo,
-- expediente/almoço/bloqueio/conflito com ignorarId; remarcação registra o
-- histórico `remarcacoes`). Nada de lógica comercial nova aqui.
--
-- Posse ANTES da chamada: a linha precisa ter `cliente_id` da sessão — as
-- RPCs da 015 comparam o telefone da LINHA; o wrapper passa o telefone da
-- própria linha (a posse já foi provada), então trocar o telefone no perfil
-- não trava o cancelamento/remarcação de agendamentos antigos.
-- ============================================================================

create or replace function public.painel_agendamento_cancelar(
  p_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cad public.clientes%rowtype;
  v_ag public.agendamentos%rowtype;
  v_fone text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select * into v_cad from public.clientes where auth_user_id = v_uid;
  if not found then
    raise exception 'Este acesso ainda não está vinculado a um cadastro.';
  end if;

  -- posse: só a linha do próprio cliente (mensagem única nunca vaza a
  -- existência de um agendamento de outra pessoa)
  select * into v_ag
    from public.agendamentos
   where id = p_id
     and cliente_id = v_cad.id;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;

  v_fone := case
    when length(public.audax_digitos(v_ag.telefone)) between 10 and 13
      then v_ag.telefone
    else v_cad.telefone
  end;

  perform public.ia_agendamento_cancelar(p_id, v_fone);

  return json_build_object('id', p_id, 'status', 'cancelado');
end;
$$;

create or replace function public.painel_agendamento_remarsar(
  p_id text,
  p_data date,
  p_horario text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cad public.clientes%rowtype;
  v_ag public.agendamentos%rowtype;
  v_fone text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select * into v_cad from public.clientes where auth_user_id = v_uid;
  if not found then
    raise exception 'Este acesso ainda não está vinculado a um cadastro.';
  end if;

  select * into v_ag
    from public.agendamentos
   where id = p_id
     and cliente_id = v_cad.id;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;

  v_fone := case
    when length(public.audax_digitos(v_ag.telefone)) between 10 and 13
      then v_ag.telefone
    else v_cad.telefone
  end;

  -- profissional continua o da linha; o cliente só muda data/horário
  perform public.ia_agendamento_remarcar(
    p_id, v_fone, p_data, p_horario, v_ag.profissional
  );

  return json_build_object(
    'id', p_id,
    'data', to_char(p_data, 'YYYY-MM-DD'),
    'horario', p_horario
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- EXECUTE: só sessão autenticada (anon/public fora)
-- ----------------------------------------------------------------------------
grant execute on function public.painel_agendamento_cancelar(text)
  to authenticated;
revoke execute on function public.painel_agendamento_cancelar(text)
  from public, anon;

grant execute on function public.painel_agendamento_remarsar(text, date, text)
  to authenticated;
revoke execute on function public.painel_agendamento_remarsar(text, date, text)
  from public, anon;
