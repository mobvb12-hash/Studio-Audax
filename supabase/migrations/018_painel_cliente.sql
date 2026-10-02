-- ============================================================================
-- Studio Audax — Painel do cliente (vínculo, posse e correção de escalação)
-- ----------------------------------------------------------------------------
-- Objetivo: abrir o PAINEL DO CLIENTE sobre a MESMA base oficial, sem segunda
-- agenda, sem segunda base de clientes e sem regras comerciais paralelas.
--
-- 1) Vínculo da identidade autenticada com o cadastro:
--    • `clientes.auth_user_id` (uuid único) é a REFERÊNCIA de identidade — o
--      telefone NÃO é identidade (dois cadastros podem ter o mesmo telefone);
--    • `agendamentos.cliente_id` liga o agendamento ao cadastro para o
--      histórico "meus agendamentos" (linhas antigas por nome/telefone são
--      associadas só quando o par nome+telefone é ÚNICO entre cadastros —
--      par ambíguo nunca é adivinhado);
--    • FKs com `on delete set null`: apagar cadastro/agendamento não derruba
--      histórico (mesmo padrão da 009 em clube_assinaturas).
--
-- 2) RLS de posse (policies PERMISSIVAS novas — as existentes continuam
--    intactas e o admin não muda em nada): o cliente autenticado enxerga
--    SOMENTE a própria linha em clientes, agendamentos, clube_assinaturas e
--    clube_pagamentos. Escritas do painel NÃO passam por policy: são RPCs
--    SECURITY DEFINER que validam a posse no servidor (mesma arquitetura da
--    012, que já protege o agendamento público).
--
-- 3) Correção de escalação de privilégio (necessária ANTES de clientes
--    autenticarem): `perfis_guardar_papel` permitia qualquer sessão
--    autenticada inserir a PRÓPRIA linha de perfis com papel 'recepcao'
--    (default da coluna) ou 'profissional' — as policies por papel da 014
--    abrem clientes/agendamentos/caixa para esses papéis, então qualquer
--    usuário autenticado (amanhã, qualquer cliente) se promovia. Agora toda
--    escrita em perfis com sessão exige admin. Nenhum app cria perfil hoje
--    por conta própria (`criarPerfil` só existe em teste) e produção tem
--    exatamente 1 perfil (admin) — ninguém perde acesso.
--
-- 4) RPCs do painel (EXECUTE só para `authenticated`, revogado de `anon` e
--    `public`): vínculo com prova de identidade (nome ou nascimento — nunca
--    expõe dados de outro cadastro, devolve apenas estados) e atualização do
--    próprio perfil com colunas permitidas.
--
-- Idempotente e não destrutivo: `add column if not exists`, `create index if
-- not exists`, `drop policy if exists` + `create policy`, `create or replace
-- function`. Nenhuma tabela, coluna ou dado existente é apagado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Vínculos: identidade autenticada → cadastro → agendamentos
-- ----------------------------------------------------------------------------
alter table public.clientes
  add column if not exists auth_user_id uuid;

create unique index if not exists idx_clientes_auth_user
  on public.clientes (auth_user_id)
  where auth_user_id is not null;

alter table public.agendamentos
  add column if not exists cliente_id text;

create index if not exists idx_agendamentos_cliente_id
  on public.agendamentos (cliente_id)
  where cliente_id is not null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'clientes'
      and constraint_name = 'clientes_auth_user_fkey'
  ) then
    alter table public.clientes
      add constraint clientes_auth_user_fkey
      foreign key (auth_user_id) references auth.users (id)
      on delete set null;
  end if;
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'agendamentos'
      and constraint_name = 'agendamentos_cliente_id_fkey'
  ) then
    alter table public.agendamentos
      add constraint agendamentos_cliente_id_fkey
      foreign key (cliente_id) references public.clientes (id)
      on delete set null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Helpers de posse (SECURITY DEFINER: leem o vínculo sem passar pela RLS
--    de clientes; `stable` para o planner reutilizar dentro das policies)
-- ----------------------------------------------------------------------------
create or replace function public.current_cliente_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clientes
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- Data de nascimento em ISO 'YYYY-MM-DD' (aceita também 'DD/MM/YYYY');
-- entrada vazia ou inválida = '' (não derruba a comparação).
create or replace function public.audax_nascimento_iso(p text)
returns text
language plpgsql
immutable
as $$
declare
  v text := trim(coalesce(p, ''));
begin
  if v ~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    begin
      return to_char(to_date(v, 'YYYY-MM-DD'), 'YYYY-MM-DD');
    exception when others then
      return '';
    end;
  end if;
  if v ~ '^\d{1,2}/\d{1,2}/\d{4}$' then
    begin
      return to_char(to_date(v, 'DD/MM/YYYY'), 'YYYY-MM-DD');
    exception when others then
      return '';
    end;
  end if;
  return '';
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) RLS de posse (somente SELECT — escrita é só via RPC)
-- ----------------------------------------------------------------------------
drop policy if exists clientes_select_proprio on public.clientes;
create policy clientes_select_proprio on public.clientes
  as permissive for select to authenticated
  using (id = public.current_cliente_id());

drop policy if exists agendamentos_select_proprio on public.agendamentos;
create policy agendamentos_select_proprio on public.agendamentos
  as permissive for select to authenticated
  using (cliente_id = public.current_cliente_id());

drop policy if exists clube_assinaturas_select_proprio on public.clube_assinaturas;
create policy clube_assinaturas_select_proprio on public.clube_assinaturas
  as permissive for select to authenticated
  using (cliente_id = public.current_cliente_id());

drop policy if exists clube_pagamentos_select_proprio on public.clube_pagamentos;
create policy clube_pagamentos_select_proprio on public.clube_pagamentos
  as permissive for select to authenticated
  using (cliente_id = public.current_cliente_id());

-- ----------------------------------------------------------------------------
-- 4) Escalação bloqueada no banco: perfis só com admin
-- ----------------------------------------------------------------------------
create or replace function public.perfis_guardar_papel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- sem sessão (service role ou aplicação da migration) não há papel a julgar
  if auth.uid() is null then
    return new;
  end if;
  -- Antes: inserir a própria linha era livre para papel fora de
  -- ('dono','admin','gerente'), e o default da coluna é 'recepcao' — qualquer
  -- sessão autenticada se promovia e as policies por papel liberavam a base.
  -- `is not true`: current_user_is_admin() devolve NULL sem perfil ativo, e
  -- `if not NULL` não dispara — o NULL precisa cair no ELSE (bloqueado).
  if public.current_user_is_admin() is not true then
    raise exception 'perfis: somente admin cria ou altera perfis';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) RPC: vincula a sessão autenticada a um cadastro (ou cria o primeiro)
--    Prova: nome confere OU nascimento confere (quando informado). Devolve
--    apenas ESTADOS — nunca dados de outro cadastro.
-- ----------------------------------------------------------------------------
create or replace function public.painel_cliente_vincular(
  p_nome text default null,
  p_telefone text default null,
  p_nascimento text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_meta_nome text := '';
  v_meta_fone text := '';
  v_email text := '';
  v_nome text;
  v_fone_bruto text;
  v_fone text;
  v_auth_email text;
  v_nasc text;
  v_ja text;
  v_cand text[];
  v_prov text[];
  v_id text;
  v_estado text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  select id into v_ja from public.clientes where auth_user_id = v_uid;
  if v_ja is not null then
    return json_build_object('estado', 'vinculado', 'clienteId', v_ja);
  end if;

  select coalesce(u.raw_user_meta_data ->> 'nome', ''),
         coalesce(u.raw_user_meta_data ->> 'telefone', ''),
         coalesce(u.email, '')
    into v_meta_nome, v_meta_fone, v_auth_email
    from auth.users u
   where u.id = v_uid;

  v_nome := trim(coalesce(nullif(trim(p_nome), ''), v_meta_nome, ''));
  v_fone_bruto := trim(coalesce(nullif(trim(p_telefone), ''), v_meta_fone, ''));
  v_fone := regexp_replace(v_fone_bruto, '\D', '', 'g');
  v_email := lower(trim(coalesce(v_auth_email, '')));
  v_nasc := public.audax_nascimento_iso(p_nascimento);

  if coalesce(length(v_nome), 0) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  if coalesce(length(v_fone), 0) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;

  -- candidatos: e-mail da conta (identidade do cadastro) OU telefone
  select coalesce(array_agg(c.id::text), '{}'::text[])
    into v_cand
    from public.clientes c
   where (v_email <> '' and lower(trim(c.email)) = v_email)
      or regexp_replace(c.telefone, '\D', '', 'g') = v_fone;

  if coalesce(array_length(v_cand, 1), 0) = 0 then
    -- nenhum cadastro pareado: cria o primeiro vínculo desta conta
    v_id := gen_random_uuid()::text;
    v_estado := 'criado';
    insert into public.clientes (
      id, nome, telefone, email, nascimento, auth_user_id, ativo,
      criado_em, atualizado_em
    ) values (
      v_id, v_nome, v_fone_bruto, v_email, v_nasc, v_uid, true,
      now(), now()
    );
  else
    -- prova de identidade: nome confere OU nascimento (quando informado)
    select coalesce(array_agg(c.id::text), '{}'::text[])
      into v_prov
      from public.clientes c
     where ((v_email <> '' and lower(trim(c.email)) = v_email)
            or regexp_replace(c.telefone, '\D', '', 'g') = v_fone)
       and (lower(trim(c.nome)) = lower(v_nome)
            or (v_nasc <> ''
                and public.audax_nascimento_iso(c.nascimento) = v_nasc));

    if coalesce(array_length(v_prov, 1), 0) = 1 then
      v_id := v_prov[1];
    elsif coalesce(array_length(v_prov, 1), 0) > 1 then
      -- mais de um cadastro com a mesma cara: desempata pelo nascimento
      if v_nasc = '' then
        return json_build_object('estado', 'ambiguo');
      end if;
      select coalesce(array_agg(c.id::text), '{}'::text[])
        into v_prov
        from public.clientes c
       where ((v_email <> '' and lower(trim(c.email)) = v_email)
              or regexp_replace(c.telefone, '\D', '', 'g') = v_fone)
         and lower(trim(c.nome)) = lower(v_nome)
         and public.audax_nascimento_iso(c.nascimento) = v_nasc;
      if coalesce(array_length(v_prov, 1), 0) <> 1 then
        return json_build_object('estado', 'ambiguo');
      end if;
      v_id := v_prov[1];
    else
      -- há candidatos, mas nenhum provado
      if v_nasc = '' then
        return json_build_object('estado', 'precisa_dados');
      end if;
      return json_build_object('estado', 'nao_confirmado');
    end if;

    v_estado := 'vinculado';
    update public.clientes
       set auth_user_id = v_uid
     where id = v_id
       and auth_user_id is null;
    if not found then
      -- corrida (outra aba vinculou) ou linha removida: reconsulta a sessão
      select id into v_ja from public.clientes where auth_user_id = v_uid;
      if v_ja is not null then
        return json_build_object('estado', 'vinculado', 'clienteId', v_ja);
      end if;
      raise exception 'Não foi possível concluir o vínculo. Tente novamente.';
    end if;
  end if;

  -- Histórico: associa agendamentos por nome+telefone SOMENTE quando o par é
  -- único entre cadastros (par compartilhado = ambíguo, nunca adivinha).
  -- `atualizado_em` não muda: vínculo é metadado do painel, não edição de
  -- conteúdo — um empurrão aqui faria a sincronização do admin rebaixar uma
  -- edição local pendente.
  update public.agendamentos a
     set cliente_id = v_id
    from public.clientes c
   where c.id = v_id
     and a.cliente_id is null
     and a.cliente = c.nome
     and length(regexp_replace(c.telefone, '\D', '', 'g')) between 10 and 13
     and regexp_replace(a.telefone, '\D', '', 'g')
         = regexp_replace(c.telefone, '\D', '', 'g')
     and not exists (
       select 1 from public.clientes c2
        where c2.id <> c.id
          and c2.nome = c.nome
          and regexp_replace(c2.telefone, '\D', '', 'g')
              = regexp_replace(c.telefone, '\D', '', 'g')
     );

  return json_build_object('estado', v_estado, 'clienteId', v_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) RPC: atualiza o PRÓPRIO cadastro (colunas permitidas do perfil)
-- ----------------------------------------------------------------------------
create or replace function public.painel_cliente_atualizar(
  p_nome text,
  p_telefone text,
  p_nascimento text default '',
  p_genero text default 'nao_informado'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id text;
  v_fone text;
  v_nasc text;
  v_gen text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  v_id := public.current_cliente_id();
  if v_id is null then
    raise exception 'Este acesso ainda não está vinculado a um cadastro.';
  end if;

  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Informe seu nome.';
  end if;
  v_fone := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um telefone válido com DDD.';
  end if;
  v_nasc := public.audax_nascimento_iso(p_nascimento);
  v_gen := lower(trim(coalesce(p_genero, 'nao_informado')));
  if v_gen not in ('nao_informado', 'masculino', 'feminino', 'outro') then
    v_gen := 'nao_informado';
  end if;

  update public.clientes
     set nome = trim(p_nome),
         telefone = trim(p_telefone),
         nascimento = v_nasc,
         genero = v_gen,
         atualizado_em = now()
   where id = v_id;

  return (
    select to_jsonb(c) from public.clientes c where c.id = v_id
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7) EXECUTE: painel só para sessão autenticada (anon/public fora)
-- ----------------------------------------------------------------------------
grant execute on function public.current_cliente_id() to authenticated;
grant execute on function public.painel_cliente_vincular(text, text, text)
  to authenticated;
grant execute on function public.painel_cliente_atualizar(text, text, text, text)
  to authenticated;

revoke execute on function public.current_cliente_id() from public, anon;
revoke execute on function public.painel_cliente_vincular(text, text, text)
  from public, anon;
revoke execute on function public.painel_cliente_atualizar(text, text, text, text)
  from public, anon;
