# Visual do mapa (ciclo 8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcadores legíveis que crescem com o zoom, vegetação sem pontinhos, mar sem corte, setinha ▲ de "dá para melhorar" e menos ícones de longe.

**Architecture:** Só cliente. `tilePaint.ts` perde as árvores, ganha cores de floresta e exporta `OPEN_SEA` (fundo do `renderer.ts`). `pick.ts` ganha `markerScale` e `veinVisible`, usados igualmente por `markers.ts` (desenho) e `pickAt` (clique). A setinha usa `checkUpgrade`/`checkUpgradeCity` de `sim/commands.ts` (puros, não alteram o estado).

**Tech Stack:** TypeScript, Canvas 2D, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-map-visuals-design.md`

## Global Constraints
- Simulação intocada (`src/sim`, `src/worldgen`): mesmas sementes → mesmos mapas e mesma partida.
- `markerScale` ∈ [1, 2], não decrescente; 1 até ~0,75 px/tile, 2 a partir de ~3 px/tile.
- Veios livres/de outros só a partir de ~0,8 px/tile; explorados da nação 0 sempre (≥ `MIN_SCALE`).
- Setinha só para a nação 0 e só quando `check*` devolve `ok`.
- Desenho e clique usam os mesmos raios e a mesma regra de visibilidade.

## Review Focus
1. Clique numa cidade grande perto de um veio/lote: a prioridade de `pickAt` (cidade antes de lote/veio) continua. (Task 2)
2. Veio explorado da nação 0 visível de longe também é clicável de longe; veio livre invisível não é clicável. (Task 2)
3. Setinha some na hora em que o dinheiro cai abaixo do custo (chave `markersKey` muda). (Task 3)
4. Emenda entre ladrilhos continua sem destoar sem as árvores (teste de vizinhos de `tilepaint.test.ts`). (Task 1)
5. Zoom mínimo numa tela larga: o fundo fora do mundo é mar, sem faixa bege. (Task 1)

---

### Task 1: Base do mapa
**Files:** Modify `src/client/map/tilePaint.ts`, `src/client/map/renderer.ts`; Test `tests/tilepaint.test.ts`
- Remover `trees()`, `TREE`, `TREE_KINDS` e a chamada. Se o carregamento de chunk em `buildGrid` só servia às árvores, manter (costa e rios usam); verificar.
- `TINT` de floresta mais forte (temperada, taiga, selva; pântano próprio), ajustado por captura.
- `export const OPEN_SEA: string` — cor `rgb()` do alto-mar como `paintTile` produz longe da costa (d ≥ 40, g e w médios); `renderer.ts` pinta o fundo com ela no lugar de `PAPER_BG`.
- Degraus e faixas verticais: achar a causa (superpowers:systematic-debugging) com captura CDP na semente 2209734144 aproximada; corrigir na raiz; teste que reproduz.
- [ ] Testes: ladrilho L0 centrado numa floresta temperada → soma de |Δ| entre pixels vizinhos na horizontal ≤ limite (sem pontos; falha hoje); pixel de alto-mar ≈ `OPEN_SEA` (±6 por canal); teste do defeito das faixas. FAIL → implementar → verdes → commit `feat: cleaner map base (no tree dots, open sea, smooth biomes)`.

### Task 2: Marcadores maiores e menos ícones de longe
**Files:** Modify `src/client/map/pick.ts`, `src/client/map/markers.ts`, `src/client/map/renderer.ts`; Test `tests/mappick.test.ts`
- `pick.ts`: `export function markerScale(scale: number): number`; `export function veinVisible(s: GameState, province: number, vein: number, scale: number): boolean`; `VEIN_DETAIL` → ~0,8 (veios livres). Raios de clique de cidade, lote, veio e fortaleza × `markerScale`; raio da cidade ≈ 1,6× o atual.
- `markers.ts`: os mesmos fatores no desenho (cidade + nível, lotes, veios, bandeira de colonização, fortaleza, barra de ocupação); aro dourado externo na capital (`GOLD`).
- `renderer.ts`: nome de província com cidade em negrito e maior; sem cidade, como hoje.
- [ ] Testes: `markerScale` em 0,2 / 0,75 / 1,5 / 3 / 12 → 1, 1, entre, 2, 2 e não decrescente; clique a 1,5× o raio antigo da cidade (escala 2,5) seleciona a cidade; veio livre não é clicável a 0,5 px/tile e é a 1; veio explorado da nação 0 é clicável a 0,5; Review Focus 1. FAIL → implementar → verdes → commit `feat: bigger zoom-aware markers and fewer far icons`.

### Task 3: Setinha "dá para melhorar" e conferência no navegador
**Files:** Modify `src/client/map/markers.ts`; Test `tests/mappick.test.ts` (ou `tests/markers.test.ts`)
- `export function upgradeable(s: GameState, pm: ProvinceMap): Set<string>` em `markers.ts` — chaves `c:<id>`, `l:<id>:<lot>`, `v:<id>:<vein>` da nação 0 com `checkUpgradeCity`/`checkUpgrade` ok. Desenho: ▲ verde no canto superior direito do ícone. A chave `markersKey` inclui a lista.
- [ ] Testes: com recurso → chave presente; sem dinheiro, com obra (`remaining > 0`) e no nível máximo → ausente; estado igual (JSON) antes/depois; `markersKey` muda quando o dinheiro cai abaixo do custo. FAIL → implementar → verdes.
- [ ] CDP (semente 2209734144 e 860, 1400 px): capturas afastado e aproximado, antes/depois; FPS não cai. `tsc`, suíte, build → commit `feat: upgrade-ready arrows on the map`.
