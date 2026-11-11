# Estabilidade civil (ciclo 6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabilidade por província com greves, incêndios e revoltas; leis de emergência e repressão; manchetes de jornal; rivais com as mesmas regras.

**Architecture:** Estado novo por província e por nação em `state.ts`; regras em `src/sim/stability.ts` chamadas na virada do mês depois da diplomacia; `runMonth` aplica leis, greves e revoltas; a IA decide leis e repressão na fase mensal. Cliente ganha faixa de manchete, Jornal, painel de Leis e estabilidade no painel da província.

**Tech Stack:** TypeScript, Canvas 2D/DOM, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-stability-design.md`

## Global Constraints
- `balance.ts`: `STAB = { start: 70, conquered: 30, base: 60, approach: 0.1, mod: { famine: -25, war: -5, longWarPer12: -1, longWarMax: -15, factory: -5, city2: -5, city3: -10, disconnected: -15, conquered: -20, conqueredMonths: 60, garrison: 10, garrisonPerLevel: 5, market: 5, capital: 10, peace: 5, bread: 10, ration: -5, martial: 15, resentment: -5 } }`; `UNREST = { strike: { below: 40, chance: 0.1, months: 2 }, fire: { below: 30, chance: 0.05 }, revolt: { below: 15, chance: 0.1, months: 3, relief: 10 } }`; `LAWS = { cooldown: 12, bread: { cost: 50, perCity: 2 }, ration: { grain: 0.5 }, shorter: { output: 0.75 }, martial: { cost: 30, tax: 0.8 } }`; `REPRESS = { below: 40, gain: 20, resentMonths: 60, men: 2, every: 12 }`; `HEADLINES = 30`.
- Textos de recusa e manchetes exatamente como na spec/plano.
- Estado serializável; simulação pura; determinismo 1× = 8×; sorteios só via `makeRng(subSeed(s.seed, ...))`.

## Review Focus
1. Revolta numa província que muda de dono (conquistada) antes de resolver → a revolta some junto, rebeldes continuam como exército neutro, sem exceção. (Task 2)
2. Greve numa província cuja fábrica é destruída por incêndio no mesmo mês → sem exceção; greve termina normalmente. (Task 2)
3. Nação eliminada com leis em vigor → nada cobra dela (Pão e circo) depois. (Task 3)
4. Reprimir com um exército que está numa batalha → recusa (`'Exército em batalha'`). (Task 3)
5. Pacing: estabilidade não trava a expansão do jogador automático (alvos de ritmo intactos). (Task 4)

---

### Task 1: Estabilidade, alvo e manchetes
**Files:** Create `src/sim/stability.ts`; Modify `src/sim/{state,balance,commands,conquest,tick,war,diplomacy}.ts`; Test `tests/stability.test.ts`
- Estado da spec (`stability`, `conquered`, `resentment`, `repressed`, `strikes`, `revolts`, `headlines`; `Nation.laws`, `Nation.lawCooldown`).
- `stabilityTarget(s, pm, id)` com os fatores (rótulos: "Sem grãos", "Guerra", "Guerra longa", "Fábricas", "Cidade grande", "Desligada", "Conquista recente", "Guarnição", "Mercado", "Capital", "Paz", "Pão e circo", "Racionamento", "Lei marcial", "Ressentimento").
- `stabilityMonth(s, pm)` (nesta task só a aproximação) chamada no `tick` depois de `diplomacyMonth`.
- `found` → 70; `chooseCapital`/`foundNation` → 70; `fall` → 30 e `conquered = mês`; `eliminate` e neutras → 0.
- `headline(s, text)` (máx. `HEADLINES`), usada em `declareWar` ("<NAÇÃO> DECLARA GUERRA À <NAÇÃO>"), paz ("PAZ ENTRE <A> E <B>"), traição ("<A> TRAI O PACTO COM <B>") e eliminação ("<A> DEIXA DE EXISTIR") — em maiúsculas; o evento normal continua no feed.
- [ ] Testes: cada fator isolado; limites; aproximação 10%; ressentimento sobe pela metade; colonizada 70, conquistada 30; manchetes gravadas e limitadas a 30; JSON. FAIL → implementar → verdes → commit `feat: province stability and headlines`.

### Task 2: Greves, incêndios e revoltas
**Files:** Modify `src/sim/stability.ts`, `src/sim/economy.ts`, `src/sim/conquest.ts`; Test `tests/stability.test.ts`
- Sorteios por província com dono na virada; greve (`until = mês + 2`), incêndio (prédio sorteado entre os existentes, −1 nível ou destruído), revolta (rebeldes `spawnArmy(s, -1, n × 'line', cidade, -1, 'Rebeldes de <prov>')`, entrada em `revolts`).
- Resolução: rebeldes sumiram → fim, +10, evento; `mês − since ≥ 3` e não é capital → província neutra (como em `eliminate`, só ela) e rebeldes somem; revolta de província que mudou de dono some (Review Focus 1).
- `runMonth`: greve → fábricas da província 0 (stalled `'strike'`); revolta → província sem impostos e sem produção.
- Manchetes: "GREVE PARALISA <FÁBRICA> DE <PROV>", "INCÊNDIO DESTRÓI <PRÉDIO> EM <PROV>" (ou "DANIFICA"), "REVOLTA EM <PROV>" (do jogador) e "REVOLTA EM <PROV> ABALA A <NAÇÃO>" (rival); greve/incêndio só do jogador.
- [ ] Testes: condições e efeitos de cada evento; tamanho dos rebeldes; determinismo; sem repetir ativo; derrotados +10; 3 meses → neutra; capital nunca; Review Focus 1 e 2. FAIL → implementar → verdes → commit `feat: strikes, fires and revolts`.

### Task 3: Leis e repressão
**Files:** Modify `src/sim/stability.ts`, `src/sim/economy.ts`; Test `tests/stability.test.ts`
- `decree`, `repeal`, `repress` (recusas da spec + `'Exército em batalha'`); Pão e circo cobrado em `stabilityMonth` (cai sem dinheiro com evento "Pão e circo suspenso: falta dinheiro"); `runMonth` aplica Racionamento, Jornada reduzida e Lei marcial; fatores de lei no alvo; manchete ao decretar ("<NAÇÃO> DECRETA <LEI>") só do jogador.
- [ ] Testes: cada efeito; custos; recusas; intervalo de 12 meses; repressão (+20, fim da greve, ressentimento, −2 homens, recusas, Review Focus 4); Review Focus 3. FAIL → implementar → verdes → commit `feat: emergency laws and repression`.

### Task 4: IA e calibração
**Files:** Modify `src/sim/stability.ts` (`aiStability`), `src/sim/ai.ts` (defesa contra rebeldes), `src/sim/armies.ts` (chamada na fase); Test `tests/stability.test.ts`, `tests/aiwar.test.ts`, `tests/pacing.test.ts`
- Regras de IA da spec. Partida de 600 meses × 4 sementes registra revoltas e verifica que nenhuma nação passa > 120 meses com revolta ativa sem parar.
- [ ] Testes: IA decreta Pão e circo com média baixa; defesa manda exército a rebeldes; ritmo verde (Review Focus 5). FAIL → implementar → verdes (calibrar só `balance.ts`, com ruling) → commit `feat: AI handles unrest`.

### Task 5: Interface
**Files:** Modify `index.html`, `src/main.ts`, `src/client/{panel,hud}.ts`, `src/client/map/markers.ts`
- Barra: "☮ média", "Leis (n)", "📰 Jornal"; faixa de manchete com fila; painéis de Leis e Jornal; estabilidade no painel da província (barra, rótulo, fatores, greve, revolta, ressentimento); "Reprimir" no painel do exército; contorno da cidade por estabilidade e ícones de greve/revolta; rebeldes em preto. `markersKey` inclui faixa de estabilidade, greves e revoltas.
- [ ] `tsc`, suíte e build verdes → commit `feat: stability, laws and newspaper UI`.

### Task 6: Navegador e fechamento
- CDP (semente 860): fatores no painel; decretar lei; greve com manchete; reprimir; revolta e rebeldes; Jornal. Teste de desempenho segue verde.
- [ ] commit de ajustes `feat: stability polish`.
