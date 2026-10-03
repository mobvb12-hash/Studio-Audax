-- ============================================================================
-- 025_catalogo_complementos.sql — complementos no catálogo oficial (item 3)
-- ----------------------------------------------------------------------------
-- A sugestão inteligente de serviço complementar precisa respeitar o que está
-- REALMENTE cadastrado (`servicos.complementos`, coluna da 019 — já editável
-- pela tela de Serviços do admin). A IA, porém, lia o catálogo público sem
-- essa coluna e, sem ela, só teria duas opções ruins: chutar serviço (proibido)
-- ou não sugerir nada.
--
-- Esta migration devolve `complementos` no catálogo público — a MESMA coluna
-- oficial, os MESMOS ids, resolvidos contra os próprios serviços ATIVOS. Nada
-- de nome/preço escrito à mão: quem consome (Painel e IA) resolve id → serviço
-- no mesmo catálogo, e serviço inativo ou autorreferência simplesmente não
-- aparece (o filtro é do lado do consumidor e também aqui).
--
-- Nenhum dado pessoal é exposto: continuam sendo só id, nome, preço, duração e
-- a lista de ids de complemento. Telefone/e-mail do profissional seguem fora
-- (razão registrada no cabeçalho da 012).
--
-- Idempotente: `create or replace function` com a MESMA assinatura.
-- ============================================================================

create or replace function public.agendamento_publico_catalogo()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'servicos', coalesce((
      select json_agg(
        json_build_object(
          'id', s.id,
          'nome', s.nome,
          'preco', s.preco,
          'duracaoMin', s.duracao_min,
          -- ids de complemento, só os que apontam para serviço ATIVO e não
          -- para o próprio serviço (o resto nunca entra na sugestão)
          'complementos', (
            select coalesce(
              json_agg(c.id order by c.nome),
              '[]'::json
            )
              from unnest(coalesce(s.complementos, '{}'::text[])) c_id
              join servicos c
                on c.id = c_id
               and c.ativo
               and c.id <> s.id
          )
        ) order by s.nome
      )
      from servicos s
      where s.ativo
    ), '[]'::json),
    'profissionais', coalesce((
      select json_agg(
        json_build_object('id', p.id, 'nome', p.nome) order by p.nome
      )
      from profissionais p
      where p.ativo
    ), '[]'::json)
  );
$$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
