# Gerador de Mundo 0a — Erosão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (Native, escolhido pelo usuário). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Grade global 1024, erosão stream power + térmica, rios seguindo vales, água local definida pela altura do terreno.

**Architecture:** Novo módulo `src/worldgen/global/erosion.ts` entre umidade e hidrologia; `plates.ts` devolve `uplift`; `chunk.ts` troca regras de água por comparação de alturas.

**Tech Stack:** TypeScript, Vitest (sem mudanças de dependências).

**Spec:** `docs/superpowers/specs/2026-11-10-worldgen-erosion-design.md`

## Global Constraints
- Regras de pureza da v1 (teste `purity.test.ts`) continuam valendo.
- `GLOBAL_SIZE = 1024`, `CELL = 4`, `WORLD_TILES = 4096`, `CHUNK = 64`.
- Constantes dependentes de resolução são expressas em função de `size`/`CELL` (não números mágicos de 512).
- Global < 8000 ms, chunk < 10 ms (`npm run perf`).
- Estágios de progresso: `forma, placas, umidade, erosão, rios, biomas`.

## Review Focus
1. **Sementes extremas** (0, 4294967295) → geração termina, terra 35–55%. Teste em Task 5.
2. **Erosão apaga montanhas** → fração ≥ MOUNTAIN_LEVEL > 2%. Teste em Task 3.
3. **Mundo sem lagos** → código de lago não quebra (lago opcional). Coberto: chunk test só exige lago se existir.
4. **Rio que termina em lago** → nível local do rio nunca acima do lago/terreno. Teste "água não flutua" (Task 6).
5. **Spawn depois da erosão** → continua em chão firme (testes de spawn da v1).

---

### Task 1: Escala 1024 com constantes relativas
**Files:** Modify `src/worldgen/constants.ts`, `global/shape.ts`, `global/moisture.ts`, `global/hydrology.ts`, `global/biomes.ts`, `tests/*.test.ts` que assumem 8/512.
- [ ] Mudar `GLOBAL_SIZE=1024`, `CELL=4`; `MIN_ISLAND`, `LAKE_MIN_CELLS`, `RIVER_FLOW_MIN`, decaimento de chuva, escalas de ruído de temperatura/umidade → proporcionais a `size/512` (fluxo ∝ (size/512)², distâncias ∝ size/512).
- [ ] Testes que usam `* 8` para converter célula→tile passam a usar `CELL`.
- [ ] `npx vitest run` → tudo verde exceto o hash de referência; atualizar com `-u` e conferir visualmente o mapa (PNG) parecido com o da v1 em mistura de biomas (histograma).
- [ ] Commit `refactor: global grid 1024 with resolution-relative constants`.

### Task 2: `uplift` em `applyPlates`
**Interfaces:** `applyPlates(seed, size, base, land): { elevation: Float32Array; uplift: Float32Array }` (uplift ∈ [0,1], = termo de montanha normalizado; 0 no oceano).
- [ ] Teste: `uplift` em [0,1], 0 no oceano, média de uplift em células ≥ MOUNTAIN_LEVEL > média geral × 3.
- [ ] Atualizar chamadores (`world.ts`, testes de placas/hidrologia).
- [ ] Commit `feat: plates return uplift`.

### Task 3: Erosão
**Files:** Create `src/worldgen/global/erosion.ts`; Test `tests/erosion.test.ts`.
**Interfaces:** `erode(size: number, elevation: Float32Array, land: Uint8Array, uplift: Float32Array, rain: Float32Array, onIter?: (i: number, n: number) => void): Float32Array`.
Algoritmo por iteração: priority-flood (reusar o de `hydrology.ts`, exportando `priorityFlood`, `downstream`), ordem por `filled` crescente (foz→montante), `F = K·dt·sqrt(A)/dist`, `h_i = (h_i + F·h_r)/(1+F)`, `h_i += U·uplift_i·dt`, clamp ≥ SEA_LEVEL+0.001 e ≤ 1; térmica a cada `THERMAL_EVERY`.
- [ ] Testes: máscara terra/oceano preservada; montanhas > 2% da terra; rugosidade média (|Δ| entre vizinhos) em montanhas maior que antes; determinismo (hash igual 2×).
- [ ] Commit `feat: stream power + thermal erosion`.

### Task 4: Perturbação em bacias planas + rios sem retas
**Files:** Modify `global/hydrology.ts`; Test `tests/hydrology.test.ts`.
- [ ] Teste: em sementes 860, 1, 2 (pipeline completa), maior sequência de passos D8 iguais em qualquer rio < 12.
- [ ] Implementar ruído ≤ 1e-4 somado à elevação antes do flood (só para a ordem/escoamento; `elevation` devolvida sem ruído).
- [ ] Commit `fix: meandering rivers on flat basins`.

### Task 5: Integrar na pipeline
**Files:** Modify `global/world.ts`, `tests/world.test.ts`, `scripts/perf.ts`.
- [ ] Teste de estágios com `'erosão'`; sementes 0 e 4294967295 terminam com terra 35–55%.
- [ ] `npm run perf` global < 8000 ms; atualizar hash de referência; PNG de conferência.
- [ ] Commit `feat: erosion stage in world pipeline`.

### Task 6: Água local por altura
**Files:** Modify `src/worldgen/chunk.ts`; Test `tests/chunk.test.ts`.
- [ ] Testes novos: água não flutua (≤ maior canto dos 4-vizinhos secos + 0.05); sem paredes de lago (< 4); confluência (tiles a < largura/2−1 de cada ponto suavizado são água).
- [ ] Implementar oceano/lago/rio conforme spec; largura máxima; nível do rio limitado a terreno − 0.3.
- [ ] Tentar remover remendos da v1; manter se testes da v1 falharem.
- [ ] Conferir no navegador (headless) margens de lago, rio e costa.
- [ ] Commit `feat: height-based local water`.
