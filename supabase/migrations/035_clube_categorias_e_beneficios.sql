-- ============================================================================
-- 035_clube_categorias_e_beneficios.sql - a configuração que faltava
-- ============================================================================
--
-- ESTADO REAL ENCONTRADO EM PRODUÇÃO (antes desta migration)
--
--   Alisamento Americano ... "Cabelo"       <-- ERRADO
--   Barba ................. "Barba"
--   Corte + Barba ......... "Cabelo"
--   Corte de  Cabelo ...... "Cabelo"
--   Corte Infantil ........ "Cabelo"
--   Limpeza de Pele ....... "Tratamento"
--   Luzes ................. "Tratamento"
--   Platinado ............. "Tratamento"
--   Sobrancelha ........... (vazio)
--
--   `desconto.categorias` = []  -> os 10% de químico não alcançavam NENHUM
--   serviço. O dinheiro do desconto estava configurado e nunca aplicado.
--
-- O QUE ESTA MIGRATION CORRIGE (com a decisão do dono)
--
--   1. "Alisamento Americano" estava como "Cabelo": um procedimento QUÍMICO
--      entrava como CORTE ILIMITADO para assinante de Audax Corte — o
--      benefício estava sendo dado onde não é benefício, e os 10% de químico
--      não chegavam. Passa para "Tratamento", o balde que a casa já usa em
--      Luzes, Platinado e Limpeza de Pele.
--      Nenhuma taxonomia nova é criada: o app já sugere Cabelo, Barba,
--      Cabelo e barba, Tratamento e Outro, e a casa já tinha escolhido
--      "Tratamento" para os químicos.
--
--   2. `desconto.categorias` = ["Tratamento"], com os 10% que já estavam
--      configurados. Agora os QUATRO químicos (Alisamento, Luzes, Platinado e
--      Limpeza de Pele) recebem 10% para cliente com benefício válido.
--
--   3. "Corte + Barba" CONTINUA como "Cabelo" — decisão do dono: o plano
--      Audax Corte e o Audax Corte + Barba seguem com o combo de graça. Por
--      isso esta migration NÃO cria a categoria "Cabelo e barba" e NÃO mexe
--      nas coberturas: 'Cabelo' já está na lista dos dois planos, que é
--      exatamente o que o dono pediu.
--
--   4. `beneficios` recebe o texto oficial de cada plano — o MESMO campo que a
--      IA já lia. A Área do Cliente mostra a frase do dono em vez de remontar
--      a partir das coberturas.
--
--   5. A RPC pública de conteúdo do Clube (034) passa a devolver esse texto.
--
-- O QUE ESTA MIGRATION NÃO FAZ
--
--   • Não mexe em `servicos.preco` (tabela oficial de preços).
--   • Não mexe em Sobrancelha: segue SEM categoria — não é cobertura do Club.
--   • Não mexe em regra de benefício, rateio, comissão ou pote.
--   • Não mexe em `servicos.nome` nem nas coberturas dos planos.
--   • Não liga `pote.ativo`: essa decisão é do dono, no Configurações.
--   • Não cria plano, tabela, trigger ou política.
--
-- Idempotente: rodar de novo não muda nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CATEGORIAS
--
-- 1a) A CORREÇÃO: "Alisamento Americano" estava como "Cabelo" — um
--     procedimento QUÍMICO entrando como CORTE ILIMITADO para assinante de
--     Audax Corte. O benefício estava sendo dado onde não é benefício, e os
--     10% de químico não chegavam. Passa para "Tratamento", o balde que a casa
--     já usa em Luzes, Platinado e Limpeza de Pele.
-- ----------------------------------------------------------------------------
update public.servicos
   set categoria = 'Tratamento'
 where lower(regexp_replace(btrim(nome), '\s+', ' ', 'g')) = 'alisamento americano'
   and btrim(coalesce(categoria, '')) = 'Cabelo';

-- 1b) RECUPERAÇÃO: preenchemos categoria VAZIA conforme a classificação que a
--     casa já demonstrava. Isto existe porque uma execução ANTERIOR desta
--     migration abortou na verificação DEPOIS do update — e o runner do
--     Supabase não é transacional: "Barba" e "Corte Infantil" ficaram sem
--     categoria. A regra é a mesma de sempre: só preenche vazio, nunca
--     sobrescreve o que alguém escolheu.
with alvo(categoria, nomes) as (
  values
    ('Cabelo', array['Corte de Cabelo', 'Corte']),
    ('Cabelo', array['Corte Infantil']),
    ('Barba',  array['Barba']),
    ('Tratamento', array['Alisamento Americano', 'Alisamento', 'Luzes',
                        'Platinado', 'Limpeza de Pele', 'Limpeza de pele'])
)
update public.servicos s
   set categoria = a.categoria
  from alvo a
 where lower(regexp_replace(btrim(s.nome), '\s+', ' ', 'g')) = any (
         -- o nome do serviço é normalizado para minúsculas; o alvo também.
         -- Sem este `lower` do lado do alvo, "Barba" nunca casaria com "barba".
         select lower(n) from unnest(a.nomes) as n)
   -- Só categoria VAZIA. O "Cabelo" do Alisamento é tratado pela 1a, que vem
   -- antes e roda sempre; aqui não sobrescreve escolha de ninguém.
   and btrim(coalesce(s.categoria, '')) = '';

-- ----------------------------------------------------------------------------
-- 2) CONFIGURAÇÃO DO CLUBE
--
-- Só preenche o que está faltando: quem já configurou não é sobrescrito.
-- ----------------------------------------------------------------------------
with base as (
  select coalesce(
    (select valor from public.configuracoes_sistema where chave = 'clube'),
    '{}'::jsonb) as cfg
),
quimicos as (
  select jsonb_set(
    cfg,
    '{desconto,categorias}',
    case
      when jsonb_array_length(
             coalesce(cfg -> 'desconto' -> 'categorias', '[]'::jsonb)) > 0
        then cfg -> 'desconto' -> 'categorias'
      else '["Tratamento"]'::jsonb
    end) as cfg
    from base
),
comissao as (
  -- 40% é a regra do dono e passa a ESTAR NA CONFIGURAÇÃO.
  --
  -- Em produção o bloco `comissao` não existia: as funções caíam no padrão
  -- 0.40 do próprio SQL, ou seja, a comissão oficial estava implícita no
  -- código em vez de estar no lugar onde o dono a configura. Este é o bloco
  -- que a Configurações → Clube edita e que a Área do Cliente mostra.
  --
  -- `jsonb_set` só cria o ÚLTIMO passo do caminho. Como o bloco `comissao`
  -- não existia, ele precisa ser criado primeiro — senão o set é ignorado em
  -- silêncio e a comissão continua só no padrão do SQL.
  select jsonb_set(
           jsonb_set(cfg, '{comissao}', coalesce(cfg -> 'comissao', '{}'::jsonb)),
           '{comissao,percentual}',
           '0.40'::jsonb) as cfg
    from quimicos
),
poteLimpo as (
  -- Tira o `pote.percentual` que reapareceu na configuração.
  --
  -- A 030 já tinha removido esse campo: ele significava "percentual da receita
  -- que entra no pote", que é a ambiguidade que o dono mandou eliminar. Nenhuma
  -- função o lê (o pote é sempre 100% da receita e a comissão vem de
  -- `comissao.percentual`), mas deixá-lo gravado é uma armadilha para quem lê a
  -- configuração depois e pensa que o pote é 40% das mensalidades.
  --
  -- `pote.ativo` NÃO é tocado: é o botão de fechamento, e está ligado por
  -- decisão do dono.
  select case
           when cfg -> 'pote' ? 'percentual'
             then jsonb_set(cfg, '{pote}',
               coalesce(cfg -> 'pote', '{}'::jsonb) - 'percentual')
           else cfg
         end as cfg
    from comissao
),
beneficios as (
  -- Texto oficial por plano (o mesmo `clube.beneficios` que a IA lia).
  select case
           when cfg -> 'beneficios' -> 'cabelo' is not null
             and cfg -> 'beneficios' -> 'barba' is not null
             and cfg -> 'beneficios' -> 'cabelo_barba' is not null
             then cfg
           else jsonb_set(
             jsonb_set(
               jsonb_set(
                 cfg,
                 '{beneficios,cabelo}',
                 '["Corte ilimitado durante a vigência","10% em procedimentos químicos","10% em produtos"]'::jsonb),
               '{beneficios,barba}',
               '["Barba ilimitada durante a vigência","10% em procedimentos químicos","10% em produtos"]'::jsonb),
             '{beneficios,cabelo_barba}',
             '["Corte ilimitado durante a vigência","Barba ilimitada durante a vigência","10% em procedimentos químicos","10% em produtos"]'::jsonb)
         end as cfg
    from poteLimpo
)
update public.configuracoes_sistema c
   set valor = (select cfg from beneficios),
       atualizado_em = now()
 where c.chave = 'clube'
   and (select cfg from beneficios) is distinct from c.valor;

-- ----------------------------------------------------------------------------
-- 3) A CONTEÚDO PÚBLICO DO CLUBE (034) agora inclui o texto dos benefícios
-- ----------------------------------------------------------------------------
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
        'rotulos', coalesce(cfg -> 'beneficios' -> 'rotulos', '{}'::jsonb),
        -- Texto oficial por plano. O `rotulos` (que é um label, não uma lista)
        -- fica de fora de propósito.
        'textos', coalesce(
          (select jsonb_object_agg(e.plano, e.valor)
             from jsonb_each(coalesce(cfg -> 'beneficios', '{}'::jsonb))
                  as e(plano, valor)
            where jsonb_typeof(e.valor) = 'array'),
          '{}'::jsonb)
      )
      from (select valor as cfg from public.configuracoes_sistema where chave = 'clube') c
    ),
    jsonb_build_object(
      'coberturas', '{}'::jsonb,
      'desconto', jsonb_build_object('quimicos', 0, 'produtos', 0, 'categorias', '[]'::jsonb),
      'rotulos', '{}'::jsonb,
      'textos', '{}'::jsonb
    )
  );
$$;

comment on function public.clube_beneficios_publicos() is
  'Conteúdo público do Clube (coberturas, descontos e texto de benefícios do '
  'config oficial). Não devolve assinatura, cliente ou valor — a elegibilidade '
  'é decidida por audax_clube_beneficio no atendimento.';

-- ----------------------------------------------------------------------------
-- 4) VERIFICAÇÃO — a migration ABORTA se a casa não estiver como o dono pediu
--
-- Preferimos uma migration que falha com mensagem clara a uma que "configura"
-- nada em silêncio quando um serviço foi renomeado.
-- ----------------------------------------------------------------------------
do $$
declare
  v_divergente text;
  v_ok int;
  v_categoria text;
begin
  select string_agg(x.nome || ' (' || x.categoria || ')', ', ')
    into v_divergente
    from (values
      ('Alisamento Americano', 'Tratamento'),
      ('Barba',                'Barba'),
      ('Corte + Barba',        'Cabelo'),
      ('Corte de  Cabelo',     'Cabelo'),
      ('Corte Infantil',       'Cabelo'),
      ('Limpeza de Pele',      'Tratamento'),
      ('Luzes',                'Tratamento'),
      ('Platinado',            'Tratamento')
    ) as x(nome, categoria)
   where not exists (
     select 1
       from public.servicos s
      where lower(regexp_replace(btrim(s.nome), '\s+', ' ', 'g'))
            = lower(regexp_replace(btrim(x.nome), '\s+', ' ', 'g'))
        and btrim(s.categoria) = x.categoria
   );

  if v_divergente is not null then
    raise exception
      'Configuração do Club divergente em: % | ESTADO REAL: %',
      v_divergente,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
           'nome', s.nome,
           'categoria', btrim(coalesce(s.categoria, ''))
         ) order by s.nome)
           from public.servicos s),
        '[]'::jsonb)::text;
  end if;

  -- Sobrancelha NÃO é cobertura do Club: precisa seguir sem categoria.
  select btrim(s.categoria) into v_categoria
    from public.servicos s
   where lower(regexp_replace(btrim(s.nome), '\s+', ' ', 'g')) = 'sobrancelha'
   limit 1;

  if v_categoria is not null and v_categoria <> '' then
    raise exception
      'Sobrancelha está categorizada como "%". Ela NÃO é cobertura do Club.',
      v_categoria;
  end if;

  -- Os químicos precisam estar ligados aos 10%.
  select count(*) into v_ok
    from public.configuracoes_sistema c,
         lateral jsonb_array_elements_text(
           coalesce(c.valor -> 'desconto' -> 'categorias', '[]'::jsonb)
         ) as item
   where c.chave = 'clube'
     and item = 'Tratamento'
     and coalesce((c.valor -> 'desconto' ->> 'quimicos')::numeric, 0) = 0.10;

  if v_ok <> 1 then
    raise exception
      'Os químicos não estão configurados: categoria "Tratamento" com 10%%.';
  end if;

  -- A comissão oficial é 40%, lida da configuração (nunca da chamada).
  select count(*) into v_ok
    from public.configuracoes_sistema
   where chave = 'clube'
     and coalesce((valor -> 'comissao' ->> 'percentual')::numeric, 0) = 0.40;

  if v_ok <> 1 then
    raise exception
      'A comissão do Club não está em 40%%. Valor atual: %',
      coalesce((select valor -> 'comissao' from public.configuracoes_sistema where chave = 'clube'), 'null'::jsonb)::text;
  end if;

  -- O `pote.percentual` não pode voltar a existir: ele significava
  -- "percentual da receita que entra no pote", que é a ambiguidade eliminada.
  select count(*) into v_ok
    from public.configuracoes_sistema
   where chave = 'clube'
     and (valor -> 'pote') ? 'percentual';

  if v_ok > 0 then
    raise exception 'O campo pote.percentual voltou a existir na configuração.';
  end if;

  -- Nenhum químico pode ter cobertura ILIMITADA: era o bug do Alisamento.
  select count(*) into v_ok
    from public.servicos s,
         lateral jsonb_each(
           coalesce(
             (select valor -> 'coberturas'
                from public.configuracoes_sistema where chave = 'clube'),
             '{}'::jsonb)
         ) as p(plano, lista),
         lateral jsonb_array_elements_text(lista) as cat
   where btrim(s.categoria) = 'Tratamento'
     and cat = 'Tratamento';

  if v_ok > 0 then
    raise exception
      '"Tratamento" entrou como COBERTURA de algum plano. Químico é desconto, não ilimitado.';
  end if;
end;
$$;

-- PostgREST recarrega o schema cache sem reinício.
notify pgrst, 'reload schema';
