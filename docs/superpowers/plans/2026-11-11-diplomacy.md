# Diplomacia (ciclo 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paz com termos, trégua, não agressão, comércio e aliança defensiva entre nações, com relação de memória, IA que aceita/recusa/propõe e cartas para o jogador.

**Architecture:** Estado novo (`relations`, `pacts`, `letters`, `pending`) em `state.ts`; regras em `src/sim/diplomacy.ts` (propor, avaliar, assinar, virada do mês); `war.ts` e `conquest.ts` passam a consultar pactos e a mexer na relação. Cliente ganha caixa de cartas e botões de proposta no painel da nação.

**Tech Stack:** TypeScript, Canvas 2D/DOM, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-diplomacy-design.md`

## Global Constraints
- `balance.ts`: `DIPLO = { months: 60, letterMonths: 3, tradeMissMax: 3, maxQty: 999, monthly: { border: -1, war: -3, trade: 2, alliance: 2, pact: 1, commonFoe: 1 }, events: { war: -30, province: -20, betrayVictim: -50, betrayOthers: -25, leave: -30, tradeBroken: -10, peace: 10 }, labels: [[50, 'amistosa'], [15, 'cordial'], [-15, 'neutra'], [-50, 'fria']] }` (abaixo de −50: hostil; rótulo é o primeiro com `v >= limite`, exceto neutra que é `v > -15`), `PRICE = { money: 1, grain: 1, wood: 1, coal: 2, iron: 2, steel: 5, arms: 4 }`, `AI_DIPLO = { strongRatio: 1.5, tradeRatio: 0.9, tradeRatioIndustrial: 0.8, shortBonus: 1.2, allyRelation: 40, allyPropose: 50, peaceLosing: -0.2, peaceMonths: 48, peaceWinning: 0.2, exhaustionPer12: 0.1, provinceWeight: 0.1, indemnityShare: 0.3, napBent: { industrial: 25, expansionist: 0, militarist: -20 }, napInterest: 20, expansionistEvery: 12 }`.
- Textos de recusa exatamente como na spec.
- Estado serializável; simulação pura; determinismo 1× = 8×; sorteios só via `makeRng(subSeed(s.seed, ...))`.
- `events` é o feed do jogador: entre rivais só traições, pazes e alianças arrastadas.

## Review Focus
1. Nação eliminada com pactos, cartas ou pendências → tudo dela some (pactos, cartas, pendências), sem exceção na virada. (Task 3)
2. Paz que cede uma província que deixou de estar ocupada entre a proposta e o aceite (carta aceita depois) → recusa com motivo, nada muda. (Task 2)
3. Jogador aceita carta de comércio sem ter o recurso → o acordo é assinado e a falta segue a regra (entrega o que tem; 3 meses rompem). (Task 3)
4. Aliança encadeada: A aliado de B, B aliado de C; X declara a A → só B entra (aliança defensiva não se propaga para C). (Task 1)
5. Duas propostas iguais do jogador ao mesmo rival no mesmo mês → a segunda recusa ("Proposta já enviada"). (Task 2)

---

### Task 1: Relação, pactos no estado e guerra com pactos

**Files:** Create `src/sim/diplomacy.ts`; Modify `src/sim/{state,balance,war,conquest,commands}.ts`; Test `tests/diplomacy.test.ts`

**Interfaces:**
- Produces: tipos `Proposal`, `Pact` e campos de estado da spec (`relations`, `pacts`, `nextPactId`, `letters`, `pending`, `nextLetterId`); `newGame` cria vazios e `foundNation` aumenta `relations` (N×N, zeros).
- `relate(s, a, b, delta)`; `relation(s, a, b)`; `relationLabel(v): string`; `pactBetween(s, a, b, kind): Pact | undefined`; `addPact(s, kind, a, b, until, trade?)`; `endPact(s, p)`.
- `declareWar` (war.ts): aliado → `'Desfaça a aliança antes'`; trégua/não agressão → traição (`betrayVictim`/`betrayOthers`, pacto termina, evento `"A Nação de X traiu o pacto com a Nação de Y"`); comércio do par termina; relação `events.war`; cada aliado do alvo (que não seja quem declara nem já em guerra com ele) entra em guerra com quem declarou, com evento `"A Nação de Z entra na guerra ao lado da Nação de Y"` — sem propagar a alianças do aliado.
- `fall`: novo parâmetro `damage = true`; província tomada de nação → `relate(prev, n, events.province)`.
- `aiWarRoll`: pula vizinho com relação ≥ 15 ou aliado; com trégua/não agressão só Militarista com relação < −50; chance ×2 com relação < −50.

- [ ] **Step 1: Testes** (`tests/diplomacy.test.ts`, mundo `makeRouteWorld` com 3 nações sem IA): relação começa 0, `relate` limita a ±100, rótulos (50 amistosa, 15 cordial, 0 neutra, −15 fria, −50 fria, −51 hostil); declarar guerra: −30; traição com não agressão: −50 vítima, −25 terceiro, pacto some, evento exato; aliado recusado; aliado do alvo arrastado com evento; Review Focus 4 (cadeia não propaga); comércio do par termina na guerra; `fall` sem dano mantém níveis; província tomada −20; `aiWarRoll` não declara com relação 20 nem a aliado; JSON ida e volta.
- [ ] **Step 2–4:** FAIL → implementar → `tsc` e suíte verdes.
- [ ] **Step 5:** commit `feat: relations, pacts and war with pacts`.

### Task 2: Propor, avaliar e assinar

**Files:** Modify `src/sim/diplomacy.ts`; Test `tests/diplomacy.test.ts`

**Interfaces:**
- `checkPropose(s, pm, from, to, p): Result` (recusas da spec + `'Proposta já enviada'` quando há `pending` igual do jogador ao mesmo destino).
- `evaluate(s, pm, n, from, p): Result` (a nota da spec; `advantage(s, pm, a, b): number` exportada).
- `sign(s, pm, a, b, p): Result` — revalida (`checkPropose` sem a regra de pendência); paz: tira guerra do par, trégua `DIPLO.months`, `fall(…, false)` em cada cedida, indenização do `payer` ao outro, relação +10, evento `"Paz entre a Nação de X e a Nação de Y"`; demais: `addPact` (comércio orientado: `a` = quem propôs, `aGives = p.give`, `bGives = p.get`).
- `propose(s, pm, from, to, p): Result` — rival→rival: `evaluate` e `sign` na hora; jogador→rival: `pending` com `answerAt = floor(month) + 1`; rival→jogador: carta (`expires = month + DIPLO.letterMonths`) e evento `"Carta da Nação de X: proposta de <tipo>"`.
- `answerLetter(s, pm, id, accept): Result` (aceitar chama `sign` com from = remetente; recusar só remove); `leaveAlliance(s, n, other): Result` (−30; recusa `'Não há aliança'`).

- [ ] **Step 1: Testes:** cada recusa de `checkPropose`; Review Focus 5; Review Focus 2 (carta de paz aceita depois que a ocupação acabou → `'Província não ocupada por quem a recebe'`); paz: guerra só do par termina, trégua 60, província cedida sem perder nível, indenização paga; avaliação: Industrial aceita NA com relação 0, Militarista 1,5× mais forte recusa (`'Não precisamos disso'`), relação −20 → `'Não confiamos em vocês'`; comércio 0,9 aceito / 0,85 recusado (Industrial aceita 0,85), sem estoque nem produção → `'Não temos esse recurso'`; aliança com relação 30 recusada; paz: perdendo aceita branca, ganhando recusa (`'Estamos vencendo'`), 48 meses de cansaço aceita; carta ao jogador criada; pendência do jogador.
- [ ] **Step 2–4:** FAIL → implementar → verdes.
- [ ] **Step 5:** commit `feat: proposals, evaluation and treaties`.

### Task 3: Virada do mês diplomática

**Files:** Modify `src/sim/diplomacy.ts`, `src/sim/tick.ts`, `src/sim/conquest.ts`; Test `tests/diplomacy.test.ts`

**Interfaces:**
- `diplomacyMonth(s, pm)` chamada em `tick` depois das contas das nações, uma vez por virada: variação mensal (`DIPLO.monthly`) por par vivo; comércio (cada lado entrega o que tem do recurso combinado; se entregou menos que o combinado, `missed++`, senão `missed = 0`; `missed >= tradeMissMax` → rompe com −10 e evento se envolve o jogador); pactos com `until <= month` terminam (evento se envolve o jogador: `"Acordo de <tipo> com a Nação de X venceu"`); cartas com `expires <= month` somem; pendências com `answerAt <= month` são respondidas (`evaluate` → `sign` ou evento `"A Nação de X recusou: <motivo>"`; aceite → `"A Nação de X aceitou <tipo>"`).
- `eliminate` remove pactos, cartas e pendências da nação eliminada (Review Focus 1).

- [ ] **Step 1: Testes:** variação mensal (fronteira −1, guerra −3, comércio +2, aliança +2, NA +1, inimigo comum +1); comércio troca na virada; Review Focus 3 (falta entrega o que tem; 3 meses rompem −10); guerra cancela; pacto vence em 60 meses; carta expira em 3; pendência respondida no mês seguinte (aceite e recusa com motivo); Review Focus 1.
- [ ] **Step 2–4:** FAIL → implementar → verdes.
- [ ] **Step 5:** commit `feat: monthly diplomacy, trade and expiry`.

### Task 4: A IA propõe

**Files:** Modify `src/sim/diplomacy.ts` (ou `src/sim/ai.ts`), `src/sim/armies.ts` (chamada na fase da nação); Test `tests/diplomacy.test.ts`, `tests/aiwar.test.ts`

**Interfaces:**
- `aiDiplomacy(s, pm, n)` na fase mensal da nação (junto de `aiStep`), no máximo uma proposta: paz (vantagem < −0,2, ou ≥ 48 meses de guerra sem vantagem > 0,2: paz branca, ou cedendo o que o outro ocupa se a branca seria recusada); aliança (relação ≥ 50 e inimigo em comum); Industrial: comércio (sobra: produção líquida > 0 e estoque ≥ 3× ela; falta: produção líquida ≤ 0; quantidade = metade da sobra mensal arredondada, mínimo 1; pede o que vale ≥ 0,9× pelo `PRICE`), NA com vizinhos de relação > −15; Expansionista: NA com vizinhos de relação > 0 a cada 12 meses. Escolha determinística entre candidatos.

- [ ] **Step 1: Testes:** Industrial com sobra de ferro e falta de grãos propõe ferro por grãos; quem perde propõe paz; uma proposta por mês no máximo; partida de 600 meses × 4 sementes (aiwar) com comércio e ao menos uma paz na média, sem exceção.
- [ ] **Step 2–4:** FAIL → implementar → verdes (calibrar `AI_DIPLO`/`DIPLO` com ruling).
- [ ] **Step 5:** commit `feat: AI diplomacy proposals`.

### Task 5: Interface da diplomacia

**Files:** Modify `index.html`, `src/main.ts`, `src/client/panel.ts`

**Interfaces:**
- Barra: botão `#letters` "✉ Cartas (n)"; painel de cartas (selo, remetente, texto por tipo, "expira em N meses", Aceitar/Recusar → `answerLetter`).
- Painel da nação: relação ("Cordial · +22"), acordos com tempo restante, botões "Propor paz…", "Não agressão", "Comércio…", "Aliança", "Desfazer aliança", "Declarar guerra" (desabilitados com o motivo de `checkPropose`); confirmação de guerra com aviso de traição.
- Formulários no painel: paz (províncias ocupadas por você a exigir / por eles a ceder, indenização com sentido) e comércio (damos/recebemos recurso e quantidade).
- Lista Nações: relação e ícones 🕊 ⚖ 🤝.
- `PanelActions` ganha `propose(to, p)`, `answer(id, accept)`, `leaveAlliance(n)`, `openLetters()`.

- [ ] **Step 1:** `tsc`, suíte e `npm run build` verdes; commit `feat: letters and diplomacy panels`.

### Task 6: Ritmo e verificação no navegador
- Ritmo (`tests/pacing.test.ts`) e partida (`tests/aiwar.test.ts`) verdes; ajustes só em `balance.ts` com ruling.
- CDP (semente 860): carta da IA aceita e comércio rodando; NA proposta e respondida; paz com província cedida; aliança arrasta aliado; aviso de traição. Capturas.
- [ ] commit de ajustes `feat: diplomacy pacing and polish`.
