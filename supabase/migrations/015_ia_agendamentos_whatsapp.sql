-- ============================================================================
-- Studio Audax — IA do WhatsApp: agendamentos com credencial server-to-server
-- ----------------------------------------------------------------------------
-- Objetivo (FASE 5): dar à IA do WhatsApp os MESMOS poderes de leitura e
-- escrita que a Agenda interna já tem, sem policy nova e sem liberar nada ao
-- público. A criação continua na função PÚBLICA `agendamento_publico_criar`
-- (012); aqui ficam somente as operações que exigem saber QUEM é o cliente:
--
--   • ia_cliente_por_telefone     → nome para pré-preencher a confirmação;
--   • ia_agendamentos_do_telefone → lista futura do cliente (cancelar/remarcar);
--   • ia_agendamento_cancelar     → cancela com as MESMAS travas da UI;
--   • ia_agendamento_remarcar     → remarca com as MESMAS regras da UI
--                                    (validarProposta com ignorarId + histórico
--                                    de remarcacoes + no-op se nada mudou).
--
-- Espelhamento de regras (fonte: src/modules/agenda/store.tsx e regras.ts):
--   • cancelar bloqueia se houver pagamento não estornado do atendimento
--     (jaPago: caixa_lancamentos.origem = 'atendimento' AND NOT estornado) e
--     recusa status já cancelado / não compareceu;
--   • remarcar NÃO checa pagamento (igual à UI), mas valida expediente →
--     almoço → bloqueio → conflito ignorando o próprio agendamento, e só
--     grava quando data/horário/profissional realmente mudam;
--   • falhas viram `raise exception` com a MESMA frase da UI — a IA repassa
--     o motivo ao cliente sem reescrever.
--
-- Segurança:
--   • SECURITY DEFINER + search_path fixo; helper `audax_digitos` sem grant;
--   • REVOKE de PUBLIC, anon e authenticated; GRANT somente para
--     service_role (é o papel das chaves sb_secret_* que a Edge Function
--     usa nos headers — corpo/URL nunca levam credencial);
--   • todo acesso a agendamentos exige telefone igual (dígitos), então um id
--     vazado não serve para ler ou mexer no agendamento de outra pessoa.
--
-- Não destrutivo e idempotente: nenhuma tabela, coluna ou dado existente é
-- alterado — apenas `create or replace function` + `revoke`/`grant`, que
-- podem rodar quantas vezes.
-- ============================================================================

-- Somente dígitos (compara telefone de agendamento/cliente com o remetente).
create or replace function public.audax_digitos(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

-- ----------------------------------------------------------------------------
-- 1) Nome do cliente pelo telefone (pré-preenchimento da confirmação).
--    Devolve {nome} ou {nome: null} — nunca outros dados cadastrais.
-- ----------------------------------------------------------------------------
create or replace function public.ia_cliente_por_telefone(p_telefone text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case
    when length(public.audax_digitos(p_telefone)) between 10 and 13 then
      coalesce(
        (
          select json_build_object('nome', c.nome)
            from clientes c
           where public.audax_digitos(c.telefone) = public.audax_digitos(p_telefone)
           order by c.atualizado_em desc
           limit 1
        ),
        json_build_object('nome', null)
      )
    else json_build_object('nome', null)
  end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Agenda futura do cliente (somente o necessário para escolher o alvo).
--    Data/hora avaliadas no fuso de Recife; a IA ainda filtra por hoje.
--    Cancelados e não comparecidos ficam de fora — não há ação possível.
-- ----------------------------------------------------------------------------
create or replace function public.ia_agendamentos_do_telefone(p_telefone text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case
    when length(public.audax_digitos(p_telefone)) between 10 and 13 then
      coalesce(
        (
          select json_agg(
            json_build_object(
              'id', a.id,
              'servico', a.servico,
              'profissional', a.profissional,
              'data', to_char(a.data, 'YYYY-MM-DD'),
              'horario', a.horario,
              'status', a.status
            )
            order by a.data, a.horario
          )
            from agendamentos a
           where public.audax_digitos(a.telefone) = public.audax_digitos(p_telefone)
             and a.data >= ((now() at time zone 'America/Recife')::date)
             and a.status in ('pendente', 'confirmado')
        ),
        '[]'::json
      )
    else '[]'::json
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Cancelamento — travas da UI (mudarStatus + jaPago) no servidor.
-- ----------------------------------------------------------------------------
create or replace function public.ia_agendamento_cancelar(
  p_id text,
  p_telefone text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ag public.agendamentos%rowtype;
  v_fone text := public.audax_digitos(p_telefone);
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{6,64}$' then
    raise exception 'Identificador inválido.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Telefone inválido.';
  end if;

  select * into v_ag
    from public.agendamentos a
   where a.id = p_id
     and public.audax_digitos(a.telefone) = v_fone;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;

  -- espelha jaPago do CaixaProvider: pagamento do atendimento não estornado
  if exists (
    select 1
      from public.caixa_lancamentos l
     where l.agendamento_id = v_ag.id
       and l.origem = 'atendimento'
       and not coalesce(l.estornado, false)
  ) then
    raise exception 'Este agendamento já foi pago. Estorne o pagamento no Caixa antes de cancelar.';
  end if;

  if v_ag.status in ('cancelado', 'nao_compareceu') then
    raise exception 'Este agendamento não está mais ativo.';
  end if;

  update public.agendamentos a
     set status = 'cancelado',
         atualizado_em = now()
   where a.id = v_ag.id
     and public.audax_digitos(a.telefone) = v_fone;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;

  return json_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Remarcação — espelha AgendaStore.remarcar + validarProposta(ignorarId).
-- ----------------------------------------------------------------------------
create or replace function public.ia_agendamento_remarcar(
  p_id text,
  p_telefone text,
  p_data date,
  p_horario text,
  p_profissional text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ag public.agendamentos%rowtype;
  v_bloqueio public.bloqueios%rowtype;
  v_fone text := public.audax_digitos(p_telefone);
  v_nome_prof text := coalesce(trim(p_profissional), '');
  v_duracao integer;
  v_inicio integer;
  v_fim integer;
  v_exp_inicio text;
  v_exp_fim text;
  v_alm_inicio text;
  v_alm_fim text;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{6,64}$' then
    raise exception 'Identificador inválido.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Telefone inválido.';
  end if;
  if p_data is null or p_data < ((now() at time zone 'America/Recife')::date) then
    raise exception 'Escolha uma data a partir de hoje.';
  end if;
  if p_horario is null or p_horario !~ '^[0-9]{1,2}:[0-9]{2}$' then
    raise exception 'Horário inválido.';
  end if;
  if v_nome_prof = '' then
    raise exception 'Profissional inválido.';
  end if;

  select * into v_ag
    from public.agendamentos a
   where a.id = p_id
     and public.audax_digitos(a.telefone) = v_fone;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;
  if v_ag.status in ('cancelado', 'nao_compareceu') then
    raise exception 'Este agendamento não está mais ativo.';
  end if;

  -- nada mudou → nada grava (a UI devolve o agendamento igual, sem erro)
  if v_ag.data = p_data
     and v_ag.horario = p_horario
     and v_ag.profissional = v_nome_prof then
    return json_build_object('ok', true, 'igual', true);
  end if;

  if not exists (
    select 1 from public.profissionais p
     where p.nome = v_nome_prof and p.ativo
  ) then
    raise exception 'Profissional indisponível.';
  end if;

  v_duracao := coalesce(
    v_ag.duracao_min,
    (select s.duracao_min from public.servicos s where s.nome = v_ag.servico),
    30
  );
  v_duracao := greatest(v_duracao, 5);

  select e.inicio, e.fim, e.almoco_inicio, e.almoco_fim
    into v_exp_inicio, v_exp_fim, v_alm_inicio, v_alm_fim
    from public.agenda_expediente e
   where e.chave = 'padrao';
  v_exp_inicio := coalesce(v_exp_inicio, '08:00');
  v_exp_fim := coalesce(v_exp_fim, '20:00');
  v_alm_inicio := coalesce(v_alm_inicio, '12:00');
  v_alm_fim := coalesce(v_alm_fim, '13:00');

  v_inicio := public.audax_minutos(p_horario);
  v_fim := v_inicio + v_duracao;

  if v_inicio < public.audax_minutos(v_exp_inicio)
     or v_fim > public.audax_minutos(v_exp_fim) then
    raise exception 'Horário fora do expediente (% às %).', v_exp_inicio, v_exp_fim;
  end if;

  if v_inicio < public.audax_minutos(v_alm_fim)
     and public.audax_minutos(v_alm_inicio) < v_fim then
    raise exception 'Horário bloqueado pelo almoço (% às %).', v_alm_inicio, v_alm_fim;
  end if;

  -- bloqueio do profissional (mesmo corte de data/intervalo da UI)
  select * into v_bloqueio
    from public.bloqueios b
   where b.profissional = v_nome_prof
     and b.data <= p_data
     and coalesce(b.data_fim, b.data) >= p_data
     and public.audax_minutos(b.inicio) < v_fim
     and v_inicio < public.audax_minutos(b.fim)
   limit 1;
  if found then
    raise exception 'Horário bloqueado: % (% às %).',
      (case v_bloqueio.tipo
        when 'almoco' then 'Almoço'
        when 'folga' then 'Folga'
        when 'ferias' then 'Férias'
        when 'ausencia' then 'Ausência'
        else 'Outro'
      end) || (case
        when coalesce(v_bloqueio.motivo, '') <> ''
        then ' — ' || v_bloqueio.motivo
        else ''
      end),
      v_bloqueio.inicio, v_bloqueio.fim;
  end if;

  -- conflito com OUTRO agendamento (ignorarId = p_id), mesma regra da UI
  if exists (
    select 1
      from public.agendamentos a
      left join public.servicos s on s.nome = a.servico
     where a.id <> p_id
       and a.profissional = v_nome_prof
       and a.data = p_data
       and a.status not in ('cancelado', 'nao_compareceu')
       and public.audax_minutos(a.horario) < v_fim
       and v_inicio < public.audax_minutos(a.horario)
             + greatest(coalesce(a.duracao_min, s.duracao_min, 30), 5)
  ) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
  end if;

  update public.agendamentos a
     set data = p_data,
         horario = p_horario,
         profissional = v_nome_prof,
         atualizado_em = now(),
         remarcacoes = coalesce(a.remarcacoes, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object(
             'de', jsonb_build_object(
               'data', to_char(v_ag.data, 'YYYY-MM-DD'),
               'horario', v_ag.horario,
               'profissional', v_ag.profissional
             ),
             'em', (extract(epoch from now()) * 1000)::bigint
           )
         )
   where a.id = v_ag.id
     and public.audax_digitos(a.telefone) = v_fone;
  if not found then
    raise exception 'Agendamento não encontrado.';
  end if;

  return json_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Privilégios: helper sem grant algum; as quatro funções SOMENTE service_role
-- (chave sb_secret_* da Edge Function). anon/authenticated/PUBLIC ficam sem
-- acesso — os dados de agendamento do cliente não são expostos à rede.
-- ----------------------------------------------------------------------------
revoke execute on function public.audax_digitos(text) from public, anon, authenticated;
revoke execute on function public.ia_cliente_por_telefone(text) from public, anon, authenticated;
revoke execute on function public.ia_agendamentos_do_telefone(text) from public, anon, authenticated;
revoke execute on function public.ia_agendamento_cancelar(text, text) from public, anon, authenticated;
revoke execute on function public.ia_agendamento_remarcar(text, text, date, text, text) from public, anon, authenticated;

grant execute on function public.ia_cliente_por_telefone(text) to service_role;
grant execute on function public.ia_agendamentos_do_telefone(text) to service_role;
grant execute on function public.ia_agendamento_cancelar(text, text) to service_role;
grant execute on function public.ia_agendamento_remarcar(text, text, date, text, text) to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
