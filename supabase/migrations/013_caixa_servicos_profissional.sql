-- ============================================================================
-- Studio Audax — Conta com vários serviços + vínculo seguro de profissional
-- ----------------------------------------------------------------------------
-- Objetivo: completar o fechamento de conta sem tocar em nenhum dado existente.
--
-- • `servicos` (jsonb): detalhe das linhas de serviço da conta. Uma conta pode
--   ter mais de um serviço (serviço do agendamento + serviços lançados na
--   reabertura). O lançamento continua sendo UM — receita, comissão e
--   relatórios não mudam de estrutura; este campo é o detalhamento por linha.
--   Nulo em lançamento antigo e em conta de um único serviço legado.
-- • `profissional_id` (text): id do cadastro do profissional no lançamento.
--   A produção de comissão passa a casar primeiro por este id — rename ou
--   diferença de caixa/acentos no nome nunca mais quebra a comissão. Ausente
--   em dado antigo: a produção continua casando pelo nome normalizado.
-- • Auditoria `acao`: inclui 'vinculo' — ação de ligar uma venda antiga
--   (lançamento sem agendamento_id) ao atendimento da conta. Não altera
--   valor, não é estorno nem reabertura; apenas registra que o vínculo foi
--   feito (regra de dados: nada muda silenciosamente).
-- • Não destrutivo e idempotente: só `add column if not exists` anulável e
--   drop+add do constraint de CHECK (mesmo padrão da migration 010) — nenhum
--   dado é apagado ou reescrito e o script pode rodar quantas vezes.
-- ============================================================================

alter table public.caixa_lancamentos
  add column if not exists servicos jsonb;

alter table public.caixa_lancamentos
  add column if not exists profissional_id text;

alter table public.caixa_auditoria
  drop constraint if exists caixa_auditoria_acao_check;

alter table public.caixa_auditoria
  add constraint caixa_auditoria_acao_check check (
    acao in ('estorno', 'reabertura', 'vinculo')
  );
