import { describe, expect, test } from 'vitest';
import { setSpeed, startGame } from '../src/sim/commands';
import { placeFortresses } from '../src/sim/fortress';
import { makeMoveGrid } from '../src/sim/movegrid';
import { battalionCount } from '../src/sim/armies';
import { newGame, type Bent, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';

const map = generateWorld(860), pm = generateProvinces(map), grid = makeMoveGrid(map);
/** Partida normal na semente 860, todos Industriais (não declaram guerra) a menos que `bents` diga outra coisa. */
const start = (bents: Bent[] = []) => {
  const s = newGame(pm, 860);
  placeFortresses(s, pm, 860);
  startGame(s, pm, pm.suggestedCapitals[0], 'normal');
  s.nations.forEach((n, i) => { if (i > 0) n.bent = bents[i - 1] ?? 'industrial'; });
  return s;
};
const months = (s: GameState, m: number, speed = 1, each?: (s: GameState) => void) => {
  setSpeed(s, speed);
  // a 1× em quadros de 1 s; nas outras velocidades um quadro por mês (quadros diferentes, mesmo resultado)
  for (let i = 0; i < m; i++) { if (speed === 1) for (let k = 0; k < 10; k++) tick(s, pm, 1, grid); else tick(s, pm, 10 / speed, grid); each?.(s); }
};
const provinces = (s: GameState, n: number) => s.owner.filter(o => o === n).length;

describe('IA: economia e exército', { timeout: 300000 }, () => {
  test('em 150 meses cada rival tem ≥ 5 províncias', () => {
    const s = start();
    months(s, 150);
    for (const n of s.nations.slice(1)) expect(provinces(s, n.id)).toBeGreaterThanOrEqual(5);
  });
  test('sem renda por 60 meses: sem exceção e sem dinheiro negativo por mais de 3 meses seguidos', () => {
    const s = start();
    let streak = 0, worst = 0;
    months(s, 60, 1, s => {
      s.routes = s.routes.filter(r => r.owner !== 1); // rotas do rival 1 somem todo mês
      s.nations[1].res.money = Math.min(s.nations[1].res.money, 5);
      streak = s.nations[1].res.money < 0 ? streak + 1 : 0;
      worst = Math.max(worst, streak);
    });
    expect(worst).toBeLessThanOrEqual(3);
  });
  test('Militarista tem mais batalhões que Industrial aos 150 meses', () => {
    const a = start(['militarist', 'industrial', 'industrial', 'industrial']), b = start(['industrial', 'industrial', 'industrial', 'industrial']);
    a.nations[1].bent = 'militarist'; // sem guerra no teste: a Militarista só declararia depois e só contra vizinhos
    for (const s of [a, b]) for (const n of s.nations) n.founded = 1e9; // carência eterna: ninguém declara
    months(a, 150); months(b, 150);
    expect(battalionCount(a, 1)).toBeGreaterThan(battalionCount(b, 1));
  });
  test('determinismo: 60 meses a 1× e a 8×', () => {
    const a = start(), b = start();
    months(a, 60, 1); months(b, 60, 8);
    expect(b.owner).toEqual(a.owner);
    expect(b.nations.map(n => n.res)).toEqual(a.nations.map(n => n.res));
  });
});
