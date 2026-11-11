import { describe, expect, test } from 'vitest';
import { chooseCapital } from '../src/sim/commands';
import { fall } from '../src/sim/conquest';
import { runMonth } from '../src/sim/economy';
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
  s.owner[2] = 1; s.city[2] = { level: 2, remaining: 0 }; s.connected[2] = true; s.stability[2] = 70;
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

describe('eventos', () => {
  /** Roda meses com a estabilidade da província 1 presa em `v` até `done` (ou 300 meses); devolve o mês. */
  const until = (s: GameState, v: number, done: (s: GameState) => boolean) => {
    for (let m = 1; m <= 300; m++) { s.month = m; s.stability[1] = v; stabilityMonth(s, pm); if (done(s)) return m; }
    return -1;
  };
  test('greve: só com fábrica e abaixo de 40; para as fábricas por 2 meses', () => {
    expect(until(world(), 35, s => s.strikes.length > 0)).toBe(-1); // sem fábrica
    const s = world();
    s.lots[1][0] = { type: 'steelworks', level: 1, remaining: 0 };
    expect(until(s, 45, x => x.strikes.length > 0)).toBe(-1); // acima de 40
    const m = until(s, 35, x => x.strikes.length > 0);
    expect(m).toBeGreaterThan(0);
    expect(s.strikes).toEqual([{ province: 1, until: m + 2 }]);
    expect(s.headlines.at(-1)!.text).toBe('GREVE PARALISA SIDERÚRGICA DE R1');
    const r = runMonth(s, pm, false, 0);
    expect(r.produced['1:0']).toBe(0);
    expect(r.stalled).toContainEqual({ province: 1, lot: 0, missing: 'strike' });
    s.month = m + 2; stabilityMonth(s, pm);
    expect(s.strikes.filter(x => x.until <= s.month)).toEqual([]);
  });
  test('greve ativa não se repete', () => {
    const s = world();
    s.lots[1][0] = { type: 'steelworks', level: 1, remaining: 0 };
    s.strikes.push({ province: 1, until: 9999 });
    until(s, 35, () => false);
    expect(s.strikes.length).toBe(1);
  });
  test('incêndio: um prédio perde um nível', () => {
    const s = world();
    s.lots[1][0] = { type: 'market', level: 2, remaining: 0 };
    expect(until(s, 25, x => x.lots[1][0]?.level !== 2)).toBeGreaterThan(0);
    expect(s.lots[1][0]).toEqual({ type: 'market', level: 1, remaining: 0 });
    expect(s.headlines.at(-1)!.text).toBe('INCÊNDIO DANIFICA MERCADO EM R1');
  });
  test('revolta: rebeldes do tamanho certo, sem impostos; determinística', () => {
    const run = () => { const s = world(); return { s, m: until(s, 5, x => x.revolts.length > 0) }; };
    const { s, m } = run();
    expect(m).toBeGreaterThan(0);
    expect(run().m).toBe(m);
    const rebels = s.armies.find(a => a.id === s.revolts[0].army)!;
    expect(rebels.owner).toBe(-1);
    expect(rebels.name).toBe('Rebeldes de R1');
    expect(rebels.battalions.length).toBe(1 + 2 + 1); // 1 + (15 − 5)/5 + cidade N1
    expect(s.headlines.at(-1)!.text).toBe('REVOLTA EM R1');
    const tax = (x: GameState) => runMonth(x, pm, false, 0).lines.money.find(l => l[0] === 'Impostos')![1];
    expect(tax(s)).toBeLessThan(tax(world())); // a província em revolta não paga
  });
  test('rebeldes derrotados: fim e +10', () => {
    const s = world(), c = world();
    s.stability[1] = 5; c.stability[1] = 5;
    s.revolts.push({ province: 1, since: 0, army: 999 }); // exército já não existe
    stabilityMonth(s, pm); stabilityMonth(c, pm);
    expect(s.revolts).toEqual([]);
    expect(s.stability[1] - c.stability[1]).toBeCloseTo(10 * 0.9, 9);
  });
  test('3 meses de revolta: a província vira neutra; na capital, nunca', () => {
    const s = world();
    for (const id of [77, 78]) s.armies.push({ id, owner: -1, name: 'Rebeldes', battalions: [{ type: 'line', soldiers: 20 }], x: 190, y: 32, path: [], morale: 1, routedUntil: 0, home: -1, supply: null, supplied: true });
    s.revolts.push({ province: 1, since: 0, army: 77 }, { province: 0, since: 0, army: 78 });
    s.month = 3; stabilityMonth(s, pm);
    expect([s.owner[1], s.city[1]]).toEqual([-1, null]);
    expect(s.owner[0]).toBe(0);
    expect(s.revolts.map(x => x.province)).toEqual([0]);
  });
  test('revolta em província conquistada some; greve com a fábrica queimada não quebra', () => {
    const s = world();
    s.revolts.push({ province: 1, since: 0, army: 999 });
    fall(s, pm, 1, 1);
    expect(s.revolts).toEqual([]);
    const t = world();
    t.lots[1][0] = { type: 'steelworks', level: 1, remaining: 0 };
    t.strikes.push({ province: 1, until: 5 });
    t.lots[1][0] = null;
    t.month = 5; stabilityMonth(t, pm);
    expect(t.strikes).toEqual([]);
  });
});
