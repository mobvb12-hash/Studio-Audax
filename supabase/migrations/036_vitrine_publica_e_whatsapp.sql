-- ============================================================================
-- 036_vitrine_publica_e_whatsapp.sql - vitrine, fotos e confirmação no WhatsApp
-- ============================================================================
--
-- 1) CATÁLOGO PÚBLICO: foto do serviço e os DESTAQUES escolhidos pelo dono.
--
--    A vitrine do agendamento (primeira tela do `/agendar`) tem três blocos:
--    repetir o último, destaques da casa e todos os serviços. "Destaques" é
--    escolha do DONO, não uma contagem: o banco não tem ranking de serviços e
--    não vamos inventar um. A escolha vive em `barbearia.destaques`, na MESMA
--    configuração que já guarda endereço, telefone, Instagram e mapa — é lá
--    que o dono já edita os dados da casa.
--
--    A foto do PROFISSIONAL só sai quando existe (`foto <> ''`): quem não tem
--    foto não ganha imagem quebrada na tela. `servicos` não tem coluna de
--    imagem — a foto do serviço não existe no sistema e não é inventada.
--    `servicos.preco` continua sendo o preço oficial.
--
-- 2) AGENDAMENTO PÚBLICO MARCA A ORIGEM 'publico'.
--
--    Hoje a criação pública deixa `origem` no default 'agenda', o que mistura
--    reserva de cliente com reserva feita no painel da equipe. Sem distinguir,
--    a confirmação por WhatsApp não sabe a quem mandar.
--
--    A marcação acontece em `agendamento_publico_criar_complementos`, que já
--    fazia um `UPDATE` no agendamento criado para aplicar a duração total.
--    `agendamento_publico_criar` NÃO É TOCADA — ela é a autoridade sobre
--    expediente, almoço, bloqueio, lock e conflito, e reescrever isso seria
--    reimplementar regra de Agenda.
--
--    Como o caminho público passa a ser sempre o wrapper (ele aceita lista de
--    complementos vazia), existe uma origem só para reserva de cliente.
--
-- 3) CONFIRMAÇÃO POR WHATSAPP PARA O AGENDAMENTO PÚBLICO.
--
--    O gatilho `agendamentos_notificar` já notificava o CLIENTE só quando a
--    origem era 'painel'. O agendamento público ficava sem confirmação no
--    celular do cliente — que é justamente de onde ele veio.
--
--    Aqui o gatilho passa a cobrir 'publico' também, e a mensagem ganha o que o
--    cliente precisa para chegar lá:
--
--      • complemento — lido do próprio marcador `[Complementos: ...]` que o
--        sistema já grava na observação (mesmo formato nos dois caminhos);
--      • endereço e WhatsApp oficial — da configuração `barbearia`, e SÓ se
--        estiverem preenchidos. Campo vazio não vira linha na mensagem:
--        "nunca inventar endereço".
--
--    A confirmação continua passando pela fila com chave de deduplicação
--    (`confirmacao_cliente:<origem>:<agendamento id>`), e a tolerância a falha
--    da 026 segue intacta: se o WhatsApp falhar, o AGENDAMENTO JÁ ESTÁ GRAVADO
--    e ninguém perde a reserva.
--
-- O QUE NÃO MUDA
--
--   • `agendamento_publico_slots` e a regra de disponibilidade: intocadas.
--   • `agendamento_publico_criar`: intocada.
--   • A notificação ao PROFISSIONAL e a de CANCELAMENTO: intocadas.
--   • Nenhuma tabela nova, nenhuma política nova, nenhum preço alterado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CATÁLOGO COM FOTO + DESTAQUES
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

comment on function public.agendamento_publico_catalogo() is
  'Catálogo público: serviços (preço oficial), foto, complementos sugeridos, '
  'profissionais, dados da casa e os destaques escolhidos pelo dono.';

-- ----------------------------------------------------------------------------
-- 2) ORIGEM 'publico' NO CAMINHO ÚNICO DE CRIAÇÃO PÚBLICA
--
-- Corpo idêntico ao da 027. A ÚNICA diferença é o `UPDATE` final, que agora
-- grava também a origem. A validação dos complementos, a soma de duração e a
-- delegação para `agendamento_publico_criar` são as mesmas, palavra por
-- palavra — inclusive o comentário do lock, que roda de novo no UPDATE.
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
  --
  -- `origem = 'publico'` é o que separa a reserva de CLIENTE da reserva feita
  -- no painel da equipe, e é o que faz a confirmação chegar no WhatsApp dele.
  update public.agendamentos
     set duracao_min = v_dur,
         origem = 'publico'
   where id = v_id;
  if not found then
    raise exception 'Não foi possível concluir o agendamento. Tente novamente.';
  end if;

  return json_build_object('id', v_id, 'status', 'pendente');
end;
$$;

grant execute on function public.agendamento_publico_criar_complementos(
  text, text, text, text, date, text, text, text[]
) to anon, authenticated, service_role;
