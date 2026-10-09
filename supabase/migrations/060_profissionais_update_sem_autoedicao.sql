-- =====================================================================
-- 060 — profissionais: fecha a autoedição e o override sem papel
--
-- STATUS: APLICÁVEL. Promovida de `supabase/propostas/` depois da autorização
--         e da auditoria contra o banco REMOTO (policies, funções, triggers,
--         grants e mapa de permissões de `src/modules/auth/permissoes.ts`):
--         nenhuma correção foi necessária no SQL, nenhuma função nem trigger
--         escreve em `profissionais` e nenhum fluxo legítimo quebra (o único
--         caminho de autoedição era o ramo próprio da policy, que só a UI da
--         página de Profissionais — restrita a gerente+ — exercitava).
--         Aplicada por `supabase db push` na ordem 060 → 061.
--
-- PROBLEMA 1 — autoedição do próprio registro (sempre ativo)
--   A policy `profissionais_update` (migration 014) tem o ramo
--     or (current_user_papel() = 'profissional'
--         and id = public.current_profissional_id())
--   nos DOIS lados (USING e WITH CHECK). Policies PERMISSIVE de UPDATE são
--   OR entre si, então esse ramo sozinho autoriza o profissional a ALTERAR a
--   própria linha de `public.profissionais` pela API — incluindo `ativo`
--   (auto-inativação) e `user_id` (troca do vínculo que dá posse no RLS).
--
-- PROBLEMA 2 — override por ação sem papel (latente)
--   A 042 criou `profissionais_update_por_acao` como PERMISSIVE apenas com
--     current_user_permissao('profissionais:editar') is true
--   sem nenhum envelope de papel. Como as permissivas são OR, uma ÚNICA
--   linha em `perfis_permissoes` com `profissionais:editar = true` concederia
--   UPDATE em QUALQUER linha de `profissionais` — inclusive a de quem tem a
--   permissão e a dos colegas — mesmo que o papel da pessoa seja
--   'profissional' ou 'recepcao'. Hoje a tabela de overrides tem 0 linhas,
--   então o caminho está inerte; ele se ativa sozinho no primeiro override.
--   A restrictive (`_limite_por_acao`, `COALESCE(..., true)`) não fecha isso:
--   restrictive só VETA, nunca concede.
--
--   Mesmo defeito foi corrigido pela própria 059 em agendamentos e comissões
--   ("pares `*_por_acao` da 042 herdam o mesmo defeito: sem envelope de
--   posse, `permitido = true` concede acesso geral"). Esta migration faz o
--   mesmo, para a tabela/ação que sobrou dentro do escopo da auditoria.
--
-- O QUE MUDA (duas policies de UPDATE em `public.profissionais`)
--   1. `profissionais_update`      → admin/gerente+ (sai o ramo próprio);
--   2. `profissionais_update_por_acao` → permissão E papel (gerente+),
--      nos DOIS lados, no mesmo formato da 059.
--   Nada além de `public.profissionais` é tocado.
--
-- O QUE NÃO MUDA (operações legítimas preservadas)
--   * SELECT do próprio cadastro: `profissionais_select` mantém o ramo
--     `id = current_profissional_id()`;
--   * INSERT e DELETE de profissionais: continuam admin/gerente+ e admin;
--   * `profissionais_update_por_papel` (gerente+) intacta;
--   * `profissionais_update_limite_por_acao` (RESTRICTIVE) intacta: a
--     revogação por override (`permitido = false`) continua vetando a
--     operação inteira para todo mundo, inclusive para gerente;
--   * `perfis`, Agenda, Caixa, Comissões, Clube, Espera e regras
--     financeiras: nenhum arquivo desses é referenciado;
--   * demais tabelas: os pares `*_por_acao` de clientes, servicos, perfis e
--     agendamentos continuam exatamente como a 042/059 os deixaram.
--
-- CONSEQUÊNCIA DA ESCOLHA (exceção ao padrão da 042 — declarada)
--   Sim: `profissionais_update_por_acao` deixa de seguir o template genérico
--   da 042 (`permissão is true` sozinha) e passa a exigir papel, como a 059
--   já fez para `agendamentos_*_por_acao` e `comissoes_*_select_por_acao`.
--   A exceção é deliberada e restrita a UMA policy de UMA tabela:
--     * nenhum outro par `*_por_acao` muda (clientes/servicos/perfis
--       seguem o padrão da 042);
--     * reexecutar a 042 num ambiente novo recria o par sem o gate, mas a
--       060 roda DEPOIS da 042 na ordem, então o estado final é o correto;
--     * a alternative (pôr o gate na restrictive) foi descartada: restrictive
--       é o lugar do VETO (`permitido = false`), não do requisito de papel,
--       e ela já é `COALESCE(..., true)` por contrato da 042.
--
-- EFEITO SOBRE O APP
--   Nenhuma tela deixa de funcionar. Os caminhos de escrita em
--   `profissionais` são `services/supabase/profissionais.ts`
--   (criar/atualizar/ativar/remover/importar), todos chamados pela página
--   Profissionais — gateada em `profissionais:criar|editar|ativar_inativar`
--   (dono/admin/gerente no mapa único). `profissionais:editar` não existe
--   nem para recepção nem para profissional em `permissoes.ts`.
--
-- REVERSÃO
--   Recriar as duas policies com o texto original (014 para a primeira e a
--   042 para a segunda) devolve o estado anterior.
--
-- CONVENÇÕES
--   `drop policy if exists` + `create policy` (idempotente), zero escrita de
--   dado, zero alteração de tabela/coluna, asserções em `do $$` que abortam
--   a migration inteira se a regra não sair como esperado, e
--   `notify pgrst, 'reload schema'` no final.
-- =====================================================================

-- 1) A autoedição: o ramo `profissional ∧ própria linha` sai dos dois lados.
drop policy if exists profissionais_update on public.profissionais;

create policy "profissionais_update"
  on public.profissionais for update
  to authenticated
  using (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_is_admin()
    or public.current_user_is_gerente_ou_acima()
  );

-- 2) O override por ação: `profissionais:editar` sozinho não concede mais
--    UPDATE — o mesmo envelope de papel que a 059 usou em agendamentos.
drop policy if exists profissionais_update_por_acao on public.profissionais;

create policy profissionais_update_por_acao on public.profissionais
  as permissive for update to authenticated
  using (
    public.current_user_permissao('profissionais:editar') is true
    and public.current_user_is_gerente_ou_acima()
  )
  with check (
    public.current_user_permissao('profissionais:editar') is true
    and public.current_user_is_gerente_ou_acima()
  );

do $$
declare
  v_count integer;
  v_qual text;
  v_check text;
  v_tipo text;
begin
  -- E060_1: existe exatamente UMA policy com esse nome (o drop garantiu).
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_update';
  if v_count <> 1 then
    raise exception 'E060_1: esperava 1 policy profissionais_update, encontrou %', v_count;
  end if;

  -- E060_2: a policy tem os dois lados (USING e WITH CHECK).
  select qual, with_check into v_qual, v_check
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_update';
  if v_qual is null or v_check is null then
    raise exception 'E060_2: profissionais_update sem qual ou sem with_check';
  end if;

  -- E060_3: o ramo de auto-edição saiu dos DOIS lados.
  if v_qual like '%current_profissional_id%'
     or v_check like '%current_profissional_id%' then
    raise exception 'E060_3: o ramo de auto-edicao continua em profissionais_update';
  end if;

  -- E060_4: admin e gerente continuam podendo editar (nada legítimo foi perdido).
  if v_qual not like '%current_user_is_gerente_ou_acima%'
     or v_check not like '%current_user_is_gerente_ou_acima%' then
    raise exception 'E060_4: admin/gerente perderam a escrita em profissionais';
  end if;

  -- E060_5: o SELECT do próprio cadastro continua (o profissional ainda se enxerga).
  select qual into v_qual
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_select';
  if v_qual is null or v_qual not like '%current_profissional_id%' then
    raise exception 'E060_5: profissionais_select perdeu a leitura do proprio cadastro';
  end if;

  -- E060_6: nenhuma policy de profissionais foi criada nem destruída (16 no
  -- total, medido no banco em 08/10/2026; 058 e 060 recriam 3 e 2 delas).
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais';
  if v_count <> 16 then
    raise exception 'E060_6: esperava 16 policies em profissionais, encontrou %', v_count;
  end if;

  -- E060_7: a policy por PAPEL (gerente+) continua existindo.
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_update_por_papel';
  if v_count <> 1 then
    raise exception 'E060_7: profissionais_update_por_papel desapareceu';
  end if;

  -- E060_8: `perfis` (edição do perfil pessoal) não foi alcançada por esta migration.
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public'
     and tablename = 'perfis'
     and cmd = 'UPDATE';
  if v_count < 1 then
    raise exception 'E060_8: perfis perdeu a policy de UPDATE';
  end if;

  -- E060_9: o par `por_acao` de UPDATE foi recriado, PERMISSIVE, em cima
  -- da MESMA tabela/comando de antes.
  select count(*), min(permissive::text), min(cmd::text) into v_count, v_tipo, v_check
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_update_por_acao';
  if v_count <> 1 or v_tipo is distinct from 'PERMISSIVE' or v_check is distinct from 'UPDATE' then
    raise exception 'E060_9: profissionais_update_por_acao = %/%/% (esperado 1/PERMISSIVE/UPDATE)',
      v_count, v_tipo, v_check;
  end if;

  -- E060_10: permissão E papel nos DOIS lados, sem ramo de auto-edição —
  -- é isto que impede `profissionais:editar` de conceder UPDATE sozinha.
  select qual, with_check into v_qual, v_check
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_update_por_acao';
  if v_qual not like '%current_user_permissao%'
     or v_qual not like '%profissionais:editar%'
     or v_qual not like '%current_user_is_gerente_ou_acima%'
     or v_check not like '%current_user_permissao%'
     or v_check not like '%profissionais:editar%'
     or v_check not like '%current_user_is_gerente_ou_acima%' then
    raise exception 'E060_10: profissionais_update_por_acao sem permissao E papel dos dois lados';
  end if;
  if v_qual like '%current_profissional_id%' or v_check like '%current_profissional_id%' then
    raise exception 'E060_10: profissionais_update_por_acao ganhou ramo de auto-edicao';
  end if;

  -- E060_11: a RESTRICTIVE ficou intacta — a revogação (`permitido = false`)
  -- continua vetando UPDATE para todo mundo, inclusive para gerente.
  select permissive, qual into v_tipo, v_qual
    from pg_policies
   where schemaname = 'public'
     and tablename = 'profissionais'
     and policyname = 'profissionais_update_limite_por_acao';
  if v_tipo is distinct from 'RESTRICTIVE'
     or v_qual is null
     or v_qual not ilike '%coalesce(current_user_permissao%' then
    raise exception 'E060_11: profissionais_update_limite_por_acao deixou de ser o veto da 042';
  end if;
end $$;

notify pgrst, 'reload schema';
