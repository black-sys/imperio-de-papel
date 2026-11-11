import { describe, expect, test } from 'vitest';
import { SUPPLY } from '../src/sim/balance';
import { chooseCapital, setSpeed } from '../src/sim/commands';
import { runMonth } from '../src/sim/economy';
import { buildRoute, checkSupply, dropSupply, supplyTroop } from '../src/sim/routes';
import { found, newGame, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { spawnTroop } from '../src/sim/troops';
import { makeRouteWorld } from './troopworld';

const { pm, grid } = makeRouteWorld();
const rich = { money: 9000, grain: 900, wood: 900, coal: 900, iron: 900, steel: 900, arms: 900 };
const game = (): GameState => { const s = newGame(pm); chooseCapital(s, pm, 0); s.res = { ...rich }; return s; };
const run = (s: GameState, months: number, speed = 1) => { setSpeed(s, speed); for (let i = 0; i < Math.round((months * 100) / speed); i++) tick(s, pm, 0.1, grid); };

describe('alcance', () => {
  test('em província sua ligada está abastecida; em terra neutra longe da rede, não', () => {
    const s = game(), near = spawnTroop(s, 0, 'line', 110, 100), far = spawnTroop(s, 0, 'line', 330, 64);
    run(s, 0.05);
    expect(near.supplied).toBe(true);
    expect(far.supplied).toBe(false);
  });
  test('perto de rota ligada também abastece', () => {
    const s = game();
    found(s, 1);
    buildRoute(s, pm, grid, 0, 1);
    run(s, 4);
    const c = s.routes[0].path[Math.floor(s.routes[0].path.length / 2)], x = (c % grid.size) * 4 + 2, y = Math.floor(c / grid.size) * 4 + 2;
    const t = spawnTroop(s, 0, 'line', x, y + 28);
    run(s, 0.05);
    expect(t.supplied).toBe(true);
  });
});

describe('sem suprimento', () => {
  test('perde ~1 homem por mês e não repõe', () => {
    const s = game(), t = spawnTroop(s, 0, 'line', 300, 100);
    run(s, 2);
    expect(t.soldiers).toBeCloseTo(20 - 2 * SUPPLY.attrition, 1);
    expect(s.events.some(e => e.text === 'Infantaria de linha sem suprimento')).toBe(true);
  });
  test('entra na batalha com moral menor: num duelo igual, quem tem suprimento vence', () => {
    const s = game(), a = spawnTroop(s, 0, 'line', 60, 90), b = spawnTroop(s, 1, 'line', 64, 90); // b (outro reino) sem rede: sem suprimento
    run(s, 1);
    expect(s.troops).toContain(a);
    expect(b.routedUntil > 0 || !s.troops.includes(b)).toBe(true);
  });
});

describe('linha de suprimento', () => {
  test('abastece longe, custa por mês e dá vantagem num duelo igual', () => {
    const s = game(), a = spawnTroop(s, 0, 'line', 300, 100), b = spawnTroop(s, 1, 'line', 300, 110);
    expect(checkSupply(s, pm, grid, a.id)).toEqual({ ok: true });
    expect(supplyTroop(s, pm, grid, a.id)).toEqual({ ok: true });
    expect(checkSupply(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Já tem linha de suprimento' });
    const cost = runMonth(s, pm, false).lines.money.find(l => l[0] === 'Linhas de suprimento')![1];
    expect(cost).toBeCloseTo(-(SUPPLY.lineMoney + SUPPLY.linePerTile * a.supply!.path.length * 4), 6);
    b.y = 104; // encosta para a batalha
    run(s, 1);
    expect(a.supplied).toBe(true);
    expect(s.troops).toContain(a);
    expect(b.routedUntil > 0 || !s.troops.includes(b)).toBe(true);
  });
  test('segue a tropa: é retraçada quando ela se afasta', () => {
    const s = game(), t = spawnTroop(s, 0, 'line', 200, 100);
    supplyTroop(s, pm, grid, t.id);
    const end0 = t.supply!.path.at(-1);
    t.x = 250; t.y = 60;
    run(s, 1.2);
    expect(t.supply!.path.at(-1)).not.toBe(end0);
    expect(t.supplied).toBe(true);
  });
  test('tropa hostil sobre a linha corta: volta a perder homens', () => {
    const s = game(), t = spawnTroop(s, 0, 'line', 300, 100);
    supplyTroop(s, pm, grid, t.id);
    const c = t.supply!.path[Math.floor(t.supply!.path.length / 2)];
    spawnTroop(s, -1, 'line', (c % grid.size) * 4 + 2, Math.floor(c / grid.size) * 4 + 2, 9);
    run(s, 1);
    expect(t.supplied).toBe(false);
    expect(t.soldiers).toBeLessThan(20);
  });
  test('recusas e cortar a linha', () => {
    const s = game(), t = spawnTroop(s, 0, 'line', 300, 100);
    t.routedUntil = 5;
    expect(checkSupply(s, pm, grid, t.id)).toEqual({ ok: false, reason: 'Tropa em fuga' });
    t.routedUntil = 0;
    supplyTroop(s, pm, grid, t.id);
    expect(dropSupply(s, t.id)).toEqual({ ok: true });
    expect(t.supply).toBeNull();
    expect(checkSupply(s, pm, grid, 999).ok).toBe(false);
  });
  test('mesmo resultado a 1× e a 8×; JSON', () => {
    const go = (speed: number) => {
      const s = game(), t = spawnTroop(s, 0, 'line', 300, 100);
      supplyTroop(s, pm, grid, t.id);
      run(s, 2, speed);
      return [t.soldiers, t.supply!.path.length, s.res.money].map(v => +v.toFixed(6));
    };
    expect(go(8)).toEqual(go(1));
    const s = game(), t = spawnTroop(s, 0, 'line', 300, 100);
    supplyTroop(s, pm, grid, t.id);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
