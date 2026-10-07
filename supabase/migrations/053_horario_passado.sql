-- ============================================================================
-- 053_horario_passado.sql — no dia de hoje, só horário que ainda não passou
-- ============================================================================
--
-- REGRA DE NEGÓCIO
--
-- O /agendar não pode oferecer (nem aceitar) horário do dia que já passou:
-- com "agora" às 12:00, o slot das 12:00 não é mais agendável e o das 12:30
-- continua sendo. Datas futuras não mudam nada.
--
-- POR QUE NO SERVIDOR
--
-- `anon` tem GRANT direto em `agendamento_publico_criar`: filtrar só a tela
-- protege quem usa a tela, não protege a RPC chamada por fora. Esta função é
-- a AUTORIDADE de criação (012 → 021 → 040 → 045), usada por delegação pelo
-- wrapper público (027/036/044) e pelo painel do cliente (019) — a recusa
-- aqui cobre todos os caminhos com UMA regra.
--
-- POR QUE O CORPO É O DA 040
--
-- A 045 redefiniu `agendamento_publico_criar` com um corpo VELHO (linhagem da
-- 012/019): pedia `agenda_expediente.dia_semana/ativo`, colunas que nunca
-- existiram na tabela (007: chave/inicio/fim/almoco_*), então TODA criação
-- pública e do painel falhava com `column "dia_semana" does not exist`. Também
-- perdia o lock da 021 (`agenda_lock_slot`), a sobreposição por DURAÇÃO, o
-- expediente por dia da 040 e a checagem de profissional ativo.
--
-- Este script refaz a autoridade sobre o corpo FUNCIONAL da 040 (o último que
-- rodou de verdade), mantendo as DUAS regras que a 045 trouxe de verdade:
--
--   • o agendamento nasce 'confirmado' (confirmação automática);
--   • e acrescenta o corte de horário passado abaixo.
--
-- O CORTE
--
--   • hoje e "agora" em America/Sao_Paulo (a 045 usava `current_date` em UTC:
--     na virada, o "hoje" saía errado);
--   • `p_data = hoje AND horário <= agora` recusa, logo após validar o
--     formato e antes de qualquer leitura/escrita;
--   • a frase é a mesma que a tela mostra.
--
-- O QUE NÃO MUDA
--
--   • Assinatura idêntica (7 argumentos): 019/024/027/036/044 chamam com
--     sete — assinatura nova criaria DUAS e a chamada ficaria ambígua.
--   • Nenhuma tabela, política ou trigger nova.
--
-- ============================================================================

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
  v_cliente_id text;
  v_data_atual date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora_minutos integer;
begin
  -- Quem está LOGADO quando agenda: a linha é dele, e é isso que faz o
  -- agendamento aparecer em "Meus agendamentos" (policy
  -- `agendamentos_select_proprio` da 018 compara `cliente_id`).
  --
  -- Sem sessão — que é o caso normal da vitrine — dá `null` e nada muda: o
  -- agendamento entra na MESMA `agendamentos`, com o mesmo nome e telefone de
  -- sempre, só sem vínculo. Sessão sem cadastro vinculado também dá `null`;
  -- quem acabou de criar a conta já chega com o cadastro ligado pela 018.
  v_cliente_id := case
    when auth.uid() is not null then public.current_cliente_id()
    else null
  end;

  if length(v_nome) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  if p_data is null or p_data < v_data_atual then
    raise exception 'Escolha uma data a partir de hoje.';
  end if;
  if p_horario is null or p_horario !~ '^[0-9]{1,2}:[0-9]{2}$' then
    raise exception 'Horário inválido.';
  end if;

  -- Dia de hoje: o atendimento tem que começar DEPOIS de agora.
  v_agora_minutos := (extract(hour from now() at time zone 'America/Sao_Paulo')::integer * 60)
                     + extract(minute from now() at time zone 'America/Sao_Paulo')::integer;
  if p_data = v_data_atual
     and public.audax_minutos(p_horario) <= v_agora_minutos then
    raise exception 'Este horário já passou. Escolha um horário futuro.';
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

  -- Expediente QUE VALE NA DATA PEDIDA (ver `agenda_expediente_do_dia`).
  -- O servidor valida contra o mesmo expediente que a vitrine usou para
  -- esconder o horário: é o que impede o pedido na mão de criar o que a
  -- tela não ofereceu.
  --
  -- `jsonb_to_record` e não `from public.agenda_expediente_do_dia(...)`: uma
  -- função que devolve jsonb, posto no FROM, vira uma coluna só — `d.inicio`
  -- não existiria.
  select
      d.inicio, d.fim, d.almoco_inicio, d.almoco_fim
    into v_exp_inicio, v_exp_fim, v_alm_inicio, v_alm_fim
    from jsonb_to_record(public.agenda_expediente_do_dia(p_data))
      as d(inicio text, fim text, almoco_inicio text, almoco_fim text);

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
    status, duracao_min, observacao, remarcacoes, criado_em, atualizado_em,
    cliente_id
  ) values (
    v_id, v_nome, trim(coalesce(p_telefone, '')), p_servico, p_profissional,
    p_data, p_horario, 'confirmado', v_duracao,
    coalesce(trim(p_observacao), ''), '[]'::jsonb, now(), now(),
    v_cliente_id
  );

  return json_build_object('id', v_id);
end;
$$;

-- Assinatura igual: grants da 045 continuam válidos; reafirmado por segurança.
grant execute on function public.agendamento_publico_criar(
  text, text, text, text, date, text, text
) to anon, authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
