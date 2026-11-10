# Subprojeto 2 — Tropas e Combate — Design

Data: 2026-11-10
Status: aprovado em conversa
Base: subprojeto 1 (províncias e economia, na `main`). Jogo: estratégia territorial offline em tempo real.

## Objetivo
Guarnições treinam tropas (10–30 soldados comandados como uma peça) que andam pelo mapa 3D real e
lutam em combate abstrato no ponto de contato. Fortalezas neutras passivas dão ao exército um uso
antes dos rivais existirem. Sem IA (rivais e bárbaros errantes ficam no subprojeto 3).

## Decisões
| Tema | Decisão |
|---|---|
| Combate | Abstrato no ponto de contato: tropas andam no terreno; batalha calculada por números em rodadas, alguns segundos |
| Tipos | Lanceiros (Guarnição N1), Arqueiros (N2), Cavaleiros (N3), vantagens cruzadas |
| Nível da Guarnição | Além dos insumos: N2 exige ≥ 3 guarnições no reino; N3 exige ≥ 3 guarnições N2+ |
| Tamanho do exército | Cada guarnição sustenta N tropas + manutenção em ouro por tropa |
| Neutros | Fortalezas passivas (~25% das neutras), mais fortes longe do início; vencer = província sua |
| Comando | Seleção múltipla (clique, Shift, caixa, grupos Ctrl+1–9), sem entidade "exército" |
| Baixas | Moral, fuga, dispersão abaixo de 3 soldados, reposição em território próprio |
| Arquitetura | Tropas na simulação pura (`src/sim`), A* na grade global de células 1024² |

## Regras (calibração inicial, `balance.ts`)
Escala: 1 mês = 10 s a 1×; uma província tem ~150 tiles de largura.

| Tipo | Guarnição | Soldados | Ataque | Defesa | Velocidade (tiles/mês) | Custo (o/m/p) | Manutenção/mês | Treino |
|---|---|---|---|---|---|---|---|---|
| Lanceiros | N1 | 20 | 1.0 | 1.2 | 150 | 40/20/0 | 1 ouro | 2 meses |
| Arqueiros | N2 | 15 | 1.0 | 0.6 | 150 | 50/40/0 | 1.5 ouro | 2 meses |
| Cavaleiros | N3 | 12 | 1.6 | 1.0 | 240 | 90/20/20 | 3 ouro | 3 meses |

- Vantagens: lanceiros +50% de dano contra cavalaria; cavalaria +50% contra arqueiros; arqueiros atiram
  sozinhos no primeiro quarto da batalha (só eles causam dano nessa fase).
- Recrutamento: pelo painel da província com Guarnição; uma tropa por vez por guarnição; nasce no local do prédio.
- Teto: Guarnição N1/N2/N3 sustenta 2/3/4 tropas. Manutenção da Guarnição (2 ouro) continua.
- Metas de nível da Guarnição: N2 exige ≥ 3 guarnições no reino (qualquer nível, contando a própria);
  N3 exige ≥ 3 guarnições de nível ≥ 2 (contando a própria).
- Movimento: mar e lago bloqueiam; rio custa 3×; montanha, pântano e neve 2×.
- Batalha:
  - Começa quando tropas inimigas ficam a ≤ 6 tiles; entram todas as tropas a ≤ 20 tiles do ponto de contato.
  - Rodadas: dano de cada lado = Σ `soldados × ataque × vantagem × terreno`; baixas do outro lado =
    dano ÷ defesa, repartidas entre as tropas proporcionalmente aos soldados.
  - Terreno: defensor em floresta/colina +25%; atacante cruzando rio −25%.
  - Moral começa em 100% e cai com as baixas; abaixo de 30% o lado foge. Duração típica 0.3–0.6 mês.
- Fuga: a tropa corre para a sua província mais próxima e ignora ordens por 0.5 mês.
  Menos de 3 soldados → dispersa (some).
- Reposição: tropa parada no seu território e fora de batalha ganha 1 soldado/mês (3/mês em província
  com Guarnição), a 2 ouro por soldado.
- Ouro negativo na virada do mês: dispersa a tropa de maior manutenção (evento no log).
- Fortalezas: ~25% das províncias neutras, nunca vizinhas de capital sugerida. Força pela distância
  (saltos no grafo de províncias) até a capital sugerida mais próxima: `2 × (saltos − 1)` tropas, de 2 a 10,
  um terço delas arqueiros a partir de 3 tropas (calibrado pelo teste de ritmo; o rascunho de 1–4 caía cedo demais). Defesa +50%, não fogem (lutam até cair). Sem combate há
  3 meses, voltam à força total. Não podem ser colonizadas (motivo no painel).
  Vencer = a província vira sua com Vila N1, sem custo.
- Tropas suas em província neutra comum: nada acontece.

## Arquitetura
### Simulação (`src/sim`, pura, serializável)
- `astar.ts`: o A* de `src/client/astar.ts` (sem uso desde que o personagem saiu) vem para cá;
  custo numérico por célula (0 = bloqueado), raio opcional (mapa todo); caminho suavizado.
  `tests/astar.test.ts` acompanha a mudança.
- `movegrid.ts`: `makeMoveGrid(map)` → `Uint8Array` 1024² com custo por célula e bônus de defesa
  (floresta/colina). Derivado do mapa; fora do save.
- `troops.ts`: tipos, `recruit`, `moveTroops`, movimento, fuga, reposição.
- `battle.ts`: contato e rodadas.
- `fortress.ts`: `placeFortresses(pm, seed)`, chamado por `newGame`; composição determinística.
- Adições ao `GameState`:
  ```ts
  troops: { id, owner /* 0 jogador, −1 fortaleza */, type, soldiers, x, y /* tiles */,
            path: number[] /* células */, morale, routedUntil, home? /* província da fortaleza */ }[]
  nextTroopId: number
  recruiting: { province, slot, type, remaining }[]
  fortresses: { province, lastCombat: number }[]
  battles: { x, y, troopIds: number[] }[]   // para o cliente desenhar
  ```
- Comandos (`{ok:true} | {ok:false, reason}`): `recruit(province, slot, type)`;
  `moveTroops(ids, alvo)` (um caminho por tropa com deslocamento de formação; recusa água);
  `upgrade` ganha as metas da Guarnição; `colonize` recusa fortaleza.
- `tick`: subpassos de ≤ 0.02 mês (resultado igual a 1× e 8×). Ordem: recrutamento → movimento →
  contato/batalhas → fuga/dispersão → reposição → regeneração de fortalezas → conquista.
  Manutenção das tropas entra em `monthlyIncome`.
- Desempenho: A* no mapa todo ~50–150 ms, só ao dar ordem. Se 10 tropas ficarem lentas, um caminho
  por grupo + deslocamento de formação.

### Cliente
- `src/client/view/troops.ts`: soldadinhos low-poly em código, um `InstancedMesh` por tipo; formação
  retangular com um modelo por soldado vivo (baixas somem); altura do terreno; viram para a marcha;
  balanço ao andar; estandarte na cor do dono (fortaleza cinza). Zoom médio: só estandarte com o número.
  Batalha: tropas se encaram; espadas cruzadas com barra de força/moral. Fortaleza: paliçada com torre.
- Pergaminho: fichas (ícone do tipo + soldados), caminho tracejado das selecionadas, castelinho nas
  fortalezas, espadas nas batalhas. Fichas numa camada leve por cima da imagem composta, redesenhada
  só quando alguma tropa mudou (mantém "mapa parado não redesenha").
- Controles: clique esquerdo em tropa seleciona (prioridade sobre a província); arrastar com o
  esquerdo = caixa; Shift+clique soma; clique direito sem arrastar (limiar ~5 px) = mover; arrastar
  com o direito continua sendo câmera; Ctrl+1–9 salva grupo, 1–9 seleciona; Esc limpa.
- Barra superior: "Tropas 5/7"; renda de ouro já com manutenção.
- Painel da província com Guarnição: recrutar cada tipo (desabilitado com motivo: "Requer Guarnição N2",
  "Teto de tropas atingido", "Faltam 20 ouro"); fila com progresso; melhoria mostra metas ("Guarnições: 2/3").
- Painel de fortaleza: força estimada ("~3 tropas de lanceiros"), "Não pode ser colonizada".
- Painel de seleção (substitui o da província quando há tropas selecionadas): tipo, soldados, moral.
- Mensagens: batalha vencida/perdida, fortaleza conquistada, tropa dispersa, tropa treinada,
  dispersão por falta de ouro.

## Testes
Simulação (vitest):
- A*: contorna lago/mar; prefere ponte de terra a cruzar rio quando compensa; null se inalcançável;
  caminho de > 1000 células em < 300 ms.
- Recrutamento: nível, teto e custos com recusa e motivo; nasce no tempo certo.
- Metas de nível: N2 recusado com 2 guarnições, aceito com 3; idem N3.
- Movimento: chega no tempo esperado; mais lento no rio.
- Batalha: lanceiros vencem cavalaria do mesmo custo; cavalaria vence arqueiros; lado maior vence;
  defensor em floresta perde menos; perdedor foge e ignora ordens; < 3 soldados some.
- Determinismo: mesma batalha dá o mesmo resultado a 1× e 8×.
- Fortalezas: ~25% das neutras, nenhuma vizinha de capital sugerida, força cresce com a distância;
  regeneração após 3 meses; conquista dá Vila N1.
- Reposição só em território próprio, mais rápida com Guarnição; manutenção desconta da renda;
  ouro negativo dispersa uma tropa.
- Estado com tropas e batalhas faz o caminho de ida e volta pelo JSON.
- Ritmo: jogador guloso estendido (recruta e ataca fortalezas próximas): 1ª fortaleza tomada entre
  15–40 min a 1×; 20 províncias entre 0.6 e 4 h (medido 0.7–1 h: conquistar não paga colonização e o ouro sobra
  no meio do jogo; o freio fino fica para o subprojeto 3, quando os rivais disputarem as fortalezas).

Manual (headless + autor): recrutar, mover em grupo, cruzar rio, atacar fortaleza, perder e ver a fuga;
FPS com ~15 tropas no 3D e no pergaminho com zoom máximo.

## Fora do escopo
IA dos rivais e bárbaros errantes (subprojeto 3), cerco com tempo, navios, generais/experiência,
formações escolhidas pelo jogador, salvar/carregar.
