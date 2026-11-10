# Subprojeto 1 — Províncias e Economia — Implementation Plan

> **For agentic workers:** superpowers:executing-plans (Native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** ~300 províncias naturais + economia ouro/madeira/pedra + colonização + câmera livre + UI.
**Architecture:** `src/worldgen/provinces.ts` (puro, no worker) → `src/sim/` (estado + regras puras) → cliente (bordas, prédios, painéis).
**Tech Stack:** TypeScript, Three.js 0.169, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-10-provinces-economy-design.md`

## Global Constraints
- Pureza do worldgen e do sim (sem DOM/three/Math.random/transcendentais) — estender `purity.test.ts` a `src/sim`.
- 1 mês = 10 s a 1×; velocidades 0/1/2/4/8.
- Números de jogo só em `src/sim/balance.ts`.
- Estado do jogo serializável em JSON (sem typed arrays no `GameState`).
- Textos de UI em português.

## Review Focus
1. Semente com continente pequeno/ilhado → contagem de províncias ainda em faixa ou degradação limpa (sem crash).
2. Comando inválido vindo da UI (província −1, vaga fora do índice, tipo desconhecido) → recusa com motivo, sem exceção.
3. Trocar semente no meio da partida → estado de jogo e overlays do mundo antigo descartados.
4. Velocidade 8× com `dt` grande (aba em segundo plano) → várias viradas de mês processadas corretamente, sem pular renda.
5. Clicar em província enquanto o mundo/províncias ainda carregam → nada quebra.

---

### Task 1: Geração de províncias (regiões)
**Files:** Create `src/worldgen/provinces.ts`; Test `tests/provinces.test.ts`.
**Interfaces:** `interface Province { id; name; center: {x,y}; cells: number; neighbors: number[]; coastal: boolean; biome: Biome; fertility; forest; rock; slots; sites: {x,y}[] }`; `interface ProvinceMap { cellProvince: Int16Array; provinces: Province[]; suggestedCapitals: number[] }`; `generateProvinces(map: WorldMap): ProvinceMap`.
Algoritmo: sementes por amostragem com distância mínima (alvo 300 em terra, proporcional à área de terra); Dijkstra multi-fonte com custo de passo `1 + RIVER_COST·river + RIDGE_COST·max(0, Δelev subindo) + MOUNTAIN·[elev≥MOUNTAIN]`; regiões < 30% da média fundidas com a vizinha de maior fronteira; ilhas sem semente viram província própria (ou se fundem se muito pequenas e ligadas).
- [ ] Testes: 250–350; cobertura; contiguidade (BFS); simetria de vizinhos; tamanhos 30–300% (exceto ilhas < 30%); fronteira em rio/crista > Voronoi de controle; determinismo.
- [ ] Commit.

### Task 2: Atributos das províncias
**Files:** Modify `src/worldgen/provinces.ts`; Test `tests/provinces.test.ts`.
- [ ] Fatores (fertilidade por bioma + rio/costa; floresta/rocha por densidade esperada), slots 3–6, sites (tiles secos/planos dentro, afastados entre si), nomes únicos, `suggestedCapitals` 5–8 afastadas e acima da mediana.
- [ ] Testes desses itens. Commit.

### Task 3: Simulação
**Files:** Create `src/sim/balance.ts`, `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/tick.ts`; Test `tests/sim.test.ts`; Modify `tests/purity.test.ts`.
**Interfaces:** `newGame(pm: ProvinceMap): GameState`; `chooseCapital(s, pm, id)`, `colonize(s, pm, id)`, `build(s, pm, id, slot, type)`, `upgrade(s, pm, id, slot)` → `Result`; `tick(s, pm, dtSeconds)`; `monthlyIncome(s, pm): {gold,wood,stone}`; `colonizeCost(s, pm, id)`; `buildCost(type, level)`.
- [ ] Testes de renda, obras, recusas (inclui entradas inválidas — Review Focus 2), guarnição, velocidades e dt grande (Focus 4), JSON round-trip.
- [ ] Commit.

### Task 4: Teste de ritmo e calibração
**Files:** Test `tests/pacing.test.ts`; Modify `src/sim/balance.ts` se necessário.
- [ ] Jogador guloso automático em 3 sementes: 1ª colonização em 3–8 meses; 20 províncias em 1.5–4 h a 1× (540–1440 meses... ver nota: 1 h = 360 meses).
- [ ] Commit.

### Task 5: Integração, câmera livre, calendário
**Files:** Modify `worker.ts`, `worldClient.ts` (províncias junto com o mundo), `main.ts`, `hud.ts`, `index.html`, `view/scene.ts`; Delete `src/client/player.ts` uso (manter `astar.ts`).
- [ ] Câmera livre (WASD/setas, arrastar botão do meio/direito, roda, Q/E); barra superior com recursos/renda/data/velocidades; espaço pausa; laço chama `tick`.
- [ ] Checklist headless. Commit.

### Task 6: Fronteiras e cores
**Files:** Create `src/client/view/borders.ts`; Modify `parchment.ts`/`strategic.ts` (overlay de fronteiras, aquarela, nomes), `chunks.ts`/`terrainMesh.ts` (tom das províncias suas), seleção/hover por raycast → célula → província.
- [ ] Checklist headless. Commit.

### Task 7: Painel, comandos e tela inicial
**Files:** Create `src/client/panel.ts`, `src/client/startScreen.ts`; Modify `index.html`, `main.ts`, `hud.ts` (mensagens).
- [ ] Painel lateral com fatores/vagas/obras/botões com motivo; colonizar; tela inicial com selos e "Fundar capital aqui".
- [ ] Checklist headless (fluxo completo). Commit.

### Task 8: Prédios no 3D
**Files:** Create `src/client/view/buildings.ts`; Modify `decor.ts`/`flora.ts` (ocultar no local e vizinhos).
- [ ] Modelos low-poly por tipo/nível, andaimes em obra, bandeira em colonização.
- [ ] Checklist headless. Commit.
