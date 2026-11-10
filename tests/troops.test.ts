import { describe, expect, test } from 'vitest';
import { checkColonize, checkRecruit, checkUpgrade, chooseCapital, recruit, setSpeed, upgrade } from '../src/sim/commands';
import { monthlyIncome } from '../src/sim/economy';
import { newGame, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { spawnTroop, troopCap } from '../src/sim/troops';
import { makeTestWorld } from './troopworld';

const { pm, grid } = makeTestWorld();
const garrison = (level = 1) => ({ type: 'garrison' as const, level, remaining: 0 });
/** Capital na província 0, guarnição pronta na vaga 1 e recursos de sobra. */
export const game = (level = 1): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  s.buildings[0][1] = garrison(level);
  s.res = { gold: 1000, wood: 1000, stone: 1000 };
  return s;
};
export const run = (s: GameState, months: number, speed = 1) => { setSpeed(s, speed); for (let i = 0; i < Math.round(months * 100 / speed); i++) tick(s, pm, 0.1, grid); };

describe('recrutamento', () => {
  test('recusas: sem guarnição, nível, fila ocupada', () => {
    const s = game();
    expect(checkRecruit(s, pm, 0, 0, 'spear')).toEqual({ ok: false, reason: 'Precisa de uma Guarnição' });
    expect(checkRecruit(s, pm, 1, 0, 'spear')).toEqual({ ok: false, reason: 'Esta província não é sua' });
    expect(checkRecruit(s, pm, 0, 1, 'archer')).toEqual({ ok: false, reason: 'Requer Guarnição N2' });
    expect(checkRecruit(s, pm, 0, 1, 'cavalry')).toEqual({ ok: false, reason: 'Requer Guarnição N3' });
    expect(recruit(s, pm, 0, 1, 'spear')).toEqual({ ok: true });
    expect(s.res).toEqual({ gold: 960, wood: 980, stone: 1000 });
    expect(recruit(s, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Já está treinando uma tropa' });
  });
  test('guarnição em obra não treina', () => {
    const s = game();
    s.buildings[0][1] = { type: 'garrison', level: 1, remaining: 2 };
    expect(checkRecruit(s, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Precisa de uma Guarnição' });
  });
  test('falta de recurso', () => {
    const s = game();
    s.res.gold = 10;
    expect(checkRecruit(s, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Falta 30 de ouro' });
  });
  test('a tropa nasce no local do prédio depois de 2 meses', () => {
    const s = game();
    recruit(s, pm, 0, 1, 'spear');
    run(s, 1.9);
    expect(s.troops.length).toBe(0);
    run(s, 0.2);
    expect(s.troops).toMatchObject([{ owner: 0, type: 'spear', soldiers: 20, x: 80, y: 80, morale: 1 }]);
    expect(s.recruiting).toEqual([]);
    expect(s.events.at(-1)!.text).toBe('Lanceiros treinados em P0');
  });
  test('teto: guarnição N1 sustenta 2, N2 3, N3 4; tropa em treino conta', () => {
    const s = game();
    expect(troopCap(s)).toBe(2);
    spawnTroop(s, 0, 'spear', 80, 80);
    recruit(s, pm, 0, 1, 'spear');
    s.buildings[0][2] = garrison(); // o teto é do reino: soma das guarnições
    expect(troopCap(s)).toBe(4);
    s.buildings[0][2] = null;
    expect(checkRecruit({ ...s, recruiting: [] }, pm, 0, 1, 'spear')).toEqual({ ok: true });
    spawnTroop(s, 0, 'spear', 80, 80);
    expect(checkRecruit({ ...s, recruiting: [] }, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Teto de tropas atingido' });
    expect(troopCap(game(2))).toBe(3);
    expect(troopCap(game(3))).toBe(4);
  });
  test('guarnição em melhoria mantém o teto do nível anterior', () => {
    const s = game();
    s.buildings[0][1] = { type: 'garrison', level: 2, remaining: 3 };
    expect(troopCap(s)).toBe(2);
  });
});

describe('metas de nível da guarnição', () => {
  test('N2 exige 3 guarnições no reino', () => {
    const s = game();
    s.buildings[0][2] = garrison();
    expect(checkUpgrade(s, pm, 0, 1)).toEqual({ ok: false, reason: 'Guarnições: 2/3' });
    s.buildings[0][3] = garrison();
    expect(upgrade(s, pm, 0, 1)).toEqual({ ok: true });
  });
  test('N3 exige 3 guarnições N2 ou maiores', () => {
    const s = game(2);
    s.buildings[0][2] = garrison(2); s.buildings[0][3] = garrison(1);
    expect(checkUpgrade(s, pm, 0, 1)).toEqual({ ok: false, reason: 'Guarnições nível 2: 2/3' });
    s.buildings[0][3] = garrison(3);
    expect(upgrade(s, pm, 0, 1)).toEqual({ ok: true });
  });
  test('outros prédios não têm meta', () => {
    expect(checkUpgrade(game(), pm, 0, 0)).toEqual({ ok: true });
  });
});

test('fortaleza não pode ser colonizada', () => {
  const s = game();
  expect(checkColonize(s, pm, 1)).toEqual({ ok: true });
  s.fortresses.push({ province: 1, garrison: ['spear'], lastCombat: 0 });
  expect(checkColonize(s, pm, 1)).toEqual({ ok: false, reason: 'Fortaleza: só cai com tropas' });
});

test('manutenção das tropas sai da renda', () => {
  const s = game(), before = monthlyIncome(s, pm).gold;
  spawnTroop(s, 0, 'spear', 80, 80);
  spawnTroop(s, 0, 'cavalry', 80, 80);
  spawnTroop(s, -1, 'spear', 80, 80, 1); // fortaleza não custa
  expect(monthlyIncome(s, pm).gold).toBe(before - 4);
});

test('estado com tropas faz ida e volta pelo JSON', () => {
  const s = game();
  recruit(s, pm, 0, 1, 'spear');
  spawnTroop(s, 0, 'spear', 80, 80);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});
