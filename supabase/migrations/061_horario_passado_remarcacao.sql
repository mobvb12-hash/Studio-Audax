-- ============================================================
-- 061_horario_passado_remarcacao.sql — remarcar também não aceita horário que já passou
-- ============================================================
--
-- REGRA DE NEGÓCIO
--
-- Remarcar para um horário do dia que JÁ PASSOU é um agendamento que não
-- pode ser honrado. Com "agora" às 15:00, mudar um atendimento de hoje para
-- as 12:00 não é remarcação: é gravar no banco algo que já não acontece.
--
-- POR QUE ESTA MIGRATION EXISTE (o gap)
--
-- A criação tem UMAS autoridade só e ela já barra isso desde a 053:
--   `agendamento_publico_criar` (053) → "Este horário já passou."
-- A remarcação, não:
--   `ia_agendamento_remarcar` (015) valida data (>= hoje), formato,
--   expediente, almoço, bloqueio e conflito — mas NUNCA o horário de hoje.
--
-- Resultado: o MESMO cliente, no MESMO dia, não consegue CRIAR um horário
-- que já passou, mas consegue REMARCAR um agendamento para ele. Os dois
-- caminhos são o Painel do cliente (`painel_agendamento_remarsar`, 019) e o
-- WhatsApp (`ia_agendamento_remarcar` chamado com a chave `sb_secret_*` da
-- Edge Function, service_role) — nenhum dos dois passa pela UI da vitrine,
-- que é a única com corte de corte no cliente (`regras.ts`).
--
-- PROTEÇÃO CONTRA CHAMADA DIRETA AO BANCO
--
-- A 015 existe justamente para que o servidor valide sem confiar na tela.
-- Sem este corte, quem chamar a RPC por fora (Painel, webhook, ou um client
-- PostgREST com a chave secreta) ignora qualquer validação de horário do
-- frontend. O corte aqui fecha os DOIS caminhos com UMA regra, do mesmo
-- jeito que a 053 fez para a criação.
--
-- O CORTE (espelha a 053, com a fuso já usada pela própria 015)
--
--   • hoje e "agora" em `America/Recife` — o MESMO fuso do teste de data
--     desta função (linha 206 da 015). Recife e São Paulo estão ambas em
--     UTC-3 sem horário de verão desde 2019, então é o mesmo instante do
--     `America/Sao_Paulo` da 053 e do `agoraStudio()` da UI;
--   • `p_data = hoje AND horário <= agora` → recusa, logo após a validação
--     de formato e antes de qualquer leitura/escrita;
--   • a frase é idêntica à da 053 e à que a tela mostra.
--
-- COLOCAÇÃO DO CORTE (depois do "nada mudou")
--
-- O "nada mudou → nada grava" (json `{igual: true}`) NÃO é uma remarcação:
-- não altera linha nenhuma. Deixá-lo ANTES do corte evita que um pedido sem
-- efeito sobre um horário já decorrido vire erro — a UI do Painel devolve o
-- agendamento igual, sem mensagem. O corte vale para Toda mudança real de
-- data/horário/profissional, que é o que tem consequência.
--
-- O QUE NÃO MUDA
--
--   • Assinatura idêntica (5 argumentos): 019 e o webhook chamam com cinco —
--     assinatura nova criaria DUAS e a chamada ficaria ambígua;
--   • grants idênticos: SOMENTE service_role (o Painel entra pela 019, que
--     é `security definer` e chama esta função);
--   • nenhuma tabela, política ou trigger nova; nenhum dado histórico é
--     tocado — a migration só muda o que a PRÓXIMA remarcação aceita;
--   • a Agenda interna (admin) continua com as MESMAS regras de sempre:
--     `validarProposta` (`regras.ts`) não tem corte de horário passado e
--     esta função não é usada por lá — editar o registro de um atendimento
--     que já aconteceu segue permitido para a equipe, como sempre foi;
--   • datas futuras não mudam nada.
--
-- ============================================================

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
  v_hoje date := (now() at time zone 'America/Recife')::date;
  v_agora_minutos integer;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{6,64}$' then
    raise exception 'Identificador inválido.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Telefone inválido.';
  end if;
  if p_data is null or p_data < v_hoje then
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

  -- Dia de hoje: o NOVO horário tem que começar DEPOIS de agora — a MESMA
  -- recusa da 053, para o MESMO dia, nos DOIS caminhos de remarcação
  -- (Painel 019 e WhatsApp/service_role). Checa depois do "nada mudou",
  -- porque só uma mudança real de data/horário/profissional precisa dele.
  v_agora_minutos := (extract(hour from now() at time zone 'America/Recife')::integer * 60)
                     + extract(minute from now() at time zone 'America/Recife')::integer;
  if p_data = v_hoje
     and public.audax_minutos(p_horario) <= v_agora_minutos then
    raise exception 'Este horário já passou. Escolha um horário futuro.';
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

-- Assinatura igual: os grants da 015 continuam válidos; reafirmados por
-- segurança. anon/authenticated/PUBLIC continuam sem acesso algum — quem
-- é cliente entra pela 019 (painel) e o WhatsApp entra pela chave secreta.
revoke execute on function public.ia_agendamento_remarcar(text, text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.ia_agendamento_remarcar(text, text, date, text, text)
  to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
