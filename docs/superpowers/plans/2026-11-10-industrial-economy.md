# Economia Industrial e Exército de 1760 (1b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a economia medieval pela industrial (cidade, veios, lotes, sete recursos, cotas) e as tropas medievais pelas de 1760, com o mapa e o painel mostrando tudo.

**Architecture:** A geração ganha cidade, lotes e veios por província. A simulação troca `buildings` por `city`/`lots`/`veins` por província e concentra a virada do mês numa função `runMonth(s, pm, apply)` que também serve de projeção para a interface. Tropas mudam de nome e de custos sem mudar o combate. O cliente desenha veios e lotes e ganha seções novas no painel.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-industrial-economy-design.md`

## Global Constraints
- Todos os números de jogo em `src/sim/balance.ts`.
- Comandos devolvem `Result` e têm `checkX` puro; motivos em português, no tom atual.
- `GameState` só com dados simples (JSON ida e volta).
- `tsc --noEmit` e a suíte inteira precisam estar verdes ao fim das Tasks 1, 4, 5 e 6. Nas Tasks 2 e 3 o cliente (`src/client`, `src/main.ts`) e `tests/mappick.test.ts` ficam quebrados de propósito (são reescritos na Task 4); o critério dessas tasks é `npx vitest run tests/sim.test.ts tests/troops.test.ts tests/battle.test.ts tests/fortress.test.ts tests/provinces.test.ts` verde e `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "^src/client\|^src/main\|^tests/mappick"` vazio.
- Simulação pura: sem `Math.random`, `sin`, `cos` (o teste de pureza continua valendo).

## Review Focus
1. Fábrica com insumo parcial → produz `floor(min(estoque/consumo))` unidades, sem deixar estoque negativo; siderúrgica antes da fábrica de armas no mesmo mês. (Task 2)
2. Cidade em obra de melhoria → impostos, consumo e lotes do nível anterior até terminar; lote recém-liberado só aceita obra quando a cidade termina. (Task 2)
3. Veio sem prédio possível (ex.: província sem lote livre, ou veio de outro tipo) → recusa com motivo, nunca exceção. (Task 2)
4. Província conquistada de fortaleza → nasce com cidade nível 1 e lotes/veios vazios do tamanho certo. (Task 3)
5. Clique num lote bloqueado no mapa → abre o painel na seção Lotes com o motivo, não seleciona outra coisa. (Task 4)

---

### Task 1: Cidade, lotes e veios na geração

**Files:**
- Modify: `src/worldgen/provinces.ts`
- Test: `tests/provinces.test.ts`

**Interfaces:**
- Produces (em `Province`, além dos campos atuais — `slots`/`sites` continuam até a Task 2 removê-los):
  - `type VeinKind = 'grain' | 'wood' | 'coal' | 'iron'`; `interface Vein { kind: VeinKind; richness: number; x: number; y: number }`.
  - `city: { x: number; y: number }` — o primeiro local escolhido pelo `pickSites` atual (mais plano e perto do centro).
  - `lots: { x: number; y: number }[]` — até 4, secos (`dryAround` raio 2), a ≤ 10 tiles da cidade, ≥ 4 tiles entre si e da cidade.
  - `veins: Vein[]` — 0–4, secos (`dryAround` raio 2), a ≥ 20 tiles da cidade, ≥ 12 entre si, dentro da província. Contagem alvo: grãos `round(fertility × 1.2)`, madeira `round(forest × 1.2)`, mineral `round(rock × 1.4)`; cortar em 4 no total na ordem mineral, madeira, grãos alternados. Célula elegível: madeira em bioma Taiga/TemperateForest/Jungle; mineral em Mountain ou elevação ≥ `MOUNTAIN_LEVEL − 0.1`; grãos em bioma Grassland/Savanna/TemperateForest com rio a ≤ 3 células ou fertilidade do bioma ≥ 0.8. Mineral vira carvão ou ferro por `makeRng(subSeed(seed, 'vein'))`. Riqueza = `clamp(0.5, 1.5, 0.6 + fatorLocal × 0.5 + (rng − 0.5) × 0.4)` com fatorLocal = fertility / forest / rock conforme o tipo.
  - `suggestCapitals`: candidata só se província + vizinhas somam ≥ 1 veio de cada tipo (substitui o critério de floresta/rocha por perto). Fallback de "nunca vazio" mantido.

- [ ] **Step 1: Testes** (mundo 860 compartilhado):
  - toda província com `cells > 0` tem `city` em chão seco (`dryAround` via o teste de água do chunk já existente) e dentro dela (`cellProvince`).
  - `lots.length ≤ 4`; cada lote a ≤ 10 tiles da cidade, seco, ≥ 4 tiles dos outros e da cidade.
  - `veins.length ≤ 4`; cada veio a ≥ 20 tiles da cidade, dentro da província, seco, riqueza em [0.5, 1.5]; madeira em célula de floresta, carvão/ferro em montanha ou colina, grãos em terra fértil.
  - pelo menos 60% das províncias têm ≥ 1 veio; existem veios dos quatro tipos no mundo.
  - toda capital sugerida tem os quatro tipos na província + vizinhas (para 860, 1, 2, 7).
  - determinismo: mesma semente → mesmos `veins`.
- [ ] **Step 2:** `npx vitest run tests/provinces.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** PASS; suíte inteira verde (`slots`/`sites` intocados); `tsc` limpo.
- [ ] **Step 5:** Commit `feat: cities, factory lots and resource veins in provinces`.

### Task 2: Economia industrial na simulação

**Files:**
- Modify: `src/sim/balance.ts`, `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/economy.ts`, `src/sim/tick.ts`, `src/sim/troops.ts`, `src/sim/battle.ts`, `src/sim/fortress.ts`, `src/worldgen/provinces.ts` (remove `slots`/`sites`)
- Rewrite: `tests/sim.test.ts`; adapt `tests/troops.test.ts`, `tests/fortress.test.ts`, `tests/battle.test.ts`, `tests/troopworld.ts`, `tests/provinces.test.ts`

**Interfaces:**
- Consumes: Task 1 `Province.city/lots/veins`.
- Produces:
  - `balance.ts`: `type Res = { money; grain; wood; coal; iron; steel; arms }` (números); `RES_KEYS`; `type BuildingType = 'farm' | 'sawmill' | 'coal_mine' | 'iron_mine' | 'steelworks' | 'arms_factory' | 'market' | 'garrison'`;
    `BUILDINGS: Record<BuildingType, { name; place: 'vein' | 'lot'; vein?: VeinKind; cost: Partial<Res>; months; out: number[] /* por nível */; uses?: Partial<Res> /* por unidade produzida */ }>` com os valores do spec (custos N1: fazenda 30 money/10 wood; serraria 30/10; minas 40 money/15 wood; siderúrgica 60 money/20 wood/10 iron; fábrica de armas 60/20 wood/10 steel; mercado 50 money/20 wood; guarnição 60 money/30 wood/10 iron);
    `CITY = { tax: [0, 4, 8, 14], grain: [0, 1, 2, 4], lots: [0, 1, 2, 4], cost: [{}, {}, { money: 80, wood: 40, iron: 20 }, { money: 200, iron: 60, steel: 30 }], months: [0, 0, 4, 8], quota3: 3, capitalTax: 10 }`;
    `START_BASE: Res` (calibrado na Task 5; início: money 60, grain 40, wood 80, coal 20, iron 40, steel 0, arms 20); `GRAIN_SHORT_TAX = 0.5`; `STALL_WARN_MONTHS = 6`; `COLONIZE` com custos em `money`/`wood`.
  - `state.ts`: `GameState` troca `buildings` por `city: ({ level: number; remaining: number } | null)[]`, `lots: (Building | null)[][]` (tamanho = `pm.provinces[i].lots.length`), `veins: (Building | null)[][]`; ganha `grainShort: boolean`, `stallWarned: Record<string, number>` (chave `"id:lot"` → mês do último aviso). `activeLevel` vale também para a cidade (`cityLevel(s, id)`).
  - `type Place = { lot: number } | { vein: number }`.
  - `commands.ts`: `checkBuild/build(s, pm, id, place, type)`; `checkUpgrade/upgrade(s, pm, id, place)` com cota (N2: 3 do tipo no reino com nível ≥ 1; N3: 3 com nível ≥ 2; motivo `"<Nome plural>: n/3"`); `checkUpgradeCity/upgradeCity(s, pm, id)` (cota da metrópole: `"Cidades nível 2: n/3"`); `checkRecruit/recruit(s, pm, id, lot, type)`; `chooseCapital` funda cidade nível 2 e aplica `startingStock(pm, capital)`. Recusas novas: `"Este veio é de <recurso>"`, `"Lote só aceita fábrica"`, `"Veio só aceita <prédio>"`, `"Libera com a cidade nível N"`, `"Lugar ocupado"`, `"Lugar inválido"`.
  - `economy.ts`: `startingStock(pm, capital): Res` (base × riqueza média dos veios do recurso na capital + vizinhas, piso 0.5; money × fertilidade da capital; steel 0; arms base); `runMonth(s, pm, apply: boolean): { net: Res; lines: Record<keyof Res, [string, number][]>; stalled: { province: number; lot: number; missing: keyof Res }[] }` executando a ordem do spec (impostos → veios → siderúrgicas → fábricas de armas → grãos → manutenção) sobre uma cópia do estoque; com `apply` grava `res`, `grainShort` e os avisos (`"Sem grãos: impostos pela metade"`, `"<Fábrica> parada em <província>: falta <recurso>"` no máximo a cada 6 meses por lote). `monthlyIncome(s, pm)` = `runMonth(s, pm, false).net` (mantido para quem usa). `troopCap` conta guarnições em lotes.
  - `tick.ts`: obras em lotes, veios e cidade; virada do mês chama `runMonth(s, pm, true)` antes da dispersão por falta de dinheiro (`res.money < 0`); colonização concluída → `city = { level: 1, remaining: 0 }`; evento `"Cidade de <nome> chegou ao nível N"`.
  - Tropas (nomes atuais por enquanto): custo de recrutar em `money`/`wood` provisório; recrutas nascem no lote da guarnição; `sites[0]` vira `city` em fuga, fortaleza e colonização.

- [ ] **Step 1: Testes** (`tests/sim.test.ts` reescrito sobre um `ProvinceMap` sintético com cidade, 4 lotes e 4 veios — um de cada tipo):
  - início: capital nível 2; `startingStock` = base × riqueza média (dois mapas com riquezas diferentes dão estoques na mesma proporção; sem veio do tipo → 0.5×); money × fertilidade.
  - impostos: nível 2 = 8 × fertilidade + 10 da capital; mercado N1 +25%; sem grãos no mês anterior → metade.
  - veios: fazenda N1 com riqueza 1.2 → +4.8 grãos/mês; minas e serraria idem.
  - siderúrgica: com 10 ferro e 3 carvão → produz 1 aço (consome 2+2), não deixa negativo; fábrica de armas usa o aço do mesmo mês.
  - grãos: cidade nível 2 consome 2; estoque 0 → `grainShort` e aviso; volta ao normal quando há grãos.
  - lotes por nível: nível 1 só o lote 0; `checkBuild` no lote 1 → `"Libera com a cidade nível 2"`; cidade em obra de melhoria ainda vale o nível anterior.
  - lugar: veio de ferro recusa fazenda (`"Veio só aceita Mina de ferro"`); lote recusa fazenda (`"Lote só aceita fábrica"`); lugar ocupado; índice inválido.
  - cotas: fazenda N1→N2 com 2 fazendas no reino → `"Fazendas: 2/3"`; com 3 aceita; N3 idem; cidade nível 3 com 2 cidades nível 2 → `"Cidades nível 2: 2/3"`.
  - obras andam no tempo; melhoria rende no nível anterior até terminar.
  - colonização em money/wood; ao concluir, cidade nível 1, lotes e veios vazios.
  - `runMonth(s, pm, false)` não muda o estado e dá o mesmo `net` que a aplicação real.
  - aviso de fábrica parada no máximo uma vez a cada 6 meses.
  - JSON ida e volta.
  - Adaptar `troops/battle/fortress` aos lugares novos (guarnição num lote; fortaleza e fuga na `city`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar; remover `slots`/`sites` de `Province` e de `suggestCapitals` (fallback usa `lots.length > 0`).
- [ ] **Step 4:** testes da simulação e da geração verdes (critério das Global Constraints).
- [ ] **Step 5:** Commit `feat: industrial economy in the simulation`.

### Task 3: Exército de 1760

**Files:**
- Modify: `src/sim/balance.ts`, `src/sim/battle.ts`, `src/sim/fortress.ts`, `src/sim/commands.ts`, `src/sim/economy.ts`
- Test: `tests/troops.test.ts`, `tests/battle.test.ts`, `tests/fortress.test.ts`

**Interfaces:**
- Produces: `TroopType = 'line' | 'artillery' | 'cavalry'`; `TROOPS` com `cost: Partial<Res>` e `upkeep: Partial<Res>`:
  - line: N1, 20 homens, ataque 1.0, defesa 1.2, 150 tiles/mês, custo 30 money + 10 grain + 10 arms, manutenção 1 money + 1 grain, 2 meses.
  - artillery: N2, 12 homens, ataque 1.4, defesa 0.6, 100 tiles/mês, custo 50 money + 15 arms + 10 steel, manutenção 1.5 money, 3 meses.
  - cavalry: N3, 12 homens, ataque 1.6, defesa 1.0, 240 tiles/mês, custo 70 money + 10 grain + 10 arms + 10 iron, manutenção 2 money + 1.5 grain, 3 meses.
  - `BATTLE.counter` vale para line→cavalry, cavalry→artillery e artillery→line; `archerOpening` vira `openingFire` (só artilharia fere nesse início).
  - Fortalezas: `line`, e `artillery` no terço distante (mesma regra da contagem atual).
  - Manutenção das tropas sai em money e grain no `runMonth` (linha "Tropas").
- [ ] **Step 1: Testes:** recrutar infantaria cobra armas e grãos; artilharia exige Guarnição N2 e aço (`"Falta 10 de aço"`); cavalaria exige N3 e ferro; infantaria vence cavalaria; cavalaria vence artilharia; artilharia fere antes do contato e a infantaria não; manutenção desconta money e grain; fortes com `line`/`artillery`; demais testes de batalha e fortaleza com os nomes novos.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** critério das Global Constraints verde.
- [ ] **Step 5:** Commit `feat: 1760 army (line infantry, artillery, cavalry)`.

### Task 4: Mapa e interface da economia nova

**Files:**
- Modify: `src/client/map/markers.ts`, `src/client/map/pick.ts`, `src/client/panel.ts`, `src/client/hud.ts`, `src/main.ts`, `index.html`
- Test: `tests/mappick.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `pick.ts`: `pickAt` ganha `{ kind: 'lot'; province; lot }` e `{ kind: 'vein'; province; vein }` (raio 10 px), na ordem tropa > cidade > lote > veio > fortaleza > selo > província; `cityAt` usa `Province.city` quando `s.city[id]`.
  - `markers.ts`: veios a partir de 0,35 px/tile (ícone por tipo + riqueza ⅰ/ⅱ/ⅲ; vazio com círculo tracejado; construído com círculo na cor do dono); lotes a partir de 1 px/tile (quadrado tracejado; ocupado = ícone da fábrica; bloqueado pelo nível = apagado com cadeado); cidade com um ponto por nível; tropas ✕ line, ponto artillery, barra cavalry. `markersKey` inclui `city`, `lots` e `veins`.
  - `panel.ts`: seções Cidade, Lotes e Veios conforme o spec; `PanelActions` ganha `upgradeCity(id)`, `build(id, place, type)`, `upgrade(id, place)`, `recruit(id, lot, type)`; `renderPanel(..., focus?: { lot?: number; vein?: number })` rola até o lugar; fábrica parada mostra o motivo do último `runMonth`.
  - `hud.ts`/`index.html`: barra com os sete recursos (ícone, valor, variação/mês, negativa em vermelho) e dica com as linhas de `runMonth(...).lines`.
  - `main.ts`: clique em lote/veio seleciona a província com foco; dica dos selos na tela inicial com os veios da província + vizinhas.
- [ ] **Step 1: Testes** (`tests/mappick.test.ts` atualizado): prioridade com lote e veio; `markersKey` muda quando um veio ou lote recebe prédio; continua igual com estado parado.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** `tsc` limpo e suíte inteira verde (exceto `tests/pacing.test.ts`, recalibrado na Task 5 — anotar o resultado).
- [ ] **Step 5:** Commit `feat: veins, lots and the industrial economy on the map and panel`.

### Task 5: Ritmo e calibração

**Files:**
- Modify: `tests/greedy.ts`, `tests/pacing.test.ts`, `src/sim/balance.ts`

**Interfaces:**
- `greedy(pm, maxMonths, map?)` adaptado: coloniza a vizinha com mais veios úteis; constrói nos veios (fazenda, serraria, minas) e nos lotes (siderúrgica, fábrica de armas, mercado, guarnição) conforme o que falta; melhora cidades; com mapa, recruta infantaria e ataca fortes como hoje. Devolve também `firstSteel` (mês do primeiro aço produzido).
- [ ] **Step 1:** `pacing.test.ts` com os alvos do spec, em meses a 1× (1 h = 360 meses): 1ª colonização 3–8; primeiro aço 180–540 (30–90 min); 1ª fortaleza 90–240 (15–40 min); 20 províncias 360–1440 (1–4 h).
- [ ] **Step 2:** rodar, anotar os números por semente.
- [ ] **Step 3:** ajustar só `balance.ts` (`START_BASE`, custos, produção, `COLONIZE`) até todos os alvos passarem nas 4 sementes; registrar antes/depois no commit.
- [ ] **Step 4:** suíte inteira verde.
- [ ] **Step 5:** Commit `feat: pacing for the industrial economy`.

### Task 6: Verificação no navegador e fechamento

- [ ] **Step 1:** Navegador sem GPU (CDP, semente 860): veios visíveis na tela inicial e na dica do selo; fundar capital; construir fazenda, serraria, minas de carvão e ferro; siderúrgica e fábrica de armas nos lotes; avançar a 8× e ver aço e armas subindo na barra (dica com as linhas); recrutar infantaria e tomar um forte; clicar num lote bloqueado e ver o motivo. Capturas.
- [ ] **Step 2:** `npx vitest run` e `npm run build` limpos; commit de ajustes `fix: …`.
