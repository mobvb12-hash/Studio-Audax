# STUDIO AUDAX — AUDITORIA DE ENCERRAMENTO

## 1. RESUMO EXECUTIVO

O projeto Studio Audax está em estado **funcional para o painel administrativo** com 15 módulos implementados, build passando, lint sem erros e typecheck limpo. Porém, **existem lacunas críticas** para o encerramento: a **área do cliente (/cliente) não existe**, o **agendamento público falta a etapa "Extras"**, o **pote do Audax Club (regra dos 40%) não está implementado**, e a **integração WhatsApp/IA está incompleta** (sem webhook, sem IA de intenção, sem agendamento/cancelamento/remarcação via WhatsApp).

Estado geral: **Pronto para uso interno (barbearia), NÃO pronto para entrega ao cliente final**.

---

## 2. GIT

| Item | Situação |
|------|----------|
| **Branch atual** | `agents/studio-audax-completion-tasks` |
| **Status** | Clean (nothing to commit, working tree clean) |
| **Commits recentes** | 20 commits à frente do `main` (último: `8fec1ac feat: completar núcleo operacional do Studio Audax`) |
| **Diferença vs main** | 299 arquivos alterados, +1.966 / -52.505 linhas (grande refatoração/limpeza) |
| **Arquivos modificados** | Muitos (ver `git diff main..agents/studio-audax-completion-tasks --stat`) |
| **Conflitos** | Nenhum |
| **Worktree** | Isolado em `studio-audax-completion-tasks` |
| **Riscos** | Branch com muitas exclusões (52k linhas removidas) — revisar se nada essencial foi perdido |

---

## 3. BANCO / SUPABASE

### Concluído ✅
- **14 migrations** (001–014) aplicáveis e idempotentes
- **RLS role-based** (migration 014) com papéis: `dono`, `admin`, `gerente`, `recepcao`, `profissional`
- Tabelas principais: `perfis`, `profissionais`, `servicos`, `clientes`, `agendamentos`, `bloqueios`, `agenda_expediente`, `caixa_lancamentos`, `caixa_fechamentos`, `caixa_auditoria`, `comissoes_configs`, `comissoes_fechamentos`, `comissoes_auditoria`, `clube_assinaturas`, `clube_pagamentos`, `produtos`, `estoque_movimentacoes`, `espera_pedidos`, `crm_interacoes`, `whatsapp_mensagens`, `ia_sugestoes`, `automacoes`, `marketing_campanhas`
- **Agendamento público** via 3 RPCs `SECURITY DEFINER` (migration 012): `agendamento_publico_catalogo`, `agendamento_publico_slots`, `agendamento_publico_criar` — expõem só o necessário, sem dados pessoais
- **Club** com assinaturas e pagamentos vinculados a `caixa_lancamentos` (deduplicação por `caixa_lancamento_id`)

### Pendente ⚠️
- Migrations 015–057 **não existem** neste worktree (referenciadas no diff vs main, mas ausentes no FS)
- Tabelas de **notificações WhatsApp**, **vitrine pública**, **expediente por dia**, **perfis do cliente**, **cron jobs** não criadas
- **Pote do Audax Club** (migrations 028–035) não existe — regra dos 40% não implementada no banco

### Problemas ❌
- `current_user_papel()` faz `SELECT` em `perfis` a cada chamada — pode impactar performance em policies complexas
- Ausência de índices compostos para queries frequentes (ex.: `agendamentos(profissional, data, status)`)

---

## 4. FRONTEND

### Concluído ✅
- **15 páginas administrativas** implementadas e no menu (`IMPLEMENTADAS` no App.tsx): Painel, Agenda, Fila, Caixa, Clientes, CRM, WhatsApp, Serviços, Profissionais, Comissões, Financeiro, Relatórios, PDV, Estoque, Clube, IA
- **Lazy loading** + `Suspense` + `ErrorBoundary` por página
- **Permissões por papel** (`podeAcessarPagina`) integradas ao layout
- **Design system** consistente (cores Studio Audax, `PainelUi`, `chipClasse`, `CelulaKpi`)
- **Persistência local** (`localStorage` + sincronização Supabase) em todos os stores
- **Autenticação** obrigatória (email + senha via Supabase Auth) — sem Supabase configurado, painel não abre
- **Rota pública** `#/agendar` (hash) ou `/agendar` (pathname) fora do portão de sessão

### Pendente ⚠️
- **Página `/cliente` (área do cliente) NÃO EXISTE**
- Módulos "futuro": `comandas`, `pacotes`, `configuracoes`, `usuarios` (páginas removidas no diff)
- `UsuariosPermissoes.tsx` e `Configuracoes.tsx` foram deletados (864 e 647 linhas respectivamente)

### Problemas ❌
- `AuthProvider`: `useCallback` `entrarComConfirmacao` falta dependência `entrarComConfirmacao` (warning lint)
- 19 warnings de `react-refresh/only-export-components` (stores exportam funções + context)
- `TelaLogin` usa email + senha (correto), mas **recuperação de senha não implementada no front** (existe RPC no banco?)

---

## 5. AGENDAMENTO PÚBLICO (`/agendar`)

| Requisito | Status | Observação |
|-----------|--------|------------|
| **Fluxo: Serviço → Barbeiro → Data → Horário → Extras → Dados → Confirmar** | ⚠️ **PARCIAL** | Falta etapa **Extras/Sugestões** |
| Cleiton e Ítalo disponíveis | ✅ | Vêm de `profissionais` ativos via RPC `agendamento_publico_catalogo` |
| Profissional selecionado antes do horário | ✅ | `select` de profissional vem antes do `select` de horário |
| Horários filtrados pelo profissional | ✅ | `horariosPublicos(data, profissionalNome, duracaoMin)` usa `baseDoDia` + regras de ocupação/bloqueio/almoço |
| Extras / sugestões | ❌ **AUSENTE** | Não há componente, nem RPC, nem catálogo de complementos |
| Cadastro (nome + telefone) | ✅ | Formulário pede nome e telefone/WhatsApp |
| Login email + senha | ✅ | **Não usado no público** — agendamento é anônimo (pendente), equipe confirma |
| Confirmação | ✅ | Status `pendente` criado; tela de sucesso mostra "equipe vai confirmar" |
| WhatsApp confirmação | ⚠️ **PARCIAL** | Texto menciona "resposta no telefone", mas **não há envio automático** (sem webhook/integração ativa) |
| Área `/cliente` | ❌ **AUSENTE** | Cliente não consegue ver/gerenciar seus agendamentos |
| Não usar nome+telefone como login | ✅ | Agendamento público não faz login; painel admin usa email+senha |

**Gap crítico**: Etapa "Extras" (complementos/upsell) não existe — nem no front, nem no banco (`catalogo_complementos` migration 025 ausente).

---

## 6. ÁREA DO CLIENTE (`/cliente`)

| Item | Status |
|------|--------|
| Página `/cliente` | ❌ **NÃO EXISTE** |
| Login do cliente | ❌ |
| Cadastro do cliente | ❌ |
| Recuperação de senha | ❌ |
| Próximos agendamentos | ❌ |
| Experiência visual | ❌ |
| Fluxo do cliente | ❌ |

**Observação**: O requisito menciona "não utilizar nome + telefone como login; login deve ser email + senha". Como a página não existe, isso não pode ser verificado. Será necessário criar do zero: autenticação Supabase Auth para clientes (tabela `perfis` com `papel = 'cliente'`?), listagem de agendamentos do cliente logado, reagendamento/cancelamento, histórico.

---

## 7. AUDAX CLUB / POTE

### Regra requerida (confirmar implementação):
> - **Pote = 100% da receita de assinaturas efetivamente recebida no período**
> - **Deduplicação por lançamento do Caixa** (`caixa_lancamento_id`)
> - **Distribuição proporcional às fichas** (produção)
> - **Método do maior resto**
> - **Comissão profissional = 40%**
> - **Restante fica para a empresa**
> - **Snapshot congela pote/parcela/comissão/produção/receita**
> - **Filtro por datas exatas**

### Estado atual:
| Item | Status | Evidência |
|------|--------|-----------|
| Assinaturas + pagamentos | ✅ | `clube_assinaturas`, `clube_pagamentos`, `store.tsx`, `regras.ts` |
| Pagamento gera lançamento no Caixa (`origem: 'clube'`) | ✅ | `registrarReceitaClube` em `caixa/store.tsx` |
| Deduplicação por `caixa_lancamento_id` | ✅ | `pagamentosNoMes` filtra estornados via `caixa_lancamento_id` |
| **Pote (soma receita clube no período)** | ❌ **NÃO IMPLEMENTADO** | Não existe `pote.ts`, `calcularPote`, `fecharPote`, tabela `clube_potes` |
| **Distribuição proporcional (maior resto)** | ❌ | Ausente |
| **Comissão 40% / Empresa 60%** | ❌ | Ausente |
| **Snapshot (congelar pote/parcela/comissão)** | ❌ | Ausente |
| **Filtro por datas exatas** | ❌ | Ausente |
| Migrations 028–035 (pote, produção, comissão) | ❌ | Não existem neste worktree |

**Conclusão**: A regra dos 40% **NÃO está preservada**. O módulo Clube gerencia assinaturas/pagamentos, mas **todo o cálculo do pote e distribuição de comissão está faltando**. As migrations referenciadas no diff (028–035) foram removidas ou nunca aplicadas neste worktree.

---

## 8. FINANCEIRO

### Concluído ✅
- **Caixa**: lançamentos (receita/despesa), estorno, fechamento de conta, reabertura, auditoria
- **Vendas**: PDV (produtos), atendimentos (serviços), assinaturas (clube) — todos geram lançamento no Caixa
- **Recebimentos**: formas de pagamento (dinheiro, pix, cartão, etc.) com `valorLiquido` (taxa descontada)
- **Comissões**: configuração por profissional (fixa/porcentagem/faixas), fechamento por período, auditoria
- **Relatórios**: Financeiro (resumo, evolução, formas), Relatórios (serviços, produtos, clientes, estoque, comissões, clube, agenda, CRM)
- **Integração Club → Caixa**: `receitaClube` separada no resumo/faturamento

### Pendente ⚠️
- **Fechamento de comissão do Clube (pote 40%)** — não existe
- **Relatório de pote/snapshot** — não existe
- **Configuração de taxas por forma de pagamento** (hoje fixo no código)

### Problemas ❌
- `caixa/store.tsx` tem 1447 linhas — monolítico, difícil de manter
- Ausência de testes de integração Caixa+Comissões+Clube juntos

---

## 9. WHATSAPP / IA

### Concluído ✅
- **Edge Function `whatsapp-enviar`** (Evolution API) — envio de texto, validação, secrets no servidor, auth `user` + `secret`
- **Página WhatsApp no admin**: lista mensagens, prepara com templates (`confirmacao`, `lembrete`, `reativacao`, `retorno`), deduplicação por conteúdo
- **Templates** com variáveis (nome, data, horario, serviço, profissional, último atendimento)
- **Persistência local** de mensagens (status: pendente/enviada/falhou)

### Pendente ⚠️
- **Webhook de recebimento** (`whatsapp-webhook`) — **não existe** (pasta ausente em `supabase/functions/`)
- **IA de intenção** (agendar/cancelar/remarcar/disponibilidade) — **não existe** (`ia.ts` ausente no webhook)
- **Agendamento via WhatsApp** — não implementado
- **Cancelamento/Remarcação via WhatsApp** — não implementado
- **Confirmação automática via WhatsApp** — mencionada no commit `29be4b7` mas não encontrada no código atual
- **Evolution API configurada** — apenas estrutura, sem credenciais reais

### Problemas ❌
- `integracaoAtiva` no store WhatsApp é apenas UI — não conecta a nada real
- Sem `whatsapp-webhook`, não há como receber mensagens do cliente
- IA (`src/modules/ia/store.tsx`) existe mas isolada — não integrada ao WhatsApp

---

## 10. TESTES / BUILD

| Comando | Resultado |
|---------|-----------|
| `npm run lint` | ✅ **Passou** — 0 errors, 19 warnings (Fast refresh) |
| `npm run typecheck` (`tsc -b`) | ✅ **Passou** — sem saída = sucesso |
| `npm run build` (`vite build`) | ✅ **Passou** — 371 kB JS gzip 105 kB, 29 kB CSS gzip 6.9 kB |
| `npm run test` (`vitest run`) | ⚠️ **NÃO CONCLUÍDO** — ambiente de teste instável (sem output, timeout), 110 arquivos de teste existentes |

**Nota**: Os testes não puderam ser executados completamente devido a problemas no ambiente de execução (PATH do Node.js instável no shell). O projeto tem infraestrutura de testes completa (vitest, jsdom, testing-library, mocks de Supabase).

---

## 11. PENDÊNCIAS REAIS

### P0 — BLOQUEADORES (impedem entrega ao cliente)
1. **Criar página `/cliente`** — autenticação email+senha, listar agendamentos, reagendar/cancelar, histórico
2. **Implementar etapa "Extras" no agendamento público** — catálogo de complementos, UI, persistência
3. **Implementar Pote do Audax Club (regra dos 40%)** — migrations 028–035, RPCs de cálculo, tela de fechamento (`FechamentoPote.tsx` existia mas foi deletada)
4. **Criar `whatsapp-webhook` Edge Function** — receber mensões, persistir, deduplicar, IA de intenção
5. **Integrar IA ao WhatsApp** — classificar intenção, executar ações (agendar/cancelar/remarcar/consultar)

### P1 — IMPORTANTES (necessários para produção robusta)
6. **Recuperação de senha no front** (tela + RPC Supabase)
7. **Webhook WhatsApp: confirmação automática** de agendamento público
8. **Migrations faltantes** (015–057): notificações, vitrine, expediente por dia, perfis cliente, cron jobs
9. **Índices compostos** no banco para performance
10. **Testes de integração** Caixa+Comissões+Clube+Agenda
11. **Configuração de taxas por forma de pagamento** (admin)

### P2 — MELHORIAS (qualidade/manutenibilidade)
12. Corrigir 19 warnings de lint (`react-refresh/only-export-components`)
13. Corrigir warning `useCallback` dependência faltante em `AuthProvider`
14. Refatorar stores grandes (`caixa`, `agenda`, `clube`) em arquivos menores
15. Documentar variáveis de ambiente obrigatórias (`.env.production.example` existe)
16. Configurar deploy Vercel/Render com SPA fallback (vercel.json + render.yaml existem)

---

## 12. O QUE NÃO DEVE SER ALTERADO (JÁ CORRETO)

- **Autenticação admin**: email + senha via Supabase Auth, sessão confirmada no servidor (`confirmar()`), RLS role-based
- **Agendamento público**: usa MESMA fonte de dados da agenda interna (RPCs 012), sem duplicar lógica
- **Persistência local + sincronização Supabase**: padrão idempotente, snapshot de divergências, reenvio pendências
- **Status de assinatura derivado** (nunca armazenado) — `proximoVencimento` + `cancelada`
- **Caixa como fonte única da verdade financeira** — relatórios derivam de `caixa_lancamentos`
- **Comissões casam por `profissional_id`** (migração 013) — rename não quebra comissão
- **Deduplicação de pagamentos do Clube** por `caixa_lancamento_id` + `vencimento_coberto`
- **Estorno remove do faturamento** (filtro `!l.estornado` em todos os cálculos)
- **Design system / cores / componentes base** (`PainelUi`, `Apresentacao`, `Moeda`)
- **Estrutura de rotas**: `#/agendar` público, demais protegidas por `AuthProvider`
- **Edge Function `whatsapp-enviar`**: secrets só no servidor, auth `user`+`secret`, validação rigorosa

---

## 13. PLANO FINAL

### P0 — BLOQUEADORES (ordem sugerida)
1. **[Banco] Criar migrations 028–035** (pote, produção, comissão 40%, snapshot, papéis, benefícios, vitrine, confirmação WhatsApp)
2. **[Backend] Implementar RPCs do pote**: `clube_calcular_pote`, `clube_fechar_pote`, `clube_snapshot_pote`
3. **[Front] Criar tela `FechamentoPote`** (listar, fechar, ver snapshot, reabrir)
4. **[Front] Criar página `/cliente`**: `PainelAuthProvider` (já existe em `src/modules/painel/` mas foi deletado?), login, cadastro, recuperação, listar agendamentos, reagendar/cancelar
5. **[Front] Adicionar etapa "Extras" no `AgendarPublico`**: novo passo entre Horário e Dados, catálogo de complementos (migração 025)
6. **[Backend] Criar `whatsapp-webhook`**: receber, persistir (`whatsapp_mensagens`), deduplicar, IA de intenção
7. **[Backend] IA de intenção**: `agendar`, `cancelar`, `remarcar`, `disponibilidade`, `confirmar` → chamar RPCs Supabase
8. **[Integração] Conectar WhatsApp → Agendamento Público**: confirmação automática, lembrete, reativação

### P1 — IMPORTANTES
9. Migrations 015–027 (notificações, vitrine, expediente/dia, perfis cliente, cron)
10. Recuperação de senha front + RPC
11. Config taxa por forma pagamento
12. Índices compostos
13. Testes integração críticos

### P2 — MELHORIAS
14. Fix lint warnings
15. Modularizar stores
16. Documentação deploy

---

**FIM DA AUDITORIA — NENHUMA ALTERAÇÃO EXECUTADA**