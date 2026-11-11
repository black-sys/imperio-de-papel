# Ciclo 2 — Rotas e Suprimento — Design

Data: 2026-11-11
Status: aprovado em conversa
Base: `main` com o mapa cartográfico (1a) e a economia industrial (1b). Direção: documento "Projeto Império de Papel".
Ordem: 1a ✓ → 1b ✓ → **2 rotas e suprimento** (este) → 3 exército como peça única → 4 rivais → 5 diplomacia →
6 estabilidade → 7 refino visual.

## Objetivo
A produção só chega ao estoque nacional por rotas: veios se ligam à sua cidade e o jogador traça rotas entre cidades
até a capital. Tropas inimigas em cima de uma rota cortam o fluxo. As mesmas rotas abastecem os exércitos; fora do
alcance eles se desgastam, e uma linha de suprimento estendida até uma tropa a abastece e fortalece na batalha.

## Decisões
| Tema | Decisão |
|---|---|
| Criação | Veio liga sozinho à cidade; jogador traça rotas entre cidades (caminho pelo terreno, custo por comprimento) |
| Corte | Tropa hostil a ≤ 6 tiles da rota, ou província inimiga no caminho |
| Desligada | Depósito local (teto 6 meses), fábricas param, impostos continuam; entrega ao religar |
| Exército | Alcance de 30 tiles de rota/cidade ligada; fora, desgaste; linha de suprimento até a tropa dá +25% |
| Arquitetura | Rotas como caminhos de células na simulação, índice célula→rotas derivado |

## Regras (calibração inicial, `balance.ts`)
### Ligações automáticas
Cada veio construído se liga à cidade da própria província, sem custo. A capital é sempre ligada.

### Rotas entre cidades
- Traçar: "Traçar rota" no painel da cidade (ou tecla R com ela selecionada) → clicar noutra cidade sua; prévia do
  caminho e do custo antes de confirmar.
- Custo: 0,4 dinheiro e 0,2 madeira por tile (calibrado: a 1 e 0,5 as rotas disputavam o dinheiro da colonização e as
  20 províncias passavam de 4 h); trecho de rio ou montanha 3×. Obra: 1 mês a cada 100 tiles (em obra,
  aparece mas não liga).
- Só entre duas cidades suas; pode passar por terra neutra, nunca por território de outro reino nem pela água; no
  máximo uma rota por par de cidades. Remover: sem reembolso.

### Ligação com a capital
- Ligada = há caminho de rotas prontas e não cortadas até a capital.
- Ligada: entrega tudo ao estoque nacional; fábricas usam o estoque nacional.
- Desligada: veios guardam a produção no depósito da cidade (teto 6 meses do que ela produz); fábricas param (motivo
  "sem rota"); impostos continuam; ao religar, o depósito vai inteiro ao estoque.
- Colônias e conquistas nascem desligadas.

### Cortes
Rota cortada enquanto houver tropa hostil (inclusive fortaleza) a ≤ 6 tiles de qualquer ponto dela, ou se passar por
província de reino inimigo. Trecho em vermelho com ✕; aviso; religa sozinha quando o corte some.

### Suprimento das tropas
- Abastecida: dentro de província sua ligada à capital, ou a ≤ 30 tiles de rota pronta e ligada ou de cidade ligada;
  funciona como hoje (repõe no seu território). Outros reinos contam como abastecidos até terem rede (ciclo 4).
- Inimigo a ≤ 20 tiles da tropa (lutando com ela) não corta a linha dela; só um corte no resto do caminho.
- Sem suprimento: −1 homem/mês, moral inicial 80% na batalha, sem reposição.
- Linha de suprimento: "Abastecer" no painel da tropa traça da cidade ligada mais próxima; abastece em qualquer lugar
  e dá +25% de ataque e defesa; custa 2 dinheiro/mês + 0,02 por tile; segue a tropa; cortável como rota; 1 por tropa.

### Ritmo
Alvos atuais mantidos (colonização, aço, fortaleza, 20 províncias); jogador automático traça rotas.

## Arquitetura
### Estado (`GameState`, serializável)
```ts
routes: { id; a; b /* províncias */; path: number[] /* células */; remaining: number; cut: boolean }[]
nextRouteId: number
depot: Res[]          // por província
connected: boolean[]  // por província (recalculado quando rotas/cortes/donos mudam)
Troop.supply: { path: number[]; from: number } | null
Troop.supplied: boolean
```

### `src/sim/routes.ts`
- `planRoute(s, pm, grid, a, b)` → caminho, custo, meses ou motivo. A* das tropas numa grade que bloqueia território de
  outro reino e encarece células a ≤ 6 tiles de fortalezas.
- `checkRoute` / `buildRoute` / `removeRoute` (comandos com `Result`).
- `routeIndex(s)`: célula → rotas; derivado, fora do save.
- `updateRoutes(s, pm, grid)` a cada passo das tropas: cortes → `connected` (passeio a partir da capital) → entrega do
  depósito de quem religou (aviso "Carga de X chegou ao estoque").
- `supplyTroop` / `dropSupply`: linha da cidade ligada mais próxima, refeita quando a tropa se afasta > 20 tiles da
  ponta (no máximo uma vez por mês de jogo).
- `troopSupplied(s, t)`: linha não cortada, ou a ≤ 30 tiles de rota ligada ou cidade ligada.

### Mudanças
- `runMonth`: veios de desligadas → depósito (teto); fábricas de desligadas não produzem (`stalled` "sem rota"); linha
  "Linhas de suprimento".
- `tick`: obra das rotas. `troops`: desgaste e `supplied`. `battle`: moral 80% sem suprimento; +25% com linha.
- `found`: nasce desligada, depósito vazio. Cidade perdida para outro reino derruba suas rotas (pronto para o ciclo 4).

### Desempenho
Cortes ~25 células por tropa hostil (~5 mil acessos/passo com ~200 tropas de fortaleza); suprimento só para tropas do
jogador (~300 células); `connected` só quando algo muda.

## Interface
- **Mapa:** rota pronta tracejada na cor do reino (mais fina no continente); em obra mais clara e pontilhada; trecho
  cortado vermelho com ✕; ligação veio→cidade como fio fino (≥ 1 px/tile); linha de suprimento pontilhada dourada;
  cidade desligada com contorno tracejado vermelho e corrente partida; tropa sem suprimento com barrinha vermelha;
  com linha, ⛽ dourado.
- **Traçar:** "Traçar rota" / R → modo de traçar ("Clique noutra cidade sua · Esc cancela"); passar sobre outra cidade
  mostra prévia e custo ("Rota até Valtathor: 🪙142 🪵71 · 2 meses") ou o motivo; clique confirma; Esc/direito cancela.
- **Painel da cidade:** "Ligada à capital" ou "Desligada da capital: depósito …"; seção Rotas com estado e "Remover";
  botão "Traçar rota".
- **Painel de tropas:** "Abastecida" / "Sem suprimento (perde 1 homem/mês)" / "Linha de suprimento de X"; "Abastecer"
  (custo/mês) e "Cortar linha".
- **Avisos:** rota cortada/religada; cidade desligada; carga entregue; tropa sem suprimento (no máximo 1 a cada 6 meses
  por tropa).
- **Barra superior:** dica com "guardado em cidades desligadas: X".

## Testes
Rotas: planejar (contorna água; recusas com motivo; desvia de fortaleza; custo por comprimento e 3× em rio/montanha);
construir (custo, obra, só liga ao terminar; remover sem reembolso); ligação (direta, por outra cidade, isolada;
colônia e conquista desligadas); cortes (6 tiles corta, 7 não; fortaleza corta; expulsar religa; corte no meio desliga
as de depois); depósito (guarda com teto, fábricas param, impostos continuam, entrega ao religar).

Suprimento: alcance 30 tiles; sem suprimento −1/mês, sem reposição, moral 80%; linha abastece, +25%, custa, refeita
ao afastar, cortada volta ao desgaste; determinismo 1× e 8×.

Estado: ida e volta pelo JSON. Ritmo: alvos atuais nas 4 sementes com o jogador automático traçando rotas.
Desempenho: passo das tropas < 1 ms com ~200 tropas de fortaleza e 30 rotas; `planRoute` atravessando o continente
< 100 ms. Mapa: chave de redesenho muda com rota construída, pronta ou cortada.

Navegador sem GPU (semente 860): traçar rota pelo painel com prévia; cidade desligada e depósito; carga chegando;
corte por tropa inimiga; linha de suprimento dourada.

## Fora do escopo
Rotas por mar, manutenção/desgaste de rotas, ferrovias e eras seguintes, sabotagem por diplomacia (ciclo 5).
