-- ============================================================================
-- 026_notificacao_agendamento_seguro.sql — corrige a falha que impedia o
-- agendamento público e garante que notificação NUNCA derrube a reserva
-- ----------------------------------------------------------------------------
-- CAUSA RAIZ (erro de produção)
--   `function public.ia_notificacao_enfileirar(text, unknown, text, text,
--    text, text, integer) does not exist`
--
--   A 024 declarou `p_ordem smallint` e o trigger `ia_notificar_agendamento`
--   chama a função com o LITERAL `1` (tipo `integer`). No PostgreSQL a
--   conversão `int4 -> int2` é cast de ATRIBUIÇÃO (`castcontext = 'a'`), e a
--   resolução de funções só aceita casts IMPLÍCITOS (`'i'`). Não havendo
--   candidato compatível, o Postgres não encontra a função.
--
--   O agravante: `agendamentos_notificar` é AFTER INSERT e chamava a função
--   de enfileiramento DIRETAMENTE. A exceção "does not exist" subia do trigger
--   e abortava a transação — o INSERT do agendamento era desfeito e o cliente
--   recebia a mensagem de que nada tinha sido criado. Isto viola a regra
--   "a falha de uma notificação NUNCA pode impedir a criação de um
--   agendamento válido".
--
-- O QUE ESTA MIGRATION FAZ
--   1. Troca a assinatura de `p_ordem` para `integer`, compatível com o
--      literal e com o resto do sistema (a coluna `ordem` segue `smallint`;
--      INSERT usa cast de atribuição, que é permitido).
--      `create or replace` não altera tipo de parâmetro, então a assinatura
--      antiga é removida antes — sem deixar sobrecarga duplicada.
--   2. Cria `ia_notificar_com_seguranca`: porta ÚNICA e tolerante a falha.
--      Nunca levanta exceção; quando algo falha, grava a linha na fila com
--      status 'falha' (reprocessável) e o motivo.
--   3. Reescreve o trigger para usar essa porta e envolve o corpo inteiro num
--      blok de exceção — qualquer erro residual vira registro de auditoria e
--      o agendamento segue gravado.
--
-- Garanteias preservadas
--   • O agendamento é gravado ANTES de qualquer tentativa de notificação; a
--     fila é escrita dentro da mesma transação, mas nunca a derruba.
--   • Idempotência: chave única por agendamento+evento (`on conflict ... do
--     nothing`), então reprocessar não duplica.
--   • Reprocessamento: `ia_notificacoes_reprocessar()` devolve 'falha' para
--     'pendente'.
--   • Nenhuma policy, nenhuma tabela e nenhuma regra comercial é alterada.
--   • Nenhuma migration anterior é editada ou removida.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Assinatura correta — `p_ordem integer` (compatível com o literal)
-- ----------------------------------------------------------------------------
drop function if exists public.ia_notificacao_enfileirar(
  text, text, text, text, text, text, smallint
);

create or replace function public.ia_notificacao_enfileirar(
  p_chave text,
  p_tipo text,
  p_destino text,
  p_mensagem text,
  p_agendamento_id text default '',
  p_destino_rotulo text default '',
  p_ordem integer default 1
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
-- 2) Porta tolerante a falha — a ÚNICA que o trigger usa
--
--    Contrato:
--      • devolve true  = notificação enfileirada (ou já existia);
--      • devolve false = desligada por configuração OU falhou. Nos dois casos o
--        AGENDAMENTO NÃO É AFETADO;
--      • NUNCA levanta exceção.
--
--    Quando falha, a intenção é gravada na fila com status 'falha' e o motivo,
--    de modo que `ia_notificacoes_reprocessar()` consiga reenviar depois. O
--    `on conflict ... do nothing` garante que uma notificação já enfileirada
--    (possivelmente já enviada) nunca seja rebaixada para 'falha' — assim
--    reprocessar não duplica nada.
-- ----------------------------------------------------------------------------
create or replace function public.ia_notificar_com_seguranca(
  p_chave text,
  p_tipo text,
  p_chave_config text,
  p_campo_config text,
  p_destino text,
  p_mensagem text,
  p_agendamento_id text default '',
  p_destino_rotulo text default '',
  p_ordem integer default 1
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ativo boolean := true;
  v_erro text := '';
begin
  begin
    -- chave desligada é decisão de configuração, não é falha
    if coalesce(trim(p_chave_config), '') <> '' then
      v_ativo := public.ia_flag_chave(p_chave_config, p_campo_config);
    end if;
    if not v_ativo then
      return false;
    end if;

    perform public.ia_notificacao_enfileirar(
      p_chave, p_tipo, p_destino, p_mensagem,
      p_agendamento_id, p_destino_rotulo, p_ordem
    );
    return true;
  exception when others then
    v_erro := left(coalesce(sqlerrm, 'erro'), 250);
  end;

  -- Falhou: registra para reprocessamento. O agendamento já está salvo.
  begin
    insert into public.ia_notificacoes (
      id, chave, tipo, agendamento_id, destino, destino_rotulo, mensagem,
      ordem, status, ultimo_erro
    )
    values (
      gen_random_uuid()::text,
      left(coalesce(nullif(trim(p_chave), ''), 'sem-chave'), 160),
      case
        when p_tipo in ('confirmacao_cliente', 'notificacao_profissional', 'pos_atendimento', 'avaliacao')
          then p_tipo
        else 'confirmacao_cliente'
      end,
      nullif(trim(coalesce(p_agendamento_id, '')), ''),
      '',
      left(trim(coalesce(p_destino_rotulo, '')), 80),
      left(coalesce(nullif(trim(p_mensagem), ''), '(mensagem indisponível)'), 4096),
      coalesce(p_ordem, 1),
      'falha',
      left('falha ao enfileirar: ' || v_erro, 300)
    )
    on conflict (chave) do nothing;
  exception when others then
    -- Nem a auditoria da fila pôde ser gravada. O agendamento continua
    -- válido — esta é a última barreira e ela NÃO propaga erro.
    return false;
  end;

  return false;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Trigger tolerante a falha
--
--    O agendamento JÁ está gravado quando este AFTER trigger roda. Portanto
--    aqui nunca se aborta a transação: tudo passa pela porta segura e o que
--    sobrar vira registro de auditoria.
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
  v_link text := '';
  v_msg_av text := '';
  v_pnome text := '';
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
    tg_op = 'INSERT' and v_ag.origem = 'painel' and v_ag.status in ('pendente', 'confirmado')
  )
  or (
    tg_op = 'UPDATE' and v_ag.origem = 'painel'
    and coalesce(v_ant.origem, '') is distinct from 'painel'
    and v_ag.status in ('pendente', 'confirmado')
  ) then
    perform public.ia_notificar_com_seguranca(
      'confirmacao_cliente:' || v_ag.id,
      'confirmacao_cliente',
      'notificacoes',
      'confirmacaoCliente',
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

-- ----------------------------------------------------------------------------
-- 4) Privilégios das funções novas
-- ----------------------------------------------------------------------------
revoke execute on function public.ia_notificacao_enfileirar(text, text, text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.ia_notificar_com_seguranca(text, text, text, text, text, text, text, text, integer) from public, anon, authenticated;

grant execute on function public.ia_notificacao_enfileirar(text, text, text, text, text, text, integer) to service_role;
grant execute on function public.ia_notificar_com_seguranca(text, text, text, text, text, text, text, text, integer) to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';