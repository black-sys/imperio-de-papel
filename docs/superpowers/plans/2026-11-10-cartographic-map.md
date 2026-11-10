# Mapa Cartográfico (1a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a visão 3D por um mapa cartográfico 2D aquarelado com zoom contínuo e marcadores em símbolos de carta militar, mantendo toda a jogabilidade atual.

**Architecture:** O worker desenha ladrilhos 192×192 em 5 níveis de zoom (níveis próximos a partir de chunks, afastados a partir do mapa global). A thread principal mantém um cache LRU de ladrilhos e desenha num único Canvas 2D: ladrilhos → território e fronteiras vetoriais → nomes → marcadores → caixa de seleção, só quando algo muda. Lógica de vista, escolha de ladrilhos, contornos e alvo sob o ponteiro são funções puras testadas com vitest.

**Tech Stack:** TypeScript, Canvas 2D, Web Worker, Vite, vitest. three.js sai.

**Spec:** `docs/superpowers/specs/2026-11-10-cartographic-map-design.md`

## Global Constraints
- Regras do jogo (`src/sim/*`) não mudam. Geração do mundo (`src/worldgen/*`) não muda, exceto a remoção de `coarse.ts` se ficar sem uso.
- Coordenadas do mundo em tiles (0–4096); `CELL = 4` tiles por célula; `cellProvince` indexado por `GLOBAL_SIZE`.
- Níveis: escala `3 / 2^L` px/tile, `L = 0..4`; ladrilho 192 px cobrindo `64·2^L` tiles; grade de `64 / 2^L` ladrilhos por lado.
- Paleta da aquarela: a da amostra B aprovada (`TINT` por bioma, papel `[240,228,198]`, mar `[168..208, 190..215, 186]` clareando com a distância da costa, água doce `[110,145,160]`, tinta `#3e2a18`). Cor do jogador `#a8342a`; neutro/fortaleza `#7a7468`; seleção `#f7d774`.
- Desvio da spec: só os níveis 0 e 1 usam chunks; o nível 2 (0,75 px/tile) usa o mapa global. Um ladrilho L2 cobriria 16 chunks (~5 ms cada, medido), ~80 ms frio; o mapa global (3 px por célula nesse nível) basta. As árvores aparecem a partir de 1,5 px/tile.
- Marcadores com tamanho fixo em px de tela. Texto da interface em português.
- Mapa parado = 0 redesenhos (contador `paints` exposto como hoje).
- Sem dependência nova. `three` e `@types/three` saem do `package.json`.

## Review Focus
1. Zoom rápido com a roda enquanto ladrilhos ainda chegam → nunca aparece buraco preto: o nível acima ampliado cobre a área. (Task 1, Task 3)
2. Gerar um mundo novo com pedidos de ladrilho em voo → respostas do mundo antigo são descartadas e o cache esvazia. (Task 3)
3. Clique sobre tropa que está em cima de uma cidade → a tropa ganha (prioridade). (Task 5)
4. Redimensionar a janela → a vista se recalcula sem distorcer e sem sair dos limites. (Task 1)
5. Tropa marchando fora da tela → não força redesenho. (Task 6)

---

### Task 1: Vista e escolha de ladrilhos (puro)

**Files:**
- Create: `src/client/map/view.ts`
- Test: `tests/mapview.test.ts`

**Interfaces:**
- Produces:
  - `const TILE_PX = 192, LEVELS = 5, MIN_SCALE = 3 / 16, MAX_SCALE = 3`.
  - `interface View { cx: number; cy: number; scale: number; w: number; h: number }` (centro em tiles, px por tile, tamanho da tela em px).
  - `toScreen(v, x, y): [number, number]`, `toWorld(v, sx, sy): [number, number]`.
  - `zoomAt(v, sx, sy, factor): View` — mantém fixo o ponto do mundo sob (sx, sy); escala limitada a [MIN_SCALE, MAX_SCALE]; aplica `clampView`.
  - `clampView(v): View` — se o mundo (4096·scale) é menor que a tela num eixo, centra nesse eixo; senão o centro fica onde a borda do mundo não entra na tela.
  - `levelFor(scale): number` — o maior L com `3/2^L ≥ scale` (o ladrilho nunca é ampliado; no máximo reduzido até 2×); `scale ≥ 3` → 0, `scale ≤ 3/16` → 4.
  - `tileSpan(L) = 64 * 2 ** L` (tiles); `visibleTiles(v, L): { L, x, y }[]` — todos os ladrilhos do nível que tocam a tela, só dentro da grade.
  - `fallbackFor(t: { L, x, y }): { L, x, y } | null` — o ladrilho do nível `L+1` que contém este (`x >> 1, y >> 1`); null em L = 4.

- [ ] **Step 1: Testes** (`tests/mapview.test.ts`):
  - ida e volta: para várias vistas e pontos, `toWorld(toScreen(p))` ≈ p (1e-9).
  - `zoomAt` mantém o ponto: o mundo sob (sx, sy) antes ≈ depois, para fatores 1.15 e 1/1.15, longe das bordas.
  - limites: escala nunca sai de [3/16, 3]; com escala mínima numa tela 1280×800 o centro é (2048, 2048); com escala 3 e centro pedido em (0,0) a borda esquerda/superior do mundo fica exatamente na borda da tela.
  - redimensionar: `clampView` com `w,h` novos mantém as invariantes acima.
  - `levelFor`: 3→0, 2→0, 1.5→1, 1→1, 0.75→2, 0.2→3, 0.1875→4, 0.05→4.
  - cobertura: para 20 vistas pseudoaleatórias, a união dos retângulos de `visibleTiles(v, levelFor(v.scale))` cobre o retângulo da tela intersectado com o mundo (amostrar 200 pontos de tela dentro do mundo: cada um cai em algum ladrilho).
  - `fallbackFor({L:0,x:5,y:9})` = `{L:1,x:2,y:4}` e cobre a mesma área do mundo; `fallbackFor({L:4,...})` = null.
- [ ] **Step 2:** `npx vitest run tests/mapview.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat: map view math and tile selection`.

### Task 2: Desenho de ladrilho em aquarela (puro, roda no worker)

**Files:**
- Create: `src/client/map/tilePaint.ts`
- Test: `tests/tilepaint.test.ts`

**Interfaces:**
- Consumes: `TILE_PX`, `tileSpan` (Task 1); `WorldMap`, `ChunkData`, `generateChunk`, `finishChunk`.
- Produces:
  - `paintTile(map: WorldMap, L: number, tx: number, ty: number, chunk: (cx: number, cy: number) => ChunkData): Uint8ClampedArray` — RGBA `TILE_PX²`, opaco.
  - `makeChunkCache(map, max = 256): (cx, cy) => ChunkData` — LRU sobre `finishChunk(map, generateChunk(map, cx, cy))`.
  - L = 0 e 1 usam chunks: por pixel, ponto do mundo `(tx·span + (px+0.5)·span/192, …)`; água por altura interpolada bilinear dos vértices `heights` contra `waterLevel` (costa lisa, sem degraus); rio = tile `water === 3` suavizado pela média 3×3 do indicador de rio (sub-tile); bioma do tile → `TINT`; relevo = sombreado pelo gradiente da altura interpolada (luz de noroeste, fator 0.62–1.12); mar clareia com a distância à costa (distância calculada no mapa global, interpolada); árvores = ponto verde `rgba(70,95,55,0.55)` raio `1.5·scale` px nas posições de `resources` (`tree`, `pine`, `cactus`) — em L1 uma de cada duas.
  - L = 2..4 usam só o mapa global (`elevation`, `water`, `river`, `biome`, interpolados bilinear por célula), mesmas cores; sem árvores; costa por limiar da elevação interpolada contra `SEA_LEVEL` (lisa).
  - Textura de papel por hash da coordenada de mundo do pixel (não do pixel local), para casar entre ladrilhos e níveis.
  - Linha de costa em tinta (`#3e2a18`, ~1 px) onde terra encosta em mar.

- [ ] **Step 1: Testes** (mundo `generateWorld(860)` compartilhado, timeout 60 s):
  - determinístico: dois `paintTile` iguais dão o mesmo `hashArrays`.
  - opaco: todo alfa = 255.
  - costura: para L = 0 e L = 3, ladrilho (x,y) e (x+1,y): a última coluna de um e a primeira do outro diferem em média < 12 por canal (continuidade); idem vertical.
  - cores: um ladrilho L = 4 todo de oceano profundo (achar um via `map.water`) tem azul > vermelho em todos os pixels longe da costa; o centro da capital sugerida 0 em L = 0 não é azul (terra); um pixel sobre um tile de rio largo em L = 0 é azulado (`b > r`).
  - desempenho: com o cache de chunks quente, média de `paintTile` em 12 ladrilhos L = 0 < 15 ms; 12 ladrilhos L = 3 < 15 ms.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: watercolor map tile painter`.

### Task 3: Ladrilhos pelo worker e cache na tela

**Files:**
- Modify: `src/client/worker.ts`, `src/client/worldClient.ts`
- Create: `src/client/map/tileCache.ts`
- Test: `tests/tilecache.test.ts`

**Interfaces:**
- Consumes: `paintTile`, `makeChunkCache` (Task 2); `visibleTiles`, `fallbackFor`, `levelFor` (Task 1).
- Produces:
  - Worker: mensagem `{ type: 'tile', L, x, y, token }` → `{ type: 'tile', L, x, y, pixels, token }` (pixels transferidos). O cache de chunks é recriado a cada mundo novo.
  - `WorldClient.tile(L, x, y): Promise<Uint8ClampedArray>`; `generate` rejeita os pedidos em voo (como hoje).
  - `class TileCache { constructor(fetch: (L,x,y) => Promise<Uint8ClampedArray>, max = 400, inFlight = 6); get(t): CanvasImageSource | null; request(ts: {L,x,y}[]): void; clear(): void; version: number }` — `request` pede os que faltam (até `inFlight` simultâneos, na ordem recebida, sem duplicar); ao chegar, converte em imagem (`ImageBitmap` ou canvas), soma 1 em `version`; LRU por acesso; `clear` descarta tudo e ignora respostas pendentes (geração).
  - `drawableFor(cache, t): { img, t } | null` — o próprio ladrilho se estiver no cache, senão sobe por `fallbackFor` até achar.

- [ ] **Step 1: Testes** (`tests/tilecache.test.ts`, com `fetch` falso controlado por promessas e um conversor de imagem injetável):
  - não pede duplicado; respeita `inFlight`; pede o resto quando um chega.
  - `version` sobe ao chegar; `get` devolve depois de chegar.
  - LRU: com `max = 3`, o menos usado sai.
  - `clear` durante voo: a resposta antiga não entra e `version` não sobe.
  - `drawableFor`: sem L0 mas com o L1 pai no cache → devolve o pai; sem nenhum → null.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar (conversão de pixels em imagem injetável para o teste rodar em node).
- [ ] **Step 4:** PASS; `npx tsc --noEmit` limpo. Aqui só se **acrescenta** `tile`; as mensagens `chunk/coarse/parchment` saem na Task 6, junto com o 3D que as usa.
- [ ] **Step 5:** Commit `feat: map tiles from the worker with an LRU cache`.

### Task 4: Contornos das províncias (puro)

**Files:**
- Create: `src/client/map/outlines.ts`
- Test: `tests/outlines.test.ts`

**Interfaces:**
- Produces:
  - `provinceRings(pm: ProvinceMap): number[][][]` — por província, lista de anéis fechados; cada anel é `[x0,y0,x1,y1,…]` em tiles nos cantos de célula (múltiplos de `CELL`), traçando a borda das células da província (buracos incluídos como anéis próprios; preencher com `evenodd`).
  - `borderSegments(pm: ProvinceMap): Float32Array` — segmentos `[x0,y0,x1,y1]` de fronteira entre duas províncias de terra diferentes, cada um uma vez só (costa não entra).
- [ ] **Step 1: Testes** (mundo 860):
  - todo anel fecha (último ponto = primeiro) e tem ≥ 4 vértices.
  - área: soma com sinal (shoelace, `evenodd`) dos anéis de cada província = `cells × CELL²` para 30 províncias.
  - fronteira única: nenhum segmento repetido (nem invertido) em `borderSegments`; todo segmento separa duas províncias ≥ 0 diferentes (amostrar o ponto médio deslocado meio tile para cada lado).
- [ ] **Step 2:** FAIL → **Step 3:** implementar (varredura das arestas de célula + encadeamento) → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: province outlines for the map`.

### Task 5: Marcadores e alvo sob o ponteiro

**Files:**
- Create: `src/client/map/markers.ts`, `src/client/map/pick.ts`
- Test: `tests/mappick.test.ts`

**Interfaces:**
- Consumes: `View`, `toScreen`, `toWorld` (Task 1); `GameState`, `ProvinceMap`.
- Produces:
  - `pick.ts`: `provinceAtTile(pm, x, y)` (vem de `view/borders.ts`); `REALM_COLORS = ['#a8342a']`, `NEUTRAL = '#7a7468'`;
    `pickAt(s, pm, v, sx, sy, mineOnly = true): { kind: 'troop'; id } | { kind: 'city' | 'fortress' | 'province'; province } | null` — prioridade tropa (retângulo 30×20 + 14 px de folga) > cidade (raio 14) > fortaleza (raio 15) > província sob o ponto; `mineOnly` limita tropas às do jogador.
    `troopsInRect(s, v, x0, y0, x1, y1): number[]` (tropas do jogador com o centro projetado dentro).
  - `markers.ts`: `drawMarkers(ctx, s, pm, v, opts: { selectedTroops: Set<number>; selectedProvince: number; pins: {x,y}[]; grid: MoveGrid | null })` — desenha, nesta ordem: rotas tracejadas das selecionadas, cidades (vila = cidade; nível = nível da vila; capital aro duplo), prédios (ícones a tinta só com `scale ≥ 1`; em obra tracejado), colonização (bandeirola + meses), fortalezas (pentágono + vivas), tropas (retângulo do dono, ✕ lanceiros, ponto arqueiros, barra cavaleiros, número embaixo; aro dourado se selecionada), batalhas (⚔ + barras de moral), selos das capitais sugeridas (`pins`). Pula o que está fora da tela.
  - `markersKey(s, v, opts): string` — muda só quando algo visível muda (posições arredondadas ao pixel de tela, soldados `ceil`, seleção, dono, prédios, colonizações, batalhas, fortalezas vivas, vista).
- [ ] **Step 1: Testes** (`tests/mappick.test.ts`, com o `makeTestWorld` de `tests/troopworld.ts` e uma vista escala 2):
  - tropa sobre a cidade → `troop`; clique na borda do retângulo da tropa (13 px do centro na horizontal) → `troop`.
  - cidade sem tropa → `city`; fortaleza → `fortress`; vazio dentro da província → `province`; fora do mundo → null.
  - `mineOnly`: tropa de fortaleza não é escolhida como `troop`.
  - `troopsInRect` pega só as do jogador dentro.
  - `markersKey`: igual com o estado parado; muda quando uma tropa anda ≥ 1 px de tela; não muda quando anda < 1 px; muda com a seleção.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: map markers and picking`.

### Task 6: Renderizador, troca do 3D e limpeza

**Files:**
- Create: `src/client/map/renderer.ts`
- Modify: `src/main.ts` (reescrita da parte de vista e entrada), `src/client/hud.ts`, `src/client/panel.ts` (só imports de `TROOP_ICON` se vierem do 3D), `index.html`, `package.json`, `scripts/perf.ts`
- Delete: `src/client/view/*`, `src/client/camera.ts`, `src/client/strategic.ts`, `src/client/parchment.ts`, `src/client/quality.ts`, `src/worldgen/coarse.ts` (se sem uso), testes `tests/{chunkmanager,flora,buildingsview,troopsview,quality,parchment,borders,coarse}.test.ts`; mensagens `chunk/coarse/parchment` do worker e do `WorldClient`.

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `class MapRenderer { constructor(canvas); setWorld(pm, cache) ; draw(s, view, opts, extraKey): boolean /* true se redesenhou */; paints: number }`
  - Camadas: ladrilhos (`drawableFor` por ladrilho visível, `cache.request` dos que faltam) → território (preencher anéis das províncias do jogador com a cor dele a 16%; selecionada com contorno dourado) → `borderSegments` tracejados `rgba(62,42,24,0.7)` com largura fixa em px → nomes (serifada itálica, tamanho ∝ √cells, só se ≥ 9 px) → `drawMarkers` → caixa de seleção.
  - Redesenha só se mudou `view | cache.version | markersKey | dono | extraKey`.
- `main.ts`: um `<canvas id="map">`; vista inicial no continente (escala mínima) com os selos; entrada conforme a spec (arrastar meio/direito; WASD/setas; roda com `zoomAt`; M alterna; clique esquerdo `pickAt`; caixa com `troopsInRect`; clique direito ≤ 5 px → `moveTroops`; Shift+1–9/1–9; Esc; `pointercancel` fecha a caixa); dica com `provinceAtTile`; `load` limpa o `TileCache`.
- `hud.ts`/`index.html`: sem seletor de qualidade nem triângulos (só FPS); estilo papel e tinta (fundo `#efe3c4`, tinta `#3e2a18`, borda `#6b5536`, serifada Georgia); ajuda sem Q/E.
- [ ] **Step 1:** Implementar o renderizador e a troca no `main.ts`; apagar os módulos e testes listados; tirar `three` e `@types/three`; ajustar `scripts/perf.ts` (sem coarse).
- [ ] **Step 2:** `npx tsc --noEmit` limpo; `npx vitest run` todo verde (simulação, geração e ritmo sem mudança); `npm run build` sem three no pacote (`grep -c three dist/assets/*.js` = 0 ocorrências de `THREE.`).
- [ ] **Step 3:** Navegador sem GPU (CDP com eventos reais), semente 860: tela inicial com selos; fundar capital; construir guarnição; recrutar; selecionar por clique e por caixa; Shift+1/Esc/1; clique direito manda; tropa chega a uma fortaleza e a conquista; zoom do continente até 3 px/tile e volta sem buraco; mapa parado 0 redesenhos em 2 s; tropa marchando redesenha; capturas em 3 zooms.
- [ ] **Step 4:** Commit `feat: cartographic map replaces the 3D view`.

### Task 7: Fechamento

- [ ] **Step 1:** Medir: tempo médio de ladrilho no worker (L0 frio e quente, L3), redesenhos parado/andando, tamanho do pacote antes/depois. Registrar no ledger.
- [ ] **Step 2:** `npx vitest run` e `npm run build` limpos; commit de ajustes `fix: …`.
