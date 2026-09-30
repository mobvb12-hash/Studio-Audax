-- ============================================================================
-- 011_caixa_valores_pagamento.sql
-- Completa caixa_lancamentos com os valores informados no fechamento da conta.
-- Idempotente: pode ser executada mais de uma vez sem quebrar a base.
-- ============================================================================

alter table public.caixa_lancamentos
  add column if not exists recebido numeric(12,2);

alter table public.caixa_lancamentos
  add column if not exists troco numeric(12,2);

alter table public.caixa_lancamentos
  add column if not exists falta numeric(12,2);

alter table public.caixa_lancamentos
  add column if not exists gorjeta numeric(12,2);
