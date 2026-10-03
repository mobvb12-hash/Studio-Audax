-- ============================================================================
-- 022_configuracoes_e_auditoria_ia.sql — configuração centralizada + trilha
-- de auditoria/aprendizado da IA (Studio Audax)
-- ----------------------------------------------------------------------------
-- Objetivo
--   (a) §15/§22: parar de espalhar configuração fixa (link de avaliação, link
--       do painel, ligar/desligar notificações, parâmetros da IA) por vários
--       arquivos. Tudo passa a viver em `configuracoes_sistema`, lida pelo
--       SERVIDOR (triggers/RPCs da 024 e a Edge Function) e pela tela admin
--       de Configurações.
--   (b) §17/§20: criar a arquitetura segura de APRENDIZADO + AUDITORIA da IA.
--       `ia_eventos` registra intenção detectada, resultado, ambiguidade,
--       termos desconhecidos, correções, contexto e ações realizadas. É
--       SOMENTE LEITURA/ANÁLISE: nenhuma função desta migration lê
--       `ia_eventos` para decidir regra comercial, e nenhuma mensagem de
--       cliente altera código ou regra — o log é insumo para evolução
--       futura, nunca um canal de comando.
--
-- Privacidade (§20) — o que NUNCA entra:
--   • CPF completo: não existe coluna para isso; o helper `audax_cpf_mascarado`
--     devolve só os 2 dígitos finais e o trigger `ia_eventos_sem_segredo`
--     REJEITA qualquer valor com 6+ dígitos consecutivos (CPF, telefone
--     completo, chave) nos campos de texto;
--   • tokens/secrets/API keys/Authorization: mesma barreira (chaves longas);
--   • texto bruto da conversa: `ia_eventos` guarda apenas CONTEXTO
--     estruturado (slots), nunca a transcrição; a conversa continua com TTL
--     de 30 minutos em `ia_contexto_whatsapp` (016).
--
-- Idempotente e não destrutivo: `create table if not exists`,
-- `create or replace function`, `on conflict do nothing`, `revoke`/`grant`.
-- Nenhuma tabela/coluna/função existente é alterada ou removida.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de privacidade (imutáveis, sem grant para ninguém)
-- ----------------------------------------------------------------------------

-- Só dígitos.
create or replace function public.audax_digitos(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

-- '123.456.789-09' / '12345678909' → '***.***.***-09' (só os 2 finais).
-- Texto que não parece CPF volta como null — a IA nunca "adivinha" um CPF.
create or replace function public.audax_cpf_mascarado(p text)
returns text
language sql
immutable
as $$
  select case
    when public.audax_digitos(p) ~ '^[0-9]{11}$'
      then '***.***.***-' || right(public.audax_digitos(p), 2)
    else null
  end;
$$;

-- Detecta qualquer sequência de 6+ dígitos (CPF, telefone completo, chave).
create or replace function public.audax_tem_digitos_longo(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(p, '') ~ '[0-9]{6,}';
$$;

-- ----------------------------------------------------------------------------
-- 1) configuracoes_sistema — fonte ÚNICA de configuração (não espalhada no
--    código). `valor` é jsonb sempre OBJETO; chaves conhecidas são validadas
--    pela lista branca abaixo.
-- ----------------------------------------------------------------------------
create table if not exists public.configuracoes_sistema (
  chave text primary key,
  grupo text not null default 'geral',
  valor jsonb not null default '{}'::jsonb,
  descricao text not null default '',
  atualizado_em timestamptz not null default now()
);

comment on table public.configuracoes_sistema is
  'Configuração centralizada do Studio Audax (links, avaliação, notificações, IA). Fonte única — o código não fixa esses valores.';

-- Lista branca de chaves + valor inicial. `on conflict do nothing`: uma
-- configuração editada pelo admin NUNCA é sobrescrita por nova migração.
insert into public.configuracoes_sistema (chave, grupo, valor, descricao)
values
  ('links', 'links', '{"painel":"","avaliacao":""}'::jsonb,
   'Links oficiais: painel do cliente e avaliação.'),
  ('avaliacao', 'links', '{"ativa":false,"link":"","mensagem":""}'::jsonb,
   'Mensagem e link oficial de avaliação (pós-atendimento).'),
  ('notificacoes', 'notificacoes',
   '{"confirmacaoCliente":true,"profissionalAgendamento":true,"posAtendimento":true,"avaliacao":true}'::jsonb,
   'Chaves de envio automático. Desligar uma chave NÃO impede o agendamento.'),
  ('clube', 'clube', '{"beneficios":{}}'::jsonb,
   'Benefícios por plano do Audax Club: {"cabelo":["..."],"barba":[],"cabelo_barba":[]}. Vazio = a IA NÃO informa benefício (nunca inventa).'),
  ('ia', 'ia',
   '{"maxSugestoes":2,"botoesInterativos":false,"nomeAtendente":"Audax"}'::jsonb,
   'Parâmetros de conversa da IA do WhatsApp.')
on conflict (chave) do nothing;

-- ----------------------------------------------------------------------------
-- 2) Validação de configuração (uma regra só, usada pelas duas portas)
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
  if v_chave not in ('links', 'avaliacao', 'notificacoes', 'clube', 'ia') then
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

  -- Links: só http(s) ou vazio — nenhum outro esquema entra por aqui.
  foreach v_texto in array array['painel', 'avaliacao'] loop
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

  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Porta do SERVIDOR (service_role: Edge Function, triggers e reprocessamento)
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
   where c.chave in ('links', 'avaliacao', 'notificacoes', 'clube', 'ia');
$$;

create or replace function public.ia_configuracao_salvar(p_chave text, p_valor text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_json jsonb;
  v_problema text;
begin
  begin
    v_json := coalesce(p_valor, '{}')::jsonb;
  exception when others then
    raise exception 'Configuração inválida.';
  end;

  v_problema := public.audax_config_valida(p_chave, v_json);
  if v_problema is not null then
    raise exception '%', v_problema;
  end if;

  insert into public.configuracoes_sistema (chave, grupo, valor, atualizado_em)
  values (
    trim(p_chave),
    case trim(p_chave)
      when 'links' then 'links'
      when 'avaliacao' then 'links'
      when 'notificacoes' then 'notificacoes'
      when 'clube' then 'clube'
      else 'ia'
    end,
    v_json,
    now()
  )
  on conflict (chave) do update
    set valor = excluded.valor,
        atualizado_em = now();

  return json_build_object('ok', true, 'chave', trim(p_chave));
end;
$$;

-- ----------------------------------------------------------------------------
-- 4) Porta do ADMIN (tela de Configurações) — sessão autenticada E gerente ou
--    acima. O cliente do painel (papel 'profissional'/sem perfil) nunca entra.
-- ----------------------------------------------------------------------------
create or replace function public.admin_configuracoes_ler()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not coalesce(public.current_user_is_gerente_ou_acima(), false) then
    raise exception 'Sem permissão para alterar configurações.';
  end if;
  return public.ia_configuracoes_ler();
end;
$$;

create or replace function public.admin_configuracao_salvar(p_chave text, p_valor text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if not coalesce(public.current_user_is_gerente_ou_acima(), false) then
    raise exception 'Sem permissão para alterar configurações.';
  end if;
  -- delega à MESMA validação da porta do servidor (regra única)
  return public.ia_configuracao_salvar(p_chave, p_valor);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5) ia_eventos — trilha de auditoria e APRENDIZADO (§17/§20)
--    Escrita só por service_role, leitura só por service_role. Sem política
--    nenhuma: nenhum papel do PostgREST (nem o admin do painel) lê direto —
--    a análise será feita por relatório próprio no futuro.
-- ----------------------------------------------------------------------------
create table if not exists public.ia_eventos (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  origem text not null default 'whatsapp',
  fluxo text not null default '',
  intencao text not null default '',
  acao text not null default '',
  executada boolean not null default false,
  motivo text not null default '',
  -- SOMENTE metadados mascarados: '***3593 (13 digitos)'. Telefone cru não entra.
  remetente text not null default '',
  digitos_telefone integer,
  -- aprendizado
  ambiguidade text not null default '',
  termos_desconhecidos jsonb not null default '[]'::jsonb,
  correcoes jsonb not null default '[]'::jsonb,
  contexto jsonb not null default '{}'::jsonb,
  acoes jsonb not null default '[]'::jsonb,
  duracao_ms integer
);

comment on table public.ia_eventos is
  'Trilha de auditoria/aprendizado da IA: intenção, resultado, ambiguidade, termos desconhecidos, correções, contexto e ações. NUNCA muda regra comercial — é insumo de análise.';

create index if not exists idx_ia_eventos_criado
  on public.ia_eventos (criado_em desc);
create index if not exists idx_ia_eventos_fluxo
  on public.ia_eventos (fluxo, criado_em desc);
create index if not exists idx_ia_eventos_acao
  on public.ia_eventos (acao, criado_em desc);

-- Barreira de privacidade: nenhum texto com 6+ dígitos consecutivos (CPF
-- completo, telefone completo, chave/secret) pode ser gravado. Vale para o
-- serviço_role também — é a garantia de que a IA não vaza dado sensível por
-- log, mesmo que o chamador tente.
create or replace function public.ia_eventos_sem_segredo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo text;
begin
  foreach v_campo in array array[
    new.origem, new.fluxo, new.intencao, new.acao, new.motivo,
    new.remetente, new.ambiguidade
  ] loop
    if public.audax_tem_digitos_longo(v_campo) then
      raise exception 'Registro de auditoria recusado: dado sensível no log.';
    end if;
  end loop;

  if length(coalesce(new.remetente, '')) > 80
     or length(coalesce(new.motivo, '')) > 300
     or length(coalesce(new.ambiguidade, '')) > 120 then
    raise exception 'Registro de auditoria recusado: campo longo demais.';
  end if;

  if length(new.termos_desconhecidos::text) > 4000
     or length(new.correcoes::text) > 4000
     or length(new.contexto::text) > 8000
     or length(new.acoes::text) > 8000 then
    raise exception 'Registro de auditoria recusado: contexto grande demais.';
  end if;

  return new;
end;
$$;

drop trigger if exists ia_eventos_guard on public.ia_eventos;
create trigger ia_eventos_guard
  before insert on public.ia_eventos
  for each row execute function public.ia_eventos_sem_segredo();

-- Registro do evento (service_role). Aceita apenas texto já saneado e
-- devolve false em vez de estourar quando o registro é recusado — perder uma
-- linha de auditoria NUNCA derruba o atendimento do cliente.
--
-- Todos os parâmetros são TEXT de propósito: é o mesmo contrato da lista
-- branca da Edge Function (./acoes.ts), onde nenhum valor — do cliente ou não —
-- vira tipo diferente de string. `p_executada`/`p_digitos`/`p_duracao_ms`
-- entram como texto e são convertidos aqui, com faixa validada.
create or replace function public.ia_evento_registrar(
  p_fluxo text,
  p_intencao text,
  p_acao text,
  p_executada text,
  p_motivo text,
  p_remetente text,
  p_digitos text,
  p_ambiguidade text,
  p_termos text,
  p_correcoes text,
  p_contexto text,
  p_acoes text,
  p_duracao_ms text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_digitos integer := case
    when trim(coalesce(p_digitos, '')) ~ '^[0-9]{1,2}$' then trim(p_digitos)::integer
    else null
  end;
  v_duracao integer := case
    when trim(coalesce(p_duracao_ms, '')) ~ '^[0-9]{1,6}$' then trim(p_duracao_ms)::integer
    else null
  end;
begin
  begin
    insert into public.ia_eventos (
      origem, fluxo, intencao, acao, executada, motivo, remetente,
      digitos_telefone, ambiguidade, termos_desconhecidos, correcoes,
      contexto, acoes, duracao_ms
    )
    values (
      'whatsapp',
      left(coalesce(p_fluxo, ''), 40),
      left(coalesce(p_intencao, ''), 40),
      left(coalesce(p_acao, ''), 40),
      trim(coalesce(p_executada, '')) = 'true',
      left(coalesce(p_motivo, ''), 300),
      left(coalesce(p_remetente, ''), 80),
      v_digitos,
      left(coalesce(p_ambiguidade, ''), 120),
      coalesce(nullif(p_termos, ''), '[]')::jsonb,
      coalesce(nullif(p_correcoes, ''), '[]')::jsonb,
      coalesce(nullif(p_contexto, ''), '{}')::jsonb,
      coalesce(nullif(p_acoes, ''), '[]')::jsonb,
      v_duracao
    );
  exception when others then
    return false;
  end;

  -- retenção: 180 dias (o aprendizado precisa de histórico, não de memória
  -- eterna; depois disso o dado some sozinho).
  delete from public.ia_eventos
   where criado_em <= now() - interval '180 days';

  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6) RLS + privilégios
--   • configuracoes_sistema: RLS ligado, SEM política; leitura/escrita só via
--     RPC (service_role pelo servidor, autenticado+gerente pela tela admin).
--   • ia_eventos: RLS ligado, SEM política; SOMENTE service_role.
-- ----------------------------------------------------------------------------
alter table public.configuracoes_sistema enable row level security;
alter table public.ia_eventos enable row level security;

revoke all on table public.configuracoes_sistema from public, anon, authenticated;
revoke all on table public.ia_eventos from public, anon, authenticated;

grant select, insert, update on public.configuracoes_sistema to service_role;
grant select, insert on public.ia_eventos to service_role;
grant usage, select on sequence public.ia_eventos_id_seq to service_role;

revoke execute on function public.audax_config_valida(text, jsonb) from public, anon, authenticated;
revoke execute on function public.audax_cpf_mascarado(text) from public, anon, authenticated;
revoke execute on function public.audax_tem_digitos_longo(text) from public, anon, authenticated;
revoke execute on function public.ia_configuracoes_ler() from public, anon, authenticated;
revoke execute on function public.ia_configuracao_salvar(text, text) from public, anon, authenticated;
revoke execute on function public.ia_evento_registrar(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.audax_config_valida(text, jsonb) to service_role;
grant execute on function public.audax_cpf_mascarado(text) to service_role;
grant execute on function public.audax_tem_digitos_longo(text) to service_role;
grant execute on function public.ia_configuracoes_ler() to service_role;
grant execute on function public.ia_configuracao_salvar(text, text) to service_role;
grant execute on function public.ia_evento_registrar(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) to service_role;

revoke execute on function public.admin_configuracoes_ler() from public, anon;
revoke execute on function public.admin_configuracao_salvar(text, text) from public, anon;
grant execute on function public.admin_configuracoes_ler() to authenticated;
grant execute on function public.admin_configuracao_salvar(text, text) to authenticated;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
