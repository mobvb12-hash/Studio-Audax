-- ============================================================================
-- 027_barbearia_e_complementos_publicos.sql
--
-- Duas Evolutionary additions, sem criar regra nova de agenda:
--
-- 1) DADOS DA BARBEARIA (endereço, telefone/WhatsApp, Instagram, mapa) como
--    CONFIGURAÇÃO OFICIAL editável, lida junto do catálogo público.
--    Hoje `configuracoes_sistema` (022) só tem `links`, `avaliacao`,
--    `notificacoes`, `clube` e `ia` — endereço, telefone e Instagram da casa
--    não existiam em lugar nenhum do sistema, e a IA respondia
--    "não disponível no sistema" (ia.ts fixava `endereco: null`).
--    Aqui eles viram dado oficial, editável pela tela de Configurações, lido
--    pelo MESMO endpoint público que já devolve o catálogo — sem nova RPC, sem
--    nova granting, sem segredo no frontend.
--
--    O TELEFONE nasce VAZIO de propósito: o número oficial vive atrás do
--    secret EVOLUTION_INSTANCE e não está em nenhuma migration, config ou
--    arquivo deste repositório. Inventar um número seria publicar um telefone
--    falso em nome da casa. Vazio = a interface simplesmente não mostra o
--    botão de WhatsApp até alguém cadastrar o número true em Configurações.
--
-- 2) AGENDAMENTO PÚBLICO COM COMPLEMENTOS, reaproveitando a regra oficial.
--    `painel_agendamento_criar` (019) já resolve complementos contra a coluna
--    oficial `servicos.complementos`, soma a duração e delega a criação para
--    `agendamento_publico_criar` (021), que continua sendo a ÚNICA autoridade
--    sobre expediente, almoço, bloqueio, lock e conflito. Esta função é a
--    mesma ideia sem `auth.uid()`: valida os MESMOS complementos, com o MESMO
--    rigor, e chama a MESMA criação. Nenhuma regra de disponibilidade é
--    reescrita aqui.
--
-- Nenhuma policy, trigger, tabela de agenda ou migration anterior é alterada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Configuração oficial da barbearia
--
--    `endereco` e `instagram` foram informados pelo dono do Studio Audax.
--    `telefone` fica vazio de propósito (ver cabeçalho) — preencher em
--    Configurações → Barbearia. `on conflict do nothing`: uma edição feita
--    pelo admin NUNCA é sobrescrita por esta migration.
-- ----------------------------------------------------------------------------
insert into public.configuracoes_sistema (chave, grupo, valor, descricao)
values (
  'barbearia',
  'barbearia',
  '{"endereco":"Rua Ecoporanga, 60 - Ibura de Baixo - Recife/PE","telefone":"","instagram":"@studioaudax__","mapa":""}'::jsonb,
  'Dados oficiais da casa: endereço, telefone/WhatsApp, Instagram e link de mapa.'
)
on conflict (chave) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Validação da nova chave
--
--    Mesma função, lista branca ampliada em UMA chave. Telefone e Instagram
--    aceitam o formato que o dono digita; nada de URL exótica entra.
-- ----------------------------------------------------------------------------
create or replace function public.audax_config_valida(p_chave text, p_valor jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_chave text := trim(coalesce(p_chave, ''));
  v_texto text;
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

  -- Links: só http(s) ou vazio - nenhum outro esquema entra por aqui.
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
  -- dígitos — 10 a 15, o mesmo intervalo de telefone do cliente.
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

  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) A porta do SERVIDOR passa a enxergar a chave nova
-- ----------------------------------------------------------------------------
create or replace function public.ia_configuracoes_ler()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(c.chave, c.valor),
    '{}'::jsonb
  )
    from public.configuracoes_sistema c
   where c.chave in ('links', 'avaliacao', 'notificacoes', 'clube', 'ia', 'barbearia');
$$;

-- ----------------------------------------------------------------------------
-- 4) Catálogo público: acrescenta os dados da casa
--
--    `agendamento_publico_catalogo` (025) é o único endpoint público de
--    leitura do catálogo e já é anon/authenticated. A casa entra no MESMO
--    retorno — sem RPC nova, sem grant novo, sem segredo. Continua sem expor
--    telefone/e-mail de cliente ou de profissional: aqui só o número da
--    BARBEARIA, que o cliente precisa para falar com a loja.
-- ----------------------------------------------------------------------------
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
        json_build_object('id', p.id, 'nome', p.nome) order by p.nome
      )
      from profissionais p
      where p.ativo
    ), '[]'::json),
    -- Objeto sempre presente (mesmo vazio): o consumidor decide o que fazer
    -- quando ainda falta cadastrar telefone, sem nunca inventar valor.
    'barbearia', coalesce((
      select json_build_object(
        'endereco', coalesce(b.valor ->> 'endereco', ''),
        'telefone', coalesce(b.valor ->> 'telefone', ''),
        'instagram', coalesce(b.valor ->> 'instagram', ''),
        'mapa', coalesce(b.valor ->> 'mapa', '')
      )
      from configuracoes_sistema b
     where b.chave = 'barbearia'
    ), '{}'::json)
  );
$$;

-- ----------------------------------------------------------------------------
-- 5) Agendamento público COM complementos
--
--    Réplica do caminho do painel (019) sem `auth.uid()`:
--      • resolve cada id contra `servicos.complementos` do serviço base —
--        id fora da lista oficial é REJEITADO, nunca aceito por confiança;
--      • soma a duração total (é ela que tem de caber no horário);
--      • registra os complementos na observação, como o painel já faz;
--      • chama `agendamento_publico_criar`, que continua sendo a autoridade
--        única sobre expediente, almoço, bloqueio, lock e conflito.
--
--    O nome do serviço base segue gravado em `agendamentos.servico` e o total
--    em `duracao_min` — exatamente o que o painel já grava, então a Agenda
--    interna, o PDV e o CRM leem os dois caminhos igual.
-- ----------------------------------------------------------------------------
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
    -- Só entra o que a própria casa marcou como complementar deste serviço.
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

-- ----------------------------------------------------------------------------
-- 6) Privilégios: a página pública é anon; o painel e a IA autenticados.
--    O service_role herda da PUBLIC, como nas demais RPCs públicas.
-- ----------------------------------------------------------------------------
grant execute on function public.agendamento_publico_criar_complementos(
  text, text, text, text, date, text, text, text[]
) to anon, authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';