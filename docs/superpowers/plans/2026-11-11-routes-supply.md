# Rotas e Suprimento (ciclo 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A produção só chega ao estoque por rotas até a capital; tropas hostis cortam rotas; as rotas abastecem os exércitos e uma linha de suprimento fortalece uma tropa na batalha.

**Architecture:** `src/sim/routes.ts` guarda rotas como caminhos de células (A* das tropas numa grade de custo própria), um índice célula→rotas derivado e `updateRoutes` a cada passo fixo das tropas (cortes, ligação com a capital, entrega de depósitos). `runMonth` passa a separar entrega nacional e depósito por cidade. O cliente desenha rotas, cortes e linhas e ganha o modo "traçar rota".

**Tech Stack:** TypeScript, Canvas 2D, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-routes-supply-design.md`

## Global Constraints
- Números em `src/sim/balance.ts` (`ROUTE = { money: 1, wood: 0.5, hardMult: 3, tilesPerMonth: 100, cutTiles: 6, fortressAvoidTiles: 6, fortressAvoidCost: 6 }`, `SUPPLY = { range: 30, attrition: 1, unsuppliedMorale: 0.8, lineBonus: 1.25, lineMoney: 2, linePerTile: 0.02, repathTiles: 20, repathMonths: 1, warnMonths: 6 }`, `DEPOT_MONTHS = 6`).
- Comandos com `Result` e `checkX` puros; motivos e avisos em português.
- `GameState` só com dados simples; o índice de rotas é derivado (fora do JSON).
- Simulação pura (sem `Math.random`, `sin`, `cos`); determinismo 1× = 8×.
- `tsc --noEmit` e a suíte inteira verdes ao fim de cada task (o cliente acompanha as mudanças de tipo na mesma task).

## Review Focus
1. Remover uma rota do meio da rede → as cidades que dependiam dela ficam desligadas no mesmo passo; religar por outro caminho funciona. (Task 1)
2. Cidade desligada com depósito cheio → produção extra se perde, depósito não passa do teto. (Task 2)
3. Província colonizada/conquistada sem nenhuma rota → nasce desligada; fábricas dela não produzem até ligar. (Task 2)
4. Tropa com linha de suprimento que entra numa batalha e é cortada no meio → perde o bônus no passo seguinte, sem exceção. (Task 4)
5. Modo traçar rota ativo e o jogador gera outro mundo ou clica fora → o modo sai sem efeito colateral. (Task 5)

---

### Task 1: Rotas, construção e ligação com a capital

**Files:**
- Create: `src/sim/routes.ts`; Test: `tests/routes.test.ts`
- Modify: `src/sim/state.ts` (campos novos, `found`), `src/sim/balance.ts` (`ROUTE`), `src/sim/tick.ts` (obra), `src/sim/troops.ts` (chamar `updateRoutes` no `troopStep`), `tests/troopworld.ts` (`makeRouteWorld`)

**Interfaces:**
- Produces:
  - `GameState`: `routes: Route[]` com `interface Route { id: number; a: number; b: number; path: number[]; remaining: number; cut: boolean }`; `nextRouteId`; `depot: Res[]` (zero por província); `connected: boolean[]` (capital `true`); `Troop.supply: { path: number[]; from: number } | null` e `Troop.supplied: boolean` (`spawnTroop` inicia `null`/`true`).
  - `routeGrid(s, pm, grid, realm = 0): Uint8Array` — custo por célula: 0 em água e em território de outro reino; ×`ROUTE.fortressAvoidCost` (teto 255) a ≤ 6 tiles de tropas de fortaleza; senão `grid.cost`.
  - `planRoute(s, pm, grid, a, b): { ok: true; path: number[]; cost: Partial<Res>; months: number } | { ok: false; reason: string }` — de `pm.provinces[a].city` a `pm.provinces[b].city`; recusas: `"Escolha duas cidades suas"`, `"Já existe uma rota entre essas cidades"`, `"Não há caminho por terra"`, `"Atravessa território de outro reino"` (sem caminho só por causa de território alheio), falta de recurso via `afford`. Custo = Σ por célula (CELL tiles por passo) `ROUTE.money`/`ROUTE.wood` × (`hardMult` se `grid.cost ≥ 2`); meses = comprimento em tiles / `tilesPerMonth`, mínimo 0,5.
  - `checkRoute(s, pm, grid, a, b): Result`, `buildRoute(s, pm, grid, a, b): Result` (paga, cria com `remaining`), `removeRoute(s, id): Result`.
  - `routeIndex(s): Map<number, number[]>` — célula → ids de rota; cache num `WeakMap` por estado, refeito quando a assinatura das rotas (ids e comprimentos) muda.
  - `recomputeConnected(s, pm)`: BFS a partir da capital pelas rotas prontas (`remaining ≤ 0`) e não cortadas; marca `connected`.
  - `updateRoutes(s, pm, grid)`: por enquanto só `recomputeConnected` (Task 3 acrescenta cortes, Task 2 a entrega).
  - `found(s, id)`: `connected[id] = false`, `depot[id]` zerado.
  - `makeRouteWorld()` em `tests/troopworld.ts`: grade 96×32 células (384×128 tiles), três províncias em faixa (x < 32, 32–63, ≥ 64 células), lago bloqueado no meio da província 1 (células x 44–50, y 10–20), rio (custo 3) na coluna x = 70, cidades em (60, 64), (190, 32), (320, 64) tiles, um veio de cada tipo por província.

- [ ] **Step 1: Testes** (`tests/routes.test.ts`): `planRoute` 0→1 contorna o lago (nenhuma célula com custo 0) e custa `ROUTE.money × tiles` com rio a 3×; recusas (cidade neutra, rota repetida, sem caminho); `buildRoute` cobra e fica `remaining > 0`; durante a obra a província 1 está desligada e depois de `months` ligada; 0–1 e 1–2 prontas → 2 ligada; `removeRoute` da 0–1 → 1 e 2 desligadas no passo seguinte; rota 0–2 direta religa as duas; colônia nova (`found`) nasce desligada; JSON ida e volta.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `npx vitest run` verde; `tsc` limpo.
- [ ] **Step 5:** Commit `feat: routes between cities and connection to the capital`.

### Task 2: Depósito e entrega

**Files:** Modify `src/sim/economy.ts`, `src/sim/routes.ts`; Test `tests/routes.test.ts`, `tests/sim.test.ts`

**Interfaces:**
- `runMonth`: veios de província com `connected[id] = false` somam em `depot[id]` (com `apply`), limitado a `DEPOT_MONTHS ×` a produção mensal daquela província por recurso; linha `"Guardado em <província>"` vai para `report.depots` (`Record<number, Partial<Res>>`), não para `net`. Fábricas de desligadas: `units = 0`, `stalled` com `missing: 'route'` (tipo `keyof Res | 'route'`). Impostos sempre entram.
- `updateRoutes`: província que passa de desligada a ligada entrega `depot` ao `res` e loga `"Carga de <província> chegou ao estoque"` (se não vazia); cidade que passa de ligada a desligada loga `"<província> desligada da capital"`.
- Testes atuais de economia usam a capital (sempre ligada) ou marcam `connected[id] = true` onde necessário.

- [ ] **Step 1: Testes:** desligada guarda grãos/minério no depósito e `net` não os conta; teto de 6 meses; fábrica de desligada parada com `'route'`; impostos da desligada entram; ao religar, o depósito vai ao estoque e o evento aparece; ligada→desligada loga o aviso.
- [ ] **Step 2–4:** FAIL → implementar (painel mostra "sem rota" no motivo) → verde.
- [ ] **Step 5:** Commit `feat: depots for disconnected cities and delivery on reconnect`.

### Task 3: Cortes

**Files:** Modify `src/sim/routes.ts`; Test `tests/routes.test.ts`

**Interfaces:**
- `updateRoutes` antes de ligar: `cut = true` se alguma tropa hostil ao dono da rota (fortaleza `owner −1`, ou dono ≠ 0 e ≠ −1) está a ≤ `cutTiles` de alguma célula da rota (consulta ao índice nas células a ≤ 2 de distância da tropa e distância real ao centro da célula), ou se alguma célula da rota pertence a província de outro reino (`owner ∉ {0, −1}`); avisos `"Rota <A>–<B> cortada"` / `"Rota <A>–<B> religada"` na mudança.
- `planRoute` já desvia de fortalezas (Task 1); aqui só o corte.
- [ ] **Step 1: Testes:** tropa hostil (`spawnTroop(s, 1, …)`) a 6 tiles corta, a 7 não; fortaleza perto corta; mover a tropa para longe religa (e o depósito entrega); corte na 0–1 desliga 1 e 2; plano 0→1 com fortaleza no caminho direto desvia (nenhuma célula a ≤ 6 tiles da fortaleza quando há alternativa); desempenho: `updateRoutes` com 200 tropas de fortaleza espalhadas e 30 rotas < 1 ms (média de 50 chamadas) no mundo real 860.
- [ ] **Step 2–4:** FAIL → implementar → verde.
- [ ] **Step 5:** Commit `feat: hostile troops cut routes`.

### Task 4: Suprimento das tropas

**Files:** Modify `src/sim/routes.ts`, `src/sim/troops.ts`, `src/sim/battle.ts`, `src/sim/economy.ts`, `src/sim/commands.ts` (reexporta comandos se preciso); Test `tests/supply.test.ts`

**Interfaces:**
- `troopSupplied(s, pm, t): boolean` — fortaleza sempre; linha não cortada; ou a ≤ `SUPPLY.range` de célula de rota pronta, ligada e não cortada, ou de cidade ligada. Atualiza `t.supplied` a cada passo.
- Desgaste: tropa do jogador sem suprimento perde `SUPPLY.attrition × dt` homens; não repõe (`refill` exige `supplied`); aviso `"<tipo> sem suprimento"` no máximo a cada 6 meses por tropa (guardar mês em `s.stallWarned["t<id>"]`).
- Batalha: ao entrar (`join`), tropa sem suprimento conta como já tendo perdido `(1 − unsuppliedMorale) / moraleLoss` dos homens no lado (a moral do lado cai na proporção); tropa com linha não cortada: ataque e defesa × `lineBonus`.
- `checkSupply/supplyTroop(s, pm, grid, troopId)`: da cidade ligada mais próxima (por distância em linha reta, depois `planRoute`-like sem custo de construção) até a célula da tropa; recusas `"Nenhuma cidade ligada alcança esta tropa"`, `"Já tem linha de suprimento"`, `"Tropa em fuga"`. `dropSupply(s, troopId)`.
- Linha segue a tropa: se a ponta está a > `repathTiles` da tropa e passou ≥ `repathMonths` desde o último traçado, retraçar (guardar `t.supply.at = s.clock`). Linha cortada: mesmo critério de corte das rotas (índice próprio ou varredura simples da linha — poucas linhas).
- `runMonth`: linha `"Linhas de suprimento"` em dinheiro: `lineMoney + linePerTile × comprimento` por linha.
- [ ] **Step 1: Testes:** abastecida a 29 tiles de rota ligada, não a 31; cidade ligada abastece; sem suprimento perde ~1 homem/mês e não repõe; moral inicial menor na batalha (lado sem suprimento foge antes num duelo igual); linha abastece longe e dá vantagem (duelo igual vencido por quem tem linha); custo mensal; tropa anda 40 tiles e a linha é retraçada; tropa hostil sobre a linha corta e a tropa volta a perder homens; determinismo 1× = 8× com linha; JSON.
- [ ] **Step 2–4:** FAIL → implementar → verde.
- [ ] **Step 5:** Commit `feat: troop supply, attrition and supply lines`.

### Task 5: Rotas no mapa e na interface

**Files:** Modify `src/client/map/markers.ts`, `src/client/map/pick.ts` (se preciso), `src/client/panel.ts`, `src/client/hud.ts`, `src/main.ts`; Test `tests/mappick.test.ts`

**Interfaces:**
- `markers.ts`: desenha rotas (tracejado na cor do dono; em obra mais claro e pontilhado; células de trecho cortado em vermelho com ✕ no meio do trecho cortado), fio veio→cidade (≥ 1 px/tile) para veios construídos, linhas de suprimento (pontilhado dourado), cidade desligada (contorno tracejado vermelho + corrente partida), tropa sem suprimento (barrinha vermelha sob o número), com linha (⛽). `markersKey` inclui rotas (id, remaining > 0, cut), `connected`, `supplied` e as linhas.
- `drawRoutePreview(ctx, v, path, ok)` para a prévia.
- `main.ts`: estado `routeFrom: number | null`; "Traçar rota" (painel) ou R com cidade sua selecionada entra no modo; `pointermove` sobre cidade sua → `planRoute` (no máximo 10×/s) → prévia e dica com custo/meses ou motivo; clique → `buildRoute` (toast se recusa); Esc, clique direito, gerar mundo ou seleção de outra coisa saem do modo.
- `panel.ts`: situação "Ligada à capital" / "Desligada da capital: depósito …"; seção Rotas (destino, "pronta" / "em obra X meses" / "cortada", botão "Remover"); botão "Traçar rota"; painel de tropas com situação de suprimento, "Abastecer" (custo/mês) e "Cortar linha". `PanelActions` ganha `startRoute(id)`, `removeRoute(routeId)`, `supply(troopId)`, `dropSupply(troopId)`.
- `hud.ts`: dica do recurso com `guardado em cidades desligadas: X` (soma de `depot`).
- [ ] **Step 1: Testes** (`tests/mappick.test.ts`): `markersKey` muda com rota construída, rota pronta, rota cortada e linha de suprimento; continua igual parado.
- [ ] **Step 2–4:** FAIL → implementar → `tsc`, suíte e `npm run build` verdes.
- [ ] **Step 5:** Commit `feat: routes, cuts and supply lines on the map and panel`.

### Task 6: Ritmo com rotas

**Files:** Modify `tests/greedy.ts`, `src/sim/balance.ts` (só se a calibração pedir)
- Jogador automático: depois de cada colonização/conquista, traça rota da nova cidade até a cidade ligada mais próxima (repete a tentativa a cada mês se faltar recurso); abastece com linha as tropas que atacam fortalezas.
- [ ] **Step 1:** rodar `tests/pacing.test.ts`, anotar.
- [ ] **Step 2:** se fora dos alvos, ajustar `ROUTE`/`SUPPLY`/custos em `balance.ts`; registrar antes/depois.
- [ ] **Step 3:** suíte verde. **Step 4:** Commit `feat: pacing with routes`.

### Task 7: Verificação no navegador e fechamento
- [ ] Navegador sem GPU (CDP, semente 860): traçar rota pelo painel com prévia e custo; cidade desligada com depósito subindo; rota pronta e "Carga … chegou"; tropa hostil (console) sobre a rota → corte vermelho e aviso; "Abastecer" uma tropa longe → linha dourada; Esc cancela o modo. Capturas.
- [ ] Medir `planRoute` através do continente e `updateRoutes` no mundo real; `npx vitest run` e `npm run build`; commit de ajustes.
