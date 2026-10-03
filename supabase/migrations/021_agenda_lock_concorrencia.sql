-- --------------------------------------------------------
-- 021_agenda_lock_concorrencia.sql
-- Previne duplicidade de reservas concorrentes (TOCTOU) na agenda oficial
-- usando advisory lock transacional do PostgreSQL.
-- NÃO altera RLS, não cria segunda agenda, não altera grants/comissões/serviços/clube.
-- --------------------------------------------------------

-- ------------------------------------------------------------
-- 1) Helper: chave determinística do slot (profissional || ':' || data)
-- ------------------------------------------------------------
create or replace function public.agenda_slot_chave(p_profissional text, p_data date)
returns bigint
language sql
immutable
set search_path = public
as $$
  select hashtextextended(p_profissional || ':' || coalesce(to_char(p_data,'YYYY-MM-DD'),''), 0);
$$;

-- ------------------------------------------------------------
-- 2) Bloqueio de 1 slot (advisory xact lock, re-entrante no mesmo tx)
-- ------------------------------------------------------------
-- A chave vem SEMPRE de `agenda_slot_chave`: um único lugar deriva o hash,
-- então trigger, criação oficial e remarcação não podem divergir.
create or replace function public.agenda_lock_slot(p_profissional text, p_data date)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_chave bigint := public.agenda_slot_chave(p_profissional, p_data);
begin
  if v_chave is null then return; end if;
  perform pg_advisory_xact_lock(v_chave);
end;
$$;

-- ------------------------------------------------------------
-- 3) Bloqueio de 2 slots em ordem determinística (previne deadlock)
-- ------------------------------------------------------------
create or replace function public.agenda_lock_slots(
  p_prof_a text, p_data_a date, p_prof_b text, p_data_b date)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v1 bigint; v2 bigint; vtmp bigint;
begin
  v1 := public.agenda_slot_chave(p_prof_a, p_data_a);
  v2 := public.agenda_slot_chave(p_prof_b, p_data_b);

  if v1 is null and v2 is null then return; end if;
  if v1 is null then perform pg_advisory_xact_lock(v2); return; end if;
  if v2 is null then perform pg_advisory_xact_lock(v1); return; end if;

  if v1 > v2 then
    vtmp := v1; v1 := v2; v2 := vtmp;
  end if;

  if v1 = v2 then
    perform pg_advisory_xact_lock(v1);
  else
    perform pg_advisory_xact_lock(v1);
    perform pg_advisory_xact_lock(v2);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 4) Trigger principal: agora bloqueia ANTES do EXISTS (evita TOCTOU)
-- ------------------------------------------------------------
-- `create or replace` (sem `drop`) preserva os grants e o OID, então o
-- trigger já instalado continua apontando para esta nova definição.
create or replace function public.agendamentos_sem_sobreposicao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelado','nao_compareceu') then
    return new;
  end if;
  -- 021: trava pelo slot ANTES da verificação de conflito. Sob READ COMMITTED
  -- a transação que perde a corrida espera aqui e só então reavalia o EXISTS,
  -- enxergando a linha já commitada da vencedora (esta é a correção do TOCTOU).
  perform public.agenda_lock_slot(new.profissional, new.data);
  if exists (
    select 1
    from public.agendamentos a
    where a.id != new.id
      and a.profissional = new.profissional
      and a.data = new.data
      and a.status not in ('cancelado','nao_compareceu')
      and (a.horario::time,
           a.horario::time + coalesce(a.duracao_min, 30) * interval '1 minute')
        overlaps
        (new.horario::time,
         new.horario::time + coalesce(new.duracao_min, 30) * interval '1 minute')
  ) then
    raise exception 'agendamento: horario ja ocupado para este profissional';
  end if;
  return new;
end;
$$;

drop trigger if exists agendamentos_sem_sobreposicao on public.agendamentos;

create trigger agendamentos_sem_sobreposicao
  before insert or update on public.agendamentos
  for each row execute function public.agendamentos_sem_sobreposicao();

-- ------------------------------------------------------------
-- 5) Trigger de remarcação: garante que slots antigo+novo sejam protegidos
-- ------------------------------------------------------------
-- Ordenação alfabética dos nomes de trigger garante que
-- `agendamentos_lock_remarcacao` (UPDATE) roda ANTES de
-- `agendamentos_sem_sobreposicao`, que só então reavalia a sobreposição.
drop trigger if exists agendamentos_lock_remarcacao on public.agendamentos;
create or replace function public.agendamentos_lock_remarcacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelado','nao_compareceu') then
    return new; -- nada passa a ocupar slot; sem lock e sem tocar na linha
  end if;
  if new.profissional is distinct from old.profissional
     or new.data is distinct from old.data then
    -- slots diferentes: trava ambos em ordem determinística
    perform public.agenda_lock_slots(old.profissional, old.data,
                                     new.profissional, new.data);
  else
    -- mesmo slot (apenas atualização de campos não-chave): trava 1 slot
    perform public.agenda_lock_slot(new.profissional, new.data);
  end if;
  -- devolve NEW: num trigger BEFORE, devolver NULL CANCELARIA o UPDATE.
  return new;
end;
$$;

create trigger agendamentos_lock_remarcacao
  before update on public.agendamentos
  for each row execute function public.agendamentos_lock_remarcacao();

-- ------------------------------------------------------------
-- 6) Criação oficial: lock ANTES da verificação de conflito
--    (requirement 1: Painel, IA/WhatsApp e Agenda pública passam todos aqui)
-- ------------------------------------------------------------
-- `create or replace` preserva os grants de 012 (anon, authenticated) e o OID.
-- O advisory lock entra logo antes do último `if exists`: com ele, o perdente
-- da corrida ESPERA aqui e só depois reavalia o conflito, então a mensagem
-- amigável "Este horário acabou de ser ocupado. Escolha outro." continua sendo
-- a que o cliente recebe — sem cair na mensagem técnica do trigger.
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
  v_nome text := coalesce(trim(p_cliente), '');
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_duracao integer;
  v_inicio integer;
  v_fim integer;
  v_exp_inicio text;
  v_exp_fim text;
  v_alm_inicio text;
  v_alm_fim text;
  v_id text;
begin
  if length(v_nome) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  if p_data is null or p_data < current_date then
    raise exception 'Escolha uma data a partir de hoje.';
  end if;
  if p_horario is null or p_horario !~ '^[0-9]{1,2}:[0-9]{2}$' then
    raise exception 'Horário inválido.';
  end if;

  select coalesce(s.duracao_min, 30)
    into v_duracao
    from servicos s
    where s.nome = p_servico and s.ativo;
  if not found then
    raise exception 'Serviço indisponível.';
  end if;

  if not exists (
    select 1 from profissionais p
    where p.nome = p_profissional and p.ativo
  ) then
    raise exception 'Profissional indisponível.';
  end if;

  select e.inicio, e.fim, e.almoco_inicio, e.almoco_fim
    into v_exp_inicio, v_exp_fim, v_alm_inicio, v_alm_fim
    from agenda_expediente e
    where e.chave = 'padrao';
  v_exp_inicio := coalesce(v_exp_inicio, '08:00');
  v_exp_fim := coalesce(v_exp_fim, '20:00');
  v_alm_inicio := coalesce(v_alm_inicio, '12:00');
  v_alm_fim := coalesce(v_alm_fim, '13:00');

  v_inicio := public.audax_minutos(p_horario);
  v_fim := v_inicio + v_duracao;

  if v_inicio < public.audax_minutos(v_exp_inicio)
     or v_fim > public.audax_minutos(v_exp_fim) then
    raise exception 'Horário fora do expediente (% às %).',
      v_exp_inicio, v_exp_fim;
  end if;

  if v_inicio < public.audax_minutos(v_alm_fim)
     and public.audax_minutos(v_alm_inicio) < v_fim then
    raise exception 'Horário bloqueado pelo almoço (% às %).',
      v_alm_inicio, v_alm_fim;
  end if;

  if exists (
    select 1 from bloqueios b
    where b.profissional = p_profissional
      and b.data <= p_data
      and coalesce(b.data_fim, b.data) >= p_data
      and public.audax_minutos(b.inicio) < v_fim
      and v_inicio < public.audax_minutos(b.fim)
  ) then
    raise exception 'Este horário está bloqueado para o profissional escolhido.';
  end if;

  -- 021: serializa este (profissional, data) ANTES do teste de conflito.
  -- Toda origem oficial (público, Painel, IA/WhatsApp) chega aqui, e o
  -- mesmo lock é reconectado no trigger — reentrante na mesma transação.
  perform public.agenda_lock_slot(p_profissional, p_data);

  if exists (
    select 1
      from agendamentos a
      left join servicos s on s.nome = a.servico
     where a.profissional = p_profissional
      and a.data = p_data
      and a.status not in ('cancelado','nao_compareceu')
      and public.audax_minutos(a.horario) < v_fim
      and v_inicio < public.audax_minutos(a.horario)
            + greatest(coalesce(a.duracao_min, s.duracao_min, 30), 5)
  ) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;

  v_id := gen_random_uuid()::text;
  insert into agendamentos (
    id, cliente, telefone, servico, profissional, data, horario,
    status, duracao_min, observacao, remarcacoes, criado_em, atualizado_em
  ) values (
    v_id, v_nome, trim(coalesce(p_telefone, '')), p_servico, p_profissional,
    p_data, p_horario, 'pendente', v_duracao,
    coalesce(trim(p_observacao), ''), '[]'::jsonb, now(), now()
  );

  return json_build_object('id', v_id);
end;
$$;

-- ------------------------------------------------------------
-- 7) Privilégios dos helpers (defesa em profundidade)
-- ------------------------------------------------------------
-- Os helpers não leem nem escrevem nada: só derivam a chave e tomam o lock.
-- Ficam sem EXECUTE para public/anon/authenticated; as funções SECURITY
-- DEFINER e os triggers chamam-nos com o privilégio do dono (postgres),
-- que é o único caminho necessário. `authenticated` continua com o mesmo
-- acesso de antes em `agendamento_publico_criar` — nada muda para o cliente.
revoke execute on function public.agenda_slot_chave(text, date) from public, anon, authenticated;
revoke execute on function public.agenda_lock_slot(text, date) from public, anon, authenticated;
revoke execute on function public.agenda_lock_slots(text, date, text, date) from public, anon, authenticated;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';