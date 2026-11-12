# Clareza da interface (ciclo 7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livro de contas, efeito das ações no saldo, alertas com sugestão, histórico de 24 meses, barra e painel reorganizados e primeiros passos.

**Architecture:** Simulação ganha histórico por nação, linhas de comércio/Pão e circo e detalhe por província na conta do mês (`economy.ts`), prévia de ações por cópia do estado (`preview.ts`) e alertas derivados (`alerts.ts`). O cliente consome isso em painéis novos (Contas, faixa de alertas, primeiros passos) e nos botões existentes.

**Tech Stack:** TypeScript, DOM/SVG inline, Canvas 2D, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-ui-clarity-design.md`

## Global Constraints
- `balance.ts`: `UI = { historyMonths: 24, runningOut: 6, runningOutRed: 2, moneyAhead: 3, stableBelow: 0.05, showDelta: 0.1 }`.
- Textos de alertas e sugestões exatamente como na tabela da spec.
- Simulação pura e determinística; estado serializável; a prévia nunca altera o estado real.

## Review Focus
1. Prévia de colonizar uma província sem rota até a capital → a cidade nova entra desligada (produção vai para o depósito, não para o saldo). (Task 2)
2. Prévia de ação sem recursos (botão desabilitado) → calcula mesmo assim, sem pagar nada e sem exceção. (Task 2)
3. Alerta de fábrica parada numa cidade em greve E desligada → um alerta só, com o motivo de maior prioridade (greve). (Task 3)
4. Nação sem cidades (eliminada) → `alerts` e `previewMonth` devolvem vazio/zeros, sem exceção. (Task 3)
5. Acordo de comércio com entrega parcial → a linha "Comércio" da projeção bate com o que a virada aplica. (Task 1)

---

### Task 1: Histórico, comércio e Pão e circo na conta, detalhe por província
**Files:** Modify `src/sim/{state,balance,economy,diplomacy,stability,commands}.ts`; Test `tests/ledger.test.ts`
- `Nation.history: { stock: Res; net: Res }[]` (vazio na fundação); gravado em `runMonth(apply=true)`; máx. 24.
- `runMonth` inclui linhas "Comércio" (por acordo; entrega `min(qtd, estoque disponível naquele ponto da conta)`, as duas pontas na conta de cada nação) e "Pão e circo"; a virada para de aplicar comércio em `diplomacyMonth` e de cobrar Pão e circo em `stabilityMonth` (a queda da lei sem dinheiro continua em `stabilityMonth`, usando o mesmo custo); contagem de faltas do comércio continua em `diplomacyMonth`, decidida pela entrega calculada na virada (guardada em `MonthReport.trade`).
- `MonthReport.byProvince[res][label]` = lista `[chave, valor]` (`p:<id>` ou `a:<id>`), somando o total da linha.
- [ ] Testes: 24 meses no histórico e JSON; linhas Comércio/Pão e circo; Review Focus 5; `byProvince` soma a linha; faltas de comércio continuam (3 meses rompem). FAIL → implementar → verdes → commit `feat: ledger history and per-province accounts`.

### Task 2: Prévia das ações
**Files:** Create `src/sim/preview.ts`; Test `tests/preview.test.ts`
- `Action` da spec; `previewMonth(s, pm, n, action)`; `previewCached(s, pm, n, action)` (chave `<mês>|<eventCount>|<JSON da ação>`, mapa por estado em `WeakMap`).
- [ ] Testes: siderúrgica com carvão e ferro → aço +, ferro −, carvão −; recrutar → manutenção; colonizar → impostos e grãos; Review Focus 1 e 2; estado real intacto (JSON igual antes/depois); memória devolve o mesmo objeto. FAIL → implementar → verdes → commit `feat: action previews`.

### Task 3: Alertas
**Files:** Create `src/sim/alerts.ts`; Test `tests/alerts.test.ts`
- `alerts(s, pm, n, report?)` com os tipos da spec (um alerta por fábrica; prioridade de motivo: revolta > greve > rota > recurso); ordenados vermelho antes de âmbar.
- [ ] Testes: cada tipo aparece e some; textos; Review Focus 3 e 4. FAIL → implementar → verdes → commit `feat: state alerts`.

### Task 4: Contas e barra superior
**Files:** Modify `index.html`, `src/main.ts`, `src/client/{hud,panel}.ts`; Create `src/client/ledger.ts`; Test `tests/ledger-ui.test.ts`
- `ledger.ts`: `trend(net)` (▲ ▼ ▬ com `UI.stableBelow`), `runsOutIn(stock, net)` (meses ou null), `sparkline(history, net)` (SVG string), `ledgerHtml(s, pm, report, open)`.
- Barra reorganizada (grupos, saldo e seta abaixo do estoque, botões à direita, caixa da semente abaixo e compacta após a capital); dica resumida com "📒 ver nas Contas"; botão "📒 Contas".
- [ ] Testes (puros): `trend`, `runsOutIn`, `sparkline` (pontos dentro da caixa). `tsc`, suíte, build → commit `feat: ledger panel and reorganized top bar`.

### Task 5: Prévias nos botões e faixa de alertas
**Files:** Modify `src/client/panel.ts`, `src/main.ts`, `index.html`
- Linha "por mês:" e dica antes/depois nos botões da spec (via `previewCached`); prévia da rota mostra também; faixa de alertas agrupada, hover lista, clique centraliza/abre, "✕" silencia o tipo até resolver.
- [ ] `tsc`, suíte, build → commit `feat: action effects on buttons and alert strip`.

### Task 6: Painel da província, primeiros passos e navegador
**Files:** Modify `src/client/panel.ts`, `src/main.ts`, `index.html`
- "Esta província por mês"; seções recolhíveis lembradas (`localStorage`, com try/catch); custo/efeito em linha própria; recusa em cinza.
- Primeiros passos (6 passos, marcação automática, "Pular dicas" lembrado).
- CDP (semente 860): Contas expandido; prévia da siderúrgica; alerta clicado; barra em 1400 e 1920 px; primeiros passos; capturas. Medir painel com prévias (< 30 ms primeira vez).
- [ ] commit `feat: province panel sections and first steps`.
