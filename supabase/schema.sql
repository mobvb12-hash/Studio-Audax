-- ============================================================================
-- Studio Audax — estrutura PostgreSQL (Supabase)
-- ----------------------------------------------------------------------------
-- Objetivo: PREPARAR a base para produção sem tocar no que já funciona.
-- • Single-tenant: nenhuma coluna de tenant/empresa — um só salão.
-- • Preservação de modelos: cada tabela tem colunas consultáveis que espelham
--   os tipos de src/modules/*/types.ts + a coluna `dados` (jsonb) com o
--   objeto original completo — a regra de negócio continua morando no app.
-- • Não destrutivo: tudo idempotente (create if not exists). Este script NÃO
--   apaga, NÃO altera dados existentes e NÃO substitui o localStorage.
-- • Ids em `text` para aceitar exatamente os ids já criados pelo app.
-- • Relacionamentos por ID usam FK; o app liga cliente por NOME (agendamentos
--   e lançamentos guardam `cliente` como texto) e propaga renomeações — por
--   isso esses vínculos ficam apenas indexados (FK por nome não existe).
-- • RLS ligado em todas as tabelas: só `authenticated` lê/escreve; `anon`
--   não tem política nenhuma ⇒ negado por padrão.
--
-- Usuários do sistema: criar no dashboard do Supabase
-- (Authentication → Users) com e-mail/senha. Nenhuma conta é semeada aqui.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Cadastro base
-- ----------------------------------------------------------------------------

create table if not exists clientes (
  id text primary key,
  nome text not null,
  telefone text not null default '',
  email text not null default '',
  ativo boolean not null default true,
  nascimento text,                      -- '' ou 'YYYY-MM-DD' (texto igual ao app)
  criado_em timestamptz,
  atualizado_em timestamptz,
  dados jsonb not null                  -- objeto Cliente completo (fidelidade total)
);

create table if not exists profissionais (
  id text primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz,
  dados jsonb not null
);

create table if not exists servicos (
  id text primary key,
  nome text not null,
  preco numeric(12,2) not null default 0,
  duracao_min integer not null default 0,
  categoria text not null default '',
  ativo boolean not null default true,
  dados jsonb not null
);

create table if not exists produtos (
  id text primary key,
  nome text not null,
  preco numeric(12,2) not null default 0,
  custo numeric(12,2) not null default 0,
  estoque integer not null default 0,
  estoque_minimo integer not null default 0,
  categoria text not null default '',
  ativo boolean not null default true,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Agenda
-- ----------------------------------------------------------------------------

create table if not exists agendamentos (
  id text primary key,
  cliente text not null,                -- nome no momento (histórico)
  telefone text not null default '',
  servico text not null,
  profissional text not null,
  data date not null,                   -- 'YYYY-MM-DD'
  horario text not null,                -- 'HH:MM'
  status text not null,                 -- pendente|confirmado|concluido|cancelado|nao_compareceu
  duracao_min integer,
  criado_em timestamptz,
  dados jsonb not null
);

create table if not exists bloqueios (
  id text primary key,
  profissional text not null,
  data date not null,
  data_fim date,                        -- ausente = mesmo dia
  inicio text not null,                 -- 'HH:MM'
  fim text not null,
  tipo text not null,                   -- almoco|folga|ferias|ausencia|outro
  motivo text not null default '',
  criado_em timestamptz,
  dados jsonb not null
);

-- Expediente padrão (objeto único — uma linha)
create table if not exists agenda_expediente (
  chave text primary key default 'padrao',
  inicio text not null,
  fim text not null,
  almoco_inicio text not null,
  almoco_fim text not null,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Estoque
-- ----------------------------------------------------------------------------

create table if not exists estoque_movimentacoes (
  id text primary key,
  produto_id text references produtos (id) on delete set null,
  produto text not null,
  tipo text not null,                   -- inicial|entrada|venda|estorno|ajuste
  quantidade integer not null,
  estoque_antes integer,
  estoque_depois integer,
  custo_unitario numeric(12,2) not null default 0,
  data date not null,
  hora text not null default '',
  origem text not null,                 -- cadastro|pdv|estorno|manual
  venda_id text,                        -- lançamento do Caixa associado
  criado_em timestamptz,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Caixa / PDV
-- ----------------------------------------------------------------------------

create table if not exists caixa_lancamentos (
  id text primary key,
  tipo text not null,                   -- receita|despesa
  origem text not null,                 -- atendimento|produto|clube|despesa
  data date not null,
  hora text not null default '',
  descricao text not null default '',
  valor numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  valor_liquido numeric(12,2) not null default 0,
  forma_pagamento text not null,        -- dinheiro|pix|cartao_credito|cartao_debito|outro
  cliente text,                         -- nome (vínculo histórico por nome)
  cliente_id text references clientes (id) on delete set null,
  profissional text,
  agendamento_id text,                  -- regra anti-duplicidade vive no app
  assinatura_id text,
  estornado boolean not null default false,
  criado_em timestamptz,
  dados jsonb not null
);

create table if not exists caixa_fechamentos (
  id text primary key,
  data date not null,
  fechado_em timestamptz,
  resumo jsonb not null,                -- ResumoFechamento completo
  reaberto jsonb,                       -- { em, motivo } | null
  dados jsonb not null
);

create table if not exists caixa_auditoria (
  id text primary key,
  acao text not null,                   -- estorno|reabertura
  data date not null,
  descricao text not null default '',
  motivo text,
  criado_em timestamptz,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Comissões
-- ----------------------------------------------------------------------------

create table if not exists comissoes_configs (
  profissional_id text primary key references profissionais (id) on delete cascade,
  percentual numeric(5,2) not null default 0,   -- 0 a 100 (%)
  ativo boolean not null default true,
  dados jsonb not null
);

create table if not exists comissoes_fechamentos (
  id text primary key,
  profissional_id text references profissionais (id) on delete set null,
  profissional_nome text not null default '',
  periodo_inicio date not null,
  periodo_fim date not null,
  qtd_atendimentos integer not null default 0,
  producao numeric(12,2) not null default 0,
  percentual numeric(5,2) not null default 0,
  comissao numeric(12,2) not null default 0,
  fechado_em timestamptz,
  reaberto jsonb,
  dados jsonb not null
);

create table if not exists comissoes_auditoria (
  id text primary key,
  acao text not null,                   -- fechamento|reabertura
  profissional_id text references profissionais (id) on delete set null,
  profissional_nome text not null default '',
  periodo_inicio date not null,
  periodo_fim date not null,
  descricao text not null default '',
  motivo text,
  criado_em timestamptz,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Audax Club
-- ----------------------------------------------------------------------------

create table if not exists clube_assinaturas (
  id text primary key,
  cliente_id text references clientes (id) on delete set null,
  cliente text not null,                -- nome no momento (histórico)
  plano text not null,                  -- cabelo|barba|cabelo_barba
  valor_mensal numeric(12,2) not null default 0,
  data_assinatura date not null,
  proximo_vencimento date not null,
  cancelada boolean not null default false,
  cancelada_em date,
  motivo_cancelamento text,
  criado_em timestamptz,
  dados jsonb not null
);

create table if not exists clube_pagamentos (
  id text primary key,
  assinatura_id text references clube_assinaturas (id) on delete no action,
  cliente_id text references clientes (id) on delete set null,
  data date not null,
  valor numeric(12,2) not null default 0,
  forma_pagamento text not null,
  caixa_lancamento_id text,
  vencimento_coberto date,              -- trava anti cobrança duplicada
  criado_em timestamptz,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- CRM / Espera / Marketing
-- ----------------------------------------------------------------------------

create table if not exists crm_interacoes (
  id text primary key,
  cliente_id text references clientes (id) on delete cascade,
  tipo text not null default 'nota',    -- nota|ligacao|presencial
  texto text not null,
  criado_em timestamptz,
  dados jsonb not null
);

create table if not exists espera_pedidos (
  id text primary key,
  cliente_id text references clientes (id) on delete set null,
  cliente text not null,
  telefone text not null default '',
  servico text not null,
  profissional text not null default '',
  periodo text not null default 'qualquer', -- manha|tarde|qualquer
  data_preferida date,                 -- ausente = qualquer dia
  status text not null,                 -- aguardando|atendido|cancelado
  observacao text not null default '',
  criado_em timestamptz,
  encerrado_em timestamptz,
  dados jsonb not null
);

create table if not exists marketing_listas (
  id text primary key,
  nome text not null,
  publico text not null,                -- inativos|aniversariantes|recorrentes|sem_retorno|novos
  criado_em timestamptz,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Automações / IA / WhatsApp
-- ----------------------------------------------------------------------------

-- Chaves já tratadas (anti-duplicação)
create table if not exists automacoes_tratadas (
  chave text primary key,
  criado_em timestamptz not null default now()
);

-- Sugestões da Central de IA: aceitas e descartadas
create table if not exists ia_tratadas (
  id text not null,
  tipo text not null check (tipo in ('aceita', 'descartada')),
  criado_em timestamptz not null default now(),
  primary key (id, tipo)
);

create table if not exists whatsapp_mensagens (
  id text primary key,
  cliente_id text references clientes (id) on delete set null,
  cliente text not null,
  template text not null,               -- confirmacao|lembrete|... (9 ids)
  texto text not null,
  status text not null,                 -- pendente|enviada|falhou
  origem text not null,                 -- crm|ia|automacao
  motivo_falha text,
  agendamento_id text,
  criado_em timestamptz,
  enviado_em timestamptz,
  dados jsonb not null
);

-- ----------------------------------------------------------------------------
-- Índices (consultas do app: filtro por dia, cliente, status, profissional)
-- ----------------------------------------------------------------------------

create index if not exists idx_clientes_nome on clientes (lower(nome));
create index if not exists idx_clientes_ativo on clientes (ativo);

create index if not exists idx_agendamentos_data on agendamentos (data);
create index if not exists idx_agendamentos_cliente on agendamentos (cliente);
create index if not exists idx_agendamentos_profissional_data
  on agendamentos (profissional, data);
create index if not exists idx_agendamentos_status on agendamentos (status);

create index if not exists idx_bloqueios_profissional_data
  on bloqueios (profissional, data);

create index if not exists idx_movimentacoes_produto
  on estoque_movimentacoes (produto_id);
create index if not exists idx_movimentacoes_data on estoque_movimentacoes (data);

create index if not exists idx_lancamentos_data on caixa_lancamentos (data);
create index if not exists idx_lancamentos_cliente on caixa_lancamentos (cliente);
create index if not exists idx_lancamentos_agendamento
  on caixa_lancamentos (agendamento_id);
create index if not exists idx_lancamentos_assinatura
  on caixa_lancamentos (assinatura_id);

create index if not exists idx_comissoes_profissional
  on comissoes_fechamentos (profissional_id);

create index if not exists idx_assinaturas_cliente
  on clube_assinaturas (cliente_id);
create index if not exists idx_assinaturas_vencimento
  on clube_assinaturas (proximo_vencimento);
create index if not exists idx_pagamentos_assinatura
  on clube_pagamentos (assinatura_id);

create index if not exists idx_interacoes_cliente on crm_interacoes (cliente_id);
create index if not exists idx_interacoes_criado on crm_interacoes (criado_em desc);

create index if not exists idx_espera_status on espera_pedidos (status);

create index if not exists idx_mensagens_cliente on whatsapp_mensagens (cliente_id);
create index if not exists idx_mensagens_status on whatsapp_mensagens (status);

-- ----------------------------------------------------------------------------
-- RLS — single-tenant: acesso apenas para usuários autenticados.
-- `anon` (chave pública do navegador sem login) não recebe política alguma.
-- ----------------------------------------------------------------------------

alter table clientes enable row level security;
alter table profissionais enable row level security;
alter table servicos enable row level security;
alter table produtos enable row level security;
alter table agendamentos enable row level security;
alter table bloqueios enable row level security;
alter table agenda_expediente enable row level security;
alter table estoque_movimentacoes enable row level security;
alter table caixa_lancamentos enable row level security;
alter table caixa_fechamentos enable row level security;
alter table caixa_auditoria enable row level security;
alter table comissoes_configs enable row level security;
alter table comissoes_fechamentos enable row level security;
alter table comissoes_auditoria enable row level security;
alter table clube_assinaturas enable row level security;
alter table clube_pagamentos enable row level security;
alter table crm_interacoes enable row level security;
alter table espera_pedidos enable row level security;
alter table marketing_listas enable row level security;
alter table automacoes_tratadas enable row level security;
alter table ia_tratadas enable row level security;
alter table whatsapp_mensagens enable row level security;

-- Re-executável: remove a política antiga antes de recriar.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clientes', 'profissionais', 'servicos', 'produtos', 'agendamentos',
    'bloqueios', 'agenda_expediente', 'estoque_movimentacoes',
    'caixa_lancamentos', 'caixa_fechamentos', 'caixa_auditoria',
    'comissoes_configs', 'comissoes_fechamentos', 'comissoes_auditoria',
    'clube_assinaturas', 'clube_pagamentos', 'crm_interacoes',
    'espera_pedidos', 'marketing_listas', 'automacoes_tratadas',
    'ia_tratadas', 'whatsapp_mensagens'
  ] loop
    execute format('drop policy if exists acesso_autenticado on %I', t);
    execute format(
      'create policy acesso_autenticado on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Chaves de uso restrito ao navegador (não são dados de negócio, ficam só
-- no localStorage e NÃO precisam de tabela):
--   studio-audax:estoque:filtro   (filtro de UI do Dashboard)
--   studio-audax:teste:lista:v1   (teste de UI)
-- ----------------------------------------------------------------------------
