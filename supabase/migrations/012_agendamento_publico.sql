-- ============================================================================
-- Studio Audax — Agendamento pelo cliente (acesso público)
-- ----------------------------------------------------------------------------
-- Objetivo: permitir que o cliente agende por um link, usando a MESMA fonte de
-- dados da Agenda interna (agendamentos / bloqueios / expediente) — nunca uma
-- segunda agenda. O cliente vê serviços, profissionais e horários livres e
-- cria o agendamento com status 'pendente' (a equipe confirma por dentro).
--
-- Por que funções e não policy de SELECT:
--   • `servicos`/`profissionais` exporiam telefone/e-mail do profissional;
--   • `agendamentos` exporia nome e telefone dos clientes.
-- As três funções abaixo devolvem somente o necessário (catálogo e ocupação
-- sem dados pessoais) e a de criação revalida expediente, almoço, bloqueio e
-- conflito no servidor antes de inserir.
--
-- Segurança:
--   • SECURITY DEFINER + search_path fixo; somente GRANT de EXECUTE (nada de
--     policy nova nas tabelas — RLS continua como está);
--   • a criação exige dados válidos e recusa horário ocupado — mesma regra
--     da Agenda interna (cancelados e não comparecidos não ocupam).
--
-- Não destrutivo e idempotente: nenhuma tabela, coluna ou dado existente é
-- alterado — apenas `create or replace function` + `grant`, que podem rodar
-- quantas vezes.
-- ============================================================================

-- Minutos desde 00:00 a partir de 'HH:MM' (entrada inválida = 0).
create or replace function public.audax_minutos(p_hora text)
returns integer
language sql
immutable
as $$
  select case
    when p_hora ~ '^[0-9]{1,2}:[0-9]{2}$'
    then (split_part(p_hora, ':', 1)::integer * 60
          + split_part(p_hora, ':', 2)::integer)
    else 0
  end;
$$;

-- Catálogo público: serviços ativos e profissionais ativos.
-- Sem telefone, e-mail, custo ou qualquer dado interno.
create or replace function public.agendamento_publico_catalogo()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'servicos', coalesce((
      select json_agg(
        json_build_object(
          'id', s.id,
          'nome', s.nome,
          'preco', s.preco,
          'duracaoMin', s.duracao_min
        ) order by s.nome
      )
      from servicos s
      where s.ativo
    ), '[]'::json),
    'profissionais', coalesce((
      select json_agg(
        json_build_object('id', p.id, 'nome', p.nome) order by p.nome
      )
      from profissionais p
      where p.ativo
    ), '[]'::json)
  );
$$;

-- Ocupação de um dia, sem dados pessoais: expediente, bloqueios e
-- agendamentos ativos (só horário/profissional/duração/status).
create or replace function public.agendamento_publico_slots(p_data date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'expediente', coalesce((
      select json_build_object(
        'inicio', e.inicio,
        'fim', e.fim,
        'almocoInicio', e.almoco_inicio,
        'almocoFim', e.almoco_fim
      )
      from agenda_expediente e
      where e.chave = 'padrao'
    ), json_build_object(
      'inicio', '08:00',
      'fim', '20:00',
      'almocoInicio', '12:00',
      'almocoFim', '13:00'
    )),
    'bloqueios', coalesce((
      select json_agg(
        json_build_object(
          'profissional', b.profissional,
          'data', b.data,
          'dataFim', b.data_fim,
          'inicio', b.inicio,
          'fim', b.fim,
          'tipo', b.tipo
        )
      )
      from bloqueios b
      where b.data <= p_data
        and coalesce(b.data_fim, b.data) >= p_data
    ), '[]'::json),
    'ocupacoes', coalesce((
      select json_agg(
        json_build_object(
          'profissional', a.profissional,
          'horario', a.horario,
          'servico', a.servico,
          'duracaoMin', a.duracao_min,
          'status', a.status
        )
      )
      from agendamentos a
      where a.data = p_data
        and a.status not in ('cancelado', 'nao_compareceu')
    ), '[]'::json)
  );
$$;

-- Cria o agendamento público depois de revalidar as MESMAS regras da Agenda:
-- expediente → almoço → bloqueio → conflito. Status nasce 'pendente'.
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
  -- sem linha de expediente (instalação nova): padrão do app
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

  if exists (
    select 1
      from agendamentos a
      left join servicos s on s.nome = a.servico
     where a.profissional = p_profissional
       and a.data = p_data
       and a.status not in ('cancelado', 'nao_compareceu')
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

grant execute on function public.audax_minutos(text) to anon, authenticated;
grant execute on function public.agendamento_publico_catalogo() to anon, authenticated;
grant execute on function public.agendamento_publico_slots(date) to anon, authenticated;
grant execute on function public.agendamento_publico_criar(
  text, text, text, text, date, text, text
) to anon, authenticated;
