# 0b — Renderização: LOD, mapa estratégico e visual — Design

Data: 2026-11-10
Status: aprovado em conversa
Base: gerador v1 + 0a (na `main`). Jogo: estratégia territorial offline.

## Objetivo
Câmera de estratégia: afastar até ~600 tiles de largura em 3D com LOD, e acima disso um mapa
estratégico em pergaminho. Visual mais rico: sombras, água animada com espuma, névoa, vegetação
decorativa. Alvo: 60 fps no Alto numa RTX 3060 (máquina do autor), com seletor de qualidade.

## Decisões
| Tema | Decisão |
|---|---|
| Zoom 3D | Largura da vista de 20 a 600 tiles |
| Mapa estratégico | Pergaminho (estilo "A" escolhido no mockup), fade entre 500 e 600 tiles, tela cheia acima |
| LOD | 3 níveis por distância (em chunks) da câmera; saias nas bordas |
| Qualidade | Baixo / Médio / Alto (padrão Alto), salvo em `localStorage` |
| Hardware alvo | RTX 3060, 16 threads; Baixo para máquinas fracas |

## LOD
| Nível | Raio padrão (Alto) | Passo da malha | Água | Decoração |
|---|---|---|---|---|
| L0 | ≤ 3 chunks | 1 tile (chunk completo) | completa, animada | árvores, rochas, vegetação extra |
| L1 | ≤ 7 chunks | 2 tiles | quads simplificados | — |
| L2 | resto da vista | 4 tiles | plano de mar/lagos | — |

- `generateCoarseChunk(map, cx, cy, step): CoarseChunk` em `src/worldgen/coarse.ts`: alturas
  `(CHUNK/step+1)²` com a mesma fórmula de terreno do chunk completo (sem rebaixamento por água),
  bioma por bloco, água parada por bloco (mesmas regras de oceano/lago do chunk), nível da água.
  Sem rios, recursos ou andabilidade. Meta < 1 ms.
- `lodFor(distChunks: number, quality: Quality): 0 | 1 | 2` — raios por qualidade:
  Alto (3, 7), Médio (2, 6), Baixo (1, 5).
- Saias: em toda malha (L0/L1/L2), uma faixa vertical de 3 unidades descendo das bordas.
- `ChunkManager` passa a gerenciar nível por chunk, trocando a malha quando o nível muda
  (com histerese de 1 chunk), e carrega a área visível inteira da câmera.
- Lógica de jogo (andabilidade, altura do personagem) continua só no L0.

## Mapa estratégico (pergaminho)
- `renderParchment(map: WorldMap, size: number): Uint8ClampedArray` (RGBA) em
  `src/client/parchment.ts`, função pura: papel com grão, relevo em sépia por sombreamento,
  litoral contornado em marrom, mar verde-acinzentado com linhas de onda, lagos/rios azul-escuros,
  florestas pontilhadas em verde, deserto pontilhado em ocre. Tamanho 2048.
- Exibido num `<canvas>` em tela cheia sobre o 3D. Opacidade = 0 abaixo de 500 tiles de largura,
  1 acima de 600, linear entre os dois. Acima de 600 a roda/arrastar controla o pan/zoom do pergaminho.
- Clique no pergaminho centraliza a câmera 3D naquele ponto; aproximar com a roda volta ao 3D.
- Tecla **M** alterna 3D ↔ pergaminho. O minimapa antigo (`map2d.ts` overlay) é substituído;
  o marcador do jogador aparece no pergaminho.

## Visual
- **Sombras**: `DirectionalLight.castShadow`, câmera de sombra seguindo o alvo e cobrindo o L0;
  mapa 2048 (Alto), 1024 (Médio), desligado (Baixo). Terreno L0, árvores, rochas e personagem
  projetam e recebem.
- **Água** (shader próprio, `onBeforeCompile` sobre Lambert ou `ShaderMaterial`): ondulação de
  vértices por seno(tempo, posição) com facetas chapadas; espuma em quads vizinhos de terra
  (atributo por vértice) pulsando; rios com deslocamento do padrão na direção da correnteza
  (atributo de direção por tile vindo da polilinha). L1/L2: plano sem animação.
- **Atmosfera**: `scene.fog` na cor do céu, por profundidade; céu em gradiente.
- **Vegetação extra**: capim, arbustos, flores, juncos (beira d'água), cactos pequenos;
  `InstancedMesh` só no L0; posição por hash do tile; não bloqueia, sem ID, não é recurso;
  densidade 100% / 50% / 0% por qualidade; nada em água nem em tile com árvore/rocha.
- **HUD**: seletor de qualidade, FPS e contagem de triângulos (`renderer.info`).

## Testes
Automáticos:
- Chunk grosso = chunk completo nas alturas de vértices amostrados em tiles secos.
- Costuras entre chunks grossos vizinhos idênticas; `npm run perf` mede o grosso (< 1 ms).
- `lodFor` nos limites de cada qualidade.
- `renderParchment` determinístico; oceano/terra com as cores esperadas; litoral escuro.
- Vegetação extra determinística, fora da água e de tiles com recurso.

Manuais (headless + PC do autor): transição de níveis sem frestas, fade do pergaminho, clique e M,
sombras, água/espuma/correnteza; **60 fps no Alto com zoom máximo verificado pelo autor no seu PC**.

## Fora do escopo
Ciclo dia/noite, clima, sons, elementos de jogo no pergaminho (fronteiras, exércitos — subprojetos 1+).
