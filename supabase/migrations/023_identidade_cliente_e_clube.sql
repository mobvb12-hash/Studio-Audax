-- ============================================================================
-- 023_identidade_cliente_e_clube.sql — identificação multi-sinal (telefone,
-- nome, CPF) e leitura do Audax Club pela IA (Studio Audax)
-- ----------------------------------------------------------------------------
-- Problema que esta migration resolve
--   Hoje a IA identifica o cliente SÓ pelo telefone (`ia_cliente_por_telefone`
--   da 015, `limit 1`). No mundo real o mesmo número pode estar em mais de um
--   cadastro — e escolher o primeiro seria atribuir o agendamento de uma pessoa
--   ao cadastro de outra. O item 6 do pedido exige vários SINAIS, e o item 9
--   exige CPF como sinal para clientes do Clube.
--
-- O que entra aqui (tudo `service_role`, nenhuma policy nova, nada exposto):
--   • audax_nome_chave / audax_cpf_valido — helpers puros de comparação;
--   • ia_clientes_identificar(telefone, nome, cpf)
--       → resolve o cliente com VÁRIOS sinais e devolve
--         `novo` (sem correspondência), `unico` (uma só, segue sozinho) ou
--         `ambiguo` (NÃO escolhe: a Edge Function pergunta). Conflito entre
--         sinais (telefone aponta um cadastro, CPF aponta outro) também é
--         `ambiguo` — arbitragem é proibida;
--   • ia_clube_cliente(cliente_id) → plano/situação/benefícios CONFIGURADOS;
--
-- Sinais e pesos (nada inventado — cada sinal vem de coluna real):
--   • telefone: `clientes.telefone` OU qualquer item de `clientes.telefones`
--     (o mesmo dado que o CRM já mostra);
--   • cpf:      `clientes.cpf` com dígito verificador válido — sinal forte,
--     usado SÓ para identificar/autorizar, nunca devolvido por completo;
--   • nome:     comparação normalizada (sem acento/pontuação/caixa) — exige
--     igualdade ou todos os termos significantemente longos presentes;
--   • vínculo de Clube e histórico de agendamentos aparecem no CANDIDATO como
--     contexto de desambiguação, não como filtro.
--
-- Privacidade (§9/§20):
--   • CPF NUNCA sai completo: só `audax_cpf_mascarado` ('***.***.***-09');
--   • nome completo de um candidato só volta quando ele foi encontrado PELOS
--     SINAIS que o próprio cliente informou (telefone/CPF) ou quando há um só
--     candidato — a desambiguação é uma pergunta, não uma ficha;
--   • e-mail, endereço, etiquetas, observação, tokens: nuncareturned.
--
-- Idempotente e não destrutivo: só `create or replace function`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers puros (sem grant para ninguém)
-- ----------------------------------------------------------------------------

-- Nome normalizado: sem acento, sem pontuação, caixa baixa, espaços colapsados.
create or replace function public.audax_nome_chave(p text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Validação de CPF pelos dígitos verificadores. Rejeita sequências de dígitos
-- iguais (000.000.000-00, 111...), que passam no cálculo mas não existem.
create or replace function public.audax_cpf_valido(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_d text := public.audax_digitos(p);
  v_i integer;
  v_soma integer;
  v_d1 integer;
  v_d2 integer;
  v_peso integer;
begin
  if length(v_d) <> 11 then
    return false;
  end if;
  if v_d ~ '^(.)\1{10}$' then
    return false;
  end if;

  -- primeiro dígito
  v_soma := 0;
  for v_i in 1..9 loop
    v_peso := 11 - v_i;
    v_soma := v_soma + (substring(v_d from v_i for 1))::integer * v_peso;
  end loop;
  v_d1 := (v_soma * 10) % 11;
  if v_d1 = 10 then v_d1 := 0; end if;

  -- segundo dígito
  v_soma := 0;
  for v_i in 1..10 loop
    v_peso := 12 - v_i;
    v_soma := v_soma + (substring(v_d from v_i for 1))::integer * v_peso;
  end loop;
  v_d2 := (v_soma * 10) % 11;
  if v_d2 = 10 then v_d2 := 0; end if;

  return v_d1 = substring(v_d from 10 for 1)::integer
     and v_d2 = substring(v_d from 11 for 1)::integer;
end;
$$;

-- Normaliza para a chave de comparação de telefone (somente dígitos).
create or replace function public.audax_telefone_chave(p text)
returns text
language sql
immutable
as $$
  select public.audax_digitos(p);
$$;

-- Sub-objeto de Clube para um cliente (fonte oficial: clube_assinaturas).
-- `atrasado` é aritmética sobre a data oficial — não é opinião da IA.
create or replace function public.ia_clube_para_cliente(p_cliente_id text)
returns jsonb
language sql
stable
as $$
  select (
    select jsonb_build_object(
      'plano', a.plano,
      'ativo', not coalesce(a.cancelada, false),
      'atrasado',
        not coalesce(a.cancelada, false)
        and a.proximo_vencimento is not null
        and a.proximo_vencimento < ((now() at time zone 'America/Recife')::date),
      'valorMensal', a.valor_mensal,
      'dataAssinatura', to_char(a.data_assinatura, 'YYYY-MM-DD'),
      'proximoVencimento', to_char(a.proximo_vencimento, 'YYYY-MM-DD')
    )
      from public.clube_assinaturas a
     where a.cliente_id = p_cliente_id
     order by a.cancelada asc, a.criado_em desc
     limit 1
  );
$$;

-- ----------------------------------------------------------------------------
-- 1) Identificação multi-sinal
--    Devolve SOMENTE o necessário para decidir e perguntar:
--      { situacao, sinais, cpfInformado, cpfValido, candidatos: [...] }
--    `situacao`:
--      novo      → nenhum sinal encontrou cadastro (a IA oferece o cadastro);
--      unico     → exatamente UM cadastro, e os sinais não se contradizem;
--      ambiguo   → 0 ou mais de um, ou sinais apontando para cadastros
--                  diferentes (nunca escolhe por conta própria).
-- ----------------------------------------------------------------------------
create or replace function public.ia_clientes_identificar(
  p_telefone text,
  p_nome text default '',
  p_cpf text default ''
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fone text := public.audax_telefone_chave(p_telefone);
  v_nome text := public.audax_nome_chave(p_nome);
  v_cpf_bruto text := trim(coalesce(p_cpf, ''));
  v_cpf text := case
    when public.audax_cpf_valido(v_cpf_bruto) then public.audax_digitos(v_cpf_bruto)
    else ''
  end;
  v_sinais text[] := '{}'::text[];
  v_linhas jsonb;
  v_total integer;
begin
  -- sinais informados (telefone só conta com 10–13 dígitos, como em 015)
  if length(v_fone) between 10 and 13 then
    v_sinais := v_sinais || 'telefone';
  end if;
  if v_cpf <> '' then
    v_sinais := v_sinais || 'cpf';
  end if;
  if v_nome <> '' and length(v_nome) >= 3 then
    v_sinais := v_sinais || 'nome';
  end if;

  -- Candidatos: telefone/CPF primeiro (índices diretos), nome como segunda
  -- varredura. Cada cadastro aparece UMA vez, com a lista de sinais que
  -- casaram — e o nome NUNCA entra sozinho sem todos os termos longos.
  with nome_casa as (
    select c.id
      from public.clientes c
     where c.ativo
       and v_nome <> ''
       and length(v_nome) >= 3
       and (
         public.audax_nome_chave(c.nome) = v_nome
         or (
           (select count(*) >= 2
              from unnest(string_to_array(v_nome, ' ')) tok
             where length(tok) >= 3)
           and not exists (
             select 1
               from unnest(string_to_array(v_nome, ' ')) tok
              where length(tok) >= 3
                and public.audax_nome_chave(c.nome) not like '%' || tok || '%'
           )
         )
       )
     limit 50
  ), alvos as (
    select c.id
      from public.clientes c
     where c.ativo
       and (
         (v_cpf <> '' and public.audax_digitos(c.cpf) = v_cpf)
         or (
           length(v_fone) between 10 and 13
           and (
             public.audax_telefone_chave(c.telefone) = v_fone
             or exists (
               select 1
                 from jsonb_array_elements(coalesce(c.telefones, '[]'::jsonb)) t
                where public.audax_telefone_chave(t ->> 'numero') = v_fone
             )
           )
         )
       )
    union
    select n.id from nome_casa n
  ), marcados as (
    select
      c.id,
      c.nome,
      c.cpf,
      case
        when length(v_fone) between 10 and 13 and (
             public.audax_telefone_chave(c.telefone) = v_fone
             or exists (
               select 1
                 from jsonb_array_elements(coalesce(c.telefones, '[]'::jsonb)) t
                where public.audax_telefone_chave(t ->> 'numero') = v_fone
             )
           ) then 'telefone'
      end as s_tel,
      case
        when v_cpf <> '' and public.audax_digitos(c.cpf) = v_cpf then 'cpf'
      end as s_cpf,
      case
        when v_nome <> ''
         and length(v_nome) >= 3
         and (
           public.audax_nome_chave(c.nome) = v_nome
           or (
             (select count(*) >= 2
                from unnest(string_to_array(v_nome, ' ')) tok
               where length(tok) >= 3)
             and not exists (
               select 1
                 from unnest(string_to_array(v_nome, ' ')) tok
                where length(tok) >= 3
                  and public.audax_nome_chave(c.nome) not like '%' || tok || '%'
             )
           )
         ) then 'nome'
      end as s_nome
    from alvos a
    join public.clientes c on c.id = a.id
  ), filtrados as (
    select
      m.*,
      array_remove(
        array[
          case when m.s_cpf  is not null then 'cpf'      end,
          case when m.s_nome is not null then 'nome'     end,
          case when m.s_tel  is not null then 'telefone' end
        ],
        null
      ) as sinais
    from marcados m
  ), ordenados as (
    select f.*,
      case
        when cardinality(f.sinais) >= 2 then 3
        when 'cpf'      = any (f.sinais) then 2
        when 'telefone' = any (f.sinais) then 2
        else 1
      end as forca
    from filtrados f
    where cardinality(f.sinais) > 0
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'nome', o.nome,
        'sinais', to_jsonb(o.sinais),
        'cpfMascarado', public.audax_cpf_mascarado(o.cpf),
        'clube', public.ia_clube_para_cliente(o.id),
        'agendamentosFuturos', (
          select count(*)
            from public.agendamentos a
           where a.cliente_id = o.id
             and a.data >= ((now() at time zone 'America/Recife')::date)
             and a.status in ('pendente', 'confirmado')
        )
      )
      order by o.forca desc, o.nome
    ), '[]'::jsonb),
    count(*)
    into v_linhas, v_total
    from (select * from ordenados limit 5) o;

  return json_build_object(
    'situacao',
      case
        when v_total is null or v_total = 0 then 'novo'
        when v_total = 1 then 'unico'
        else 'ambiguo'
      end,
    'sinais', to_jsonb(v_sinais),
    'cpfInformado', v_cpf_bruto <> '',
    'cpfValido', v_cpf <> '',
    'candidatos', coalesce(v_linhas, '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 2) Clube de um cliente já identificado (plano, situação, vencimento).
--    Benefícios NÃO vêm daqui: vêm da configuração `clube.beneficios`
--    (022) — a IA nunca inventa benefício, e sem configuração ela não
--    informa nenhum.
-- ----------------------------------------------------------------------------
create or replace function public.ia_clube_cliente(p_cliente_id text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_cliente_id is null or trim(p_cliente_id) = '' then
    return json_build_object('ok', false, 'motivo', 'Cliente não identificado.');
  end if;

  return json_build_object(
    'ok', true,
    'clienteId', p_cliente_id,
    'clube', public.ia_clube_para_cliente(trim(p_cliente_id))
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Privilégios — espelha 015/016: SOMENTE service_role (chave sb_secret_*
--    da Edge Function). public/anon/authenticated ficam sem acesso: cadastro
--    de cliente e plano do Clube não são expostos à rede.
-- ----------------------------------------------------------------------------
revoke execute on function public.audax_nome_chave(text) from public, anon, authenticated;
revoke execute on function public.audax_cpf_valido(text) from public, anon, authenticated;
revoke execute on function public.audax_telefone_chave(text) from public, anon, authenticated;
revoke execute on function public.ia_clube_para_cliente(text) from public, anon, authenticated;
revoke execute on function public.ia_clientes_identificar(text, text, text) from public, anon, authenticated;
revoke execute on function public.ia_clube_cliente(text) from public, anon, authenticated;

grant execute on function public.audax_nome_chave(text) to service_role;
grant execute on function public.audax_cpf_valido(text) to service_role;
grant execute on function public.audax_telefone_chave(text) to service_role;
grant execute on function public.ia_clube_para_cliente(text) to service_role;
grant execute on function public.ia_clientes_identificar(text, text, text) to service_role;
grant execute on function public.ia_clube_cliente(text) to service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
