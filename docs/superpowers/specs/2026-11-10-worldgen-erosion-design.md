# Gerador de Mundo 0a — Erosão e correção de artefatos — Design

Data: 2026-11-10
Status: aprovado em conversa, aguardando revisão do spec escrito
Base: `docs/superpowers/specs/2026-11-09-world-generator-design.md` (v1, já na `main`)

## Contexto

O jogo mudou de rumo: agora é **estratégia territorial offline em tempo real** (províncias, economia
ouro/madeira/pedra, tropas, 4 reinos rivais com IA, partidas longas com salvar/carregar).
Multiplayer foi abandonado. Sem servidor, a geração pode gastar mais CPU no carregamento.

Roadmap: **0a (este)** → 0b renderização (LOD, sombras, água, atmosfera) → 1 províncias/economia →
2 tropas/combate → 3 IA → 4 partida completa.

### Objetivo do 0a
Relevo com aspecto natural (vales escavados, cristas recortadas) e água coerente com o terreno,
eliminando os artefatos conhecidos da v1:
1. rios retos longos em bacias planas;
2. paredes verticais nas margens de lagos;
3. água flutuando acima da margem;
4. rios estreitados em confluências.

### Critérios de sucesso
- Todos os testes da v1 continuam passando (ajustando apenas o que depende de `CELL`/`GLOBAL_SIZE`
  e o hash de referência, que muda intencionalmente).
- Os novos testes de qualidade (abaixo) passam.
- Geração global < 8 s num PC médio; chunk < 10 ms.

## Decisões

| Tema | Decisão |
|---|---|
| Erosão | Stream power implícita (Braun & Willett 2013) + erosão térmica, numa grade 1024×1024 |
| Escala | `GLOBAL_SIZE = 1024`, `CELL = 4` (antes 512 e 8). `WORLD_TILES` continua 4096 |
| Água local | Determinada pela altura do terreno vs. nível da água (não mais por célula com jitter) |
| Jitter | Mantido só para fronteiras de bioma |
| Determinismo | Mesmas regras da v1 (sem `Math.random/sin/cos/exp/pow/log`) |
| Renderização | Fora do escopo (fica no 0b) |

## Pipeline global (nova)

1. **Forma** — como na v1, em 1024.
2. **Placas** — como na v1; passa a devolver também `uplift: Float32Array` (soerguimento por
   célula, ∈ [0,1]): alto onde há colisão de placas (o termo de montanha), baixo nas planícies.
3. **Umidade** — como na v1, sobre o relevo pré-erosão.
4. **Erosão** (estágio novo `'erosão'`) — `N_ITER` iterações (40–60):
   - priority-flood → receptor D8 de cada célula de terra;
   - acúmulo de fluxo `A` ponderado pela umidade (chuva);
   - **stream power implícita** com `m = 0.5`, `n = 1`: processando células da foz para montante,
     `h_i ← (h_i + F·h_r) / (1 + F)` com `F = K · dt · sqrt(A_i) / dist(i, r)` (`r` = receptor);
   - soerguimento: `h_i += U · uplift_i · dt` (terra apenas; oceano inalterado);
   - a cada `THERMAL_EVERY` iterações, **erosão térmica**: onde a diferença para um vizinho excede
     `TALUS`, transfere metade do excesso para o vizinho mais baixo;
   - terra permanece ≥ `SEA_LEVEL + 0.001`; máscara terra/oceano preservada.
   Constantes (`K`, `dt`, `U`, `N_ITER`, `TALUS`, `THERMAL_EVERY`) calibradas por testes e
   inspeção visual; ficam em `constants.ts`.
5. **Hidrologia** — como na v1, sobre o relevo erodido. Antes do priority-flood, perturbação
   mínima por ruído (amplitude ≤ 1e-4) em células planas para quebrar caminhos retos.
6. **Temperatura e biomas** — como na v1.

Estágios de progresso: `'forma'`, `'placas'`, `'umidade'`, `'erosão'`, `'rios'`, `'biomas'`.

## Fase local (chunk)

Tudo continua função das coordenadas globais de tile (costuras idênticas). Padding mantido.

- **Oceano**: tile com altura de terreno < 0 e alguma célula de oceano num raio de 2 células.
- **Lago**: nível `L` = maior `lakeSurface` (convertida para altura) entre as células de lago num
  raio de 1 célula; tile é lago se a altura do terreno < `L`.
- **Rio**: tile a menos de `largura/2` de algum segmento; largura = **máxima** entre os segmentos
  que cobrem o tile; nível = `min(superfície interpolada, altura do terreno no centro do tile − 0.3)`.
- Vértices rebaixados para `min` sobre os tiles d'água vizinhos de `(nível − profundidade)`, como na v1.
- As regras de remendo da v1 (tile com 4 cantos tocando oceano vira oceano; bioma Oceano em tile seco
  vira Praia) podem ser removidas se os testes correspondentes continuarem passando; senão ficam.
- Andabilidade e recursos inalterados.

## Testes

Mantidos (com ajuste de constantes): todos os da v1.

Novos:
- **Rios sem retas longas**: em toda polilinha de rio global, a maior sequência de passos D8 na
  mesma direção tem < 12 células (sementes 860, 1, 2).
- **Relevo recortado**: média de `|Δelevação|` entre vizinhos em células de montanha é maior depois
  da erosão do que antes (mesma semente).
- **Erosão preserva a máscara** e mantém montanhas: fração de terra ≥ `MOUNTAIN_LEVEL` > 2%.
- **Água não flutua**: superfície de nenhum tile d'água excede em mais de 0.05 o maior canto dos tiles
  secos 4-vizinhos.
- **Sem paredes de lago**: em tiles secos vizinhos a lago, (canto mais alto − canto mais baixo) < 4.
- **Confluência**: para cada ponto de rio (suavizado), tiles a menos de `(largura/2 − 1)` dele são água.
- **Desempenho** (script `npm run perf`): global < 8000 ms, chunk < 10 ms.

## Fora do escopo
LOD, sombras, água animada, névoa, vegetação extra (0b); províncias e tudo de jogo (1+).
