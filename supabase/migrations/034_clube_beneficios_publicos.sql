-- ============================================================================
-- 034_clube_beneficios_publicos.sql - o que o CLIENTE lê sobre o seu plano
-- ============================================================================
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A Área do Cliente (`/cliente`) precisa mostrar os benefícios do plano
-- ("corte ilimitado", "10% em químicos"). O texto oficial desses benefícios
-- NÃO é uma frase do código: ele já existe na configuração da casa
-- (`configuracoes_sistema.clube`), que é a MESMA chave que o
-- `audax_clube_beneficio` (028) lê no momento do atendimento:
--
--     clube.coberturas.<plano>          categorias cobertas (ilimitado)
--     clube.desconto.quimicos           fração, 0.10 = 10%
--     clube.desconto.produtos           fração, 0.10 = 10%
--     clube.desconto.categorias         quais categorias são "químico"
--
-- `configuracoes_sistema` NÃO tem policy: ninguém lê e ninguém escreve, por
-- design (a 022 cria a tabela fechada e a `admin_configuracoes_ler` é só para
-- a equipe). Repetir esses números no frontend criaria uma segunda fonte — e a
-- tela passaria a mentir no dia em que o dono mudasse a configuração.
--
-- O QUE ESTA FUNÇÃO FAZ
--
--   Projeta SÓ o que é público sobre o Clube: coberturas por plano, os
--   percentuais de desconto e os rótulos que a casa deu aos planos. É uma
--   leitura, sem escrita e sem tabela nova.
--
-- O QUE ESTA FUNÇÃO NÃO FAZ
--
--   • Não devolve assinatura, pagamento, cliente, valor de pote, comissão,
--     agenda ou qualquer dado de terceiro — o beneficiário do Club vem da
--     tabela `servicos`, que já é pública, e o resto nem é consultado.
--   • Não decide se o cliente tem direito ao benefício. Quem decide é
--     `audax_clube_beneficio`, na hora do atendimento, com a regra de
--     vigência. Esta função só diz O QUE o plano oferece.
--   • Não abre nada: `anon` e `authenticated` leem o mesmo conteúdo público,
--     porque a tela de planos é pública justamente para quem ainda não tem
--     conta.
--
-- ============================================================================

create or replace function public.clube_beneficios_publicos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'coberturas', coalesce(cfg -> 'coberturas', '{}'::jsonb),
        'desconto', jsonb_build_object(
          'quimicos', coalesce((cfg -> 'desconto' ->> 'quimicos')::numeric, 0),
          'produtos', coalesce((cfg -> 'desconto' ->> 'produtos')::numeric, 0),
          'categorias', coalesce(cfg -> 'desconto' -> 'categorias', '[]'::jsonb)
        ),
        'rotulos', coalesce(cfg -> 'beneficios' -> 'rotulos', '{}'::jsonb)
      )
      from (select valor as cfg from public.configuracoes_sistema where chave = 'clube') c
    ),
    jsonb_build_object(
      'coberturas', '{}'::jsonb,
      'desconto', jsonb_build_object('quimicos', 0, 'produtos', 0, 'categorias', '[]'::jsonb),
      'rotulos', '{}'::jsonb
    )
  );
$$;

comment on function public.clube_beneficios_publicos() is
  'Conteúdo público do Clube (coberturas e descontos do config oficial). '
  'Não devolve assinatura, cliente ou valor — a elegibilidade é decidida por '
  'audax_clube_beneficio no atendimento.';

-- ----------------------------------------------------------------------------
-- EXECUTE
--
-- PostgreSQL dá EXECUTE para PUBLIC em função nova; o conteúdo é público, mas
-- o revoke deixa explícito que a intenção foi pensada e não esquecida. O
-- `grant` explícito é o que o cliente e o agendamento público realmente usam.
-- ----------------------------------------------------------------------------
revoke execute on function public.clube_beneficios_publicos() from public;
revoke execute on function public.clube_beneficios_publicos() from anon;

grant execute on function public.clube_beneficios_publicos()
  to anon, authenticated, service_role;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
