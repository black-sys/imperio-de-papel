# Gerador de Mundo v1 — Design

Data: 2026-11-09
Status: aprovado em conversa, aguardando revisão do spec escrito

## Contexto e objetivo

Jogo isométrico co-op inspirado em Guild Wars, com **mundo procedural como mecânica central**.
Referência analisada: Palisade Demo — mecânicas interessantes, mas o mundo é repetitivo porque
os mapas são polígonos desenhados à mão, a semente do relevo é fixa e só existem 3 tipos de
terreno. Este projeto resolve isso com um gerador de continente coerente por semente.

Este spec cobre **só o primeiro subprojeto: o gerador de mundo + visualizador jogável no
navegador**. Combate, cidades, rede/servidor (Raspberry Pi 5) e territórios vêm em ciclos
seguintes, cada um com seu spec.

### Critérios de sucesso
- Uma semente gera um continente com relevo, rios, lagos e biomas que fazem sentido geográfico.
- A mesma semente gera o mesmo mundo em qualquer navegador/máquina.
- Amigos abrem um link (`?seed=N`) servido pelo PC do autor e andam pelo mesmo mundo.
- Sementes diferentes geram mundos visivelmente diferentes (combate a repetitividade).

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Stack | Vite + TypeScript + Three.js, testes com Vitest |
| Visão | Isométrica, câmera ortográfica, estilo **low-poly facetado** |
| Estrutura do mundo | **Continente finito** definido por semente; uma semente nova = "temporada" nova |
| Modificação | **Estático na v1**; terreno e futuras alterações em camadas separadas |
| Tamanho | **4096×4096 tiles** (1 tile = 1 m, ~14 min para atravessar a 5 tiles/s) |
| Camadas v1 | Relevo + água, rios + biomas. Regiões, cidades, estradas e pontos de interesse ficam para depois |
| Escopo jogável | Visualizador + personagem andando, **sem rede** |
| Abordagem | **Duas escalas**: simulação global grossa + detalhe local por chunk |
| Hospedagem v1 | Site estático no PC do autor (`vite build` + `vite preview --host`), acesso via Tailscale ou Cloudflare Tunnel |

## Arquitetura

```
src/
  worldgen/        TypeScript puro, sem DOM nem Three.js
    rng.ts         PRNG com semente + derivação de subsementes
    noise.ts       ruído com semente (value/simplex, fbm, ridged, domain warp)
    global/        fase global 512×512
    chunk.ts       fase local: chunk 64×64
    types.ts       WorldMap, ChunkData, Resource
  client/
    worker.ts      executa o worldgen fora da thread principal
    map2d.ts       mapa-múndi 2D em canvas
    view/          cena Three.js: câmera, malhas, água, decoração, gerenciador de chunks
    player.ts      personagem, movimento, pathfinding
  main.ts
tests/             testes do worldgen
```

**Regra:** `src/worldgen/` não importa nada de navegador. Quando o servidor chegar, essa pasta
vira pacote compartilhado sem reescrita. Sem monorepo na v1.

### Fluxo de dados
1. `main.ts` lê a semente (`?seed=` ou aleatória) e envia ao worker.
2. O worker gera o `WorldMap` e o transfere (Transferable, sem cópia) para a thread principal,
   reportando progresso por etapa.
3. `map2d.ts` desenha o mapa a partir do `WorldMap`.
4. O gerenciador de chunks pede ao worker os chunks ao redor da câmera; o worker devolve
   `ChunkData`; a thread principal constrói as malhas.

### Tipos principais
- `WorldMap` (512×512, arrays tipados): `elevation: Float32Array`, `water: Uint8Array`
  (0 terra, 1 oceano, 2 lago), `flow: Float32Array` (fluxo acumulado), `river: Uint8Array`,
  `temperature: Float32Array`, `moisture: Float32Array`, `biome: Uint8Array`, `seed`,
  `spawn: {x, y}` (em tiles), e a rede de rios como polilinhas para a fase local.
- `ChunkData` (chunk `cx, cy`): `heights: Float32Array` (65×65 vértices),
  `biome: Uint8Array` (64×64), `water: Uint8Array` (64×64: 0 seco, 1 oceano, 2 lago, 3 rio),
  `waterLevel: Float32Array` (64×64, altura da superfície da água),
  `riverWidth: Float32Array` (64×64, 0 fora de rio; decide vau vs. bloqueio), `walk: Uint8Array` (64×64: 0 bloqueado, 1 normal,
  2 lento/vau), `resources: Resource[]`.
- `Resource`: `{ id: string, kind: 'pine' | 'tree' | 'cactus' | 'rock', x, y }`.
  `id = "c{cx}_{cy}#{i}"` — estável e determinístico, base para a futura camada de
  alterações (corte, coleta, territórios).

## Pipeline do gerador

### Determinismo
- PRNG próprio com semente (ex.: sfc32/mulberry32). Nunca `Math.random`.
- Cada etapa usa subsemente `hash(seed, "<etapa>")`, para mudar uma etapa sem embaralhar as outras.
- Nas decisões do worldgen usar só `+ - * /` e `Math.sqrt` (exatos em IEEE-754); evitar
  `Math.sin/cos/exp/pow/log` cujo resultado pode variar entre motores JS.

### Fase global (512×512, 1 célula = 8×8 tiles)
1. **Forma**: fbm com domain warp + queda radial nas bordas → máscara de terra. Ajuste do limiar
   para ~45% de terra; manter a maior massa e ilhas pequenas.
2. **Relevo por placas**: 8–12 sementes Voronoi com vetor de deriva. Fronteiras convergentes →
   cordilheiras (ruído ridged ao longo da fronteira); divergentes → vales/fendas. Mais fbm para colinas.
3. **Umidade**: varredura do vento de oeste para leste, carregando umidade do oceano; chuva
   proporcional à subida do relevo (orográfica) → sombra de chuva atrás das cordilheiras.
4. **Hidrologia**: priority-flood para preencher depressões; depressões acima de área/profundidade
   mínimas viram lagos. Direção de escoamento D8, acúmulo de fluxo ponderado pela chuva.
   Fluxo acima do limite → rio. Uma passada de erosão leve cava vales ao longo dos rios.
   Rios extraídos como polilinhas até o mar ou um lago.
5. **Temperatura**: latitude (norte frio, sul quente) − gradiente por altitude + ruído leve.
6. **Biomas** (Whittaker, temperatura × umidade): oceano, praia, neve/tundra, taiga, floresta
   temperada, campo, pântano (úmido e plano), savana, deserto, selva, rocha de montanha.
7. **Spawn**: tile andável de campo/floresta mais próximo do centro do continente.

### Fase local (chunk 64×64 tiles)
- Altura: interpolação suave (bicúbica) do relevo global + ruído fino com amplitude por bioma.
  Calculada em coordenadas globais de tile, para que vértices de borda coincidam entre chunks.
- Rios: polilinhas suavizadas (Chaikin), largura proporcional ao fluxo; tiles dentro da
  largura são rebaixados abaixo do nível da água.
- Bioma por tile: amostra global com jitter por ruído, para esconder a grade 8×8.
- Andabilidade: oceano, lago e rio largo → bloqueado; rio raso → vau (lento); inclinação acima
  do limite → bloqueado; tile com árvore/rocha → bloqueado.
- Recursos: posições por amostragem determinística (semente do chunk), densidade por bioma.

### Metas de desempenho
- Fase global < 3 s num PC médio.
- Chunk < 10 ms.

## Renderização

- **Câmera**: ortográfica, isométrica (45° yaw, ~35,26° pitch), segue o personagem com suavização.
  Zoom pela roda com limite (até ~80×80 tiles visíveis). **Q/E** giram 90°.
- **Terreno**: geometria não indexada (2 triângulos por tile) → cor chapada por triângulo;
  cor do bioma + variação por hash. `MeshLambertMaterial` com `flatShading` e `vertexColors`.
  Luz direcional + hemisférica. Sem sombras na v1.
- **Água**: superfície plana, semitransparente e facetada no nível do mar, de cada lago e ao
  longo dos rios. Estática.
- **Decoração**: 3–4 modelos low-poly gerados em código (pinheiro, árvore, cacto, rocha) via
  `InstancedMesh`, a partir de `ChunkData.resources`.
- **Chunks**: raio de ~5×5 chunks ao redor da câmera; pedidos por proximidade com limite de
  concorrência; `dispose` ao passar de raio + 1 (histerese).
- **Mapa 2D** (tecla M): canvas 512×512 por bioma, com rios e marcador do jogador; clique teleporta.
- **Meta**: 60 fps num PC médio.

## Personagem e interface

- Boneco low-poly com primitivas. WASD relativo à rotação da câmera; clique para andar com A*
  nos tiles andáveis dos chunks carregados (limite ~64 tiles de busca).
- 5 tiles/s; vau = metade. Altura acompanha o terreno.
- HTML sobre o canvas: campo de semente + "Gerar", botão "copiar link" (`?seed=N`), barra de
  progresso da fase global, painel com coordenada, bioma e FPS.

## Erros e casos de borda
- `?seed=` inválido → semente aleatória e URL atualizada.
- Falha no worker → mensagem na tela com a semente, para reproduzir o erro.
- Clique em tile inalcançável ou fora dos chunks carregados → sem movimento, sem travar.
- Teleporte pelo mapa 2D para água → tile andável mais próximo.

## Testes

Vitest, só em `src/worldgen/`:
- **Determinismo**: mesma semente → mesmo hash de `WorldMap` e de chunks de amostra; hash de
  referência fixo para a semente 860.
- **Regras do mundo** (várias sementes):
  - terra entre 35% e 55%;
  - todo rio desce monotonicamente e termina no mar ou num lago;
  - ≥ 8 dos 11 biomas presentes;
  - umidade média a leste das cordilheiras menor que a oeste;
  - spawn andável;
  - vértices de borda de chunks vizinhos idênticos;
  - IDs de recursos idênticos entre gerações.
- **Desempenho** (script separado, rodado localmente): global < 3 s, chunk < 10 ms.
- **Cliente**: checklist manual no navegador (andar, girar, zoom, M, trocar semente, abrir link).

## Fora do escopo (próximos ciclos)
Rede/servidor no Pi 5 e jogadores se vendo, combate e skills, cidades, regiões, estradas,
pontos de interesse, territórios e coleta (a camada de alterações), sombras, animação de água,
sons.
