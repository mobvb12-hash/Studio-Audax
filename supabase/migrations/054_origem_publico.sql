-- ============================================================================
-- 054_origem_publico.sql — a reserva da vitrine volta a ser `origem = 'publico'`
-- ============================================================================
--
-- O QUE ERA
--
-- A 036 marcou a reserva feita pela tela pública com `origem = 'publico'` no
-- MESMO update que gravava o contato — e deixou isso explícito:
--
--     "`origem = 'publico'` é o que separa a reserva de CLIENTE da reserva
--      feita pela equipe"
--
-- É essa marca que o trigger de confirmação (045) usa: notifica o CLIENTE
-- quando `origem in ('painel','publico')` e o PROFISSIONAL em qualquer INSERT
-- com status pendente/confirmado.
--
-- O QUE ACONTECEU
--
-- A 044 reescreveu o wrapper `agendamento_publico_criar_complementos` a partir
-- de uma base da 027 (anterior à 036) e o update dela ficou só com
-- `duracao_min` + `dados`. A 045 copiou o corpo da 044. Resultado: desde a
-- 044, toda reserva da vitrine nasce com `origem = 'agenda'` (padrão da
-- coluna) e o trigger NÃO envia a confirmação ao cliente — o profissional
-- recebe, o cliente não.
--
-- O QUE ESTE ARQUIVO FAZ
--
-- Redefine o wrapper com o corpo IMPLANTADO (045) palavra por palavra, com
-- UMA diferença: o update volta a setar `origem = 'publico'`. Nada mais muda:
-- assinatura, grants, retorno `'status': 'confirmado'` e delegação para a
-- autoridade continuam idênticos (sem drop — a assinatura já é a mesma, então
-- não há risco de perder grant).
--
-- ============================================================================

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

  -- 054: `origem = 'publico'` de volta — sem ela o trigger da 045 não
  -- confirma ao cliente e a reserva vira "da equipe" por engano.
  update public.agendamentos
     set duracao_min = v_dur,
         origem = 'publico',
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

-- Mesma assinatura da 044/045 (10 parâmetros): o grant existente já serve;
-- reafirmado por segurança caso algum replay tenha deixado só o de 7.
grant execute on function public.agendamento_publico_criar_complementos(
  text, text, text, text, date, text, text, text[], text, text
) to anon, authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
