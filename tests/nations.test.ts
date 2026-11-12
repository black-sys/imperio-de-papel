import { describe, expect, test } from 'vitest';
import { build, chooseCapital, colonize, checkColonize, moveArmies, startGame, setSpeed } from '../src/sim/commands';
import { cityTax, startingStock } from '../src/sim/economy';
import { newGame, type GameState } from '../src/sim/state';
import { battalionCount, spawnArmy, splitArmy } from '../src/sim/armies';
import { supplyArmy } from '../src/sim/routes';
import { tick } from '../src/sim/tick';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { world } from './troopworld';

describe('início com rivais (mundo real)', { timeout: 60000 }, () => {
  const pm = generateProvinces(generateWorld(860));
  const start = (d: 'easy' | 'normal' | 'hard' = 'normal') => { const s = newGame(pm, 860); expect(startGame(s, pm, pm.suggestedCapitals[0], d)).toEqual({ ok: true }); return s; };
  const s = start();
  test('um rival por capital sugerida restante, até 4, como o jogador', () => {
    expect(s.nations.length).toBe(1 + Math.min(4, pm.suggestedCapitals.length - 1));
    expect(s.nations[0].ai).toBe(false);
    for (const n of s.nations.slice(1)) {
      expect(pm.suggestedCapitals).toContain(n.capital);
      expect(n.capital).not.toBe(s.nations[0].capital);
      expect(s.owner[n.capital]).toBe(n.id);
      expect(s.city[n.capital]).toEqual({ level: 2, remaining: 0 });
      expect(s.connected[n.capital]).toBe(true);
      expect(n.res).toEqual(startingStock(pm, n.capital));
      expect(n.name).toBe(`Nação de ${pm.provinces[n.capital].name}`);
      expect(n.ai).toBe(true);
      expect(['militarist', 'expansionist', 'industrial']).toContain(n.bent);
    }
    expect(s.nations[0].name).toBe(`Nação de ${pm.provinces[s.nations[0].capital].name}`);
  });
  test('mesma semente, mesmas inclinações', () => {
    expect(start().nations.map(n => n.bent)).toEqual(s.nations.map(n => n.bent));
  });
  test('dificuldade muda só a renda dos rivais', () => {
    const e = start('easy'), h = start('hard'), r = s.nations[1].capital, me = s.nations[0].capital;
    expect(cityTax(e, pm, r)).toBeCloseTo(0.7 * cityTax(s, pm, r), 9);
    expect(cityTax(h, pm, r)).toBeCloseTo(1.3 * cityTax(s, pm, r), 9);
    expect(cityTax(e, pm, me)).toBeCloseTo(cityTax(s, pm, me), 9);
  });
  test('serializável', () => {
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('mesmas regras para todas as nações (mundo de teste)', () => {
  const { pm, grid } = world;
  /** Jogador na província 0, rival (nação 1) na província 1. */
  const two = (): GameState => {
    const s = newGame(pm);
    chooseCapital(s, pm, 0);
    s.nations.push({ ...s.nations[0], history: [], id: 1, name: 'Nação de P1', ai: true, capital: 1, res: { ...s.nations[0].res }, atWar: [] });
    s.owner[1] = 1; s.city[1] = { level: 2, remaining: 0 }; s.connected[1] = true;
    return s;
  };
  test('rival paga obra do próprio estoque; não age em província alheia', () => {
    const s = two(), mine = { ...s.nations[0].res }, before = s.nations[1].res.money;
    expect(build(s, pm, 1, { lot: 0 }, 'market', 1)).toEqual({ ok: true });
    expect(s.nations[1].res.money).toBeLessThan(before);
    expect(s.nations[0].res).toEqual(mine);
    expect(build(s, pm, 0, { lot: 2 }, 'market', 1)).toEqual({ ok: false, reason: 'Esta província não é sua' });
    expect(checkColonize(s, pm, 0, 1)).toEqual({ ok: false, reason: 'Esta província não é neutra' });
    expect(colonize(s, pm, 1, 0).ok).toBe(false);
  });
  test('o jogador não comanda exército do rival', () => {
    const s = two(), a = spawnArmy(s, 1, ['line', 'line'], 180, 80);
    expect(moveArmies(s, grid, [a.id], 60, 80)).toEqual({ ok: false, reason: 'Nenhum exército selecionado' });
    expect(a.path).toEqual([]);
    expect(splitArmy(s, a.id, [0])).toEqual({ ok: false, reason: 'Exército inválido' });
    expect(supplyArmy(s, pm, grid, a.id).ok).toBe(false);
    expect(moveArmies(s, grid, [a.id], 170, 90, 1)).toEqual({ ok: true });
  });
  test('batalhões contam por nação', () => {
    const s = two();
    spawnArmy(s, 1, ['line', 'line'], 180, 80); spawnArmy(s, 0, ['line'], 60, 80);
    expect(battalionCount(s)).toBe(1);
    expect(battalionCount(s, 1)).toBe(2);
  });
  test('cada nação paga a própria virada do mês', () => {
    const s = two();
    s.lots[1][0] = { type: 'market', level: 1, remaining: 0 };
    const r0 = s.nations[0].res.money, r1 = s.nations[1].res.money;
    setSpeed(s, 1);
    for (let i = 0; i < 100; i++) tick(s, pm, 0.1, null);
    expect(s.nations[0].res.money).not.toBe(r0);
    expect(s.nations[1].res.money - r1).toBeGreaterThan(s.nations[0].res.money - r0); // mercado só no rival
  });
});
