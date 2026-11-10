# Tropas e Combate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarnições treinam lanceiros/arqueiros/cavaleiros que andam no terreno real e lutam em batalhas abstratas contra fortalezas neutras.

**Architecture:** Tudo de regra em `src/sim` (puro, serializável, testado com vitest): A* numa grade de custo derivada do mapa, tropas, batalha em passos fixos e fortalezas. O cliente só desenha (InstancedMesh no 3D, fichas no pergaminho) e traduz entrada em comandos.

**Tech Stack:** TypeScript, three.js 0.169, Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-troops-combat-design.md`

## Global Constraints
- Todos os números de jogo em `src/sim/balance.ts` (valores do spec, tabela "Regras").
- Comandos devolvem `Result` (`{ ok: true } | { ok: false, reason }`) e têm `checkX` sem efeito colateral para a interface, como os atuais.
- `GameState` continua só com dados simples (JSON ida e volta). A grade de movimento fica fora do estado.
- Textos de interface e eventos em português, no tom dos atuais.
- Grade e `cellProvince` são indexadas por `grid.size` (1024 no jogo, menor nos testes), nunca por `GLOBAL_SIZE` direto em `src/sim`. 1 célula = `CELL` (4) tiles.
- Mapa parado no pergaminho continua com 0 redesenhos.

## Review Focus
1. Ordem de mover para água, para fora do mapa ou para célula inalcançável → recusa com motivo, tropa não trava. (Task 3)
2. Tropa em fuga recebe ordem → recusada com "Tropa em fuga"; tropa dentro de batalha recebe ordem → sai andando e deixa a batalha ao passar de 20 tiles. (Tasks 3, 4)
3. Guarnição em obra de melhoria → o teto usa `activeLevel` (vale o nível anterior até a obra acabar); recrutar recusa quando `tropas ≥ teto` e nenhuma tropa é dispersa por causa do teto. (Task 2)
4. Ouro abaixo do custo de reposição → reposição para, não deixa ouro negativo. (Task 3)
5. Fortaleza cuja província não tem `sites` → nunca é escolhida. (Task 5)

---

### Task 1: A* na grade global e grade de movimento

**Files:**
- Create: `src/sim/movegrid.ts`, `src/sim/astar.ts`, `tests/troopworld.ts`, `tests/astar.test.ts` (reescrito)
- Delete: `src/client/astar.ts` (sem uso desde que o personagem saiu)

**Interfaces:**
- Produces:
  - `interface MoveGrid { size: number; cost: Uint8Array; cover: Uint8Array }` — `cost` 0 bloqueado, senão multiplicador de tempo (1, 2, 3); `cover` 1 = floresta/colina.
  - `makeMoveGrid(map: WorldMap): MoveGrid` — `water≠0` → 0; `river` → 3; biomas Mountain/Snow/Swamp → 2; resto 1. `cover`: Taiga/TemperateForest/Jungle ou `elevation ≥ MOUNTAIN_LEVEL − 0.1`.
  - `findCellPath(grid: MoveGrid, from: number, to: number): number[] | null` — índices de célula (`y*size+x`), sem `from`, com `to` no fim; `[]` se `from === to`; null se bloqueado/inalcançável.
  - `cellAt(grid, x, y): number` (x,y em tiles; −1 fora do mapa).
  - `tests/troopworld.ts`: `makeTestWorld(): { pm: ProvinceMap; grid: MoveGrid }` — grade 64², tudo custo 1; coluna de rio (custo 3) em x=32 exceto ponte em y=10 (custo 1); lago bloqueado em x∈[40,50], y∈[40,50]; floresta (`cover=1`) em x∈[0,8]; província 0 = x<32, província 1 = x≥32, vizinhas, cada uma com 4 `sites` em terra, `cellProvince` preenchido, `suggestedCapitals: [0]`.

- [ ] **Step 1: Testes** em `tests/astar.test.ts`:
  - `caminho reto`: em grade aberta 64², de (0,0) a (10,0) tem 10 células e termina em `10`.
  - `contorna o lago`: nenhuma célula do caminho tem `cost===0`.
  - `prefere a ponte quando compensa`: de (28,10)→(36,12) não pisa em `cost===3`; de (28,40)→(36,40) (ponte longe) cruza o rio (pelo menos uma célula `cost===3`).
  - `inalcançável → null`: destino dentro do lago e destino cercado.
  - `desempenho`: grade 1024² aberta com uma parede vertical de x=500 com abertura em y=1000; de (10,10) a (1000,10) retorna caminho com > 1000 células em < 300 ms.
  - `makeMoveGrid`: num mapa de `generateWorld(1)`, toda célula com `water≠0` tem cost 0 e toda com `river=1` e `water=0` tem cost 3.
- [ ] **Step 2:** `npx vitest run tests/astar.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar. A* 8-direções sem cortar quina bloqueada; custo do passo = distância (1 ou √2) × `cost` da célula de chegada; heurística octile. Estruturas: `Float32Array g`, `Int32Array parent`, `Uint8Array closed` de `size²` por chamada e heap binário em arrays paralelos (sem tuplas). Apagar `src/client/astar.ts`.
- [ ] **Step 4:** `npx vitest run tests/astar.test.ts` → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat: global A* on move grid`.

### Task 2: Tipos de tropa, recrutamento e metas da Guarnição

**Files:**
- Modify: `src/sim/balance.ts`, `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/economy.ts`, `src/sim/tick.ts`
- Create: `src/sim/troops.ts`
- Test: `tests/troops.test.ts`

**Interfaces:**
- Consumes: Task 1 `makeTestWorld`.
- Produces:
  - `balance.ts`: `type TroopType = 'spear' | 'archer' | 'cavalry'`; `TROOPS: Record<TroopType, { name: string; level: number; soldiers: number; attack: number; defense: number; speed: number; cost: Res; upkeep: number; months: number }>` com os valores do spec (nomes 'Lanceiros', 'Arqueiros', 'Cavaleiros'); `TROOP_CAP = [0, 2, 3, 4]`; `GARRISON_GOAL = [0, 0, 3, 3]` (por nível alvo).
  - `state.ts`: `interface Troop { id: number; owner: number; type: TroopType; soldiers: number; x: number; y: number; path: number[]; morale: number; routedUntil: number; home: number }` (`home` −1 para o jogador); `GameState` ganha `troops: Troop[]`, `nextTroopId`, `recruiting: { province: number; slot: number; type: TroopType; remaining: number }[]`, `fortresses: { province: number; garrison: TroopType[]; lastCombat: number }[]`, `battles: Battle[]` com `interface Battle { x: number; y: number; start: number; troopIds: number[]; sides: { owner: number; initial: number; morale: number }[] }` (declarada aqui, usada na Task 4), `clock: number` (meses de passos fixos já simulados), `stepAcc: number`. `newGame` inicia vazios/0.
  - `troops.ts`: `troopCap(s): number` (Σ `TROOP_CAP[activeLevel]` das guarnições do jogador); `spawnTroop(s, owner, type, x, y, home = -1): Troop`.
  - `commands.ts`: `checkRecruit(s, pm, province, slot, type): Result`, `recruit(...)`. Recusas: província/vaga inválida, "Esta província não é sua", "Precisa de uma Guarnição" (vaga não é guarnição pronta), `Requer Guarnição N${level}`, "Já está treinando uma tropa", "Teto de tropas atingido", falta de recurso (reusar `afford`). Conta como ocupando o teto: tropas do jogador + `recruiting`.
  - `checkUpgrade` para guarnição indo ao nível L≥2: precisa de `GARRISON_GOAL[L]` guarnições do jogador com `activeLevel ≥ L−1` (contando a própria); motivo `Guarnições: ${n}/${goal}` para N2 e `Guarnições nível 2: ${n}/${goal}` para N3.
  - `checkColonize`: fortaleza → `"Fortaleza: só cai com tropas"` (antes do teste de vizinhança).
  - `monthlyIncome`: desconta Σ `TROOPS[type].upkeep` das tropas do jogador.
  - `tick` → `advance`: `recruiting` anda como obras; ao concluir, `spawnTroop` no `pm.provinces[p].sites[slot]` e evento `${name} treinados em ${província}`.

- [ ] **Step 1: Testes** (`tests/troops.test.ts`, com `makeTestWorld`, capital 0 e uma guarnição pronta posta direto em `s.buildings[0][1]`):
  - recusa sem guarnição; recusa arqueiros com guarnição N1 (`Requer Guarnição N2`); aceita lanceiros e cobra 40/20/0; segunda na mesma vaga recusa "Já está treinando uma tropa".
  - após 2 meses de `tick` existe 1 tropa `spear` com 20 soldados no local da vaga 1; evento registrado.
  - teto: com guarnição N1 (teto 2), 2 tropas existentes → "Teto de tropas atingido".
  - metas: guarnição N1 com 2 guarnições no reino → `Guarnições: 2/3`; com 3 → aceita. N3 com só 2 guarnições N2 → `Guarnições nível 2: 2/3`.
  - colonizar fortaleza (pôr `s.fortresses=[{province:1,...}]`) recusa com o motivo.
  - manutenção: 1 lanceiro reduz `monthlyIncome().gold` em 1.
- [ ] **Step 2:** `npx vitest run tests/troops.test.ts` → FAIL.
- [ ] **Step 3:** Implementar conforme Interfaces.
- [ ] **Step 4:** `npx vitest run` → tudo PASS (sim.test.ts e pacing sem regressão).
- [ ] **Step 5:** Commit `feat: troop types, recruitment and garrison goals`.

### Task 3: Ordens, movimento, reposição e passos fixos

**Files:**
- Modify: `src/sim/troops.ts`, `src/sim/commands.ts`, `src/sim/tick.ts`, `src/sim/balance.ts`, `src/main.ts`, `tests/sim.test.ts`, `tests/greedy.ts`
- Test: `tests/troops.test.ts`

**Interfaces:**
- Consumes: Task 1 (`findCellPath`, `cellAt`, `MoveGrid`), Task 2 (`Troop`, `spawnTroop`).
- Produces:
  - `balance.ts`: `BATTLE` (usado aqui só `step: 0.02`, `formation: 10` tiles entre tropas); `REFILL = { rate: 1, garrisonRate: 3, gold: 2 }`.
  - `tick(s, pm, dtSeconds, grid: MoveGrid | null)` — novo parâmetro obrigatório; `null` pula a fase de tropas. Atualizar as 7 chamadas (testes, `greedy.ts`, `main.ts`).
  - Fase de tropas: `s.stepAcc += meses`; enquanto `stepAcc ≥ BATTLE.step`: `troopStep(s, pm, grid, BATTLE.step)` e `s.clock += step`. Datas de tropa (`routedUntil`, `lastCombat`, `start`) usam `s.clock`.
  - `troopStep` (em `troops.ts`, Task 4/5 acrescentam fases): movimento → (batalhas, Task 4) → reposição → (fortalezas, Task 5).
  - Movimento: anda até o centro da próxima célula do `path` (`cx*CELL+CELL/2`) a `TROOPS[type].speed / cost(célula atual)` tiles/mês; tira a célula do `path` ao chegar.
  - `checkMove(s, grid, ids, x, y): Result` / `moveTroops(s, grid, ids, x, y)`: recusas "Nenhuma tropa selecionada", "Destino na água" (célula com cost 0 ou fora), "Tropa em fuga" (se alguma está em fuga, as outras andam e o motivo volta), "Caminho impossível". Destino de cada tropa = alvo + deslocamento de formação em grade (`ceil(√n)` colunas, `BATTLE.formation` tiles) — deslocamento que cai na água usa o alvo puro.
  - Reposição: tropa do jogador, sem `path`, fora de batalha, não em fuga, em célula de província própria, `soldiers < max`: ganha `rate × dt` (`garrisonRate` se a província tem guarnição pronta), paga `REFILL.gold` por soldado; não repõe se o ouro não cobre.
  - Virada do mês com ouro < 0 depois da renda: dispersa a tropa do jogador de maior `upkeep` (empate: maior `id`) e loga `${name} dispersos por falta de ouro`.
  - `main.ts`: `moveGrid = makeMoveGrid(map)` em `load`, passado ao `tick`.

- [ ] **Step 1: Testes:**
  - `chega no tempo`: lanceiro anda 40 tiles em campo aberto em ≈ 40/150 mês (±0.03).
  - `mais lento no rio`: mesma distância cruzando o rio (fora da ponte) leva mais tempo que pela ponte medida em células de custo.
  - recusas: destino no lago → "Destino na água"; sem ids → "Nenhuma tropa selecionada".
  - formação: 4 tropas mandadas ao mesmo ponto terminam a ≥ 8 tiles umas das outras.
  - reposição: tropa com 10 soldados parada na província 0 sem guarnição tem ≈ 11 após 1 mês e o ouro caiu 2; com guarnição ≈ 13; na província 1 (neutra) continua 10; com ouro 0 continua 10.
  - ouro negativo: forçar `res.gold = -5` antes da virada → a tropa de maior manutenção some e o evento aparece.
  - passos fixos: o mesmo cenário rodado com `tick(…, 0.1)` a 1× e `tick(…, 1)` a 8× por igual total de meses dá posições iguais (6 casas).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit `feat: troop orders, movement and refill`.

### Task 4: Batalha, moral e fuga

**Files:**
- Create: `src/sim/battle.ts`
- Modify: `src/sim/balance.ts`, `src/sim/troops.ts`
- Test: `tests/battle.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `BATTLE` completo: `{ step: 0.02, formation: 10, contact: 6, join: 20, rate: 1.0, archerOpening: 0.1, counter: 1.5, cover: 1.25, river: 0.75, fortress: 1.5, moraleLoss: 2, breakAt: 0.3, rout: 0.5, minSoldiers: 3 }`.
  - `battleStep(s, pm, grid, dt)`, chamado no `troopStep` depois do movimento:
    1. Tira das batalhas tropas mortas, em fuga ou a > `join` do centro.
    2. Contato: tropa sem batalha e não em fuga com inimiga (dono diferente, não em fuga) a ≤ `contact` → entra na batalha de uma delas ou cria uma no ponto médio (`start = s.clock`, limpa o `path` das duas). Depois, toda tropa não em fuga a ≤ `join` de um centro entra (soma `soldiers` ao `initial` do seu lado; cria o lado se não existir).
    3. Rodada: para cada tropa atacante `a` e alvo `d` do outro lado: `a.soldiers × attack × rate × dt × (d.soldiers / total inimigo) × vantagem × (célula de a é rio ? river : 1)`; baixas de `d` += dano ÷ (`defense × (cover? cover : 1) × (d.owner === −1 ? fortress : 1)`). Vantagem `counter` para lanceiros→cavalaria e cavalaria→arqueiros. Se `s.clock − start < archerOpening`, só arqueiros causam dano. Aplicar baixas depois de calcular todas.
    4. Moral do lado = `1 − moraleLoss × (initial − atual) / initial`; espelhar em `troop.morale`. Lado com dono ≠ −1 abaixo de `breakAt` foge: `routedUntil = clock + rout`, `path` até `sites[0]` da sua província mais próxima (sem caminho → dispersa).
    5. Tropas com `soldiers < minSoldiers` somem (jogador: evento `${name} dispersos`).
    6. Batalha com < 2 lados vivos e não fugidos acaba: vencedores voltam a `morale 1`; evento `Vitória perto de ${província}` / `Derrota perto de ${província}` se o jogador participou.
  - `checkMove` recusa em fuga enquanto `clock < routedUntil`; tropa com ordem dentro de batalha anda e sai ao passar de `join`.

- [ ] **Step 1: Testes** (tropas postas direto com `spawnTroop` em campo aberto, dono 0 contra dono 1 — dono 1 é só "outro" e foge normalmente):
  - 1 lanceiro × 1 cavaleiro → cavaleiro some ou foge; lanceiro sobrevive.
  - 1 cavaleiro × 1 arqueiro → cavaleiro vence.
  - 2 lanceiros × 1 lanceiro → o lado de 2 vence.
  - floresta: lanceiro × lanceiro com o defensor em `cover=1` → defensor perde menos soldados que no campo aberto (mesmo cenário espelhado).
  - fuga: perdedor tem `routedUntil > clock`, anda para a sua província e `moveTroops` com ele devolve "Tropa em fuga".
  - duração: lanceiro × lanceiro iguais termina entre 0.3 e 0.6 mês.
  - determinismo: a mesma batalha a 1× e 8× dá os mesmos soldados (6 casas).
  - JSON: estado no meio da batalha → `JSON.parse(JSON.stringify(s))` continua a batalha com o mesmo resultado.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar; ajustar só `rate` se a duração sair do alvo.
- [ ] **Step 4:** `npx vitest run` PASS.
- [ ] **Step 5:** Commit `feat: abstract battles with morale and rout`.

### Task 5: Fortalezas neutras

**Files:**
- Create: `src/sim/fortress.ts`
- Modify: `src/sim/balance.ts`, `src/sim/troops.ts`, `src/main.ts`
- Test: `tests/fortress.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `FORTRESS = { share: 0.25, regenMonths: 3 }` em `balance.ts`.
  - `placeFortresses(s: GameState, pm: ProvinceMap, seed: number): void` — separado de `newGame` para os testes de economia não ganharem fortalezas. Candidatas: neutras com `sites.length > 0`, fora de `suggestedCapitals` e não vizinhas delas. Escolhe `round(share × neutras com sites)` (limitado às candidatas) embaralhando com `makeRng(subSeed(seed, 'fortress'))`. `hops` = BFS no grafo de vizinhos a partir de todas as capitais sugeridas; `n = clamp(1 + floor((hops − 2) / 3), 1, 4)`; com `hops ≥ 8` a última tropa é arqueiros, com `hops ≥ 11` as duas últimas. Tropas nascem com `owner −1`, `home = província`, em `sites[0]` + até 3 tiles.
  - `fortressStep(s, pm, dt)` no fim do `troopStep`: fortaleza com tropa em batalha → `lastCombat = clock`; sem tropas vivas → província do jogador com Vila N1 na vaga 0, entrada removida, evento `Fortaleza de ${nome} conquistada`; sem combate há ≥ `regenMonths` → recria as tropas que faltam e enche os soldados.
  - Tropas `owner −1` nunca andam nem fogem (lutam até `minSoldiers`).
  - `main.ts`: `placeFortresses(game, pm, seed)` logo após `newGame`.

- [ ] **Step 1: Testes:**
  - em `generateProvinces(generateWorld(860))`: nº de fortalezas = 25% (±1) das neutras com sites; nenhuma em/vizinha de capital sugerida; todas com sites; contagem média de tropas não diminui com `hops`.
  - determinismo: mesma semente → mesmas províncias.
  - conquista (test world): fortaleza na província 1 com 1 lanceiro; 3 lanceiros do jogador atacam → `owner[1] === 0`, Vila N1 na vaga 0, evento.
  - regeneração: fortaleza perde soldados, inimigo recua; após 3 meses sem combate volta à força total; antes disso não.
  - fortaleza nunca foge: batalha perdida pela fortaleza termina com as tropas dela mortas, não em fuga.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` PASS.
- [ ] **Step 5:** Commit `feat: neutral fortresses`.

### Task 6: Ritmo com o exército

**Files:**
- Modify: `tests/greedy.ts`, `tests/pacing.test.ts`, `src/sim/balance.ts` (só se a calibração pedir)

**Interfaces:**
- Consumes: tudo de 2–5. `greedy(pm, maxMonths, map?)`: com `map`, cria a grade, chama `placeFortresses`, constrói 1 guarnição na capital cedo, recruta até o teto e, com ≥ 3 tropas prontas, manda todas à fortaleza mais próxima (por `hops`) e reenvia ao fim de cada batalha. Devolve também `firstFortress` (mês).

- [ ] **Step 1:** Em `pacing.test.ts` passar o mapa ao `greedy` e acrescentar `firstFortress` entre 90 e 240 meses (15–40 min), mantendo os alvos de colonização.
- [ ] **Step 2:** `npx vitest run tests/pacing.test.ts` e anotar os números por semente.
- [ ] **Step 3:** Se fora do alvo, ajustar só `FORTRESS`, `TROOPS.*.cost` ou a fórmula de força em `balance.ts`/`fortress.ts`; registrar no commit os números antes/depois.
- [ ] **Step 4:** `npx vitest run` PASS.
- [ ] **Step 5:** Commit `feat: pacing with troops and fortresses`.

### Task 7: Tropas, batalhas e fortalezas no 3D

**Files:**
- Create: `src/client/view/troops.ts`
- Modify: `src/main.ts`, `index.html` (camada `#labels` para rótulos DOM)
- Test: `tests/troopsview.test.ts`

**Interfaces:**
- Consumes: `GameState.troops/battles/fortresses`.
- Produces: `class TroopsView { constructor(scene); sync(s, heightAt, viewWidth, selected: Set<number>); clear(); }` e `formationSlots(n: number, facing: number): { x: number; z: number }[]` (pura, testável).
  - Modelos low-poly em código (mesmo estilo `part/box/cyl` de `buildings.ts`): lanceiro, arqueiro, cavaleiro; um `InstancedMesh` por tipo, capacidade crescida sob demanda; um modelo por soldado vivo (`ceil(soldiers)`), formação retangular centrada na tropa virada para a direção do movimento (ou para o centro da batalha); balanço vertical ao andar.
  - Estandarte por tropa na cor do dono (`REALM_COLOR` do jogador; cinza na fortaleza); anel no chão quando selecionada.
  - `viewWidth > 250`: soldados ocultos, só estandarte; rótulo DOM com o nº de soldados.
  - Batalha: rótulo DOM "⚔" com barra de moral de cada lado no ponto projetado.
  - Fortaleza: paliçada com torre no `sites[0]` enquanto a entrada existir (modelo novo em `buildings.ts`, `BuildingsView.sync` a desenha).
- [ ] **Step 1:** Teste de `formationSlots`: `n` posições distintas, espaçamento ≥ 0.9 tile, centradas (média ≈ 0).
- [ ] **Step 2:** FAIL → implementar → PASS.
- [ ] **Step 3:** Ligar em `main.ts` (`troopsView.sync` no quadro, `clear` em `load`). Conferir com `npm run dev`: lanceiro recrutado aparece e anda (pelo console `moveTroops`).
- [ ] **Step 4:** `npx tsc --noEmit` limpo; commit `feat: troops, battles and fortresses in 3D`.

### Task 8: Fichas no pergaminho

**Files:**
- Modify: `src/client/strategic.ts`, `src/main.ts`
- Test: `tests/parchment.test.ts` (só se a lógica de chave for extraída como função pura)

**Interfaces:**
- Produces: `StrategicMap.setUnits(units: { x: number; y: number; text: string; color: string; kind: 'troop' | 'fortress' | 'battle'; selected: boolean; path?: { x: number; y: number }[] }[], key: string)`. `key` entra na chave de `draw`; desenhadas depois da imagem e dos nomes, em pixels de tela (tamanho fixo). `main.ts` monta `key` com posições arredondadas a 1 tile + soldados arredondados + seleção, de modo que parado = mesma chave.
- [ ] **Step 1:** Implementar e ligar.
- [ ] **Step 2:** Verificar no navegador headless: com tropas paradas e mapa parado, `strategic.paints` não sobe em 2 s; com uma tropa andando, sobe.
- [ ] **Step 3:** Commit `feat: troop tokens on parchment`.

### Task 9: Seleção, ordens, painéis e barra superior

**Files:**
- Modify: `src/main.ts`, `src/client/panel.ts`, `src/client/hud.ts`, `index.html`

**Interfaces:**
- Consumes: `recruit/checkRecruit`, `moveTroops/checkMove`, `troopCap`.
- Produces:
  - Seleção `selectedTroops: Set<number>` (só do jogador). Clique esquerdo: tropa mais próxima projetada a ≤ 20 px tem prioridade sobre a província; Shift soma/alterna. Arrastar o esquerdo > 5 px: caixa (div `#box`) seleciona as tropas projetadas dentro. Esc limpa. Pergaminho: clique em ficha seleciona.
  - Clique direito sem arrastar (≤ 5 px entre down/up): raycast no terreno → `moveTroops`; recusa vira `toast`. Arrastar continua com a câmera.
  - Grupos: **Shift+1–9 salva, 1–9 seleciona** (por `e.code`). Desvio do spec: Ctrl+1–9 é tomado pelo navegador para trocar de aba e não pode ser impedido.
  - `renderPanel(s, pm, id, act, troops: number[])`: com `troops.length > 0` mostra o painel de seleção (tipo, soldados `ceil`, moral %, "em fuga"/"em batalha"); senão o da província. Província com guarnição pronta: seção "Tropas" com botões por tipo (`checkRecruit`, custo, motivo) e fila com meses restantes. Neutra com fortaleza: "Fortaleza · ~N tropas de X" e o motivo de `checkColonize`. `PanelActions.recruit(id, slot, type)`.
  - `setTopbar` ganha `troops: { n: number; cap: number }` → `Tropas n/cap` (contando `recruiting`) num `<span id="troops">`.
  - Mensagens já saem pelo log de eventos.
- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Verificação manual (headless + autor), tudo pelo jogo: construir guarnição, recrutar 2 lanceiros, caixa de seleção, mover em grupo cruzando rio, atacar fortaleza próxima, ver vitória e conquista; perder de propósito e ver a fuga e a recusa de ordem; Shift+1 / 1.
- [ ] **Step 3:** `npm run build` limpo; `npx vitest run` PASS.
- [ ] **Step 4:** Commit `feat: troop selection, orders, recruit panel and topbar`.

### Task 10: Desempenho e fechamento

- [ ] **Step 1:** Com ~15 tropas na tela (via console), medir FPS no 3D e no pergaminho com zoom máximo (headless dá só a tendência; o autor confere na RTX 3060, alvo > 160 fps no Alto). Medir o tempo de `moveTroops` com 10 tropas atravessando o continente; se > 300 ms, um caminho por grupo + deslocamento de formação.
- [ ] **Step 2:** `npx vitest run` e `npm run build` limpos; commit de qualquer ajuste `fix: …`.
