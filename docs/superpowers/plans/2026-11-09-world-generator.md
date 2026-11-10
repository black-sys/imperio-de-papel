# Gerador de Mundo v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerador determinístico de continente 4096×4096 (relevo, rios, lagos, biomas, recursos) + visualizador isométrico low-poly no navegador com personagem andando.

**Architecture:** `src/worldgen/` é TypeScript puro (sem DOM): fase global 512×512 gera `WorldMap`; fase local gera `ChunkData` 64×64 sob demanda. O cliente roda o worldgen num Web Worker e renderiza chunks com Three.js (câmera ortográfica isométrica).

**Tech Stack:** Vite 5, TypeScript 5 (strict), Three.js 0.169, Vitest 2. Node ≥ 20.

**Spec:** `docs/superpowers/specs/2026-11-09-world-generator-design.md`

## Global Constraints

- `src/worldgen/` não importa nada de DOM, `three` ou `src/client/`.
- `src/worldgen/` nunca usa `Math.random`, `Math.sin`, `Math.cos`, `Math.tan`, `Math.exp`, `Math.pow`, `Math.log`, `**` com expoente não inteiro, `Math.atan2`. Permitidos: `+ - * /`, `Math.sqrt`, `Math.floor/ceil/round/abs/min/max/imul`.
- Mundo: `WORLD_TILES = 4096`, `GLOBAL_SIZE = 512`, `CELL = 8` (tiles por célula global), `CHUNK = 64`, chunks por lado = 64.
- 1 tile = 1 unidade de mundo. Altura em unidades de mundo = `(elevation - SEA_LEVEL) * HEIGHT_SCALE` + detalhe; nível do mar = 0.
- Terra entre 35% e 55% das células globais (alvo 45%).
- Metas: fase global < 3 s, chunk < 10 ms (PC médio).
- Velocidade do personagem 5 tiles/s; vau = 2,5 tiles/s.
- ID de recurso: `` `c${cx}_${cy}#${n}` ``.
- Link compartilhável: `?seed=N` (inteiro uint32).
- Textos de UI em português.

## Review Focus

1. **Semente inválida na URL** (`?seed=abc`, `-5`, `1.5`, `99999999999`) → semente aleatória válida e URL reescrita; nunca tela em branco. Teste: `parseSeed` (Task 1).
2. **Chunks na borda do mundo / fora dele** (`cx=-1`, `cx=64`) → chunk de oceano bloqueado, sem exceção. Teste em Task 9.
3. **Trocar a semente enquanto a anterior ainda está gerando** → resultado antigo descartado; só o mundo da semente atual aparece. Token de geração em Task 11 (checklist manual).
4. **Teleporte pelo mapa 2D para água/montanha bloqueada** → cai no tile andável mais próximo. Teste: `nearestWalkable` (Task 13).
5. **Clique em ponto inalcançável ou em chunk não carregado** → personagem não se move, sem travar. Teste: `findPath` retorna `null` (Task 13).

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, README.md
src/worldgen/
  constants.ts   constantes do mundo
  types.ts       Biome, WorldMap, River, ChunkData, Resource
  rng.ts         makeRng, subSeed, hashArrays
  seed.ts        parseSeed, randomSeed
  noise.ts       valueNoise, fbm, ridged, warp
  global/shape.ts       landShape
  global/plates.ts      applyPlates
  global/moisture.ts    windMoisture
  global/hydrology.ts   runHydrology
  global/biomes.ts      temperatureMap, classifyBiome, biomeMap
  global/world.ts       generateWorld (orquestra + spawn)
  chunk.ts       generateChunk (alturas, água, rios, biomas)
  resources.ts   placeResources, walkability
src/client/
  worker.ts      protocolo com o worldgen
  worldClient.ts lado principal do worker (promises + token)
  map2d.ts       mapa-múndi 2D
  hud.ts         semente, link, progresso, painel
  view/scene.ts  renderer, câmera iso, luzes, rotação/zoom
  view/terrainMesh.ts  ChunkData → malhas (terreno + água)
  view/decor.ts  InstancedMesh de árvores/rochas
  view/chunks.ts gerenciador de chunks
  astar.ts       findPath, nearestWalkable (puro)
  player.ts      boneco, WASD, clique
src/main.ts
tests/*.test.ts
scripts/perf.ts
```

---

### Task 1: Scaffold, RNG, semente e regra de pureza

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts` (vazio por enquanto), `src/worldgen/constants.ts`, `src/worldgen/types.ts`, `src/worldgen/rng.ts`, `src/worldgen/seed.ts`
- Test: `tests/rng.test.ts`, `tests/purity.test.ts`

**Interfaces:**
- Produces:
  - `constants.ts`: `WORLD_TILES=4096, GLOBAL_SIZE=512, CELL=8, CHUNK=64, CHUNKS_PER_SIDE=64, SEA_LEVEL=0.4, MOUNTAIN_LEVEL=0.75, HEIGHT_SCALE=64, RIVER_FLOW_MIN=40, LAKE_MIN_CELLS=12, LAKE_MIN_DEPTH=0.01, MAX_WALK_SLOPE=1.2, FORD_MAX_WIDTH=3`
  - `types.ts`: `enum Biome { Ocean=0, Beach, Snow, Taiga, TemperateForest, Grassland, Swamp, Savanna, Desert, Jungle, Mountain }` (11 valores) e as interfaces `WorldMap`, `River`, `ChunkData`, `Resource` exatamente como no spec; `River = { points: Float32Array /* pares x,y em tiles */, flow: Float32Array, surface: Float32Array /* elevação 0..1 por ponto */ }`; `WorldMap.rivers: River[]`; `WorldMap.lakeSurface: Float32Array` (0 onde não é lago); `WorldMap.filled: Float32Array` (superfície após priority-flood).
  - `rng.ts`: `makeRng(seed: number): () => number` (sfc32, saída em [0,1)), `subSeed(seed: number, label: string): number` (uint32), `hashArrays(...arrs: ArrayBufferView[]): string` (FNV-1a 32 bits em hex sobre os bytes)
  - `seed.ts`: `parseSeed(raw: string | null): number | null` (aceita só inteiro decimal 0..4294967295), `randomSeed(): number` (usa `crypto.getRandomValues`; único ponto do worldgen-adjacente com aleatoriedade real — fica em `seed.ts` e é chamado só pelo cliente)

- [ ] **Step 1: Scaffold** — `npm init`, deps: `three`, dev: `typescript vite vitest @types/three tsx`. Scripts: `dev: vite`, `build: tsc --noEmit && vite build`, `preview: vite preview --host`, `test: vitest run`, `perf: tsx scripts/perf.ts`. `tsconfig` strict, `target ES2022`, `module ESNext`, `moduleResolution bundler`, `lib [ES2022, DOM, WebWorker]`.

- [ ] **Step 2: Write failing tests** (`tests/rng.test.ts`)

```ts
test('makeRng é determinístico e em [0,1)', () => {
  const a = makeRng(860), b = makeRng(860);
  const xs = Array.from({ length: 1000 }, a);
  expect(xs).toEqual(Array.from({ length: 1000 }, b));
  expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
  expect(makeRng(861)()).not.toBe(xs[0]);
});
test('subSeed difere por rótulo e é estável', () => {
  expect(subSeed(860, 'rios')).toBe(subSeed(860, 'rios'));
  expect(subSeed(860, 'rios')).not.toBe(subSeed(860, 'placas'));
});
test('hashArrays muda com um byte', () => {
  const a = new Uint8Array([1, 2, 3]), b = new Uint8Array([1, 2, 4]);
  expect(hashArrays(a)).not.toBe(hashArrays(b));
});
test.each([['123', 123], ['0', 0], ['4294967295', 4294967295]])('parseSeed(%s)', (s, v) => expect(parseSeed(s)).toBe(v));
test.each([null, '', 'abc', '-5', '1.5', '4294967296', '12abc'])('parseSeed inválido %s', s => expect(parseSeed(s)).toBeNull());
```

`tests/purity.test.ts`: lê recursivamente `src/worldgen/**/*.ts` e falha se casar `/Math\.(random|sin|cos|tan|exp|pow|log|atan2)\b|from ['"](three|.*client)/`. `seed.ts` é exceção apenas para `crypto`.

- [ ] **Step 3: Run** `npx vitest run` → FAIL (módulos inexistentes).
- [ ] **Step 4: Implement** `constants.ts`, `types.ts`, `rng.ts`, `seed.ts`.
- [ ] **Step 5: Run** `npx vitest run` → PASS.
- [ ] **Step 6: Commit** `feat: scaffold, seeded rng and purity rule`

---

### Task 2: Ruído

**Files:** Create `src/worldgen/noise.ts`; Test `tests/noise.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `valueNoise(x: number, y: number, seed: number): number` ([0,1], interpolação smoothstep, hash inteiro como no Palisade `nO`), `fbm(x, y, seed, octaves: number): number` ([0,1]), `ridged(x, y, seed, octaves): number` ([0,1], `1-|2n-1|` por oitava), `warp(x, y, seed, strength: number): [number, number]` (desloca por dois fbm).

- [ ] **Step 1: Tests** — para 10 000 pontos aleatórios (rng semente 1): todos os quatro em [0,1]; mesma entrada ⇒ mesma saída; continuidade: `|fbm(x,y)-fbm(x+0.001,y)| < 0.01`; sementes diferentes ⇒ médias de 100 amostras diferem.
- [ ] **Step 2:** `npx vitest run tests/noise.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: seeded noise`

---

### Task 3: Forma do continente

**Files:** Create `src/worldgen/global/shape.ts`; Test `tests/shape.test.ts`

**Interfaces:**
- Consumes: `fbm`, `warp`, `subSeed`, constantes.
- Produces: `landShape(seed: number, size: number): { base: Float32Array; land: Uint8Array }` — `base` em [0,1]; `land[i]=1` se terra. Ajusta o limiar pela distribuição (percentil) para 45% de terra e depois mantém a maior massa conectada (4-vizinhos) mais ilhas com ≥ 20 células; células removidas viram oceano. Borda de 4 células sempre oceano. Re-normaliza `base` para que o limiar caia em `SEA_LEVEL`.

- [ ] **Step 1: Tests** — para sementes 1..6 com `size=256`: fração de terra em [0.35, 0.55]; todas as células com `x<4|y<4|x>=size-4|y>=size-4` são oceano; `land[i]===1 ⇔ base[i] >= SEA_LEVEL`; determinismo (`hashArrays` igual em duas chamadas).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: continent shape`

---

### Task 4: Relevo por placas

**Files:** Create `src/worldgen/global/plates.ts`; Test `tests/plates.test.ts`

**Interfaces:**
- Consumes: `landShape` (resultado), `ridged`, `fbm`, `makeRng`.
- Produces: `applyPlates(seed: number, size: number, base: Float32Array, land: Uint8Array): Float32Array` — elevação em [0,1]; oceano < `SEA_LEVEL`, terra ≥ `SEA_LEVEL` (preserva a máscara).

Algoritmo: 8–12 sementes de placa (rng), cada uma com vetor de deriva unitário. Para cada célula, placa = mais próxima (distância com warp para fronteiras irregulares); distância à fronteira = diferença entre a 1ª e 2ª distâncias. Convergência na fronteira = `dot(drift_a - drift_b, dir_a→b)`; se > 0, soma `conv * ridged * max(0, 1 - d/14)` (montanha); se < 0, subtrai metade disso (vale). Soma fbm de colinas com amplitude 0.08. Clampa terra em [SEA_LEVEL, 1].

- [ ] **Step 1: Tests** (sementes 1..4, size 256): máscara preservada; fração de terra ≥ `MOUNTAIN_LEVEL` em [0.02, 0.20]; **cordilheiras são alongadas**: a maior componente conectada de células ≥ `MOUNTAIN_LEVEL` tem razão bounding-box (lado maior / lado menor) ≥ 2 ou ≥ 40 células; determinismo.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (ajustar amplitudes se a faixa de montanha falhar).
- [ ] **Step 5: Commit** `feat: plate mountains`

---

### Task 5: Umidade pelo vento

**Files:** Create `src/worldgen/global/moisture.ts`; Test `tests/moisture.test.ts`

**Interfaces:**
- Produces: `windMoisture(size: number, elevation: Float32Array, land: Uint8Array, seed: number): Float32Array` ([0,1]).

Algoritmo (por linha, x de 0 a size-1, vento oeste→leste):
```
carried = 1
oceano: carried += (1 - carried) * 0.15; moisture = 1
terra:  rise = max(0, elev[x] - elev[x-1])
        rain = carried * (0.015 + rise * 6)
        carried = max(0, carried - rain)
        moisture = clamp(carried * 0.8 + rain * 4 + (fbm-0.5)*0.1, 0, 1)
```
Depois aplica blur 3×3 duas vezes.

- [ ] **Step 1: Tests** — mapa sintético 64×64: x<10 oceano, terra no resto com crista (elev 0.9) em x∈[30,33]: média de umidade em x∈[20,29] > média em x∈[36,45] + 0.15. Saída em [0,1]. Oceano = 1 antes do blur (testar só faixa x<8 ≥ 0.9).
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: wind moisture and rain shadow`

---

### Task 6: Hidrologia (lagos, fluxo, rios, erosão)

**Files:** Create `src/worldgen/global/hydrology.ts`; Test `tests/hydrology.test.ts`

**Interfaces:**
- Produces: `runHydrology(size: number, elevation: Float32Array, land: Uint8Array, moisture: Float32Array): { elevation: Float32Array; filled: Float32Array; water: Uint8Array; lakeSurface: Float32Array; flow: Float32Array; river: Uint8Array; rivers: River[] }`

Passos:
1. **Priority-flood** (Barnes 2014) a partir de todas as células de oceano, com ε = 1e-5: `filled[n] = max(elev[n], filled[c] + ε)`. Heap binário próprio.
2. **Lagos**: componentes 8-conectadas de terra com `filled - elev > LAKE_MIN_DEPTH` e tamanho ≥ `LAKE_MIN_CELLS` → `water=2`, `lakeSurface = filled`. Oceano → `water=1`.
3. **Fluxo**: ordenar células de terra por `filled` decrescente; cada uma passa `flow += moisture` (chuva própria) para o vizinho D8 de menor `filled` (sempre existe graças ao ε).
4. **Rio**: `river=1` onde `flow ≥ RIVER_FLOW_MIN` e `water=0`.
5. **Erosão**: em células de rio, `elevation -= min(0.03, 0.004*sqrt(flow))`, sem descer abaixo de `SEA_LEVEL + 0.001`; mantém `filled = max(filled_novo_por_reflood)` recalculando o priority-flood uma vez.
6. **Polilinhas**: para cada nascente (célula de rio sem montante de rio), seguir D8 até chegar em água (oceano/lago) ou num rio já traçado (termina ali, ponto de junção incluído). Pontos no centro da célula em tiles (`x*CELL+CELL/2`), `surface = filled`.

- [ ] **Step 1: Tests**
  - mapa sintético rampa 64×64 (oceano em x<4, elevação sobe para leste, umidade 1): existe ≥ 1 rio; todo `River` termina numa célula com `water≠0` ou no ponto de outro rio; `surface` não-crescente ao longo de cada rio.
  - mapa com bacia fechada (cratera 10×10 no meio da rampa): vira lago (`water=2` em ≥ 12 células).
  - para sementes 1..3 rodando shape+plates+moisture com size 256: as mesmas duas regras de rio valem para todos os rios.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: hydrology, lakes and rivers`

---

### Task 7: Temperatura e biomas

**Files:** Create `src/worldgen/global/biomes.ts`; Test `tests/biomes.test.ts`

**Interfaces:**
- Produces:
  - `temperatureMap(size, elevation: Float32Array, seed): Float32Array` — `t = y/(size-1) - max(0, elev - SEA_LEVEL)*1.2 + (fbm-0.5)*0.1`, clamp [0,1] (norte frio, sul quente).
  - `classifyBiome(elev: number, t: number, m: number, water: number, coastal: boolean, slope: number): Biome`
  - `biomeMap(size, elevation, temperature, moisture, water): Uint8Array`

Tabela de `classifyBiome` (primeira regra que casar):
```
water=1 → Ocean ; water=2 → Ocean (lago renderiza como água; bioma de borda vem do vizinho)
coastal && elev < SEA_LEVEL + 0.02 → Beach
elev ≥ MOUNTAIN_LEVEL → t < 0.25 ? Snow : Mountain
t < 0.15 → Snow
t < 0.35 → m > 0.4 ? Taiga : Grassland
t < 0.70 → m < 0.25 ? Grassland : (m > 0.75 && slope < 0.004 ? Swamp : TemperateForest)
senão    → m < 0.20 ? Desert : m < 0.45 ? Savanna : m < 0.75 ? Grassland : Jungle
```
`coastal` = algum 4-vizinho com `water=1`; `slope` = máx |Δelev| para os 4 vizinhos.

- [ ] **Step 1: Tests** — `test.each` com uma linha por regra da tabela acima (ex.: `classifyBiome(0.5, 0.9, 0.1, 0, false, 0.01) === Biome.Desert`, `classifyBiome(0.5, 0.5, 0.9, 0, false, 0.001) === Biome.Swamp`, `classifyBiome(0.8, 0.1, 0.5, 0, false, 0) === Biome.Snow`, ...). `temperatureMap`: média da linha 0 < média da última linha.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: temperature and biomes`

---

### Task 8: `generateWorld` + spawn + hash de referência + perf

**Files:** Create `src/worldgen/global/world.ts`, `scripts/perf.ts`; Test `tests/world.test.ts`

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces: `generateWorld(seed: number, onProgress?: (stage: string, pct: number) => void): WorldMap` — etapas na ordem do spec, cada uma com `subSeed(seed, '<etapa>')`; `spawn` = célula de terra `water=0`, bioma ∈ {Grassland, TemperateForest}, mais próxima do centro → convertida para tile central da célula. Estágios reportados: `'forma'`, `'placas'`, `'umidade'`, `'rios'`, `'biomas'`.

- [ ] **Step 1: Tests** (size real 512; marcar `describe` com timeout 30 s)
  - `hashArrays(...)` de duas chamadas com 860 é igual; snapshot do hash da semente 860 com `toMatchInlineSnapshot()` (preenchido na primeira execução — é o "hash de referência").
  - para sementes 1..3: terra em [0.35, 0.55]; ≥ 8 biomas distintos; spawn em célula de terra com bioma Grassland/TemperateForest.
  - **sombra de chuva**: para cada célula de montanha com terra a 6 células de distância dos dois lados, média de umidade a oeste (x-6..x-2) > média a leste (x+2..x+6), agregado sobre o mundo (comparar as duas médias globais).
  - `onProgress` é chamado com os 5 estágios em ordem.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: `scripts/perf.ts`** — mede `generateWorld(860)` e média de 50 `generateChunk` (adicionado na Task 9; até lá só o global). Imprime `global: X ms (meta 3000)`. Run: `npm run perf`. Se > 3000 ms, otimizar antes de seguir (priority-flood e blur são os suspeitos).
- [ ] **Step 6: Commit** `feat: generateWorld with spawn and reference hash`

---

### Task 9: Chunk — alturas, água, rios, biomas

**Files:** Create `src/worldgen/chunk.ts`; Test `tests/chunk.test.ts`

**Interfaces:**
- Consumes: `WorldMap`, `noise`, constantes.
- Produces: `generateChunk(map: WorldMap, cx: number, cy: number): ChunkData` (sem `walk`/`resources` reais ainda — Task 10 preenche; aqui `walk` todo 1 e `resources=[]`).

Regras:
- Vértice global `(gx, gy)`, `gx = cx*CHUNK + i`, i ∈ [0,64]. Elevação = Catmull-Rom bicúbica de `map.elevation` em `(gx/CELL - 0.5, gy/CELL - 0.5)` (clamp nas bordas). Altura = `(e - SEA_LEVEL)*HEIGHT_SCALE + detalhe`, detalhe = `(fbm(gx/6, gy/6, seed)-0.5) * amp[bioma]`, amp: Mountain 6, Snow 4, Taiga 1.5, TemperateForest 1.2, Jungle 1.2, Savanna 0.8, Grassland 0.6, Desert 1.0 (dunas), Swamp 0.2, Beach 0.2, Ocean 1.0. **Tudo calculado só de (gx, gy)** — garante costuras.
- Bioma do tile: célula global em `((gx + (fbm-0.5)*6)/CELL, (gy + ...)/CELL)` (jitter).
- Água: célula do jitter com `water=1` → tile 1, `waterLevel=0`; `water=2` → tile 2, `waterLevel=(lakeSurface-SEA_LEVEL)*HEIGHT_SCALE`. Vértices de tiles d'água são rebaixados para `waterLevel - 1.5` se estiverem acima.
- Rios: polilinhas de `map.rivers` com bbox tocando o chunk (+8 de margem), suavizadas com 2 iterações de Chaikin. Largura = `min(8, 1 + sqrt(flow)*0.3)`. Vértice a distância < largura/2 do segmento mais próximo: altura = `min(altura, superfície - 0.8)` onde superfície = `(surface interpolado - SEA_LEVEL)*HEIGHT_SCALE`; tile com centro dentro → `water=3`, `waterLevel` = superfície. Guardar a largura do rio por tile em array interno para Task 10 (exportar `riverWidthAt` ou incluir em `ChunkData.riverWidth: Float32Array` — **usar `riverWidth: Float32Array` (64×64, 0 fora do rio)** e adicionar ao tipo).
- Fora do mundo (`cx` ou `cy` fora de [0,63]): retorna chunk com alturas `-HEIGHT_SCALE*0.2`, `water=1`, bioma Ocean.

- [ ] **Step 1: Tests**
  - **costura**: para (cx,cy) = (20,20) e vizinho (21,20): coluna 64 de um == coluna 0 do outro (`toEqual`); idem vertical com (20,21).
  - determinismo: `hashArrays` de `generateChunk(map,20,20)` igual em duas chamadas.
  - fora do mundo: `generateChunk(map,-1,0)` e `(64,10)` não lançam; todos os tiles `water=1`.
  - **rio presente**: para o primeiro `River` de `map` (semente 860), o chunk que contém seu 5º ponto tem ≥ 1 tile `water=3`.
  - tiles com `water≠0` têm os 4 vértices ≤ `waterLevel`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. Rodar `npm run perf` (adicionar o bloco de chunk): média < 10 ms.
- [ ] **Step 5: Commit** `feat: chunk heights, water and rivers`

---

### Task 10: Andabilidade e recursos

**Files:** Create `src/worldgen/resources.ts`; Modify `src/worldgen/chunk.ts` (chamar ao final); Test `tests/resources.test.ts`

**Interfaces:**
- Produces: `walkability(c: ChunkData): Uint8Array` e `placeResources(seed: number, c: ChunkData): Resource[]`; `generateChunk` passa a preencher `walk` e `resources` e marca tiles com recurso como `walk=0`.

Regras:
- `walk`: `water=1|2` → 0; `water=3` → `riverWidth ≤ FORD_MAX_WIDTH` ? 2 : 0; maior |Δaltura| entre os 4 vértices do tile > `MAX_WALK_SLOPE` → 0; senão 1.
- Recursos: rng `makeRng(subSeed(seed, \`res:${cx},${cy}\`))`; percorrer tiles em ordem de linha; tile com `walk=1`: sortear contra a densidade do bioma; `n` = contador sequencial. Densidades: TemperateForest 0.18 `tree`; Taiga 0.20 `pine`; Jungle 0.30 `tree`; Swamp 0.08 `tree`; Savanna 0.03 `tree`; Grassland 0.02 `tree` + 0.01 `rock`; Desert 0.015 `cactus` + 0.01 `rock`; Mountain 0.04 `rock`; Snow 0.01 `rock`; Beach/Ocean 0. Posição = centro do tile + jitter ±0.3 (coordenadas globais em tiles).
- Spawn nunca recebe recurso (pular o tile do `map.spawn`).

- [ ] **Step 1: Tests**
  - IDs estáveis: duas gerações do chunk (20,20) → mesma lista de `id`, `kind`, `x`, `y`; IDs casam `/^c20_20#\d+$/`.
  - nenhum recurso em tile de água; todo tile com recurso tem `walk=0`.
  - chunk de floresta (procurar o primeiro chunk cujo bioma majoritário é TemperateForest) tem densidade de recursos > 0.1; chunk de oceano tem 0.
  - tile de rio estreito (`riverWidth` ∈ (0,3]) → `walk=2`.
  - o tile de spawn tem `walk≠0`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (rodar a suíte inteira: a Task 9 continua passando).
- [ ] **Step 5: Commit** `feat: walkability and resources with stable ids`

---

### Task 11: Worker, mapa 2D e HUD (primeira versão no navegador)

**Files:** Create `src/client/worker.ts`, `src/client/worldClient.ts`, `src/client/map2d.ts`, `src/client/hud.ts`; Modify `src/main.ts`, `index.html`; Create `README.md`

**Interfaces:**
- Consumes: `generateWorld`, `generateChunk`, `parseSeed`, `randomSeed`.
- Produces:
  - Protocolo do worker: entrada `{ type: 'world', seed, token }` | `{ type: 'chunk', cx, cy, token }`; saída `{ type: 'progress', stage, pct, token }` | `{ type: 'world', map, token }` | `{ type: 'chunk', data, token }` | `{ type: 'error', message, seed, token }`. O worker guarda o `WorldMap` atual e envia uma cópia (structured clone) — chunks transferidos (`Transferable`).
  - `class WorldClient { generate(seed, onProgress): Promise<WorldMap>; chunk(cx, cy): Promise<ChunkData> }` — cada `generate` incrementa `token`; respostas com token antigo são descartadas (Review Focus 3).
  - `drawMap2d(canvas: HTMLCanvasElement, map: WorldMap): void`, `onMapClick(canvas, cb: (tileX, tileY) => void)`; cores por bioma num `BIOME_COLORS: Record<Biome, [r,g,b]>` exportado (reutilizado pelo terreno 3D); rios desenhados por cima; marcador do jogador via `setMarker(tileX, tileY)`.
  - `hud.ts`: `initHud({ onGenerate(seed), getLink() })`, `setProgress(stage, pct)`, `setInfo({ x, y, biome, fps })`, `showError(msg, seed)`. Nomes de bioma em português.
- `main.ts`: `seed = parseSeed(params.get('seed')) ?? randomSeed()`; se inválido, `history.replaceState` com a semente nova. Gera mundo, desenha mapa 2D (tecla M alterna).

- [ ] **Step 1:** implementar; `npm run dev`.
- [ ] **Step 2: Checklist manual** (abrir `http://localhost:5173/?seed=860`):
  - barra de progresso passa pelos 5 estágios; mapa 2D aparece com litoral, montanhas, rios e biomas;
  - `?seed=abc` → abre com semente aleatória e a URL mostra `?seed=<número>`;
  - "Gerar" com outra semente duas vezes seguidas rápido → mapa final é da última semente;
  - "copiar link" copia URL com `?seed=`.
- [ ] **Step 3:** `README.md` — como rodar (`npm i`, `npm run dev`), como compartilhar (`npm run build && npm run preview` → porta 4173; Tailscale: amigos entram na tailnet e acessam `http://<ip-tailscale>:4173/?seed=N`; ou `cloudflared tunnel --url http://localhost:4173`).
- [ ] **Step 4: Commit** `feat: worker, world map 2d and hud`

---

### Task 12: Cena isométrica, malhas low-poly, água, decoração, chunks

**Files:** Create `src/client/view/scene.ts`, `src/client/view/terrainMesh.ts`, `src/client/view/decor.ts`, `src/client/view/chunks.ts`; Modify `src/main.ts`

**Interfaces:**
- Consumes: `WorldClient.chunk`, `BIOME_COLORS`, `ChunkData`.
- Produces:
  - `createScene(canvas): { renderer, scene, camera, setTarget(x, z), rotate(dir: 1 | -1), zoom(delta) }` — `OrthographicCamera`, yaw 45° + 90°·k, pitch 35.264°, zoom limitado (frustum de 20 a 80 tiles de largura); `DirectionalLight` + `HemisphereLight`; Q/E giram; roda = zoom. Eixo: mundo x = tile x, z = tile y, y = altura.
  - `buildTerrain(c: ChunkData): THREE.Mesh` — geometria não indexada, 2 triângulos/tile, `vertexColors`, cor do bioma × (0.92 + 0.16·hash(triângulo)), `MeshLambertMaterial({ vertexColors: true, flatShading: true })`.
  - `buildWater(c: ChunkData): THREE.Mesh | null` — um quad por tile com `water≠0` na altura `waterLevel`, azul semitransparente (`opacity 0.75`), `flatShading`.
  - `class Decor { add(chunkKey, resources: Resource[]); remove(chunkKey) }` — um `InstancedMesh` por `kind` (pinheiro = cone+cilindro, árvore = icosaedro+cilindro, cacto = cilindros, rocha = dodecaedro achatado), geometrias criadas em código, escala/rotação variando por hash do `id`.
  - `class ChunkManager { update(centerTileX, centerTileY): void; walkAt(tx, ty): number /* 0 se chunk não carregado */; heightAt(x, y): number /* bilinear */; biomeAt(tx, ty): Biome | null }` — raio 2 (5×5), pedidos ordenados por distância, máx. 4 em voo, descarte (`dispose` de geometria/material + `Decor.remove`) acima de raio 3.

- [ ] **Step 1:** implementar; câmera começa no `map.spawn`.
- [ ] **Step 2: Checklist manual:** terreno facetado com cores por bioma; rios e lagos visíveis com água; árvores densas em floresta, cactos no deserto; sem fendas entre chunks; Q/E giram 90°; zoom limitado; ao mover a câmera (setas temporárias), chunks carregam e descarregam sem travar; FPS ≥ 60 no HUD no seu PC.
- [ ] **Step 3: Commit** `feat: isometric low-poly view with chunk streaming`

---

### Task 13: Personagem, pathfinding e teleporte

**Files:** Create `src/client/astar.ts`, `src/client/player.ts`; Modify `src/main.ts`; Test `tests/astar.test.ts`

**Interfaces:**
- Consumes: `ChunkManager.walkAt/heightAt/biomeAt`, `createScene().setTarget`, `onMapClick`, `setMarker`, `setInfo`.
- Produces:
  - `findPath(walk: (x: number, y: number) => number, from: {x,y}, to: {x,y}, maxRadius = 64): {x,y}[] | null` — A* 8-direções, custo 1 (diagonal √2), tile `walk=2` custa ×2, sem cortar quina de bloqueado; `null` se destino bloqueado, fora do raio ou inalcançável.
  - `nearestWalkable(walk, x, y, maxR = 32): {x,y} | null` — busca em anéis crescentes.
  - `class Player { update(dt); moveDir(dx, dy) /* WASD, relativo à câmera */; goTo(tile) ; teleport(tile) ; position }` — 5 tiles/s, ×0.5 em `walk=2`; não entra em `walk=0`; y = `heightAt`.
- `main.ts`: WASD → `moveDir` (rotacionado pelo yaw da câmera); clique no terreno (raycast) → `findPath` → `goTo`; clique no mapa 2D → `nearestWalkable` (após carregar o chunk de destino) → `teleport`; HUD mostra coord, bioma, FPS; câmera e `ChunkManager.update` seguem o jogador.

- [ ] **Step 1: Tests** (`tests/astar.test.ts`, grade sintética via função)
  - caminho reto em grade aberta tem comprimento 11 de (0,0) a (10,0);
  - contorna uma parede vertical com abertura;
  - destino cercado → `null`; destino bloqueado → `null`; destino a 100 tiles com `maxRadius=64` → `null`;
  - prefere desviar de 3 tiles de vau se o desvio custa menos;
  - `nearestWalkable` a partir de tile de água cercado por água num raio 5 retorna um tile a distância 6; tudo bloqueado → `null`.
- [ ] **Step 2:** FAIL. **Step 3:** implement `astar.ts`. **Step 4:** PASS.
- [ ] **Step 5:** implement `player.ts` e integração em `main.ts`.
- [ ] **Step 6: Checklist manual:** WASD anda na direção da tela após girar com Q/E; não atravessa mar, lago, rio largo, árvores ou penhascos; atravessa vau mais devagar; clique anda contornando obstáculos; clique em lugar inalcançável não faz nada; M + clique no oceano teleporta para a praia mais próxima; amigo abre `http://<ip>:4173/?seed=860` (via `npm run preview`) e vê o mesmo mundo.
- [ ] **Step 7: Commit** `feat: player movement, pathfinding and teleport`
