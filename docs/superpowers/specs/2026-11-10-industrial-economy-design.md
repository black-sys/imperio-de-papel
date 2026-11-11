# Ciclo 1b — Economia Industrial e Exército de 1760 — Design

Data: 2026-11-10
Status: aprovado em conversa
Base: `main` com o mapa cartográfico (ciclo 1a). Direção: documento "Projeto Império de Papel".
Ordem: 1a mapa ✓ → **1b economia e exército** (este) → 2 rotas → 3 exército como peça única → 4 rivais → 5 diplomacia →
6 estabilidade → 7 refino visual.

## Objetivo
Trocar a economia medieval (ouro, madeira, pedra; vagas genéricas) pela industrial do documento: recursos básicos,
avançados e dinheiro; minas e campos sobre veios longe da cidade; fábricas em lotes junto da cidade; cidades em níveis
que consomem grãos; cotas de nível para todos os prédios. Trocar lanceiros, arqueiros e cavaleiros por infantaria de
linha, artilharia e cavalaria de 1760, mantendo o combate e o comando atuais.

## Decisões
| Tema | Decisão |
|---|---|
| Território | Províncias mantidas, cada uma com a sua cidade |
| Recursos | Dinheiro; básicos grãos, madeira, carvão, ferro; avançados aço e armas |
| Lugares | Gerados: cidade, até 4 lotes junto dela, 0–4 veios longe dela |
| Estoque | Nacional único; as rotas (ciclo 2) passam a condicionar a entrega |
| Cidade | Níveis 1–3; consome grãos; libera lotes |
| Exército | Infantaria de linha (N1), artilharia (N2), cavalaria (N3); combate atual |

## Regras (calibração inicial, `balance.ts`)
### Recursos e início
`res`: dinheiro, grãos, madeira, carvão, ferro, aço, armas. Capital com cidade nível 2 e estoque inicial de dinheiro,
grãos, madeira, ferro e algumas armas (o bastante para a primeira infantaria); valores calibrados pelo teste de ritmo.

### Cidade (uma por província)
| Nível | Impostos/mês | Grãos/mês | Lotes liberados | Subir custa | Cota |
|---|---|---|---|---|---|
| 1 Vila | 4 × fertilidade | 1 | 1 | ao colonizar | — |
| 2 Cidade | 8 × fertilidade | 2 | 2 | dinheiro, madeira, ferro | — |
| 3 Metrópole | 14 × fertilidade | 4 | 4 | dinheiro, ferro, aço | 3 cidades nível 2+ |
Bônus fixo de impostos na capital. Sem grãos no estoque na virada do mês: impostos pela metade no mês seguinte, com aviso.

### Veios (0–4 por província, ≥ 20 tiles da cidade, riqueza 0,5–1,5)
| Prédio | Veio | Produz/mês N1/N2/N3 (× riqueza) |
|---|---|---|
| Fazenda | grãos (terra fértil, perto de rio) | 4 / 7 / 10 |
| Serraria | madeira (floresta) | 3 / 5 / 8 |
| Mina de carvão | carvão (colina, montanha) | 2 / 4 / 6 |
| Mina de ferro | ferro (colina, montanha) | 2 / 4 / 6 |
Um veio só aceita o prédio do seu recurso.

### Lotes (até 4, ≤ 10 tiles da cidade)
| Prédio | Consome por unidade | Produz/mês N1/N2/N3 |
|---|---|---|
| Siderúrgica | 2 ferro + 2 carvão | 2 / 4 / 6 aço |
| Fábrica de armas | 1 aço + 1 madeira | 2 / 4 / 6 armas |
| Mercado | — | +25 / 40 / 60% dos impostos da cidade |
| Guarnição | manutenção em dinheiro | treina tropas; sustenta 2 / 3 / 4 |
Lote só aceita prédio de fábrica. Fábrica sem insumo suficiente produz o que der.

### Melhorias e cotas
N2 custa 1,8× e N3 3× (N3 sempre com aço); tempo ×1,5 por nível. Cota para todos os prédios: N2 exige 3 do mesmo
tipo no reino (contando ele); N3 exige 3 do mesmo tipo no N2+. A Guarnição já segue essa regra.

### Exército de 1760
| Tipo | Guarnição | Homens | Papel | Custo | Manutenção/mês |
|---|---|---|---|---|---|
| Infantaria de linha | N1 | 20 | resistente; vence cavalaria | dinheiro, grãos, armas | dinheiro e grãos |
| Artilharia | N2 | 12 | atira antes do contato, mais forte que o arqueiro; castiga infantaria; frágil e lenta | dinheiro, armas, aço | dinheiro |
| Cavalaria | N3 | 12 | rápida; vence artilharia | dinheiro, grãos, armas, ferro | dinheiro e grãos |
Custo crescente por tamanho do exército mantido (× 1,6 por tropa). Fortalezas neutras viram fortes com infantaria;
os distantes, com artilharia.

### Colonização
Dinheiro e madeira com o crescimento exponencial atual; a província nasce com cidade nível 1.

### Ordem da virada do mês
Impostos (mercado, capital, penalidade de grãos do mês anterior) → produção dos veios → siderúrgicas → fábricas de
armas → consumo de grãos das cidades → manutenção de guarnições e tropas → dispersão por falta de dinheiro.

## Arquitetura
### Geração (`src/worldgen/provinces.ts`)
`Province` troca `slots`/`sites` por:
```ts
city: { x: number; y: number }
lots: { x: number; y: number }[]                     // até 4
veins: { kind: 'grain' | 'wood' | 'coal' | 'iron'; richness: number; x: number; y: number }[]  // 0–4
```
Mesmas regras de chão seco das vagas atuais (`dryAround`). Quantidade de veios por tipo a partir de floresta, rocha e
fertilidade; carvão/ferro por sorteio da semente; riqueza = fator local + ruído. `fertility` continua (impostos).
Capitais sugeridas: além dos critérios atuais, província + vizinhas somam ao menos um veio de cada tipo.

### Simulação (`src/sim`)
- `Res` com os sete recursos. Por província: `city: { level, remaining } | null`, `lots: (Building | null)[]`,
  `veins: (Building | null)[]`. Tipos de prédio: `farm, sawmill, coal_mine, iron_mine, steelworks, arms_factory,
  market, garrison`. Tipos de tropa: `line, artillery, cavalry`.
- Comandos (`{ ok } | { ok: false, reason }` e `checkX`): `build(s, pm, id, place, type)` com `place = { lot: i } |
  { vein: i }`; `upgrade(s, pm, id, place)` com cotas; `upgradeCity(s, pm, id)`; `recruit(s, pm, id, lot, type)`;
  `colonize`.
- Batalhas, fortalezas e custo crescente com os nomes novos; artilharia mais lenta e com abertura mais forte.

### Cliente
Marcadores de veio, lote e fábrica; seções Cidade, Lotes e Veios no painel; barra superior com sete recursos; avisos;
dica da tela inicial com os veios próximos. A escolha sob o ponteiro inclui lote e veio.

## Interface
- **Mapa:** veios como ícone a tinta (trigo, árvore, picaretas) com riqueza em romanos pequenos; vazio com círculo
  tracejado, construído com círculo na cor do dono; visíveis a partir do zoom regional e na tela inicial. Cidade com um
  ponto por nível (capital com aro duplo). De perto, lotes como quadrados tracejados em volta da cidade; ocupado vira o
  ícone da fábrica (chaminé, mosquete, toldo, torre); bloqueado aparece apagado com cadeado. Em obra, tracejado. Tropas:
  ✕ infantaria, ponto artilharia, barra cavalaria.
- **Clique em veio ou lote:** abre o painel da província rolado até ele.
- **Painel (sua):** Cidade (nível, impostos e grãos/mês, "Melhorar cidade" com custo e motivo); Lotes (prédio ou "Lote
  livre", botões de fábrica, recrutar na guarnição, "Libera com a cidade nível N"); Veios (tipo, riqueza, produção, um
  botão do prédio do recurso; construído mostra produção e melhoria com a cota); fábrica sem insumo mostra "Parada:
  falta carvão" ou "Produzindo 1 de 2".
- **Painel (neutra ou fortaleza):** mostra os veios.
- **Barra superior:** 🪙 dinheiro, 🌾 grãos, 🪵 madeira, ⚫ carvão, ⛓ ferro, 🔩 aço, 🔫 armas, com variação/mês (negativa
  em vermelho); tropas e data; dica por recurso com origem e destino ("Grãos: +12 fazendas, −9 cidades, −2 tropas").
- **Avisos:** sem grãos; fábrica parada por falta de insumo (no máximo um por fábrica a cada 6 meses); cidade subiu de nível.
- **Tela inicial:** dica de cada selo com os veios próximos ("Grãos ⅱ, madeira ⅲ, carvão ⅰ, ferro ⅱ").

## Testes
Geração: cidade em chão seco; lotes ≤ 10 tiles e secos; veios ≥ 20 tiles, secos e no terreno certo; riqueza 0,5–1,5;
0–4 veios; capitais sugeridas com os quatro tipos na província + vizinhas; determinismo; testes atuais ajustados.

Economia: impostos por nível (fertilidade, mercado, capital); sem grãos → impostos pela metade até voltar; veios por
riqueza; siderúrgica 2+2 → 1, parcial quando falta; fábrica de armas usa o aço do mesmo mês; lotes 1/2/4 por nível e
recusa com motivo; veio só aceita o seu prédio e lote só fábrica; cotas N2/N3 e cidade nível 3; manutenção em dinheiro
e grãos; colonização com cidade nível 1.

Exército: recrutar exige armas (aço na artilharia, ferro na cavalaria), nível de guarnição e teto; infantaria vence
cavalaria, cavalaria vence artilharia, artilharia fere antes do contato; fortes com infantaria e artilharia nos
distantes; testes de batalha e fortaleza com os nomes novos.

Estado: ida e volta pelo JSON.

Ritmo (jogador automático adaptado, 4 sementes): 1ª colonização 3–8 meses; primeiro aço 30–90 min; 1ª fortaleza 15–40
min; 20 províncias 1–4 h.

Mapa: escolha sob o ponteiro com lote e veio (tropa > cidade > lote > veio > fortaleza > província); chave de redesenho
muda com prédio em veio ou lote.

Navegador sem GPU (semente 860): veios na tela inicial; fundar capital; fazenda, serraria, minas, siderúrgica, fábrica
de armas; aço e armas subindo na barra; recrutar infantaria e tomar um forte.

Manual (autor): economia gostosa de jogar; veios ajudam a escolher a capital.

## Fora do escopo
Rotas e suprimento (2), exército como peça única (3), rivais (4), diplomacia (5), estabilidade (6), refino visual e
áudio (7), petróleo e eras seguintes.
