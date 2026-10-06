-- ============================================================================
-- 044 — e-mail e data de nascimento no agendamento público da vitrine
-- ============================================================================
--
-- O QUE MUDA
--
-- A etapa "Dados" do /agendar passou a pedir e-mail e data de nascimento ao
-- lado do nome e do telefone que já existiam. A criação do agendamento não
-- tinha para onde levá-los: `agendamentos` não tem coluna de e-mail nem de
-- nascimento, e a RPC só recebia cliente, telefone, serviço, profissional,
-- data, horário, observação e complementos.
--
-- ONDE GRAVA (e o que NÃO faz)
--
--   • `agendamentos.dados` — o jsonb que a própria 007 descreve como
--     "opcional: o app grava coluna a coluna". NENHUMA alter table, nenhuma
--     coluna nova, nenhum dado apagado, nenhuma regra financeira tocada.
--   • Só o WRAPPER `agendamento_publico_criar_complementos` muda de
--     assinatura. `agendamento_publico_criar` continua sendo a mesma das
--     021/040 — é ela quem valida expediente, conflito e lock, e é ela que
--     019 (painel), 024 (notificações), 027 e 036 continuam chamando.
--
-- POR QUE EXISTE UM `drop function`
--
-- Postgres identifica função por (nome, tipos dos parâmetros): criar uma versão
-- com dois parâmetros a mais seria UMA SEGUNDA FUNÇÃO (sobrecarga), e a
-- chamada de sete argumentos passaria a ser ambígua — "function is not
-- unique". O drop da assinatura antiga é o que mantém uma função só; ele é
-- idempotente (`if exists`) e morre junto com os grants, por isso o grant é
-- refeto logo abaixo.
--
-- VALIDAÇÃO: o servidor não fica mais rígido que a tela
--
-- E-mail e nascimento são validados SÓ quando vêm preenchidos. Quem continua
-- chamando sem eles — `painel_agendamento_criar` (019) e a IA/WhatsApp — é
-- aceito exatamente como antes. Obrigatório é regra da TELA da vitrine.
--
-- Pode correr duas vezes.

drop function if exists public.agendamento_publico_criar_complementos(
  text, text, text, text, date, text, text, text[]
);

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
  v_nasc text := '';
begin
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  if trim(coalesce(p_nascimento, '')) <> '' then
    v_nasc := public.audax_nascimento_iso(p_nascimento);
    -- Comparação como TEXTO ISO: mesmo comprimento, a ordem lexicográfica é a
    -- cronológica — e assim nenhum cast quebra com uma data maluca.
    if v_nasc = '' or v_nasc > to_char(current_date, 'YYYY-MM-DD') then
      raise exception 'Informe uma data de nascimento válida.';
    end if;
  end if;

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
    -- QUALQUER serviço ATIVO pode entrar como adicional (regra da 040: a
    -- configuração `servicos.complementos` virou ordem de leitura na tela).
    -- O que continua barrado: id que não é serviço ativo, o próprio base e o
    -- excesso — este último pela regra de vaga de `agendamento_publico_criar`,
    -- com o horário dito no erro.
    select * into v_compl
      from public.servicos
     where id = trim(v_item)
       and ativo;
    if not found or v_compl.id = v_base.id then
      raise exception 'Complemento indisponível para este serviço.';
    end if;
    v_dur := v_dur + coalesce(v_compl.duracao_min, 0);
    v_nomes := v_nomes || v_compl.nome;
  end loop;

  if cardinality(v_nomes) > 0 then
    v_obs := case when v_obs = '' then '' else v_obs || ' | ' end
             || '[Complementos: ' || array_to_string(v_nomes, ', ') || ']';
  end if;

  -- A criação é a MESMA de sempre (lock, expediente, conflito). Só depois o
  -- resultado ganha os dois dados de contato, na MESMA transação: se o update
  -- falhar, a criação inteira desfaz e ninguém fica com agendamento órfão.
  select public.agendamento_publico_criar(
           p_cliente, p_telefone, p_servico, p_profissional,
           p_data, p_horario, v_obs
         ) ->> 'id'
    into v_id;

  if v_id is null or v_id = '' then
    raise exception 'Não foi possível agendar. Tente novamente.';
  end if;

  -- Duração TOTAL (base + complementos) + os dados do cliente. O trigger de
  -- sobreposição roda de novo aqui e valida a soma — igual ao caminho do painel.
  update public.agendamentos
     set duracao_min = v_dur,
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

  return json_build_object('id', v_id, 'status', 'pendente');
end;
$$;

-- O drop levou os grants junto: sem este grant a vitrine não consegue mais
-- chamar a função (e o painel/IA continuam pelo caminho de sempre).
grant execute on function public.agendamento_publico_criar_complementos(
  text, text, text, text, date, text, text, text[], text, text
) to anon, authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício: a assinatura nova é a que
-- vale na hora, sem esperar o próximo deploy.
notify pgrst, 'reload schema';
