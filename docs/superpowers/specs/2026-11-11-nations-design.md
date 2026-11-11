# Ciclo 4 — Nações Rivais — Design

Data: 2026-11-11
Status: aprovado em conversa
Base: ciclos 1a, 1b, 2 e 3 na `main` (mapa cartográfico, economia industrial, rotas e suprimento, exércitos de batalhões).
Substitui a spec pausada `2026-11-10-rival-realms-design.md` (escrita antes do Império de Papel).

## Objetivo
Até 4 nações rivais controladas por IA, nas outras capitais sugeridas, jogando com as mesmas regras do jogador.
A guerra começa por declaração (o jogador tem o botão; a IA decide pela inclinação). Províncias com dono são
conquistáveis por ocupação; perder a capital elimina a nação; a partida tem vitória e derrota.

## Decisões
| Tema | Decisão |
|---|---|
| Nome | "Nação de <capital>"; inclinações Militarista, Expansionista, Industrial |
| Guerra | Só por declaração; o jogador declara a qualquer nação viva; a IA sorteia pela inclinação contra vizinhos; permanente neste ciclo |
| Conquista | Vencer e ocupar por um tempo; Guarnição alonga; dano de guerra ao cair |
| Fim | Capital caída elimina a nação; vence a última de pé |
| IA | As mesmas regras e comandos do jogador; dificuldade muda só a renda dos rivais |
| Comportamento | Uma IA (o jogador automático `tests/greedy.ts` promovido), três inclinações por pesos |
| Visão | Sem névoa de guerra |

## Regras (calibração inicial em `balance.ts`)
### Nações
- Jogador = nação 0; até 4 rivais, um por capital sugerida restante (menos capitais = menos rivais).
- Rivais nascem quando o jogador funda a capital, como ele: cidade inicial e recursos iniciais pela média do
  próprio território (regra atual).
- Inclinação sorteada pela semente. Cor por índice numa paleta fixa do cliente.
- Dificuldade (tela inicial): renda dos rivais × 0.7 (Fácil), 1 (Normal, padrão), 1.3 (Difícil); a do jogador não muda.

### Paz e guerra
- Todos começam em paz. Em paz: exércitos se cruzam sem lutar, não ocupam; no território alheio ficam sem
  suprimento (não é território próprio); rotas e linhas não são cortadas por quem está em paz.
- Declarar guerra: o jogador, contra qualquer nação viva (botão com confirmação). Guerra é simétrica e permanente
  neste ciclo; evento "A Nação de X declarou guerra à Nação de Y"; contra o jogador, aviso com pausa automática.
- IA, uma vez por mês, só contra nações com província vizinha (fronteira), sorteio determinístico pela semente:
  `WAR = { militarist: 0.15, expansionist: 0.08, strongMult: 2, strongRatio: 1.5, graceMonths: 24 }`.
  - Militarista: 15%/mês; ×2 se tem ≥ 1,5× os batalhões do vizinho.
  - Expansionista: 8%/mês, só se tem mais batalhões que o vizinho.
  - Industrial: nunca declara.
  - Carência: ninguém (IA) declara nos primeiros 24 meses após a fundação.
- Fortalezas neutras lutam contra todos. Ao cair, a província vai para a nação com mais homens a ≤ 20 tiles.

### Ocupação
- Começa com exército de nação em guerra com o dono dentro da província e nenhum exército do dono lá
  (em fuga não conta).
- Tempo: `OCCUPY = { base: 1, garrison: [0, 2, 3, 4], capital: 3 }` — 1 mês; com Guarnição ativa N1/N2/N3,
  2/3/4 meses; capital +3.
- A contagem zera se o ocupante sai ou é expulso; não avança com exército do dono presente.
- Ao cair (dano de guerra): a província passa ao ocupante; cada prédio −1 nível (N1 e em obra são destruídos);
  cidade no mínimo N1; treino e colonização ali cancelados; rotas com ponta nela se rompem; linhas de suprimento
  que saíam dela caem; o depósito passa ao conquistador; a cidade começa desligada da rede dele.

### Eliminação e fim
- Capital caída: a nação acaba; exércitos dispersos; demais províncias viram neutras (sem prédios, sem rotas,
  colonizáveis); o conquistador fica com a capital como província comum. Evento "A Nação de X foi eliminada pela
  Nação de Y". Regra isolada numa função (porta aberta para o modo futuro "capital móvel").
- Derrota: capital do jogador cai. Vitória: último rival cai (Industriais não declaram: cabe ao jogador ir atrás).
- Tela de fim com tempo de jogo e províncias; "Continuar olhando" e "Novo mundo".

### Igual para todos
Fuga para a província própria mais próxima; reposição só em território próprio; até 2 colonizações simultâneas;
cotas e metas de nível; manutenção; custos crescentes por nação; teto de batalhões pelas guarnições da nação;
reforço pela linha da própria cidade.

## Arquitetura
### Estado (`src/sim/state.ts`)
```ts
type Bent = 'militarist' | 'expansionist' | 'industrial';
interface Nation { id: number; name: string; bent: Bent; incomeMult: number; alive: boolean;
                   res: Res; capital: number; grainShort: boolean; armyNumber: number;
                   atWar: number[]; founded: number }
GameState: nations: Nation[]                  // 0 = jogador; substitui res, capital, grainShort, armyNumber
           owner: number[]                    // −1 neutra, senão id da nação
           colonizing: { province, nation, remaining }[]
           routes: Route & { owner }          // dono da rota
           occupations: { province, nation, progress }[]
           result: null | 'victory' | 'defeat'
```
`connected`, `depot`, `recruiting`, `lots`, `veins`, `city` seguem por província (dono = `owner`). Tudo serializável.

### Comandos
- Todos recebem a nação depois do estado: `colonize(s, pm, n, id)`, `build`, `upgrade`, `upgradeCity`, `recruit`,
  `moveArmies(s, grid, n, ids, x, y)`, `buildRoute`, `supplyArmy`, `mergeArmies`, `splitArmy`, `renameArmy`, com os
  `checkX` e as mesmas recusas. O cliente passa 0. Nação não age em província/exército alheio.
- `declareWar(s, n, target): Result` — recusas: nação inválida/eliminada, a si mesma, já em guerra.
- `startGame(s, pm, capital, difficulty, seed)` substitui `chooseCapital`.
- Economia (`runMonth`, custos, `armyCap`, `battalionCount`, conectividade a partir da capital) por nação.

### Hostilidade
`hostile(s, ownerA, ownerB)` é a única fonte: −1 (fortaleza) é hostil a todos; nações só se em guerra. Usada em
batalha, cortes de rotas/linhas, ocupação. Em batalha de vários lados cada batalhão só fere inimigos.

### Passo de tempo
- Passo fixo das tropas: marcha → rotas → suprimento → batalha → ocupação/queda → eliminação → reforço →
  reposição → fortalezas.
- Virada do mês, por nação viva: renda (× `incomeMult`), dispersão por falta de dinheiro; nos rivais `aiStep` e o
  sorteio de guerra, cada rival num passo diferente do mês.
- `events` segue como feed do jogador: tudo dele, mais guerras e eliminações de qualquer nação.

### IA (`src/sim/ai.ts`)
`aiStep(s, pm, grid, n)`, pura e determinística, mensal. `tests/greedy.ts` sai dos testes e vira a base.
Ordem:
1. **Defender:** ocupação ou inimigo no território → exércitos livres mais próximos se a força somada ≥ 0,8× a do
   invasor; senão recua para a capital e recruta.
2. **Recompor:** exército < 50% dos homens volta a província com Guarnição.
3. **Economia:** a lógica atual (colonizar, veios, siderúrgica, armas, mercados, melhorias, rotas).
4. **Exército:** guarnições numa fração das províncias; recruta até o teto com reserva de dinheiro e armas.
5. **Atacar:** junta exércitos prontos; alvo mais vantajoso entre fortalezas e províncias de nações em guerra; só
   com a margem da inclinação; sempre com linha de suprimento; capital inimiga mal defendida tem preferência.
6. **Declarar guerra:** o sorteio acima.

| Peso | Militarista | Expansionista | Industrial |
|---|---|---|---|
| Fração com Guarnição | 1/2 | 1/3 | 1/4 |
| Margem para atacar | 1,5× | 2× | 3× (só fortalezas e quem a atacou) |
| Prioridade do dinheiro | recrutar | colonizar | fábricas e melhorias |

Os testes de ritmo usam a IA jogando como nação 0.

### Desempenho
A\* já reusa buffers; máscaras de ameaça por nação; a IA traça um caminho por exército e só refaz quando o alvo
muda; rivais em passos diferentes do mês. Meta: mês com 5 nações e ~60 exércitos < 50 ms de simulação.

## Interface
- **Tela inicial:** seletor de dificuldade; selos "aqui nascerá uma nação rival" nas outras capitais sugeridas.
- **Cores:** território, contorno, peças e rotas na cor da nação (carmim jogador, azul-prússia, verde-garrafa,
  ocre, violeta); fortalezas cinza; selo colorido em cada capital.
- **Barra superior:** botão "Nações" → lista (nome, cor, inclinação, províncias, batalhões, situação) com
  "Declarar guerra" por linha; clicar no nome centraliza na capital.
- **Painel de província rival:** nação, inclinação, situação, cidade, prédios, exércitos; "Declarar guerra"
  (confirmação); sem botões de obra.
- **Ocupação:** barra no selo da cidade na cor do ocupante; painel "Ocupada pela Nação de X — cai em N meses" /
  "Você ocupa — cai em N meses (Guarnição N2 alonga)".
- **Exército alheio:** clique mostra painel só de leitura (dono, batalhões, homens, moral); só os seus selecionam.
- **Mensagens:** guerras (pausa quando contra você), província sua sob ocupação, perdida, tomada, nação
  eliminada; entre rivais só guerra e eliminação.
- **Fim:** "Vitória"/"Derrota" com tempo e províncias; "Continuar olhando" e "Novo mundo".

## Testes
Regras (vitest):
- Início: rivais nas capitais sugeridas restantes, recursos pela média do território; menos capitais = menos rivais.
- Mesmas regras: comando de rival com os mesmos custos e recusas; nação não age em província/exército alheio.
- Dificuldade: renda dos rivais × 0.7 / 1 / 1.3; a do jogador não muda.
- Paz: cruzam sem batalha, não ocupam; rotas/linhas de quem está em paz não se cortam. `declareWar` cria guerra dos
  dois lados com evento e recusas.
- Declaração da IA: determinística; Industrial nunca; nada na carência; Militarista declara antes da Expansionista
  na média de sementes.
- Batalha de três lados: duas nações em paz não se ferem.
- Ocupação: 1 mês; 2/3/4 com Guarnição; capital +3; zera se o ocupante sai; parada com exército do dono (fuga não
  conta); ao cair: prédios −1, N1 e obras somem, rotas rompem, treino e colonização cancelados.
- Eliminação: exércitos dispersos, províncias neutras sem prédios nem rotas; derrota e vitória.
- Fortaleza vai para a nação com mais homens em volta.
- JSON: ida e volta com nações, guerras e ocupações.

IA:
- Não trava: 5 nações por 600 meses em 4 sementes, sem exceção, sem dinheiro negativo persistente.
- Progride: cada rival ≥ 5 províncias em 150 meses e ≥ 1 fortaleza em 300.
- Reage: defende quando tem força, recua quando não tem; respeita a margem da inclinação.
- Determinismo: mesma semente, mesma partida, a 1× e 8×.

Ritmo: alvos atuais com a IA como nação 0. Novo: no Normal, 1ª guerra entre 20 e 60 meses; ≥ 1 nação eliminada
em até 400 meses. Desempenho: mês com 5 nações e ~60 exércitos < 50 ms.

Navegador (headless): início com dificuldade, rivais crescendo, declarar guerra, ocupar e tomar, perder uma
província, eliminar um rival, tela de fim.

## Fora do escopo
Tratados, paz, comércio e acordos (ciclo 5 — a Industrial passa a propor acordos). Estabilidade (ciclo 6).
Névoa de guerra. Salvar/carregar. Modos futuros: capital móvel, IAs com lógica própria por personalidade.
