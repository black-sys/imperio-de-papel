# 0b — Render/LOD — Implementation Plan

> **For agentic workers:** superpowers:executing-plans (Native). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Zoom estratégico com LOD até 600 tiles, pergaminho acima disso, sombras, água animada, névoa, vegetação extra e seletor de qualidade.
**Architecture:** worldgen ganha `coarse.ts`; cliente ganha `quality.ts`, `parchment.ts`, `strategic.ts`, `view/water.ts`, `view/flora.ts`; `ChunkManager` passa a gerenciar níveis.
**Tech Stack:** Three.js 0.169, Vitest.
**Spec:** `docs/superpowers/specs/2026-11-10-render-lod-design.md`

## Global Constraints
- Pureza do worldgen mantida (teste `purity.test.ts`).
- Zoom 3D: 20–600 tiles; fade do pergaminho 500→600.
- Raios LOD (L0, L1): Alto (3,7), Médio (2,6), Baixo (1,5).
- Sombras 2048/1024/off; vegetação 100/50/0%.
- Andabilidade/altura do jogador só do L0.

## Review Focus
1. Câmera em zoom máximo perto da borda do mundo → chunks fora do mundo não são pedidos; sem erro.
2. Trocar semente com chunks L1/L2 em voo → descartados (token/geração).
3. Personagem anda para fora do raio L0 enquanto o chunk L0 ainda não carregou → não atravessa bloqueios (walkAt=0 até L0).
4. `localStorage` indisponível → qualidade padrão Alto, sem erro.
5. Redimensionar janela no pergaminho → canvas acompanha.

---

### Task 1: `generateCoarseChunk`
**Files:** Create `src/worldgen/coarse.ts`; Modify `src/worldgen/chunk.ts` (exportar `terrainHeight(map,gx,gy)` e `standingWaterAt(map,gx,gy,top)`); Test `tests/coarse.test.ts`.
**Interfaces:** `interface CoarseChunk { cx; cy; step; heights: Float32Array /* (CHUNK/step+1)² */; biome: Uint8Array /* (CHUNK/step)² */; water: Uint8Array /* 0/1/2 */; waterLevel: Float32Array }`; `generateCoarseChunk(map, cx, cy, step: 2|4): CoarseChunk`.
- [ ] Testes: alturas iguais às do `generateChunk` em vértices amostrados de tiles secos (sem água num raio de 2 tiles); costura com vizinho; fora do mundo = oceano; determinismo.
- [ ] `perf.ts` mede média do grosso (meta < 1 ms).
- [ ] Commit.

### Task 2: Qualidade + `lodFor`
**Files:** Create `src/client/quality.ts`; Test `tests/quality.test.ts`.
**Interfaces:** `type Quality = 'low'|'medium'|'high'`; `QUALITY: Record<Quality, { l0: number; l1: number; shadow: 0|1024|2048; flora: number; animateWater: boolean }>`; `lodFor(dist: number, q: Quality): 0|1|2`; `loadQuality(): Quality` (try/catch localStorage, padrão 'high'); `saveQuality(q)`.
- [ ] Testes de limites e de localStorage ausente.
- [ ] Commit.

### Task 3: `renderParchment`
**Files:** Create `src/client/parchment.ts`; Test `tests/parchment.test.ts`.
**Interfaces:** `renderParchment(map: WorldMap, size: number): Uint8ClampedArray`.
- [ ] Testes: determinístico; pixel em oceano aberto ≈ verde-acinzentado; pixel no interior seco ≈ papel; pixel de litoral escuro (marrom).
- [ ] Commit.

### Task 4: LOD no cliente
**Files:** Modify `src/client/worker.ts`, `src/client/worldClient.ts` (`coarse(cx,cy,step)`), `src/client/view/terrainMesh.ts` (`buildCoarseTerrain`, `buildCoarseWater`, saias), `src/client/view/chunks.ts` (níveis), `src/client/view/scene.ts` (zoom 600, far plane), `src/main.ts`.
- [ ] `ChunkManager.update(centerX, centerY, viewRadiusChunks, quality)`: nível por chunk via `lodFor`, histerese, descarte fora da vista + 1.
- [ ] Checklist headless: zoom 20→600 sem frestas; chunks fora do mundo não pedidos.
- [ ] Commit.

### Task 5: Mapa estratégico
**Files:** Create `src/client/strategic.ts`; Modify `index.html`, `src/main.ts`, `src/client/map2d.ts` (remover overlay; manter `BIOME_COLORS/BIOME_NAMES`).
- [ ] Canvas em tela cheia com `renderParchment(map, 2048)`; opacidade por largura da vista; pan/zoom acima de 600; clique centraliza; M alterna; marcador do jogador.
- [ ] Checklist headless.
- [ ] Commit.

### Task 6: Sombras, névoa, água animada, seletor de qualidade
**Files:** Modify `scene.ts`, `terrainMesh.ts`; Create `src/client/view/water.ts`; Modify `hud.ts`, `index.html`.
- [ ] Sombras por qualidade seguindo o alvo; névoa + céu; shader de água com ondulação, espuma (atributo shore) e correnteza (atributo flow dir); HUD com qualidade, FPS e triângulos.
- [ ] Checklist headless (screenshots).
- [ ] Commit.

### Task 7: Vegetação extra
**Files:** Create `src/client/view/flora.ts`; Test `tests/flora.test.ts`.
**Interfaces:** `placeFlora(c: ChunkData, density: number): { kind: FloraKind; x: number; y: number; s: number }[]` (pura); classe `Flora` (InstancedMesh por tipo, add/remove por chunk).
- [ ] Testes: determinístico; nada em água; nada em tile com recurso; densidade 0 → vazio.
- [ ] Commit.
