import { describe, expect, test } from 'vitest';
import type { TroopType } from '../src/sim/balance';
import { moveTroops } from '../src/sim/commands';
import type { GameState } from '../src/sim/state';
import { spawnTroop } from '../src/sim/troops';
import { game, run, world } from './troopworld';

const { grid } = world;
/** Jogador (dono 0) em (x, y) contra o dono 1 a 4 tiles a leste; roda até a batalha acabar. */
function fight(mine: TroopType[], theirs: TroopType[], x = 200, y = 20, speed = 1, dx = 4) {
  const s = game(), unit = speed === 1 ? 0.02 : 0.08;
  const a = mine.map((t, i) => spawnTroop(s, 0, t, x, y + i * 4)), b = theirs.map((t, i) => spawnTroop(s, 1, t, x + dx, y + i * 4));
  run(s, unit, speed);
  expect(s.battles.length).toBe(1);
  let months = unit;
  while (s.battles.length && months < 5) { run(s, unit, speed); months += unit; }
  const alive = (ts: typeof a) => ts.filter(t => s.troops.includes(t) && s.clock >= t.routedUntil);
  return { s, a, b, months, mine: alive(a), theirs: alive(b) };
}
const texts = (s: GameState) => s.events.map(e => e.text);

describe('vantagens', () => {
  test('infantaria de linha vence cavalaria', () => {
    const r = fight(['line'], ['cavalry']);
    expect(r.mine.length).toBe(1);
    expect(r.theirs.length).toBe(0);
    expect(texts(r.s)).toContain('Vitória perto de P1');
  });
  test('cavalaria vence artilharia', () => {
    const r = fight(['cavalry'], ['artillery']);
    expect(r.mine.length).toBe(1);
    expect(r.theirs.length).toBe(0);
  });
  test('artilharia atira antes do contato; a infantaria não', () => {
    const s = game(), a = spawnTroop(s, 0, 'artillery', 200, 20), b = spawnTroop(s, 1, 'line', 204, 20);
    run(s, 0.08);
    expect(b.soldiers).toBeLessThan(20);
    expect(a.soldiers).toBe(12);
    const s2 = game(), c = spawnTroop(s2, 0, 'line', 200, 20), d = spawnTroop(s2, 1, 'line', 204, 20);
    run(s2, 0.08);
    expect([c.soldiers, d.soldiers]).toEqual([20, 20]);
  });
  test('artilharia é lenta: 100 tiles por mês', () => {
    const s = game(2), t = spawnTroop(s, 0, 'artillery', 10, 102);
    moveTroops(s, world.grid, [t.id], 50, 102);
    run(s, 0.3);
    expect(t.path.length).toBeGreaterThan(0); // 40 tiles levam 0.4 mês
    run(s, 0.15);
    expect(t.path.length).toBe(0);
  });
  test('o lado maior vence', () => {
    const r = fight(['line', 'line'], ['line']);
    expect(r.mine.length).toBe(2);
    expect(r.theirs.length).toBe(0);
  });
});

describe('terreno', () => {
  test('defensor na floresta perde menos', () => {
    const open = fight(['line'], ['line'], 100, 100), forest = fight(['line'], ['line'], 38, 100, 1, -4); // inimigo em x=34 (célula 8, floresta); jogador fora dela
    expect(grid.cover[25 * 64 + 8]).toBe(1);
    expect(forest.b[0].soldiers).toBeGreaterThan(open.b[0].soldiers + 1);
  });
  test('quem luta de dentro do rio causa menos dano', () => {
    const dry = fight(['line'], ['line'], 100, 100), river = fight(['line'], ['line'], 130, 100); // jogador na célula 32 (rio)
    expect(river.b[0].soldiers).toBeGreaterThan(dry.b[0].soldiers + 1);
  });
});

describe('moral e fuga', () => {
  test('batalha entre iguais dura de 0.3 a 0.6 mês', () => {
    const r = fight(['line'], ['line']);
    expect(r.months).toBeGreaterThanOrEqual(0.3);
    expect(r.months).toBeLessThanOrEqual(0.6);
  });
  test('o perdedor foge para a sua província e ignora ordens', () => {
    const r = fight(['line'], ['line', 'line'], 100, 100), t = r.a[0];
    expect(r.s.troops).toContain(t);
    expect(t.routedUntil).toBeGreaterThan(r.s.clock);
    expect(t.soldiers).toBeGreaterThan(10); // moral quebra antes do extermínio
    expect(texts(r.s)).toContain('Derrota perto de P0');
    expect(moveTroops(r.s, grid, [t.id], 100, 100)).toEqual({ ok: false, reason: 'Tropa em fuga' });
    run(r.s, 0.6);
    expect(Math.hypot(t.x - 60, t.y - 80)).toBeLessThan(4); // cidade da província 0
    expect(moveTroops(r.s, grid, [t.id], 100, 100)).toEqual({ ok: true });
    expect(t.morale).toBe(1);
  });
  test('tropa com menos de 3 soldados se dispersa', () => {
    const s = game(), t = spawnTroop(s, 0, 'line', 200, 20);
    t.soldiers = 3.2;
    spawnTroop(s, 1, 'line', 204, 20);
    run(s, 0.2);
    expect(s.troops).not.toContain(t);
    expect(texts(s)).toContain('Infantaria de linha dispersa');
  });
  test('fortaleza (dono −1) não foge: luta até cair', () => {
    const s = game(), f = spawnTroop(s, -1, 'line', 204, 20, 1);
    for (let i = 0; i < 4; i++) spawnTroop(s, 0, 'line', 200, 12 + i * 4);
    run(s, 2);
    expect(s.troops).not.toContain(f);
    expect(f.routedUntil).toBe(0);
    expect(s.battles).toEqual([]);
  });
  test('tropa com ordem sai da batalha ao se afastar', () => {
    const s = game(), t = spawnTroop(s, 0, 'line', 200, 20);
    spawnTroop(s, -1, 'line', 204, 20, 1);
    run(s, 0.04);
    expect(s.battles.length).toBe(1);
    expect(moveTroops(s, grid, [t.id], 240, 100)).toEqual({ ok: true });
    run(s, 0.3);
    expect(s.battles).toEqual([]);
    expect(t.routedUntil).toBe(0);
    const left = t.soldiers;
    run(s, 0.2);
    expect(t.soldiers).toBe(left);
  });
  test('tropas vizinhas (até 20 tiles) entram na batalha; as distantes não', () => {
    const s = game(), near = spawnTroop(s, 0, 'line', 190, 30), far = spawnTroop(s, 0, 'line', 150, 20);
    spawnTroop(s, 0, 'line', 200, 20); spawnTroop(s, 1, 'line', 204, 20);
    run(s, 0.04);
    expect(s.battles[0].troopIds).toContain(near.id);
    expect(s.battles[0].troopIds).not.toContain(far.id);
  });
});

describe('determinismo', () => {
  const sig = (r: ReturnType<typeof fight>) => [...r.a, ...r.b].map(t => +t.soldiers.toFixed(6));
  test('mesmo resultado a 1× e a 8×', () => {
    expect(sig(fight(['line', 'artillery'], ['cavalry', 'line'], 200, 20, 8))).toEqual(sig(fight(['line', 'artillery'], ['cavalry', 'line'])));
  });
  test('batalha continua igual depois de ida e volta pelo JSON', () => {
    const mk = () => { const s = game(); spawnTroop(s, 0, 'line', 200, 20); spawnTroop(s, 0, 'artillery', 200, 24); spawnTroop(s, 1, 'cavalry', 204, 20); run(s, 0.1); return s; };
    const a = mk(), b = JSON.parse(JSON.stringify(mk())) as GameState;
    expect(b).toEqual(a);
    run(a, 1); run(b, 1);
    expect(b).toEqual(a);
  });
});
