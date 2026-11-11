import { describe, expect, test } from 'vitest';
import type { TroopType } from '../src/sim/balance';
import { moveArmies } from '../src/sim/commands';
import type { GameState } from '../src/sim/state';
import { spawnArmy, men } from '../src/sim/armies';
import { game, run, world } from './troopworld';

const { grid } = world;
/** Jogador (dono 0) em (x, y) contra o dono 1 a 4 tiles a leste; roda até a batalha acabar. */
function fight(mine: TroopType[], theirs: TroopType[], x = 200, y = 20, speed = 1, dx = 4) {
  const s = game(1, true), unit = speed === 1 ? 0.02 : 0.08;
  const a = mine.map((t, i) => spawnArmy(s, 0, [t], x, y + i * 4)), b = theirs.map((t, i) => spawnArmy(s, 1, [t], x + dx, y + i * 4));
  run(s, unit, speed);
  expect(s.battles.length).toBe(1);
  let months = unit;
  while (s.battles.length && months < 5) { run(s, unit, speed); months += unit; }
  const alive = (ts: typeof a) => ts.filter(t => s.armies.includes(t) && s.clock >= t.routedUntil);
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
    const s = game(1, true), a = spawnArmy(s, 0, ['artillery'], 200, 20), b = spawnArmy(s, 1, ['line'], 204, 20);
    run(s, 0.08);
    expect(men(b)).toBeLessThan(20);
    expect(men(a)).toBe(12);
    const s2 = game(1, true), c = spawnArmy(s2, 0, ['line'], 200, 20), d = spawnArmy(s2, 1, ['line'], 204, 20);
    run(s2, 0.08);
    expect(men(c)).toBe(20);
    expect(men(d)).toBeCloseTo(20 - 0.08, 6); // só o desgaste: a nação inimiga dos testes não tem rede
  });
  test('artilharia é lenta: 100 tiles por mês', () => {
    const s = game(2), t = spawnArmy(s, 0, ['artillery'], 10, 102);
    moveArmies(s, world.grid, [t.id], 50, 102);
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
    // o jogador defende: em x=34 (célula 8, floresta) ou em campo aberto; o inimigo ataca de fora
    const open = fight(['line'], ['line'], 100, 100), forest = fight(['line'], ['line'], 34, 100);
    expect(grid.cover[25 * 64 + 8]).toBe(1);
    expect(men(forest.a[0])).toBeGreaterThan(men(open.a[0]) + 1);
  });
  test('quem luta de dentro do rio causa menos dano', () => {
    const dry = fight(['line'], ['line'], 100, 100), river = fight(['line'], ['line'], 126, 100); // inimigo em x=130, célula 32 (rio)
    expect(men(river.a[0])).toBeGreaterThan(men(dry.a[0]) + 1);
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
    expect(r.s.armies).toContain(t);
    expect(t.routedUntil).toBeGreaterThan(r.s.clock);
    expect(men(t)).toBeGreaterThan(10); // moral quebra antes do extermínio
    expect(texts(r.s)).toContain('Derrota perto de P0');
    expect(moveArmies(r.s, grid, [t.id], 100, 100)).toEqual({ ok: false, reason: 'Exército em fuga' });
    run(r.s, 0.6);
    expect(Math.hypot(t.x - 60, t.y - 80)).toBeLessThan(4); // cidade da província 0
    expect(moveArmies(r.s, grid, [t.id], 100, 100)).toEqual({ ok: true });
    expect(t.morale).toBe(1);
  });
  test('tropa com menos de 3 soldados se dispersa', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 200, 20);
    t.battalions[0].soldiers = 3.2;
    spawnArmy(s, 1, ['line'], 204, 20);
    run(s, 0.2);
    expect(s.armies).not.toContain(t);
    expect(texts(s)).toContain('Batalhão de infantaria de linha perdido');
  });
  test('fortaleza (dono −1) não foge: luta até cair', () => {
    const s = game(), f = spawnArmy(s, -1, ['line'], 204, 20, 1);
    for (let i = 0; i < 4; i++) spawnArmy(s, 0, ['line'], 200, 12 + i * 4);
    run(s, 2);
    expect(s.armies).not.toContain(f);
    expect(f.routedUntil).toBe(0);
    expect(s.battles).toEqual([]);
  });
  test('tropa com ordem sai da batalha ao se afastar', () => {
    const s = game(1, true), t = spawnArmy(s, 0, ['line'], 200, 20);
    spawnArmy(s, -1, ['line'], 204, 20, 1);
    run(s, 0.04);
    expect(s.battles.length).toBe(1);
    expect(moveArmies(s, grid, [t.id], 240, 100)).toEqual({ ok: true });
    run(s, 0.3);
    expect(s.battles).toEqual([]);
    expect(t.routedUntil).toBe(0);
    const left = men(t);
    run(s, 0.2);
    expect(men(t)).toBeGreaterThanOrEqual(left); // fora da batalha não perde mais ninguém (em território seu, repõe)
  });
  test('tropas vizinhas (até 20 tiles) entram na batalha; as distantes não', () => {
    const s = game(), near = spawnArmy(s, 0, ['line'], 190, 30), far = spawnArmy(s, 0, ['line'], 150, 20);
    spawnArmy(s, 0, ['line'], 200, 20); spawnArmy(s, 1, ['line'], 204, 20);
    run(s, 0.04);
    expect(s.battles[0].armyIds).toContain(near.id);
    expect(s.battles[0].armyIds).not.toContain(far.id);
  });
});

describe('determinismo', () => {
  test('mesmo resultado a 1× e a 8×', () => {
    // mesmo tempo total nos dois (depois da batalha a reposição continua: comparar no mesmo instante)
    const go = (speed: number) => {
      const s = game(1, true), ts = [spawnArmy(s, 0, ['line'], 200, 20), spawnArmy(s, 0, ['artillery'], 200, 24), spawnArmy(s, 1, ['cavalry'], 204, 20), spawnArmy(s, 1, ['line'], 204, 24)];
      run(s, 1.6, speed);
      return ts.map(t => +men(t).toFixed(6));
    };
    expect(go(8)).toEqual(go(1));
  });
  test('batalha continua igual depois de ida e volta pelo JSON', () => {
    const mk = () => { const s = game(); spawnArmy(s, 0, ['line'], 200, 20); spawnArmy(s, 0, ['artillery'], 200, 24); spawnArmy(s, 1, ['cavalry'], 204, 20); run(s, 0.1); return s; };
    const a = mk(), b = JSON.parse(JSON.stringify(mk())) as GameState;
    expect(b).toEqual(a);
    run(a, 1); run(b, 1);
    expect(b).toEqual(a);
  });
});
