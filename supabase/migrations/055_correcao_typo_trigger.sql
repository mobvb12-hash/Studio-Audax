-- ============================================================================
-- 055_correcao_typo_trigger.sql — `audax_hora_legible` → `audax_hora_legivel`
-- ============================================================================
--
-- O QUE ESTAVA QUEBRADO
--
-- A 045 reescreveu o trigger `ia_notificar_agendamento` e digitou
--
--     v_hora text := public.audax_hora_legible(v_ag.horario);   -- 045, linha 366
--
-- com "legible" (E). A função real, criada na 024, é
-- `audax_hora_legivel(text)` (I) — nenhum script do repositório cria a
-- variante com E.
--
-- POR QUE DERRUBAVA TUDO
--
-- O erro acontece na seção DECLARE, ANTES do bloco `begin ... exception when
-- others then ... end` do trigger — e erro de inicialização de variável NÃO é
-- pego por aquele handler (ele protege só o corpo). Resultado: desde a 045,
-- QUALQUER insert ou update em `agendamentos` falhava com
-- `42883: function public.audax_hora_legible(text) does not exist` — agenda
-- admin (upsert), Painel do cliente, vitrine e RPC pública, todos.
--
-- A 045 tenta engolir falhas do próprio trigger (loga em `ia_eventos` e
-- devolve a linha); o typo escapava desse contrato.
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Redefine `ia_notificar_agendamento()` com o corpo EXATO da 045 — mensagens
-- melhoradas, flags, fila `ia_notificar_com_seguranca`, pós-atendimento e
-- avaliação intactos — trocando só o nome da função no DECLARE. É
-- `create or replace` sem troca de assinatura: o trigger existente (024,
-- `before ... on agendamentos for each row`) continua apontando para a mesma
-- função e os grants atuais são preservados.
--
-- ============================================================================

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

-- PostgRest recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
