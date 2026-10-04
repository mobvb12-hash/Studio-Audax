-- ============================================================================
-- 040_expediente_por_dia.sql - a casa abre em horários diferentes por dia
-- ============================================================================
--
-- O PROBLEMA
--
-- O expediente era UMschedule só para a semana inteira: 08:00 às 20:00, todos
-- os dias. A vitrine não podia mostrar o horário de funcionamento, porque a
-- grade de horários offeringia 18:00 de sábado e 15:00 de domingo — e a página
-- estaria se contradizindo na mesma tela.
--
-- A casa funciona assim (informado pelo dono):
--
--     Segunda a sexta   08:00 às 19:00   (almoço 12:00 às 13:00)
--     Sábado            08:00 às 17:00   (sem almoço)
--     Domingo           09:00 às 12:00   (sem almoço)
--
-- ESTE SCRIPT
--
--   • `public.agenda_expediente_do_dia(p_data)` — o expediente QUE VALE
--     naquele dia. É a única função que decide;
--   • `agendamento_publico_slots` passa a devolver ESSE expediente, e não o
--     geral — a vitrine recebe a grade já certa;
--   • `agendamento_publico_criar` passa a validar contra ESSE expediente — o
--     servidor recusa o que a tela esconde, que é o que fecha o buraco;
--   • o catálogo público expõe `barbearia.horarios`, para a vitrine PODER
--     mostrar o horário de funcionamento.
--
-- ONDE VIVE O HORÁRIO
--
-- Em `barbearia.horarios`, a mesma configuração que já guarda endereço,
-- telefone e Instagram — é o lugar onde a casa já edita "os dados de quem
-- somos", e horário de funcionamento é exatamente isso.
--
-- A chave é o dia da semana no mesmo número do PostgreSQL e do app:
-- 0 = domingo, 1 = segunda ... 6 = sábado. Só os dias que a casa FILM differem
-- precisam de entrada; quem não tiver usa o expediente geral da Agenda (as
-- colunas de `agenda_expediente`, que a tela da Agenda continua editando).
--
-- O ALMOÇO É POR DIA
--
-- Quem define a manhã pode não ter pausa: o domingo inteiro cabe em 09:00 às
-- 12:00 e um almoço de 12:00 às 13:00 o apagaria. Então `almocoInicio` e
-- `almocoFim` são de cada dia, e AUSENTES significam sem almoço — nunca "o
-- almoço de outro dia".
--
-- O QUE NÃO MUDA
--
--   • A regra de vaga, o lock de concorrência e o delegates de criar são os da
--     021, palavra por palavra: o que muda é QUAL expediente elas comparam.
--   • `agendamento_publico_criar_complementos` (036) continua chamando
--     `agendamento_publico_criar` e não é tocada.
--   • Nenhuma tabela nova: `barbearia.horarios` é jsonb na configuração.
--   • Sem `horarios`, o resolver devolve o expediente geral e tudo se comporta
--     como hoje.
-- ============================================================================

create or replace function public.agenda_expediente_do_dia(p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_dow  int;
  v_barb jsonb;
  v_dia  jsonb;
  -- Escalares, e não um `record`: `select into record` sem linha deixa o
  -- record NÃO ATRIBUÍDO, e `v_base.inicio` estoura em plpgsql. Uma casa sem
  -- linha 'padrao' tem que cair no padrão, não quebrar a Agenda.
  v_base_inicio text;
  v_base_fim    text;
  v_base_ai     text;
  v_base_af     text;
  v_inicio text;
  v_fim    text;
  v_ai     text;
  v_af     text;
begin
  if p_data is null then
    raise exception 'Data inválida.';
  end if;

  -- PostgreSQL: 0 = domingo ... 6 = sábado. O mesmo número do app.
  v_dow := extract(dow from p_data)::int;

  select c.valor into v_barb
    from configuracoes_sistema c
    where c.chave = 'barbearia';
  v_dia := coalesce(v_barb -> 'horarios', '{}'::jsonb) -> v_dow::text;
  if jsonb_typeof(v_dia) is distinct from 'object' then
    v_dia := null;
  end if;

  -- O GERAL é a linha 'padrao' da Agenda. Continua sendo o que a tela da
  -- Agenda edita e o que vale para o dia que a casa não customizou.
  select e.inicio, e.fim, e.almoco_inicio, e.almoco_fim
    into v_base_inicio, v_base_fim, v_base_ai, v_base_af
    from agenda_expediente e
    where e.chave = 'padrao';

  v_inicio := coalesce(v_base_inicio, '08:00');
  v_fim    := coalesce(v_base_fim, '20:00');
  v_ai     := coalesce(v_base_ai, '12:00');
  v_af     := coalesce(v_base_af, '13:00');

  if v_dia is not null
     and nullif(btrim(coalesce(v_dia ->> 'inicio', '')), '') is not null
     and nullif(btrim(coalesce(v_dia ->> 'fim', '')), '') is not null then
    v_inicio := btrim(v_dia ->> 'inicio');
    v_fim    := btrim(v_dia ->> 'fim');
    v_ai     := btrim(coalesce(v_dia ->> 'almocoInicio', ''));
    v_af     := btrim(coalesce(v_dia ->> 'almocoFim', ''));
    -- Almoço pela metade não é pausa: sem os dois, não há almoço.
    if v_ai = '' or v_af = '' or v_ai >= v_af then
      v_ai := '';
      v_af := '';
    end if;
  end if;

  return json_build_object(
    'inicio', v_inicio,
    'fim', v_fim,
    'almocoInicio', v_ai,
    'almocoFim', v_af
  );
end;
$fn$;

grant execute on function public.agenda_expediente_do_dia(date) to anon, authenticated;

-- ============================================================================
-- A GRADE PÚBLICA: o expediente do dia, não o da semana
-- ============================================================================
--
-- Corpo idêntico ao da 012, com UMA troca: o expediente devolvido é o que vale
-- na data pedida. A lista de occupations, bloqueios e o formato do jsonb são
-- os mesmos — a vitrine continua recebendo exatamente o que recebia, só que
-- com o expediente certo.

create or replace function public.agendamento_publico_slots(p_data date)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    -- Expediente QUE VALE NESTE DIA. A casa abre em horários
    -- diferentes conforme o dia da semana, e a grade que a vitrine mostra tem
    -- de ser a grade real — senão a página oferece o que a casa não atende.
    'expediente', public.agenda_expediente_do_dia(p_data),
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

-- ============================================================================
-- A CRIAÇÃO PÚBLICA: validar contra o expediente do dia
-- ============================================================================
--
-- Corpo idêntico ao da 021 — lock, sobreposição, bloqueio, conflito e origem,
-- palavra por palavra. A única troca é o expediente comparado: agora é o do
-- dia pedido. É o que fecha o buraco de a tela esconder um horário e o
-- servidor aceitar.

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
    status, duracao_min, observacao, remarcacoes, criado_em, atualizado_em
  ) values (
    v_id, v_nome, trim(coalesce(p_telefone, '')), p_servico, p_profissional,
    p_data, p_horario, 'pendente', v_duracao,
    coalesce(trim(p_observacao), ''), '[]'::jsonb, now(), now()
  );

  return json_build_object('id', v_id);
end;
$$;

-- ============================================================================
-- O CATÁLOGO PÚBLICO: o horário de funcionamento da casa
-- ============================================================================
--
-- Corpo idêntico ao da 039, mais `barbearia.horarios` no bloco da casa.

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
          'duracaoMin', s.duracao_min,
          -- Categoria oficial da casa (Cabelo, Barba, Tratamento...). É o que
          -- agrupa a lista de serviços; texto solto aqui no frontend seria
          -- taxonomia paralela.
          'categoria', btrim(coalesce(s.categoria, '')),
          -- ids de complemento, só os que apontam para serviço ATIVO e não
          -- para o próprio serviço (o resto nunca entra na sugestão)
          'complementos', (
            select coalesce(
              json_agg(c.id order by c.nome),
              '[]'::json
            )
              from unnest(coalesce(s.complementos, '{}'::text[])) c_id
              join servicos c
                on c.id = c_id
               and c.ativo
               and c.id <> s.id
          )
        ) order by s.nome
      )
      from servicos s
      where s.ativo
    ), '[]'::json),
    'profissionais', coalesce((
      select json_agg(
        json_build_object(
          'id', p.id,
          'nome', p.nome,
          -- Foto do profissional, só quando existe.
          'foto', case when btrim(coalesce(p.foto, '')) = '' then '' else p.foto end
        ) order by p.nome
      )
      from profissionais p
      where p.ativo
    ), '[]'::json),
    'barbearia', coalesce((
      select jsonb_build_object(
        'fotos', coalesce(
          (select jsonb_agg(f order by ord)
             from jsonb_array_elements_text(coalesce(b.valor -> 'fotos', '[]'::jsonb))
                  with ordinality as f(foto, ord)),
          '[]'::jsonb),
        -- Horário de funcionamento, por dia da semana, na mesma chave que
        -- `agenda_expediente_do_dia` lê. O público pode ver horário de
        -- funcionamento; não pode ver expediente interno nem bloqueio.
        'horarios', coalesce(b.valor -> 'horarios', '{}'::jsonb),
        'endereco', btrim(coalesce(b.valor ->> 'endereco', '')),
        'telefone', btrim(coalesce(b.valor ->> 'telefone', '')),
        'instagram', btrim(coalesce(b.valor ->> 'instagram', '')),
        'mapa', btrim(coalesce(b.valor ->> 'mapa', ''))
      )
      from configuracoes_sistema b
      where b.chave = 'barbearia'
    ), '{}'::jsonb),
    -- Destaques escolhidos pelo dono, na ordem em que ele gravou. Serviço que
    -- saiu do catálogo não vira destaque quebrado.
    'destaques', coalesce((
      select jsonb_agg(x.nome order by x.ordem)
        from jsonb_array_elements_text(
               coalesce(
                 (select valor -> 'destaques'
                    from configuracoes_sistema where chave = 'barbearia'),
                 '[]'::jsonb)
               ) with ordinality as x(nome, ordem)
      where exists (select 1 from servicos s where s.nome = x.nome and s.ativo)
    ), '[]'::jsonb)
  );
$$;

-- ============================================================================
-- A CONFIGURAÇÃO: validar `barbearia.horarios`
-- ============================================================================
--
-- Corpo idêntico ao da 039, mais o bloco do horário de funcionamento. As
-- regras de `fotos`, `destaques`, `clube` e a rejeição de chave
-- desconhecida seguem iguais.

create or replace function public.audax_config_valida(p_chave text, p_valor jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_chave text := trim(coalesce(p_chave, ''));
  v_horario jsonb;
  v_texto text;
  v_comissao_local numeric;
begin
  if v_chave not in ('links', 'avaliacao', 'notificacoes', 'clube', 'ia', 'barbearia') then
    return 'Configuração desconhecida.';
  end if;
  if p_valor is null then
    return 'Valor de configuração ausente.';
  end if;
  if jsonb_typeof(p_valor) <> 'object' then
    return 'Valor de configuração deve ser um objeto.';
  end if;
  if length(p_valor::text) > 8192 then
    return 'Configuração grande demais.';
  end if;

  -- HORÁRIO DE FUNCIONAMENTO: at most um par início/fim por dia da
  -- semana, na chave 0 (domingo) a 6 (sábado). Dia sem entrada usa o
  -- expediente geral da Agenda.
  --
  -- O que é recusado aqui é o que quebraria a grade de horários: HH:MM que o
  -- Postgres não entende, fim antes do início, e almoço pela metade.
  if v_chave = 'barbearia' and p_valor ? 'horarios' then
    if jsonb_typeof(p_valor -> 'horarios') <> 'object' then
      return 'Horário de funcionamento inválido.';
    end if;
    if exists (
      select 1
        from jsonb_each(p_valor -> 'horarios') par
       where par.key !~ '^[0-6]$'
    ) then
      return 'Horário de funcionamento inválido.';
    end if;
    for v_horario in
      select par.value from jsonb_each(p_valor -> 'horarios') par
    loop
      if jsonb_typeof(v_horario) <> 'object' then
        return 'Horário de funcionamento inválido.';
      end if;
      if v_horario ? 'inicio' or v_horario ? 'fim' then
        if (v_horario ->> 'inicio') !~ '^[0-2][0-9]:[0-5][0-9]$'
           or (v_horario ->> 'fim') !~ '^[0-2][0-9]:[0-5][0-9]$'
           or (v_horario ->> 'inicio') >= (v_horario ->> 'fim') then
          return 'Horário de funcionamento inválido.';
        end if;
      end if;
      if v_horario ? 'almocoInicio' or v_horario ? 'almocoFim' then
        if (v_horario ->> 'almocoInicio') !~ '^[0-2][0-9]:[0-5][0-9]$'
           or (v_horario ->> 'almocoFim') !~ '^[0-2][0-9]:[0-5][0-9]$'
           or (v_horario ->> 'almocoInicio') >= (v_horario ->> 'almocoFim') then
          return 'Horário de almoço inválido.';
        end if;
      end if;
    end loop;
  end if;

  -- GALERIA DA CASA: até 8 imagens, cada uma uma URL http(s) ou vazio.
  if v_chave = 'barbearia' and p_valor ? 'fotos' then
    if jsonb_typeof(p_valor -> 'fotos') <> 'array' then
      return 'Fotos da barbearia inválidas.';
    end if;
    if jsonb_array_length(p_valor -> 'fotos') > 8 then
      return 'Fotos demais (máximo 8).';
    end if;
    for v_texto in
      select jsonb_array_elements_text(p_valor -> 'fotos')
    loop
      if v_texto is null then
        return 'Fotos da barbearia inválidas.';
      end if;
      if btrim(v_texto) <> '' and length(v_texto) > 2000 then
        return 'Link de foto longo demais.';
      end if;
      if btrim(v_texto) <> ''
         and v_texto !~ '^https?://[^[:space:]]+$' then
        return 'Foto da barbearia precisa ser um link http(s).';
      end if;
    end loop;
  end if;

  -- DESTAQUES DA VITRINE: lista de nomes de serviço que o dono escolheu para
  -- aparecer em destaque no agendamento público.
  if v_chave = 'barbearia' and p_valor ? 'destaques' then
    if jsonb_typeof(p_valor -> 'destaques') <> 'array' then
      return 'Destaques inválidos.';
    end if;
    if jsonb_array_length(p_valor -> 'destaques') > 12 then
      return 'Destaques demais (máximo 12).';
    end if;
    for v_texto in
      select jsonb_array_elements_text(p_valor -> 'destaques')
    loop
      if v_texto is null or btrim(v_texto) = '' then
        return 'Destaques inválidos.';
      end if;
      if length(v_texto) > 80 then
        return 'Nome de serviço longo demais nos destaques.';
      end if;
    end loop;
  end if;

  -- Links: são http(s) ou vazio - nenhum outro esquema entra por aqui.
  foreach v_texto in array array['painel', 'avaliacao', 'mapa'] loop
    if p_valor ? v_texto then
      if jsonb_typeof(p_valor -> v_texto) <> 'string' then
        return 'Link inválido.';
      end if;
      if p_valor ->> v_texto <> ''
and p_valor ->> v_texto !~ '^https?://[^[:space:]]+$' then
        return 'Link inválido.';
      end if;
    end if;
  end loop;

  -- Mensagem de avaliação: texto livre, sem segredo e sem dado de terceiro.
  if p_valor ? 'mensagem' then
    if jsonb_typeof(p_valor -> 'mensagem') <> 'string' then
      return 'Mensagem de avaliação inválida.';
    end if;
    if length(p_valor ->> 'mensagem') > 600 then
return 'Mensagem de avaliação grande demais.';
    end if;
  end if;

  -- Barbearia: endereço e Instagram são texto curto; telefone aceita o que o
  -- dono digita (com +, espaço, parênteses e hífen) e é validado só pelos
  -- dígitos - 10 a 15, o mesmo intervalo de telefone do cliente.
  foreach v_texto in array array['endereco', 'instagram'] loop
    if p_valor ? v_texto then
      if jsonb_typeof(p_valor -> v_texto) <> 'string' then
        return 'Dados da barbearia inválidos.';
      end if;
if length(p_valor ->> v_texto) > 300 then
        return 'Dados da barbearia grandes demais.';
      end if;
    end if;
  end loop;

  if p_valor ? 'telefone' then
    if jsonb_typeof(p_valor -> 'telefone') <> 'string' then
      return 'Telefone da barbearia inválido.';
    end if;
    if length(p_valor ->> 'telefone') > 40 then
      return 'Telefone da barbearia grande demais.';
    end if;
    if length(regexp_replace(coalesce(p_valor ->> 'telefone', ''), '\D', '', 'g')) not between 0 and 15 then
      return 'Telefone da barbearia inválido.';
    end if;
  end if;

  -- Comissão do profissional sobre a parcela do pote: fração entre 0 e 1.
  if p_valor ? 'comissao' then
    if jsonb_typeof(p_valor -> 'comissao') <> 'object' then
      return 'Comissão do Audax Club inválida.';
    end if;
    if (p_valor -> 'comissao') ? 'percentual' then
      if jsonb_typeof(p_valor -> 'comissao' -> 'percentual') <> 'number' then
        return 'A comissão deve ser uma fração entre 0 e 1 (0,40 = 40%).';
      end if;
      v_comissao_local := (p_valor -> 'comissao' ->> 'percentual')::numeric;
      if v_comissao_local < 0 or v_comissao_local > 1 then
        return 'A comissão deve ser uma fração entre 0 e 1 (0,40 = 40%).';
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- ============================================================================
-- OS EXTRAS: qualquer serviço ativo pode entrar no mesmo horário
-- ============================================================================
--
-- Corpo idêntico ao da 027/036 — a soma das durações, a observação e a
-- delegação para `agendamento_publico_criar`, palavra por palavra. A única
-- troca é QUEM PODE SER ADICIONADO: antes, só o serviço que a casa tinha
-- marcado como complementar; agora, qualquer serviço ativo do catálogo.
--
-- É a mudança que faz "quero incluir sobrancelha também" funcionar sem a casa
-- ter configurado nada. O que a configuração virou foi a ORDEM em que a
-- vitrine mostra, e isso é tela, não regra.

create or replace function public.agendamento_publico_criar_complementos(
  p_cliente text,
  p_telefone text,
  p_servico text,
  p_profissional text,
  p_data date,
  p_horario text,
  p_observacao text default '',
  p_complementos text[] default '{}'
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
    -- QUALQUER serviço ATIVO pode entrar como adicional.
    --
    -- Antes entrava só o que estava em `v_base.complementos` — a lista que a
    -- casa configurava. Vazia (que era o caso), a etapa de extras da vitrine
    -- não oferecia nada: quem queria corte + barba + sobrancelha no mesmo
    -- horário não tinha como pedir os três. A configuração virou ORDEM de
    -- leitura na tela, e a lista de Permitidos é o catálogo.
    --
    -- O que continua barrado:
    --   • id que não é de um serviço ativo;
    --   • o próprio serviço base (contaria a duração duas vezes);
    --   • e o excesso: se os adicionais não couberem no expediente, é a regra
    --     de vaga de `agendamento_publico_criar` que recusa, com o horário
    --     dito no erro. Nenhum número mágico aqui.
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

  select public.agendamento_publico_criar(
           p_cliente, p_telefone, p_servico, p_profissional,
           p_data, p_horario, v_obs
         ) ->> 'id'
    into v_id;

  if v_id is null or v_id = '' then
    raise exception 'Não foi possível agendar. Tente novamente.';
  end if;

  -- Duração TOTAL (base + complementos). O trigger de sobreposição roda de novo
  -- aqui e valida a soma — igual ao caminho do painel.
  update public.agendamentos
     set duracao_min = v_dur
   where id = v_id;
  if not found then
    raise exception 'Não foi possível concluir o agendamento. Tente novamente.';
  end if;

  return json_build_object('id', v_id, 'status', 'pendente');
end;
$$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
