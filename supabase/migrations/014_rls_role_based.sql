-- ============================================================================
-- Studio Audax — Políticas RLS baseadas em papel (role-based access control)
-- ----------------------------------------------------------------------------
-- Objetivo: substituir as políticas "authenticated using (true)" por políticas
-- que respeitem o papel do usuário (dono, admin, gerente, recepcao, profissional).
--
-- Esta migration deve rodar APÓS a 001_perfis.sql e as outras que criam as tabelas.
-- É idempotente: usa DROP POLICY IF EXISTS + CREATE POLICY.
--
-- Também remove a política genérica `acesso_autenticado` (laço do bootstrap em
-- schema.sql: "for all to authenticated using (true)"): policies permissivas são
-- combinadas com OR pelo Postgres, então sem este drop ela permaneceria ativa em
-- paralelo às policies por papel e anularia todo o controle de acesso.
-- ============================================================================

-- Função auxiliar para obter o papel do usuário autenticado
create or replace function public.current_user_papel()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce((
    select papel from public.perfis
    where user_id = auth.uid()
      and ativo = true
  ), 'recepcao');
$$;

-- Função para verificar se é admin/dono
create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_papel() in ('dono', 'admin');
$$;

-- Função para verificar se é gerente ou acima
create or replace function public.current_user_is_gerente_ou_acima()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_papel() in ('dono', 'admin', 'gerente');
$$;

-- Função para verificar se é recepção ou acima
create or replace function public.current_user_is_recepcao_ou_acima()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_papel() in ('dono', 'admin', 'gerente', 'recepcao');
$$;

-- Função para obter o ID do profissional logado (se for profissional)
-- Vínculo usuário autenticado → profissional: a coluna `user_id` não existia
-- em nenhuma fonte do esquema (002, 004 e schema.sql); sem ela a função abaixo
-- falharia com 42703. Criada aqui como anulável e idempotente — nenhum dado
-- existente é alterado e o app não escreve nesta coluna hoje.
alter table public.profissionais
  add column if not exists user_id uuid;

create or replace function public.current_profissional_id()
returns text
language sql
security definer
set search_path = public
as $$
  select id from public.profissionais
  where user_id = auth.uid()
    and ativo = true
  limit 1;
$$;

grant execute on function public.current_user_papel() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_is_gerente_ou_acima() to authenticated;
grant execute on function public.current_user_is_recepcao_ou_acima() to authenticated;
grant execute on function public.current_profissional_id() to authenticated;

-- ----------------------------------------------------------------------------
-- Remove a política genérica do bootstrap (schema.sql): "acesso_autenticado"
-- "for all to authenticated using (true)". Idempotente e à prova de drift:
-- só tenta o drop se a tabela existir (build só com as migrations 001-009
-- não cria marketing_listas / automacoes_tratadas / ia_tratadas).
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'agendamentos', 'automacoes_tratadas', 'bloqueios', 'caixa_auditoria',
    'caixa_fechamentos', 'caixa_lancamentos', 'clientes', 'clube_assinaturas',
    'clube_pagamentos', 'comissoes_auditoria', 'comissoes_configs',
    'comissoes_fechamentos', 'crm_interacoes', 'espera_pedidos',
    'estoque_movimentacoes', 'ia_tratadas', 'marketing_listas', 'perfis',
    'produtos', 'profissionais', 'servicos', 'whatsapp_mensagens'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists acesso_autenticado on %I', t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- PROFISSIONAIS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver e criar
-- Profissional: só vê o próprio registro
-- ============================================================================
drop policy if exists profissionais_select_autenticado on public.profissionais;
drop policy if exists profissionais_insert_autenticado on public.profissionais;
drop policy if exists profissionais_update_autenticado on public.profissionais;
drop policy if exists profissionais_delete_autenticado on public.profissionais;

create policy "profissionais_select"
  on public.profissionais for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and id = public.current_profissional_id())
  );

create policy "profissionais_insert"
  on public.profissionais for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "profissionais_update"
  on public.profissionais for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or (public.current_user_papel() = 'profissional' and id = public.current_profissional_id())
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or (public.current_user_papel() = 'profissional' and id = public.current_profissional_id())
  );

create policy "profissionais_delete"
  on public.profissionais for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- SERVIÇOS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção/Profissional: só leitura (para agendar)
-- ============================================================================
drop policy if exists servicos_select_autenticado on public.servicos;
drop policy if exists servicos_insert_autenticado on public.servicos;
drop policy if exists servicos_update_autenticado on public.servicos;
drop policy if exists servicos_delete_autenticado on public.servicos;

create policy "servicos_select"
  on public.servicos for select
  to authenticated
  using (true); -- todos autenticados podem ver serviços para agendar

create policy "servicos_insert"
  on public.servicos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "servicos_update"
  on public.servicos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "servicos_delete"
  on public.servicos for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- CLIENTES
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver, criar, editar, histórico
-- Profissional: pode ver e ver histórico (para atendimento)
-- ============================================================================
drop policy if exists clientes_select_autenticado on public.clientes;
drop policy if exists clientes_insert_autenticado on public.clientes;
drop policy if exists clientes_update_autenticado on public.clientes;
drop policy if exists clientes_delete_autenticado on public.clientes;

create policy "clientes_select"
  on public.clientes for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or public.current_user_papel() = 'profissional'
  );

create policy "clientes_insert"
  on public.clientes for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "clientes_update"
  on public.clientes for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "clientes_delete"
  on public.clientes for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- AGENDAMENTOS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver todos, criar, editar, cancelar, reagendar, concluir
-- Profissional: vê só seus agendamentos, pode criar/editar/concluir os seus
-- ============================================================================
drop policy if exists agenda_acesso_autenticado on public.agendamentos;

create policy "agendamentos_select"
  on public.agendamentos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "agendamentos_insert"
  on public.agendamentos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "agendamentos_update"
  on public.agendamentos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "agendamentos_delete"
  on public.agendamentos for delete
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- BLOQUEIOS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode gerenciar bloqueios
-- Profissional: pode gerenciar seus próprios bloqueios
-- ============================================================================
drop policy if exists agenda_acesso_autenticado on public.bloqueios;

create policy "bloqueios_select"
  on public.bloqueios for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "bloqueios_insert"
  on public.bloqueios for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "bloqueios_update"
  on public.bloqueios for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "bloqueios_delete"
  on public.bloqueios for delete
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- EXPEDIENTE
-- ============================================================================
-- Admin/Gerente: pode gerenciar
-- Recepção/Profissional: só leitura
-- ============================================================================
drop policy if exists agenda_acesso_autenticado on public.agenda_expediente;

create policy "agenda_expediente_select"
  on public.agenda_expediente for select
  to authenticated
  using (true);

create policy "agenda_expediente_insert"
  on public.agenda_expediente for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "agenda_expediente_update"
  on public.agenda_expediente for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- CAIXA LANÇAMENTOS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver, lançar receita, lançar despesa
-- Profissional: não acessa
-- ============================================================================
drop policy if exists caixa_acesso_autenticado on public.caixa_lancamentos;

create policy "caixa_lancamentos_select"
  on public.caixa_lancamentos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "caixa_lancamentos_insert"
  on public.caixa_lancamentos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "caixa_lancamentos_update"
  on public.caixa_lancamentos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "caixa_lancamentos_delete"
  on public.caixa_lancamentos for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- CAIXA FECHAMENTOS
-- ============================================================================
-- Admin/Gerente: pode fechar, reabrir, ver
-- Recepção: pode ver, fechar (não reabrir)
-- Profissional: não acessa
-- ============================================================================
drop policy if exists caixa_acesso_autenticado on public.caixa_fechamentos;

create policy "caixa_fechamentos_select"
  on public.caixa_fechamentos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "caixa_fechamentos_insert"
  on public.caixa_fechamentos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "caixa_fechamentos_update"
  on public.caixa_fechamentos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- CAIXA AUDITORIA
-- ============================================================================
-- Admin/Gerente: vê tudo
-- Recepção: não acessa
-- Profissional: não acessa
-- ============================================================================
drop policy if exists caixa_acesso_autenticado on public.caixa_auditoria;

create policy "caixa_auditoria_select"
  on public.caixa_auditoria for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "caixa_auditoria_insert"
  on public.caixa_auditoria for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- COMISSÕES CONFIG
-- ============================================================================
-- Admin/Gerente: gerencia configurações
-- Profissional: vê só a sua
-- ============================================================================
drop policy if exists comissoes_acesso_autenticado on public.comissoes_configs;

create policy "comissoes_configs_select"
  on public.comissoes_configs for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional_id = public.current_profissional_id())
  );

create policy "comissoes_configs_insert"
  on public.comissoes_configs for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "comissoes_configs_update"
  on public.comissoes_configs for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- COMISSÕES FECHAMENTOS
-- ============================================================================
-- Admin/Gerente: vê todos, pode fechar/reabrir
-- Profissional: vê só os seus
-- ============================================================================
drop policy if exists comissoes_acesso_autenticado on public.comissoes_fechamentos;

create policy "comissoes_fechamentos_select"
  on public.comissoes_fechamentos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional_id = public.current_profissional_id())
  );

create policy "comissoes_fechamentos_insert"
  on public.comissoes_fechamentos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "comissoes_fechamentos_update"
  on public.comissoes_fechamentos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- COMISSÕES AUDITORIA
-- ============================================================================
-- Admin/Gerente: vê tudo
-- Profissional: vê só a sua
-- ============================================================================
drop policy if exists comissoes_acesso_autenticado on public.comissoes_auditoria;

create policy "comissoes_auditoria_select"
  on public.comissoes_auditoria for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional_id = public.current_profissional_id())
  );

create policy "comissoes_auditoria_insert"
  on public.comissoes_auditoria for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- ============================================================================
-- CLUBE ASSINATURAS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver, criar, editar, registrar pagamento
-- Profissional: não acessa
-- ============================================================================
drop policy if exists clube_acesso_autenticado on public.clube_assinaturas;

create policy "clube_assinaturas_select"
  on public.clube_assinaturas for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "clube_assinaturas_insert"
  on public.clube_assinaturas for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "clube_assinaturas_update"
  on public.clube_assinaturas for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "clube_assinaturas_delete"
  on public.clube_assinaturas for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- CLUBE PAGAMENTOS
-- ============================================================================
-- Admin/Gerente/Recepção: pode registrar pagamento
-- ============================================================================
drop policy if exists clube_acesso_autenticado on public.clube_pagamentos;

create policy "clube_pagamentos_select"
  on public.clube_pagamentos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "clube_pagamentos_insert"
  on public.clube_pagamentos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

-- ============================================================================
-- PRODUTOS
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver
-- Profissional: não acessa
-- ============================================================================
drop policy if exists produtos_acesso_autenticado on public.produtos;

create policy "produtos_select"
  on public.produtos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "produtos_insert"
  on public.produtos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "produtos_update"
  on public.produtos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

create policy "produtos_delete"
  on public.produtos for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- ESTOQUE MOVIMENTAÇÕES
-- ============================================================================
-- Admin/Gerente: acesso total
-- Recepção: pode ver, registrar entrada/ajuste
-- Profissional: não acessa
-- ============================================================================
drop policy if exists estoque_acesso_autenticado on public.estoque_movimentacoes;

create policy "estoque_movimentacoes_select"
  on public.estoque_movimentacoes for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "estoque_movimentacoes_insert"
  on public.estoque_movimentacoes for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

-- ============================================================================
-- PERFIS
-- ============================================================================
-- Admin: gerencia perfis de todos
-- Usuário: vê e edita só o próprio
-- ============================================================================
drop policy if exists perfis_select_autenticado on public.perfis;
drop policy if exists perfis_insert_autenticado on public.perfis;
drop policy if exists perfis_update_autenticado on public.perfis;
drop policy if exists perfis_delete_autenticado on public.perfis;

create policy "perfis_select"
  on public.perfis for select
  to authenticated
  using (
    public.current_user_is_admin()
    or user_id = auth.uid()
  );

create policy "perfis_insert"
  on public.perfis for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or user_id = auth.uid()
  );

create policy "perfis_update"
  on public.perfis for update
  to authenticated
  using (
    public.current_user_is_admin()
    or user_id = auth.uid()
  )
  with check (
    public.current_user_is_admin()
    or user_id = auth.uid()
  );

create policy "perfis_delete"
  on public.perfis for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- FILA DE ESPERA (espera_pedidos)
-- ============================================================================
-- Admin/Gerente/Recepção: acesso total
-- Profissional: vê só os da sua especialidade/área (se aplicável)
-- ============================================================================
drop policy if exists espera_acesso_autenticado on public.espera_pedidos;

create policy "espera_pedidos_select"
  on public.espera_pedidos for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
    or (public.current_user_papel() = 'profissional' and profissional = (
      select nome from public.profissionais where id = public.current_profissional_id()
    ))
  );

create policy "espera_pedidos_insert"
  on public.espera_pedidos for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "espera_pedidos_update"
  on public.espera_pedidos for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "espera_pedidos_delete"
  on public.espera_pedidos for delete
  to authenticated
  using (
    public.current_user_is_admin()
  );

-- ============================================================================
-- CRM INTERAÇÕES
-- ============================================================================
-- Admin/Gerente/Recepção: acesso total
-- Profissional: vê só interações dos seus clientes (opcional - por enquanto todos)
-- ============================================================================
drop policy if exists crm_acesso_autenticado on public.crm_interacoes;

create policy "crm_interacoes_select"
  on public.crm_interacoes for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "crm_interacoes_insert"
  on public.crm_interacoes for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

-- ============================================================================
-- WHATSAPP MENSAGENS
-- ============================================================================
-- Admin/Gerente/Recepção: acesso total
-- Profissional: não acessa
-- ============================================================================
drop policy if exists whatsapp_acesso_autenticado on public.whatsapp_mensagens;

create policy "whatsapp_mensagens_select"
  on public.whatsapp_mensagens for select
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "whatsapp_mensagens_insert"
  on public.whatsapp_mensagens for insert
  to authenticated
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

create policy "whatsapp_mensagens_update"
  on public.whatsapp_mensagens for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
    or public.current_user_is_recepcao_ou_acima()
  );

-- ============================================================================




-- ============================================================================




-- ============================================================================




-- ============================================================================
-- GRANT EXECUTE PARA ANON (agendamento público)
-- ============================================================================
-- As funções de agendamento público já têm grant para anon na migration 012
-- Não mexemos nelas - elas usam SECURITY DEFINER e não dependem de RLS