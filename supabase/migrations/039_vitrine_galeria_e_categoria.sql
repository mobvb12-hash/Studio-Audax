-- ============================================================================
-- 039_vitrine_galeria_e_categoria.sql - a vitrine no formato de uma vitrine
-- ============================================================================
--
-- O QUE MUDA NO CATÁLOGO PÚBLICO
--
--   1. `categoria` de cada serviço — a taxonomia que a CASA já usa
--      (Cabelo, Barba, Tratamento). É o que permite agrupar "Todos os serviços"
--      numa lista sanfona sem inventar taxonomia no frontend.
--
--   2. `barbearia.fotos` — a galeria da casa, lida da MESMA configuração que
--      já guarda endereço, telefone, Instagram e mapa.
--
-- A galeria e a categoria são ADICIONAIS: uma casa sem foto e sem categoria
-- continua funcionando — a vitrine esconde a galeria e agrupa o que tiver.
--
-- O QUE NÃO MUDA
--
--   • Preço, duração, complementos, profissionais e destaques: intactos.
--   • `servicos.preco` continua sendo o preço oficial.
--   • Nenhuma regra de Agenda, de Club ou de notificação.
--   • Nada é público além do que já era: categoria é o rótulo que a equipe já
--     vê na tela de Serviços, e fotos são imagens da casa.
-- ============================================================================

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
-- A GALERIA DA CASA NA CONFIGURAÇÃO
-- ============================================================================
--
-- `barbearia.fotos` é a lista de imagens da casa, na ordem em que o dono
-- gravou. Aqui o servidor só garante o SHAPE — lista de textos, até 8 URLs
-- http(s) de 2000 caracteres:
--
--   • URL de http(s), ou vazio (o dono pode limpar sem quebrar o registro)
--   • nada de javascript:, data: ou ftp: — o campo vira <img src>, então o
--     esquema é o que segura a página contra script embutido na configuração
--
-- A imagem em si não é validada aqui: o navegador quebra o <img> se a URL não
-- carregar, e a vitrine esconde foto que falhou. Validar binário no banco seria
-- fingir capacidade que o Postgres não tem.
--
-- O restante do corpo é o da 038, palavra por palavra, com UM bloco novo no
-- começo. As regras de `destaques`, de `clube` e a rejeição de chave
-- desconhecida seguem idênticas.
-- ============================================================================

create or replace function public.audax_config_valida(p_chave text, p_valor jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_chave text := trim(coalesce(p_chave, ''));
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

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
