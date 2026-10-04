-- ============================================================================
-- 041_perfis_e_conta_do_cliente.sql - a conta de cliente dentro do RLS certo
-- ============================================================================
--
-- O QUE ESTE SCRIPT É (e o que ele NÃO é)
--
-- Ele foi reescrito depois de auditar o banco real. A versão anterior criava
-- uma SEGUNDA tabela `perfis` com coluna `auth_uid` e papel ('equipe' |
-- 'cliente') — e falharia na primeira linha que não é `create table if not
-- exists`: `insert into public.perfis (auth_uid, ...)` num banco cujo `perfis`
-- já existe desde a 001 com `user_id`. Também duplicava um modelo que já
-- existe, o que é proibido aqui.
--
-- AUDITORIA: o que JÁ FECHAVA o acesso do cliente antes desta migration
--
-- A conta de cliente não é coisa nova — ela nasceu na 018 junto com o Painel do
-- Cliente, e as políticas por papel da 014/017 já tinham substituído todos os
-- `using (true)` originais. O estado real é este:
--
--   tabela            | política que manda                 | cliente vê
--   ------------------+------------------------------------+------------------
--   clientes          | clientes_select_proprio (018)      | só a PRÓPRIA linha
--                     | clientes_*_por_papel (017)         | (papel = null nega)
--   agendamentos      | agendamentos_select_proprio (018)  | só os PRÓPRIOS
--                     | agendamentos_*_por_papel (017)     |
--   clube_assinaturas | ..._select_proprio (018)           | só a própria
--   clube_pagamentos  | ..._select_proprio (018)           | só o próprio
--   perfis            | perfis_select_por_papel (017)      | admin ou a própria
--   caixa/estoque/    | *_por_papel (017)                  | nada (papel null)
--   comissões/crm/    |                                    |
--   whatsapp/bloqueios|                                    |
--
-- O mecanismo é `public.current_user_papel()` (017:40), que devolve NULL para
-- quem não tem linha em `perfis` — e NULL nega tudo. Como NENHUM código cria
-- linha de `perfis` para conta de cliente (o trigger 018/017 bloqueia insert
-- sem admin), a conta do cliente nasce sem papel e, por desenho, sem acesso à
-- operação interna. Escrita em `clientes`/`agendamentos` também é negada, e o
-- agendamento público não depende de policy: `agendamento_publico_criar` é
-- `security definer` (012/021/040).
--
-- Conclusão: `clientes` e `agendamentos` NÃO precisam de política nova aqui.
-- Repetir um `eh_equipe()` / `perfis.auth_uid` seria criar um segundo modelo de
-- papel ao lado do que já existe — exatamente o que não pode ser feito.
--
-- O QUE FALTAVA (e é o motivo de existir esta migration)
--
-- A 014 substituiu o `agenda_acesso_autenticado ... using (true)` da 007 por
-- uma política de leitura que também ficou `using (true)` (014:386). A 017
-- criou `agenda_expediente_select_por_papel`, mas como policies PERMISSIVAS são
-- unidas por OU, a permissiva antiga continuava vencendo: qualquer sessão
-- autenticada — inclusive a de um cliente — lia o expediente inteiro da casa.
--
-- `agenda_expediente` é dado de operação interna (dias, janelas, almoço). Não é
-- dado do cliente. E a vitrine não precisa dela por RLS: o expediente chega ao
-- público por `agendamento_publico_slots` e `agenda_expediente_do_dia`, ambos
-- `security definer`.
--
-- E QUÊM É EQUIPE AGORA
--
-- Ninguém é promovido aqui. Quem tem linha em `perfis` com papel de equipe já
-- é a equipe, e continua com o mesmo acesso de antes. Conta criada DEPOIS
-- desta migration pela tela de cadastro do cliente é cliente, e continua sem
-- linha em `perfis` — o que a mantém fora do painel interno.
--
-- Se um dia uma conta nova tiver que virar equipe, o caminho é o de sempre:
--     insert into public.perfis (user_id, nome, email, papel)
--     values ('<uuid>', '<nome>', '<email>', 'recepcao');
--
-- O QUE NÃO MUDA
--
--   • A equipe segue vendo e fazendo exatamente o que via antes.
--   • Nenhuma tabela é criada, renomeada ou apagada.
--   • Nenhuma coluna é adicionada: os vínculos já existem —
--     `clientes.auth_user_id` e `agendamentos.cliente_id` (018).
--   • Nenhuma regra de preço, vaga, comissão, fechamento ou Club é tocada.
--   • O agendamento criado pelo cliente continua entrando na MESMA tabela
--     `agendamentos`, que é a mesma que a equipe lê na Agenda interna.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Fecha o último `using (true)` que uma conta de cliente conseguia ler
-- ----------------------------------------------------------------------------
--
-- A política `agenda_expediente_select` (014:386) era `using (true)` e não foi
-- substituída pela 017 — ela foi apenas convivendo com a nova. Removê-la faz o
-- SELECT cair inteiramente em `agenda_expediente_select_por_papel`, que exige
-- `current_user_is_recepcao_ou_acima()`.
--
-- Idempotente: `drop policy if exists`. Sem drop não há como "remover" uma
-- policy, e esta migration pode ser reaplicada.
-- ----------------------------------------------------------------------------
drop policy if exists agenda_expediente_select on public.agenda_expediente;

-- Confirmação de que a política permissiva de leitura sumiu: a query falha em
-- produção se ainda existir, o que transformaria um regresso silencioso em
-- erro visível logo na primeira checagem.
do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'agenda_expediente'
       and policyname = 'agenda_expediente_select'
  ) then
    raise exception '041: agenda_expediente_select ainda existe (using true)';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) Nada mais a fazer — e deixar isso explícito
-- ----------------------------------------------------------------------------
--
-- `clientes`, `agendamentos`, `perfis`, `clube_assinaturas` e `clube_pagamentos`
-- já estão com a leitura restrita ao próprio registro (018) e a escrita por
-- papel (017). Nenhuma `create table`, nenhum `add column`, nenhuma política
-- sobre `clientes` ou `agendamentos` é criada aqui: criá-las seria uma segunda
-- versão de uma regra que já existe.
--
-- O que a conta de cliente ganhou com isto:
--   • lê a PRÓPRIA ficha em `clientes`             (018, inalterado)
--   • lê os PRÓPRIOS agendamentos                  (018, inalterado)
--   • NÃO lê mais o expediente interno da casa     (esta migration)
--   • NÃO escreve nada fora das RPCs de posse      (017/018, inalterado)
--   • NÃO entra no painel da equipe                (sem linha em `perfis`)

notify pgrst, 'reload schema';
