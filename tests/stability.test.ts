import { describe, expect, test } from 'vitest';
import { chooseCapital } from '../src/sim/commands';
import { fall } from '../src/sim/conquest';
import { headline, stabilityMonth, stabilityTarget } from '../src/sim/stability';
import { found, newGame, type GameState } from '../src/sim/state';
import { declareWar } from '../src/sim/war';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld(); // R0, R1, R2 em faixa
/** Jogador com capital em R0 e R1 (cidade N1, ligada); rival (nação 1) em R2. */
export const world = (): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  found(s, 1); s.connected[1] = true;
  s.nations.push({ ...s.nations[0], id: 1, name: 'Nação de R2', ai: true, capital: 2, res: { ...s.nations[0].res }, atWar: [], laws: [], lawCooldown: {} });
  s.owner[2] = 1; s.city[2] = { level: 2, remaining: 0 }; s.connected[2] = true;
  s.relations = [[0, 0], [0, 0]];
  return s;
};
const target = (s: GameState, id = 1) => stabilityTarget(s, pm, id).target;

describe('alvo', () => {
  test('base em paz: 60 + 5; cada fator isolado', () => {
    const s = world();
    expect(target(s)).toBe(65);
    expect(stabilityTarget(s, pm, 1).factors).toEqual([['Paz', 5]]);
    const f = (change: (s: GameState) => void) => { const t = world(); change(t); return target(t) - 65; };
    expect(f(s => { s.nations[0].grainShort = true; })).toBe(-25);
    expect(f(s => { s.lots[1][0] = { type: 'steelworks', level: 2, remaining: 0 }; })).toBe(-10);
    expect(f(s => { s.city[1] = { level: 2, remaining: 0 }; })).toBe(-5);
    expect(f(s => { s.city[1] = { level: 3, remaining: 0 }; })).toBe(-10);
    expect(f(s => { s.connected[1] = false; })).toBe(-15);
    expect(f(s => { s.month = 30; s.conquered[1] = 0; })).toBe(-10);
    expect(f(s => { s.lots[1][0] = { type: 'garrison', level: 2, remaining: 0 }; })).toBe(15);
    expect(f(s => { s.lots[1][0] = { type: 'market', level: 2, remaining: 0 }; })).toBe(10);
    expect(f(s => { s.month = 10; s.resentment[1] = 20; })).toBe(-5);
    expect(target(s, 0) - 65).toBe(10 - 5); // capital (+10) N2 (−5)
  });
  test('guerra: −5 por guerra e −1 por 12 meses da mais antiga (sem o +5 da paz)', () => {
    const s = world();
    declareWar(s, 0, 1, pm);
    expect(target(s)).toBe(55);
    s.month = 36;
    expect(target(s)).toBe(52);
    s.month = 400;
    expect(target(s)).toBe(40); // guerra longa limitada a −15
  });
  test('limitado a 0–100', () => {
    const s = world();
    s.nations[0].grainShort = true; s.connected[1] = false; s.city[1] = { level: 3, remaining: 0 };
    s.lots[1] = s.lots[1].map(() => ({ type: 'steelworks', level: 3, remaining: 0 }));
    expect(target(s)).toBe(0);
  });
});

describe('variação', () => {
  test('começa em 70 (fundada) e 30 (conquistada); anda 10% do caminho', () => {
    const s = world();
    expect([s.stability[0], s.stability[1]]).toEqual([70, 70]);
    stabilityMonth(s, pm);
    expect(s.stability[1]).toBeCloseTo(69.5, 9);
    fall(s, pm, 1, 1);
    expect(s.stability[1]).toBe(30);
    expect(s.conquered[1]).toBe(s.month);
  });
  test('ressentimento: a subida anda pela metade', () => {
    const s = world();
    s.stability[1] = 30; s.resentment[1] = 99;
    stabilityMonth(s, pm);
    expect(s.stability[1]).toBeCloseTo(30 + (60 - 30) * 0.1 * 0.5, 9);
  });
});

describe('manchetes', () => {
  test('guerra declarada vira manchete; o jornal guarda as últimas 30', () => {
    const s = world();
    declareWar(s, 0, 1, pm);
    expect(s.headlines.at(-1)!.text).toBe('NAÇÃO DE R0 DECLARA GUERRA À NAÇÃO DE R2');
    for (let i = 0; i < 40; i++) headline(s, `T${i}`);
    expect(s.headlines.length).toBe(30);
    expect(s.headlines.at(-1)!.text).toBe('T39');
  });
  test('JSON', () => {
    const s = world();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
