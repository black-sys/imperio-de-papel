import { describe, expect, test } from 'vitest';
import { chooseCapital, setSpeed, startGame } from '../src/sim/commands';
import { aiStep } from '../src/sim/ai';
import { placeFortresses } from '../src/sim/fortress';
import { makeMoveGrid } from '../src/sim/movegrid';
import { spawnArmy } from '../src/sim/armies';
import { newGame, type Bent, type GameState } from '../src/sim/state';
import { declareWar } from '../src/sim/war';
import { tick } from '../src/sim/tick';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { makeRouteWorld } from './troopworld';

const { pm, grid } = makeRouteWorld(); // R0 (cidade 60,64), R1 (190,32), R2 (320,64)
const rich = { money: 0, grain: 0, wood: 0, coal: 0, iron: 0, steel: 0, arms: 0 }; // sem dinheiro: a IA não gasta na economia
/** Jogador em R0; rival 1 com capital R2 e dono de R1 (Guarnição em R2); em guerra. */
const game = (bent: Bent = 'industrial'): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  s.nations[0].res = { ...rich };
  s.nations.push({ ...s.nations[0], id: 1, name: 'Nação de R2', bent, ai: true, capital: 2, res: { ...rich }, atWar: [] });
  for (const p of [1, 2]) { s.owner[p] = 1; s.city[p] = { level: 1, remaining: 0 }; s.connected[p] = true; }
  s.lots[2][0] = { type: 'garrison', level: 1, remaining: 0 };
  declareWar(s, 0, 1);
  return s;
};
const end = (s: GameState, id: number) => { const a = s.armies.find(a => a.id === id)!, c = a.path.at(-1); return c === undefined ? null : { x: (c % grid.size) * 4 + 2, y: Math.floor(c / grid.size) * 4 + 2 }; };
const near = (p: { x: number; y: number } | null, x: number, y: number, r = 20) => !!p && Math.hypot(p.x - x, p.y - y) <= r;
const bats = (k: number) => Array.from({ length: k }, () => 'line' as const);

describe('IA em guerra', () => {
  test('defende: com força, vai ao invasor', () => {
    const s = game(), mine = spawnArmy(s, 1, bats(4), 320, 64);
    spawnArmy(s, 0, bats(3), 150, 100); // invasor em R1
    aiStep(s, pm, grid, 1);
    expect(near(end(s, mine.id), 150, 100)).toBe(true);
  });
  test('recua para a capital quando o invasor é forte demais', () => {
    const s = game(), mine = spawnArmy(s, 1, bats(4), 230, 110);
    spawnArmy(s, 0, bats(10), 150, 100);
    aiStep(s, pm, grid, 1);
    expect(near(end(s, mine.id), 320, 64)).toBe(true);
  });
  test('recompõe: exército com 40% dos homens volta à província com Guarnição', () => {
    const s = game(), a = spawnArmy(s, 1, bats(2), 200, 100);
    for (const b of a.battalions) b.soldiers = 8;
    aiStep(s, pm, grid, 1);
    expect(near(end(s, a.id), 320, 64, 30)).toBe(true);
  });
  test('margem: Industrial com 5 não ataca 2; Militarista com 3 ataca 2', () => {
    for (const [bent, k, attacks] of [['industrial', 5, false], ['militarist', 3, true]] as const) {
      const s = game(bent), a = spawnArmy(s, 1, bats(k), 320, 64);
      spawnArmy(s, 0, bats(2), 64, 70); // defensores na cidade do jogador
      aiStep(s, pm, grid, 1);
      expect(near(end(s, a.id), 60, 64, 25)).toBe(attacks);
    }
  });
});

describe('partida inteira', { timeout: 600000 }, () => {
  test.each([860, 1, 2, 7])('semente %i: 5 nações por 600 meses sem exceção; guerras e eliminações acontecem', seed => {
    const map = generateWorld(seed), real = generateProvinces(map), g = makeMoveGrid(map);
    const s = newGame(real, seed);
    placeFortresses(s, real, seed);
    startGame(s, real, real.suggestedCapitals[0], 'normal');
    s.nations[0].ai = true; // o jogador também joga sozinho
    setSpeed(s, 1);
    let firstWar = -1, firstOut = -1;
    for (let m = 1; m <= 600; m++) {
      tick(s, real, 10, g);
      if (firstWar < 0 && s.nations.some(n => n.atWar.length)) firstWar = m;
      if (firstOut < 0 && s.nations.some(n => !n.alive)) firstOut = m;
    }
    console.log(`semente ${seed}: 1ª guerra ${firstWar}, 1ª eliminação ${firstOut}, vivas ${s.nations.filter(n => n.alive).length}, províncias ${s.nations.map(n => s.owner.filter(o => o === n.id).length).join('/')}`);
    // a IA só declara a vizinhos de fronteira: a 1ª guerra depende de quando as fronteiras se encostam
    expect(firstWar).toBeGreaterThanOrEqual(24);
    expect(firstWar).toBeLessThanOrEqual(300);
    expect(firstOut).toBeGreaterThan(0);
    expect(firstOut).toBeLessThanOrEqual(400);
    for (const n of s.nations) if (n.alive) expect(n.res.money).toBeGreaterThan(-50);
  });
});
