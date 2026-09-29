-- ============================================================================
-- Studio Audax — Fechamento de conta (formas de pagamento + recebimento)
-- ----------------------------------------------------------------------------
-- Objetivo: dar suporte à tela de Fechar Conta do atendimento, sem tocar em
-- nenhum dado existente.
--
-- • Formas de pagamento previstas no fechamento: PIX, PIX integrado, Crédito,
--   Débito, Transferência, Dinheiro, Pré-pago e "Outros" (legado dos dados
--   antigos). O check do 005 cobre as 5 primeiras; esta migration alarga a
--   lista para as 8.
-- • Colunas opcionais do recebimento: `recebido` (entregue pelo cliente),
--   `troco` (devolvido), `falta` (saldo em aberto / dívida) e `gorjeta`.
--   Todas são null em lançamento antigo e em lançamento cujo operador não
--   informou o recebimento — nada muda para quem não usa o campo.
-- • Gorjeta fica FORA de valor/desconto/valor_liquido de propósito: receita,
--   comissão (40%) e relatórios continuam exatamente como estão.
-- • Drift-safe como 005/003/004: `add column if not exists` completa a base
--   criada por `supabase/schema.sql` (que não tem essas colunas) e o
--   constraint é dropado e recriado com a lista ampliada — funciona tanto
--   para a tabela que nasceu no 005 (constraint existe) quanto para a que
--   nasceu no schema.sql (constraint nem existe).
-- • Não destrutivo e idempotente: nenhuma linha é apagada ou reescrita e o
--   script pode rodar quantas vezes.
-- • Formas fora da lista nunca existiram (o check anterior já limitava a 5),
--   então o novo check aceita 100% do dado existente.
-- ============================================================================

alter table public.caixa_lancamentos
  drop constraint if exists caixa_lancamentos_forma_pagamento_check;

alter table public.caixa_lancamentos
  add constraint caixa_lancamentos_forma_pagamento_check check (
    forma_pagamento in (
      'dinheiro',
      'pix',
      'pix_integrado',
      'cartao_credito',
      'cartao_debito',
      'transferencia',
      'pre_pago',
      'outro'
    )
  );

alter table public.caixa_lancamentos
  add column if not exists recebido numeric(12,2);
alter table public.caixa_lancamentos
  add column if not exists troco numeric(12,2);
alter table public.caixa_lancamentos
  add column if not exists falta numeric(12,2);
alter table public.caixa_lancamentos
  add column if not exists gorjeta numeric(12,2);
