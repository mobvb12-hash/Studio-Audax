-- ============================================================================
-- Studio Audax — IA do WhatsApp: contexto conversacional e dedup PERSISTENTES
-- ----------------------------------------------------------------------------
-- Objetivo (correção arquitetural): as Edge Functions rodam em V8 isolates
-- distintos por invocação — os Maps em memória da FASE 5 perdiam o contexto
-- entre mensagens reais (caso registrado: "Quero agendar um Corte Degradê."
-- respondia "Para qual dia?" e a resposta "2" caía no fluxo informativa em
-- outra execução) e deixavam a deduplicação de reentregas sem efeito real
-- quando a 2ª cópia chegava em outro isolate. O banco é a fonte de verdade;
-- nenhum Map de processo participa da correção.
--
-- Duas tabelas novas (nenhuma tabela/coluna/dado existente é alterado):
--   • ia_contexto_whatsapp  → contexto por remetente no shape EXATO
--                             ContextoConversa da FASE 5 (JSONB com
--                             atualizadoEm + historico + rascunho), TTL de
--                             30 minutos via atualizado_em;
--   • ia_mensagens_whatsapp → ids de mensagem já processados, janela de
--                             deduplicação de 15 minutos (a mesma da FASE 5).
--
-- Quatro RPCs (padrão de segurança idêntico à migration 015):
--   • ia_contexto_ler      → contexto vivo ou null (e limpa o expirado);
--   • ia_contexto_salvar   → upsert + varredura das linhas expiradas;
--   • ia_contexto_fechar   → remove a conversa do remetente;
--   • ia_mensagem_registrar→ INSERT ... ON CONFLICT DO NOTHING atômico:
--                             duas execuções concorrentes do mesmo id
--                             recebem `true` SOMENTE UMA vez.
--
-- Segurança:
--   • SECURITY DEFINER + search_path fixo; reuso do helper audax_digitos (015)
--     sem grant algum;
--   • REVOKE de PUBLIC, anon e authenticated nas funções E nas tabelas;
--   • GRANT de execute somente para service_role (é o papel da chave
--     sb_secret_* usada nos headers pela Edge Function — corpo/URL nunca
--     levam credencial);
--   • RLS habilitado sem policy nas duas tabelas: nenhum cliente via
--     PostgREST lê ou escreve; todo acesso acontece dentro das funções;
--   • nenhum secret/token é armazenado; a chave de localização é o telefone
--     em dígitos — o MESMO dado que o projeto já guarda em agendamentos
--     (mesmo padrão de privacidade existente); o texto da conversa vive
--     somente no JSONB e é apagado pelo TTL.
--
-- Idempotente e não destrutivo: create table if not exists / create index if
-- not exists / create or replace function / revoke / grant — pode rodar
-- quantas vezes, sem apagar dado pré-existente (a limpeza de TTL dentro das
-- funções atinge SOMENTE as linhas destas tabelas efêmeras).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabelas efêmeras da conversa e da deduplicação.
-- ----------------------------------------------------------------------------
create table if not exists public.ia_contexto_whatsapp (
  remetente text primary key,
  contexto jsonb not null,
  atualizado_em timestamptz not null default now()
);

create index if not exists ix_ia_contexto_whatsapp_atualizado_em
  on public.ia_contexto_whatsapp (atualizado_em);

create table if not exists public.ia_mensagens_whatsapp (
  id_mensagem text primary key,
  registrado_em timestamptz not null default now()
);

create index if not exists ix_ia_mensagens_whatsapp_registrado_em
  on public.ia_mensagens_whatsapp (registrado_em);

-- Sem policy alguma: anon/authenticated não veem nem escrevem (nem via
-- PostgREST); service_role acessa somente por dentro das funções abaixo.
alter table public.ia_contexto_whatsapp enable row level security;
alter table public.ia_mensagens_whatsapp enable row level security;

-- ----------------------------------------------------------------------------
-- 2) Ler contexto — vivo dentro do TTL de 30 minutos; expirado some.
--    Devolve o JSONB do ContextoConversa ou null (nunca texto de erro).
-- ----------------------------------------------------------------------------
create or replace function public.ia_contexto_ler(p_remetente text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_chave text := public.audax_digitos(p_remetente);
  v_ctx jsonb;
begin
  if length(v_chave) < 10 or length(v_chave) > 13 then
    return null;
  end if;

  select c.contexto into v_ctx
    from public.ia_contexto_whatsapp c
   where c.remetente = v_chave
     and c.atualizado_em > now() - interval '30 minutes';
  if v_ctx is not null then
    return v_ctx;
  end if;

  -- ausente ou fora do TTL: remove o que existir do remetente (limpeza segura
  -- — atinge apenas esta tabela efêmera, nunca dado de cliente)
  delete from public.ia_contexto_whatsapp where remetente = v_chave;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Salvar contexto — upsert idempotente + varredura das linhas expiradas.
--    `p_contexto` chega como string JSON (o corpo da RPC é só params string);
--    a validação de forma garante o shape ContextoConversa antes de gravar.
-- ----------------------------------------------------------------------------
create or replace function public.ia_contexto_salvar(
  p_remetente text,
  p_contexto text
)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_chave text := public.audax_digitos(p_remetente);
  v_ctx jsonb;
begin
  if length(v_chave) < 10 or length(v_chave) > 13 then
    raise exception 'Telefone inválido.';
  end if;
  if p_contexto is null or length(p_contexto) = 0 or length(p_contexto) > 100000 then
    raise exception 'Contexto inválido.';
  end if;
  begin
    v_ctx := p_contexto::jsonb;
  exception when others then
    raise exception 'Contexto inválido.';
  end;
  if jsonb_typeof(v_ctx) <> 'object'
     or not (v_ctx ? 'atualizadoEm')
     or not (v_ctx ? 'historico')
     or jsonb_typeof(v_ctx -> 'historico') <> 'array'
     or not (v_ctx ? 'rascunho') then
    raise exception 'Contexto inválido.';
  end if;

  -- varredura de TTL: mantém a tabela apenas com conversas vivas
  delete from public.ia_contexto_whatsapp
   where atualizado_em <= now() - interval '30 minutes';

  insert into public.ia_contexto_whatsapp (remetente, contexto, atualizado_em)
  values (v_chave, v_ctx, now())
  on conflict (remetente)
  do update set contexto = excluded.contexto,
                atualizado_em = excluded.atualizado_em;

  return json_build_object('ok', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Fechar contexto — descarte explícito da conversa do remetente.
-- ----------------------------------------------------------------------------
create or replace function public.ia_contexto_fechar(p_remetente text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_chave text := public.audax_digitos(p_remetente);
begin
  if length(v_chave) < 10 or length(v_chave) > 13 then
    raise exception 'Telefone inválido.';
  end if;

  delete from public.ia_contexto_whatsapp where remetente = v_chave;
  return json_build_object('ok', true, 'removido', found);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) Deduplicação atômica — o gate que impede a 2ª entrega (mesmo id, OUTRA
--    execução/isolate) de rodar Gemini, ações e envio de novo. `insert ...
--    on conflict do nothing` + `found` garante que só UMA das concorrentes
--    recebe true; a janela expirada é varrida antes (tabela nunca cresce
--    sem fim e, após os 15 minutos, o mesmo id volta a ser aceito — igual ao
--    comportamento da FASE 5).
-- ----------------------------------------------------------------------------
create or replace function public.ia_mensagem_registrar(p_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id text := trim(coalesce(p_id, ''));
begin
  if length(v_id) < 1 or length(v_id) > 200 then
    raise exception 'Identificador inválido.';
  end if;

  delete from public.ia_mensagens_whatsapp
   where registrado_em <= now() - interval '15 minutes';

  insert into public.ia_mensagens_whatsapp (id_mensagem, registrado_em)
  values (v_id, now())
  on conflict (id_mensagem) do nothing;

  return found;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) Privilégios — espelha a migration 015: helper já sem grant; as quatro
--    funções SOMENTE service_role (chave sb_secret_* da Edge Function);
--    PUBLIC/sem acesso em anon e authenticated; tabelas sem grant algum
--    para os papéis de cliente (leitura/escrita só via SECURITY DEFINER).
-- ----------------------------------------------------------------------------
revoke execute on function public.ia_contexto_ler(text) from public, anon, authenticated;
revoke execute on function public.ia_contexto_salvar(text, text) from public, anon, authenticated;
revoke execute on function public.ia_contexto_fechar(text) from public, anon, authenticated;
revoke execute on function public.ia_mensagem_registrar(text) from public, anon, authenticated;

grant execute on function public.ia_contexto_ler(text) to service_role;
grant execute on function public.ia_contexto_salvar(text, text) to service_role;
grant execute on function public.ia_contexto_fechar(text) to service_role;
grant execute on function public.ia_mensagem_registrar(text) to service_role;

revoke all on table public.ia_contexto_whatsapp from public, anon, authenticated;
revoke all on table public.ia_mensagens_whatsapp from public, anon, authenticated;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
