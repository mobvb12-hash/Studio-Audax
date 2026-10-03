-- ============================================================================
-- 037_confirmacao_whatsapp_publico.sql - o cliente recebe a confirmação no WhatsApp
-- ============================================================================
--
-- O QUE ESTAVA FALTANDO
--
-- O gatilho `agendamentos_notificar` notificava o CLIENTE só quando a origem
-- do agendamento era 'painel' (Área do Cliente). Quem marcava pelo
-- `/agendar` — a página que o próprio dono divulga no Instagram — ficava sem
-- confirmação nenhuma no celular, que é justamente de onde ele veio.
--
-- O QUE MUDA
--
--   • A confirmação ao cliente passa a valer para a origem 'publico' também,
--     com a MESMA porta tolerante a falha da 026: o agendamento já está
--     gravado quando esta função roda, então uma falha no WhatsApp NUNCA
--     desfaz a reserva — ela vira registro para reprocessamento.
--
--   • A mensagem ganha o que o cliente precisa para chegar lá: complemento,
--     endereço e o WhatsApp oficial da casa, todos lidos da configuração.
--     Campo vazio simplesmente não vira linha (nunca inventar endereço).
--
--   • O aviso ao PROFISSIONAL ganha a etiqueta "Agendamento online", para a
--     equipe saber de onde veio a reserva. A chave de deduplicação, o
--     pós-atendimento e a avaliação seguem intactos.
--
-- O QUE NÃO MUDA
--
--   • Nenhuma regra de Agenda, de preço, de Club ou de notificação.
--   • A chave de deduplicação continua sendo por agendamento
--     (`confirmacao_cliente:<id>`): uma reserva não recebe duas confirmações.
--   • A porta `ia_notificar_com_seguranca` é a mesma da 026 — não há um
--     caminho novo de notificação.
--
-- O CORPO ABAIXO É O DA 026 COM QUATRO MUDANÇAS PONTUAIS, verificáveis no
-- `supabase-schema.test.ts`: as duas variáveis novas, a etiqueta de origem, a
-- condição da confirmação e o texto da mensagem.
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
  -- Complementos e dados da casa, para a confirmação do agendamento público.
  v_complementos text := '';
  v_casa jsonb := '{}'::jsonb;
begin
  ---------------------------------------------------------------------------
  -- Notificação ao PROFISSIONAL (§11): só na criação — é exatamente quando o
  -- agendamento "está confirmado no servidor". Chave por agendamento.
  ---------------------------------------------------------------------------
  if tg_op = 'INSERT' and v_ag.status in ('pendente', 'confirmado') then
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
        '🔔 NOVO AGENDAMENTO',
        'Cliente: ' || coalesce(nullif(trim(v_ag.cliente), ''), '(não informado)'),
        'Serviço: ' || coalesce(nullif(trim(v_ag.servico), ''), '(não informado)'),
        'Data: ' || v_data,
        'Horário: ' || v_hora,
        'Profissional: ' || coalesce(nullif(trim(v_ag.profissional), ''), '(não informado)'),
        'Origem: ' || case v_ag.origem when 'painel' then 'Painel do Cliente'
                                        when 'publico' then 'Agendamento online'
                                        when 'whatsapp' then 'WhatsApp'
                                        else 'Agenda' end
      ),
      v_ag.id,
      coalesce(nullif(trim(v_prof.nome), ''), v_ag.profissional),
      1
    );
  end if;

  ---------------------------------------------------------------------------
  -- Confirmação ao CLIENTE (§13): só no canal que ainda não tinha uma — o
  -- Painel do Cliente. No WhatsApp a conversa já respondeu e no admin a equipe
  -- tem o botão manual.
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
    -- Complementos: o PRÓPRIO marcador que o sistema grava na observação
    -- ("[Complementos: Barba, Sobrancelha]"). Não há coluna nova e os dois
    -- caminhos de criação escrevem no mesmo formato.
    if v_ag.observacao ~ '\[Complementos:[^\]]*\]' then
      v_complementos := btrim(regexp_replace(
        (regexp_match(v_ag.observacao, '\[Complementos:([^\]]*)\]'))[1],
        '^\s+|\s+$', '', 'g'));
    end if;

    -- Dados da CASA, da configuração oficial. Campo vazio não vira linha:
    -- nunca inventar endereço nem telefone na mensagem.
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
        '✅ Agendamento confirmado!',
        'Studio Audax',
        'Cliente: ' || coalesce(nullif(trim(v_ag.cliente), ''), '(não informado)'),
        'Serviço: ' || coalesce(nullif(trim(v_ag.servico), ''), '(não informado)'),
        nullif('Complementos: ' || nullif(v_complementos, ''), 'Complementos: '),
        'Profissional: ' || coalesce(nullif(trim(v_ag.profissional), ''), '(não informado)'),
        'Data: ' || v_data,
        'Horário: ' || v_hora,
        nullif('Endereço: ' || nullif(btrim(coalesce(v_casa ->> 'endereco', '')), ''), 'Endereço: '),
        nullif('WhatsApp: ' || nullif(btrim(coalesce(v_casa ->> 'telefone', '')), ''), 'WhatsApp: ')
      ),
      v_ag.id,
      coalesce(nullif(trim(v_ag.cliente), ''), ''),
      1
    );
  end if;

  ---------------------------------------------------------------------------
  -- Pós-atendimento (§14) e avaliação (§15) — SÓ com status real 'concluido'.
  ---------------------------------------------------------------------------
  if tg_op = 'UPDATE'
     and v_ag.status = 'concluido'
     and coalesce(v_ant.status, '') is distinct from 'concluido' then

    v_pnome := public.audax_primeiro_nome(v_ag.cliente);

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

    -- link/mensagem de avaliação vêm da configuração oficial; ausência deles
    -- significa "não enviar", nunca "inventar endereço".
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
  ---------------------------------------------------------------------------
  -- Última barreira. O agendamento JÁ está gravado; registra-se o motivo para
  -- auditoria e DEVOLVE-SE o registro normalmente, sem abortar a transação.
  ---------------------------------------------------------------------------
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
    -- Auditoria é melhor-esforço: nunca vira bloqueio.
    null;
  end;

  return v_ag;
end;
$$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
