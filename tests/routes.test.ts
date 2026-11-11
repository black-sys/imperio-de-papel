import { describe, expect, test } from 'vitest';
import { DEPOT_MONTHS, ROUTE } from '../src/sim/balance';
import { cityTax, runMonth } from '../src/sim/economy';
import { chooseCapital, setSpeed } from '../src/sim/commands';
import { buildRoute, checkRoute, planRoute, removeRoute } from '../src/sim/routes';
import { found, newGame, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { makeRouteWorld } from './troopworld';

const { pm, grid } = makeRouteWorld();
const rich = { money: 9000, grain: 900, wood: 900, coal: 900, iron: 900, steel: 900, arms: 900 };
/** Capital na 0; as províncias 1 e 2 já são suas (cidade nível 1, sem rota). */
const game = (): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  found(s, 1); found(s, 2);
  s.res = { ...rich };
  return s;
};
const run = (s: GameState, months: number) => { setSpeed(s, 1); for (let i = 0; i < Math.round(months * 100); i++) tick(s, pm, 0.1, grid); };

describe('planejar rota', () => {
  test('contorna o lago; custo por tile, rio a 3×', () => {
    const r = planRoute(makeState(), pm, grid, 0, 1);
    if (!r.ok) throw new Error(r.reason);
    expect(r.path.every(c => grid.cost[c] !== 0)).toBe(true);
    const tiles = r.path.reduce((a, c) => a + 4 * (grid.cost[c] >= 2 ? ROUTE.hardMult : 1), 0);
    expect(r.cost.money).toBeCloseTo(tiles * ROUTE.money, 6);
    expect(r.cost.wood).toBeCloseTo(tiles * ROUTE.wood, 6);
    const r12 = planRoute(makeState(), pm, grid, 1, 2);
    if (!r12.ok) throw new Error(r12.reason);
    expect(r12.path.some(c => grid.cost[c] === 3)).toBe(true); // cruza o rio da coluna 70
  });
  test('recusas', () => {
    const s = newGame(pm);
    chooseCapital(s, pm, 0);
    s.res = { ...rich };
    expect(checkRoute(s, pm, grid, 0, 1)).toEqual({ ok: false, reason: 'Escolha duas cidades suas' });
    found(s, 1);
    expect(buildRoute(s, pm, grid, 0, 1)).toEqual({ ok: true });
    expect(checkRoute(s, pm, grid, 1, 0)).toEqual({ ok: false, reason: 'Já existe uma rota entre essas cidades' });
    s.res.money = 0;
    found(s, 2);
    expect(checkRoute(s, pm, grid, 1, 2).ok).toBe(false);
  });
});

function makeState() { return game(); }

describe('construir e ligar', () => {
  test('cobra, fica em obra e só liga ao terminar', () => {
    const s = game(), plan = planRoute(s, pm, grid, 0, 1);
    if (!plan.ok) throw new Error(plan.reason);
    expect(buildRoute(s, pm, grid, 0, 1)).toEqual({ ok: true });
    expect(s.res.money).toBeCloseTo(9000 - plan.cost.money!, 6);
    expect(s.routes[0].remaining).toBeCloseTo(plan.months, 6);
    run(s, plan.months - 0.1);
    expect(s.connected[1]).toBe(false);
    run(s, 0.2);
    expect(s.connected[1]).toBe(true);
  });
  test('ligação por outra cidade; remover desliga as de depois; rota direta religa', () => {
    const s = game();
    buildRoute(s, pm, grid, 0, 1); buildRoute(s, pm, grid, 1, 2);
    run(s, 6);
    expect(s.connected).toEqual([true, true, true]);
    expect(removeRoute(s, s.routes[0].id)).toEqual({ ok: true });
    run(s, 0.05);
    expect(s.connected).toEqual([true, false, false]);
    buildRoute(s, pm, grid, 0, 2);
    run(s, 6);
    expect(s.connected).toEqual([true, true, true]);
    expect(removeRoute(s, 999)).toEqual({ ok: false, reason: 'Rota inexistente' });
  });
  test('colônia nasce desligada; estado com rotas faz ida e volta pelo JSON', () => {
    const s = game();
    expect(s.connected).toEqual([true, false, false]);
    buildRoute(s, pm, grid, 0, 1);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('depósito e entrega', () => {
  const ready = (type: 'farm' | 'coal_mine' | 'steelworks') => ({ type, level: 1, remaining: 0 });
  test('desligada guarda a produção dos veios; o estoque nacional não a conta; impostos entram', () => {
    const s = game();
    s.veins[1][0] = ready('farm'); s.veins[1][2] = ready('coal_mine');
    const r = runMonth(s, pm, false);
    expect(r.depots[1]).toEqual({ grain: 4, coal: 2 });
    expect(r.net.coal).toBeCloseTo(0, 9);
    expect(r.lines.money.find(l => l[0] === 'Impostos')![1]).toBeCloseTo(cityTax(s, pm, 0) + cityTax(s, pm, 1) + cityTax(s, pm, 2), 9);
    runMonth(s, pm, true);
    expect(s.depot[1]).toMatchObject({ grain: 4, coal: 2 });
  });
  test('teto de 6 meses de produção', () => {
    const s = game();
    s.veins[1][2] = ready('coal_mine');
    for (let i = 0; i < 10; i++) runMonth(s, pm, true);
    expect(s.depot[1].coal).toBeCloseTo(2 * DEPOT_MONTHS, 9);
  });
  test('fábrica de cidade desligada para com o motivo "sem rota"', () => {
    const s = game();
    s.lots[1][0] = ready('steelworks');
    const r = runMonth(s, pm, false);
    expect(r.stalled).toEqual([{ province: 1, lot: 0, missing: 'route' }]);
    expect(r.produced['1:0']).toBe(0);
  });
  test('ao religar, a carga vai para o estoque com aviso; ao desligar, aviso', () => {
    const s = game();
    s.veins[1][2] = ready('coal_mine');
    runMonth(s, pm, true); runMonth(s, pm, true);
    const coal = s.res.coal;
    buildRoute(s, pm, grid, 0, 1);
    run(s, 4);
    expect(s.connected[1]).toBe(true);
    expect(s.depot[1].coal).toBe(0);
    expect(s.res.coal).toBeGreaterThan(coal + 3.9 - 1e-9); // os 4 guardados (mais o que os meses de obra renderam no depósito)
    expect(s.events.some(e => e.text === 'Carga de R1 chegou ao estoque')).toBe(true);
    removeRoute(s, s.routes[0].id);
    run(s, 0.05);
    expect(s.events.at(-1)!.text).toBe('R1 desligada da capital');
  });
});
