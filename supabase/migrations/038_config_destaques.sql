-- ============================================================================
-- 038_config_destaques.sql - o dono escolhe os destaques da vitrine
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A vitrine do agendamento público (`/agendar`) tem uma seção "Destaques da
-- casa" com os serviços que o dono quer highlighted. Não existe ranking
-- automático no banco — e não vamos inventar contagem de agendamento por
-- serviço só para ordenar uma vitrine. A escolha é do DONO.
--
-- A escolha vive em `barbearia.destaques`, na mesma configuração que já guarda
-- endereço, telefone, Instagram e mapa: é o lugar onde a casa já edita "os
-- dados de quem somos".
--
-- ESTE SCRIPT
--
--   • teaching o servidor a ACEITAR e validar esse campo novo na chave
--     `barbearia` — lista de nomes de serviço, até 12, texto curto.
--
-- O QUE NÃO MUDA
--
--   • O corpo da validação é o da 030, palavra por palavra, com UM bloco novo
--     no começo. As regras de `clube` (coberturas, desconto, comissão) e a
--     rejeição de chave desconhecida seguem idênticas.
--   • Nenhuma tabela, nenhuma política, nenhum preço.
--   • A vitrine só mostra a seção quando o dono configurou algo: lista vazia
--     é resposta válida.
--
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
