-- ----------------------------------------------------------------------------
-- Studio Audax — 043: perfis.papel volta a aceitar todos os papéis do painel
-- ----------------------------------------------------------------------------
-- Causa (drift de versionamento, não bug de código):
--   `001_perfis.sql` foi editada DEPOIS de aplicada (commit 8fec1ac ampliou o
--   check de ('admin', 'recepcao', 'profissional') para os cinco papéis
--   atuais). Como a 001 já estava registrada no remoto, a edição nunca
--   re-executou e a produção ficou com a constraint antiga. Cadastro de um
--   `dono` (ou `gerente`) falhava com:
--
--     new row for relation "perfis" violates check constraint "perfis_papel_check"
--
-- Correção: SOMENTE a constraint, com os cinco valores oficiais de
-- `PapelPerfil` (src/modules/auth/tipos.ts) — os mesmos do arquivo 001.
--
-- O que esta migration NÃO faz (de propósito):
--   * não altera nenhum dado: as linhas existentes (admin, profissional)
--     continuam válidas e continuam onde estão;
--   * não mexe em default, colunas, policies, RLS (014/017/042 intactas);
--   * não cria regra nenhuma entre papel e vínculo profissional —
--     `profissionais.user_id` segue independente do papel, como já é:
--     dono + vínculo, admin + vínculo, profissional + vínculo, todos válidos;
--   * não toca em Caixa, Agenda, Clube, Estoque, Comissões, WhatsApp.
--
-- O dono continua invariável e com acesso total: isso não vem da constraint,
-- vem de `permissoes.ts`, do trigger `perfis_guardar_papel` (017) e da 042
-- (`current_user_permissao()` devolve null para dono).
--
-- Idempotente: drop constraint if exists + add constraint.
-- ----------------------------------------------------------------------------

alter table public.perfis drop constraint if exists perfis_papel_check;

alter table public.perfis add constraint perfis_papel_check
  check (papel in ('dono', 'admin', 'gerente', 'recepcao', 'profissional'));

-- Verificação automática: se a constraint não sair com dono e gerente
-- aceitos, o push falha em vez de seguir com meia correção.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.perfis'::regclass
       and conname = 'perfis_papel_check'
       and pg_get_constraintdef(oid) like '%dono%'
       and pg_get_constraintdef(oid) like '%gerente%'
  ) then
    raise exception '043: perfis_papel_check nao aceita dono/gerente';
  end if;
end $$;
