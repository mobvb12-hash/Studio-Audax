-- ============================================================================
-- Studio Audax — Agenda (agendamentos, bloqueios, expediente)
-- ----------------------------------------------------------------------------
-- Objetivo: levar ao Supabase a agenda existente, preservando exatamente ids,
-- datas, horários, profissionais, status, observações e o histórico de
-- remarcações que já existem no localStorage.
--
-- • Espelha `src/modules/agenda/types.ts`. `remarcacoes` é histórico e vai
--   em `jsonb`; o resto são colunas consultáveis (data, horário, profissional
--   e status são os filtros da Agenda).
-- • Drift-safe como 003–006: `create table if not exists` completa a base criada
--   por `supabase/schema.sql` (que não tem `observacao`, `remarcacoes` nem
--   `atualizado_em` e deixa `dados` obrigatório) e `add column if not exists`
--   adiciona só o que falta. Nenhuma linha é apagada ou reescrita.
-- • `atualizado_em` é apenas o carimbo de conflito da sincronização (mesmo
--   papel de `produtos`/`servicos`): o app decide qual versão é a mais recente
--   sem inventar regra nova. Registros antigos herdam `criado_em`.
-- • Idempotência: a chave primária é o MESMO id gerado pelo app e toda escrita
--   é `upsert` por `id` — reenviar a mesma agenda (ou o mesmo agendamento)
--   atualiza a linha e nunca cria um segundo agendamento.
-- • O expediente é um objeto único (chave `padrao`), como já é no app.
-- • Vínculos por nome (cliente/servico/profissional) seguem apenas indexados:
--   o app liga por nome, então FK por nome não existe (mesmo comentário de
--   `supabase/schema.sql`).
-- • RLS ligado: acesso somente para usuários autenticados. `anon` não recebe
--   política alguma.
-- ============================================================================

create table if not exists public.agendamentos (
  id text primary key,
  cliente text not null,                -- nome no momento (histórico)
  telefone text not null default '',
  servico text not null,
  profissional text not null,
  data date not null,                   -- 'YYYY-MM-DD'
  horario text not null,                -- 'HH:MM'
  status text not null check (
    status in ('pendente', 'confirmado', 'concluido', 'cancelado', 'nao_compareceu')
  ),
  duracao_min integer,                  -- duração registrada no agendamento
  observacao text not null default '',
  remarcacoes jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

create table if not exists public.bloqueios (
  id text primary key,
  profissional text not null,
  data date not null,
  data_fim date,                        -- ausente = mesmo dia
  inicio text not null,                 -- 'HH:MM'
  fim text not null,
  tipo text not null check (tipo in ('almoco', 'folga', 'ferias', 'ausencia', 'outro')),
  motivo text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

-- Expediente padrão (objeto único — uma linha, chave 'padrao')
create table if not exists public.agenda_expediente (
  chave text primary key default 'padrao',
  inicio text not null,
  fim text not null,
  almoco_inicio text not null,
  almoco_fim text not null,
  atualizado_em timestamptz not null default now(),
  dados jsonb                           -- opcional: o app grava coluna a coluna
);

-- Completa a base vinda da estrutura preliminar (supabase/schema.sql).
alter table public.agendamentos
  add column if not exists observacao text not null default '';
alter table public.agendamentos
  add column if not exists remarcacoes jsonb not null default '[]'::jsonb;
alter table public.agendamentos
  add column if not exists atualizado_em timestamptz not null default now();
alter table public.agendamentos
  add column if not exists criado_em timestamptz not null default now();

alter table public.bloqueios
  add column if not exists atualizado_em timestamptz not null default now();
alter table public.bloqueios
  add column if not exists criado_em timestamptz not null default now();

alter table public.agenda_expediente
  add column if not exists atualizado_em timestamptz not null default now();

-- `dados jsonb not null` é herança da estrutura preliminar; o app grava coluna
-- a coluna (mesmo tratamento dado a clientes/profissionais/serviços/caixa/
-- produtos/estoque). Valores já gravados são preservados.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agendamentos'
      and column_name = 'dados'
  ) then
    execute 'alter table public.agendamentos alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bloqueios'
      and column_name = 'dados'
  ) then
    execute 'alter table public.bloqueios alter column dados drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agenda_expediente'
      and column_name = 'dados'
  ) then
    execute 'alter table public.agenda_expediente alter column dados drop not null';
  end if;
end $$;

-- Consultas do app: agenda do dia, por profissional, por cliente e bloqueios.
create index if not exists idx_agendamentos_data
  on public.agendamentos (data);
create index if not exists idx_agendamentos_profissional_data
  on public.agendamentos (profissional, data);
create index if not exists idx_agendamentos_cliente
  on public.agendamentos (cliente);
create index if not exists idx_agendamentos_status
  on public.agendamentos (status);
create index if not exists idx_bloqueios_profissional_data
  on public.bloqueios (profissional, data);

alter table public.agendamentos enable row level security;
alter table public.bloqueios enable row level security;
alter table public.agenda_expediente enable row level security;

-- Re-executável: remove a política anterior antes de recriar (mesmo padrão de
-- 005/006 e de supabase/schema.sql).
do $$
declare
  t text;
begin
  foreach t in array array['agendamentos', 'bloqueios', 'agenda_expediente'] loop
    execute format('drop policy if exists acesso_autenticado on %I', t);
    execute format('drop policy if exists agenda_acesso_autenticado on %I', t);
    execute format(
      'create policy agenda_acesso_autenticado on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
