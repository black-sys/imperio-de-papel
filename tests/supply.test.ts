import { describe, expect, test } from 'vitest';
import { REINFORCE, SUPPLY } from '../src/sim/balance';
import { chooseCapital, setSpeed } from '../src/sim/commands';
import { runMonth } from '../src/sim/economy';
import { buildRoute, checkSupply, dropSupply, reinforceStep, reinforcing, supplyArmy } from '../src/sim/routes';
import { found, newGame, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { spawnArmy, men } from '../src/sim/armies';
import { addEnemy, makeRouteWorld } from './troopworld';

const { pm, grid } = makeRouteWorld();
const rich = { money: 9000, grain: 900, wood: 900, coal: 900, iron: 900, steel: 900, arms: 900 };
const game = (): GameState => { const s = newGame(pm); chooseCapital(s, pm, 0); addEnemy(s); s.nations[0].res = { ...rich }; return s; };
const run = (s: GameState, months: number, speed = 1) => { setSpeed(s, speed); for (let i = 0; i < Math.round((months * 100) / speed); i++) tick(s, pm, 0.1, grid); };

describe('alcance', () => {
  test('em província sua ligada está abastecida; em terra neutra longe da rede, não', () => {
    const s = game(), near = spawnArmy(s, 0, ['line'], 110, 100), far = spawnArmy(s, 0, ['line'], 330, 64);
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
    const t = spawnArmy(s, 0, ['line'], x, y + 28);
    run(s, 0.05);
    expect(t.supplied).toBe(true);
  });
});

describe('sem suprimento', () => {
  test('perde ~1 homem por mês e não repõe', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 300, 100);
    run(s, 2);
    expect(men(t)).toBeCloseTo(20 - 2 * SUPPLY.attrition, 1);
    expect(s.events.some(e => e.text === `${t.name} sem suprimento`)).toBe(true);
  });
  test('entra na batalha com moral menor: num duelo igual, quem tem suprimento vence', () => {
    const s = game(), a = spawnArmy(s, 0, ['line'], 60, 90), b = spawnArmy(s, 1, ['line'], 64, 90); // b (outro reino) sem rede: sem suprimento
    run(s, 1);
    expect(s.armies).toContain(a);
    expect(b.routedUntil > 0 || !s.armies.includes(b)).toBe(true);
  });
});

describe('linha de suprimento', () => {
  test('abastece longe, custa por mês e dá vantagem num duelo igual', () => {
    const s = game(), a = spawnArmy(s, 0, ['line'], 300, 100), b = spawnArmy(s, 1, ['line'], 300, 110);
    expect(checkSupply(s, pm, grid, a.id)).toEqual({ ok: true });
    expect(supplyArmy(s, pm, grid, a.id)).toEqual({ ok: true });
    expect(checkSupply(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Já tem linha de suprimento' });
    const cost = runMonth(s, pm, false).lines.money.find(l => l[0] === 'Linhas de suprimento')![1];
    expect(cost).toBeCloseTo(-(SUPPLY.lineMoney + SUPPLY.linePerTile * a.supply!.path.length * 4), 6);
    b.y = 104; // encosta para a batalha
    run(s, 1);
    expect(a.supplied).toBe(true);
    expect(s.armies).toContain(a);
    expect(b.routedUntil > 0 || !s.armies.includes(b)).toBe(true);
  });
  test('segue a tropa: é retraçada quando ela se afasta', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 200, 100);
    supplyArmy(s, pm, grid, t.id);
    const end0 = t.supply!.path.at(-1);
    t.x = 250; t.y = 60;
    run(s, 1.2);
    expect(t.supply!.path.at(-1)).not.toBe(end0);
    expect(t.supplied).toBe(true);
  });
  test('tropa hostil sobre a linha corta: volta a perder homens', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 300, 100);
    supplyArmy(s, pm, grid, t.id);
    const c = t.supply!.path[Math.floor(t.supply!.path.length / 2)];
    spawnArmy(s, -1, ['line'], (c % grid.size) * 4 + 2, Math.floor(c / grid.size) * 4 + 2, 9);
    run(s, 1);
    expect(t.supplied).toBe(false);
    expect(men(t)).toBeLessThan(20);
  });
  test('recusas e cortar a linha', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 300, 100);
    t.routedUntil = 5;
    expect(checkSupply(s, pm, grid, t.id)).toEqual({ ok: false, reason: 'Exército em fuga' });
    t.routedUntil = 0;
    supplyArmy(s, pm, grid, t.id);
    expect(dropSupply(s, t.id)).toEqual({ ok: true });
    expect(t.supply).toBeNull();
    expect(checkSupply(s, pm, grid, 999).ok).toBe(false);
  });
  test('mesmo resultado a 1× e a 8×; JSON', () => {
    const go = (speed: number) => {
      const s = game(), t = spawnArmy(s, 0, ['line'], 300, 100);
      supplyArmy(s, pm, grid, t.id);
      run(s, 2, speed);
      return [men(t), t.supply!.path.length, s.nations[0].res.money].map(v => +v.toFixed(6));
    };
    expect(go(8)).toEqual(go(1));
    const s = game(), t = spawnArmy(s, 0, ['line'], 300, 100);
    supplyArmy(s, pm, grid, t.id);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('reforço pela linha', () => {
  /** Exército longe, com linha da capital (Guarnição pronta) e numa batalha registrada. */
  const setup = () => {
    const s = game();
    s.lots[0][0] = { type: 'garrison', level: 1, remaining: 0 };
    const a = spawnArmy(s, 0, ['line', 'line'], 300, 100);
    supplyArmy(s, pm, grid, a.id);
    a.battalions[0].soldiers = 10; a.battalions[1].soldiers = 19;
    s.battles.push({ x: 302, y: 100, start: 0, armyIds: [a.id], sides: [{ owner: 0, initial: 29, morale: 1 }] });
    return { s, a };
  };
  test('repõe 3 homens/mês por batalhão, pagando do estoque', () => {
    const { s, a } = setup(), before = { ...s.nations[0].res };
    expect(reinforcing(s, a)).toBe(0);
    reinforceStep(s, 1);
    expect(a.battalions.map(b => b.soldiers)).toEqual([13, 20]); // o segundo só tinha 1 a repor
    expect(before.money - s.nations[0].res.money).toBeCloseTo(4 * REINFORCE.money, 9);
    expect(before.arms - s.nations[0].res.arms).toBeCloseTo(4 * REINFORCE.arms, 9);
    expect(before.grain - s.nations[0].res.grain).toBeCloseTo(4 * REINFORCE.grain, 9);
  });
  test('sem armas, para com aviso; volta quando há armas', () => {
    const { s, a } = setup();
    s.nations[0].res.arms = 0.5; // dá para 1 homem
    reinforceStep(s, 1);
    expect(a.battalions[0].soldiers + a.battalions[1].soldiers).toBeCloseTo(30, 9);
    expect(s.nations[0].res.arms).toBeGreaterThanOrEqual(0);
    expect(s.events.at(-1)!.text).toBe('Reforço de R0 parado: faltam armas');
    s.nations[0].res.arms = 100;
    reinforceStep(s, 1);
    expect(a.battalions[0].soldiers).toBeGreaterThan(11);
  });
  test('sem reforço: linha cortada, cidade desligada, sem Guarnição ou fora de batalha', () => {
    const { s, a } = setup();
    a.supply!.cut = true;
    expect(reinforcing(s, a)).toBeNull();
    a.supply!.cut = false; s.lots[0][0] = null;
    expect(reinforcing(s, a)).toBeNull();
    s.lots[0][0] = { type: 'garrison', level: 1, remaining: 0 }; s.battles = [];
    expect(reinforcing(s, a)).toBeNull();
  });
  test('batalhão treinado na origem durante a batalha chega pela linha, mesmo passando de 8', () => {
    const { s, a } = setup();
    a.battalions = Array.from({ length: 8 }, () => ({ type: 'line' as const, soldiers: 20 }));
    s.nations[0].res = { money: 1e6, grain: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6, arms: 1e6 };
    s.lots[0][0] = { type: 'garrison', level: 3, remaining: 0 };
    s.lots[0][1] = { type: 'garrison', level: 3, remaining: 0 }; // teto 8 + 4 (a segunda guarnição conta no teto)
    s.recruiting.push({ province: 0, lot: 0, type: 'cavalry', remaining: 0.01 });
    setSpeed(s, 1); tick(s, pm, 0.1, null); // conclui o treino (sem passo de tropas)
    expect(a.battalions.length).toBe(9);
    expect(s.events.some(e => e.text === `Batalhão de cavalaria chegou ao ${a.name} pela linha`)).toBe(true);
  });
});

describe('revisão final', () => {
  test('exército com 9 batalhões que foge separa o excesso quando a fuga acaba', () => {
    const s = game(), a = spawnArmy(s, 0, Array.from({ length: 9 }, () => 'line' as const), 300, 100);
    a.morale = 0.2; a.routedUntil = 0.5;
    run(s, 0.3);
    expect(a.battalions.length).toBe(9); // ainda em fuga
    run(s, 0.4);
    expect(a.battalions.length).toBe(8);
    expect(s.armies.filter(x => x.owner === 0).length).toBe(2);
  });
  test('guarnição de origem em melhoria continua mandando reforço', () => {
    const s = game();
    s.lots[0][0] = { type: 'garrison', level: 2, remaining: 3 }; // N1 → N2 em obra
    const a = spawnArmy(s, 0, ['line'], 300, 100);
    supplyArmy(s, pm, grid, a.id);
    s.battles.push({ x: 302, y: 100, start: 0, armyIds: [a.id], sides: [{ owner: 0, initial: 20, morale: 1 }] });
    expect(reinforcing(s, a)).toBe(0);
  });
});

test('guarnição de fortaleza com 10 batalhões não se separa', async () => {
  const { addFortress } = await import('../src/sim/fortress');
  const s = game();
  addFortress(s, pm, 1, Array.from({ length: 10 }, () => 'line' as const));
  run(s, 0.1);
  expect(s.armies.filter(a => a.owner === -1).map(a => a.battalions.length)).toEqual([10]);
});
