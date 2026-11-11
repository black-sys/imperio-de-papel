import { describe, expect, test } from 'vitest';
import { chooseCapital, setSpeed } from '../src/sim/commands';
import { newGame, type GameState } from '../src/sim/state';
import { spawnArmy } from '../src/sim/armies';
import { eliminate, fall, occupyMonths } from '../src/sim/conquest';
import { addFortress, fortressStep } from '../src/sim/fortress';
import { reinforceStep } from '../src/sim/routes';
import { declareWar } from '../src/sim/war';
import { tick } from '../src/sim/tick';
import { makeRouteWorld } from './troopworld';

const { pm, grid } = makeRouteWorld(); // províncias R0, R1, R2 em faixa; cidades em (60,64), (190,32), (320,64)
const rich = { money: 9000, grain: 900, wood: 900, coal: 900, iron: 900, steel: 900, arms: 900 };
/** Jogador com capital em R0; rival (nação 1) com capital em R2 e dono de R1; em guerra (a menos que `peace`). */
const game = (peace = false): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  s.nations[0].res = { ...rich };
  s.nations.push({ ...s.nations[0], id: 1, name: 'Nação de R2', ai: false, capital: 2, res: { ...rich }, atWar: [] });
  for (const p of [1, 2]) { s.owner[p] = 1; s.city[p] = { level: p === 2 ? 2 : 1, remaining: 0 }; }
  s.routes.push({ id: s.nextRouteId++, owner: 1, a: 1, b: 2, path: [], remaining: 0, cut: false });
  if (!peace) declareWar(s, 0, 1);
  return s;
};
const run = (s: GameState, months: number) => { setSpeed(s, 1); for (let i = 0; i < Math.round(months * 100); i++) tick(s, pm, 0.1, grid); };
const texts = (s: GameState) => s.events.map(e => e.text);

describe('ocupação', () => {
  test('sem Guarnição cai em 1 mês', () => {
    const s = game();
    spawnArmy(s, 0, ['line', 'line'], 140, 110);
    run(s, 0.95);
    expect(s.owner[1]).toBe(1);
    expect(s.occupations).toEqual([{ province: 1, nation: 0, progress: expect.any(Number) }]);
    run(s, 0.1);
    expect(s.owner[1]).toBe(0);
    expect(s.occupations).toEqual([]);
    expect(texts(s)).toContain('R1 tomada da Nação de R2');
  });
  test('tempo: Guarnição N1/N2/N3 = 2/3/4 meses; capital +3', () => {
    const s = game();
    expect(occupyMonths(s, 1)).toBe(1);
    for (const [lv, m] of [[1, 2], [2, 3], [3, 4]]) { s.lots[1][0] = { type: 'garrison', level: lv, remaining: 0 }; expect(occupyMonths(s, 1)).toBe(m); }
    s.lots[1][0] = { type: 'garrison', level: 2, remaining: 1 }; // em melhoria vale o nível anterior
    expect(occupyMonths(s, 1)).toBe(2);
    expect(occupyMonths(s, 2)).toBe(1 + 3);
    s.lots[1][0] = { type: 'garrison', level: 1, remaining: 0 };
    spawnArmy(s, 0, ['line'], 140, 110);
    run(s, 1.9);
    expect(s.owner[1]).toBe(1);
    run(s, 0.15);
    expect(s.owner[1]).toBe(0);
  });
  test('ocupante sai: a contagem some; volta: recomeça do zero', () => {
    const s = game(), a = spawnArmy(s, 0, ['line'], 140, 110);
    run(s, 0.5);
    a.x = 60; a.y = 64; // de volta para casa
    run(s, 0.05);
    expect(s.occupations).toEqual([]);
    a.x = 140; a.y = 110;
    run(s, 0.5);
    expect(s.occupations[0].progress).toBeLessThan(0.6);
    expect(s.owner[1]).toBe(1);
  });
  test('exército do dono presente segura a contagem; em fuga não segura', () => {
    const s = game(), a = spawnArmy(s, 0, ['line'], 140, 110);
    run(s, 0.3);
    const d = spawnArmy(s, 1, ['line'], 240, 110), p = s.occupations[0].progress;
    run(s, 0.3);
    expect(s.occupations[0].progress).toBeCloseTo(p, 9);
    d.routedUntil = s.clock + 5;
    run(s, 0.3);
    expect(s.occupations[0].progress).toBeGreaterThan(p + 0.25);
    void a;
  });
  test('em paz não ocupa', () => {
    const s = game(true);
    spawnArmy(s, 0, ['line'], 140, 110);
    run(s, 1.5);
    expect(s.occupations).toEqual([]);
    expect(s.owner[1]).toBe(1);
  });
});

describe('queda: dano de guerra', () => {
  test('prédios −1 nível, N1 e obras somem, cidade ≥ N1, treino cancelado, rotas rompidas', () => {
    const s = game();
    s.city[1] = { level: 2, remaining: 0 };
    s.lots[1][0] = { type: 'market', level: 2, remaining: 0 };
    s.lots[1][1] = { type: 'steelworks', level: 1, remaining: 0 };
    s.lots[1][2] = { type: 'garrison', level: 3, remaining: 2 };
    s.veins[1][0] = { type: 'farm', level: 1, remaining: 2 };
    s.veins[1][1] = { type: 'sawmill', level: 2, remaining: 0 };
    s.recruiting.push({ province: 1, lot: 2, type: 'line', remaining: 1 });
    fall(s, pm, 1, 0);
    expect(s.owner[1]).toBe(0);
    expect(s.lots[1].slice(0, 3)).toEqual([{ type: 'market', level: 1, remaining: 0 }, null, null]);
    expect(s.veins[1].slice(0, 2)).toEqual([null, { type: 'sawmill', level: 1, remaining: 0 }]);
    expect(s.city[1]).toEqual({ level: 1, remaining: 0 });
    expect(s.recruiting).toEqual([]);
    expect(s.routes).toEqual([]);
    expect(s.connected[1]).toBe(false);
  });
  test('linha de suprimento que saía da cidade caída cai junto, sem cobrar reforço', () => {
    const s = game();
    s.owner[1] = 0; s.connected[1] = true; s.lots[1][0] = { type: 'garrison', level: 1, remaining: 0 };
    const a = spawnArmy(s, 0, ['line'], 300, 100);
    a.battalions[0].soldiers = 10;
    a.supply = { path: [1, 2], from: 1, at: 0, cut: false };
    s.battles.push({ x: 300, y: 100, start: 0, armyIds: [a.id], sides: [{ owner: 0, initial: 20, morale: 1 }] });
    fall(s, pm, 1, 1);
    expect(a.supply).toBeNull();
    const before = { ...s.nations[0].res };
    reinforceStep(s, 1, pm);
    expect(s.nations[0].res).toEqual(before);
    expect(texts(s)).toContain('R1 perdida para a Nação de R2');
  });
});

describe('eliminação e fim', () => {
  test('capital caída: nação acaba, exércitos somem, resto vira neutro; vitória', () => {
    const s = game();
    s.lots[1][0] = { type: 'market', level: 1, remaining: 0 };
    spawnArmy(s, 1, ['line'], 200, 100);
    s.occupations.push({ province: 1, nation: 1, progress: 0.2 });
    fall(s, pm, 2, 0);
    expect(s.nations[1].alive).toBe(false);
    expect(s.armies.some(a => a.owner === 1)).toBe(false);
    expect(s.owner[2]).toBe(0);
    expect([s.owner[1], s.city[1], s.lots[1][0]]).toEqual([-1, null, null]);
    expect(s.routes).toEqual([]);
    expect(s.occupations).toEqual([]);
    expect(s.nations[0].atWar).toEqual([]);
    expect(texts(s)).toContain('A Nação de R2 foi eliminada pela Nação de R0');
    expect(s.result).toBe('victory');
  });
  test('capital do jogador caída: derrota', () => {
    const s = game();
    fall(s, pm, 0, 1);
    expect(s.nations[0].alive).toBe(false);
    expect(s.result).toBe('defeat');
  });
  test('nação eliminada no meio de uma batalha: o passo seguinte segue sem ids velhos', () => {
    const s = game(), mine = spawnArmy(s, 0, ['line', 'line'], 300, 60);
    spawnArmy(s, 1, ['line'], 304, 60);
    run(s, 0.06);
    expect(s.battles.length).toBe(1);
    eliminate(s, pm, 1, 0);
    run(s, 0.06);
    expect(s.battles).toEqual([]);
    expect(s.armies).toContain(mine);
  });
});

test('fortaleza caída vai para a nação com mais homens em volta', () => {
  const s = game();
  s.owner[1] = -1; s.city[1] = null;
  addFortress(s, pm, 1, ['line']);
  spawnArmy(s, 1, ['line', 'line'], 195, 40); spawnArmy(s, 0, ['line'], 185, 40);
  s.armies = s.armies.filter(a => a.owner !== -1); // a guarnição caiu
  fortressStep(s, pm);
  expect(s.owner[1]).toBe(1);
});

test('JSON com ocupações', () => {
  const s = game();
  s.occupations.push({ province: 1, nation: 0, progress: 0.4 });
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});
