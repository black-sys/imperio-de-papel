import { describe, expect, test } from 'vitest';
import { chooseCapital } from '../src/sim/commands';
import { fall } from '../src/sim/conquest';
import { runMonth } from '../src/sim/economy';
import { aiStability, decree, headline, repeal, repress, stabilityMonth, stabilityTarget } from '../src/sim/stability';
import { aiStep } from '../src/sim/ai';
import { spawnArmy, men } from '../src/sim/armies';
import { eliminate } from '../src/sim/conquest';
import { cityTax } from '../src/sim/economy';
import { found, newGame, type GameState } from '../src/sim/state';
import { declareWar } from '../src/sim/war';
import { makeRouteWorld } from './troopworld';
import { STAB } from '../src/sim/balance';
const B = STAB.base; // alvo base

const { pm, grid } = makeRouteWorld(); // R0, R1, R2 em faixa
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
    expect(target(s)).toBe(B + 5);
    expect(stabilityTarget(s, pm, 1).factors).toEqual([['Paz', 5]]);
    const f = (change: (s: GameState) => void) => { const t = world(); change(t); return target(t) - (B + 5); };
    expect(f(s => { s.nations[0].grainShort = true; })).toBe(-25);
    expect(f(s => { s.lots[1][0] = { type: 'steelworks', level: 2, remaining: 0 }; })).toBe(-10);
    expect(f(s => { s.city[1] = { level: 2, remaining: 0 }; })).toBe(-5);
    expect(f(s => { s.city[1] = { level: 3, remaining: 0 }; })).toBe(-10);
    expect(f(s => { s.connected[1] = false; })).toBe(-15);
    expect(f(s => { s.month = 30; s.conquered[1] = 0; })).toBe(-10);
    expect(f(s => { s.lots[1][0] = { type: 'garrison', level: 2, remaining: 0 }; })).toBe(15);
    expect(f(s => { s.lots[1][0] = { type: 'market', level: 2, remaining: 0 }; })).toBe(10);
    expect(f(s => { s.month = 10; s.resentment[1] = 20; })).toBe(-5);
    expect(target(s, 0) - (B + 5)).toBe(10 - 5); // capital (+10) N2 (−5)
  });
  test('guerra: −5 por guerra e −1 por 12 meses da mais antiga (sem o +5 da paz)', () => {
    const s = world();
    declareWar(s, 0, 1, pm);
    expect(target(s)).toBe(B - 5);
    s.month = 36;
    expect(target(s)).toBe(B - 8);
    s.month = 400;
    expect(target(s)).toBe(B - 20); // guerra longa limitada a −15
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
    expect(s.stability[1]).toBeCloseTo(70 + (B + 5 - 70) * 0.1, 9);
    fall(s, pm, 1, 1);
    expect(s.stability[1]).toBe(30);
    expect(s.conquered[1]).toBe(s.month);
  });
  test('ressentimento: a subida anda pela metade', () => {
    const s = world();
    s.stability[1] = 30; s.resentment[1] = 99;
    stabilityMonth(s, pm);
    expect(s.stability[1]).toBeCloseTo(30 + (B - 30) * 0.1 * 0.5, 9);
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

describe('leis', () => {
  test('decretar: custo, recusas, intervalo de 12 meses ao revogar', () => {
    const s = world(), m0 = s.nations[0].res.money;
    expect(decree(s, 0, 'bread')).toEqual({ ok: true });
    expect(s.nations[0].res.money).toBe(m0 - 50);
    expect(s.headlines.at(-1)!.text).toBe('NAÇÃO DE R0 DECRETA PÃO E CIRCO');
    expect(decree(s, 0, 'bread')).toEqual({ ok: false, reason: 'Lei já em vigor' });
    expect(repeal(s, 0, 'ration')).toEqual({ ok: false, reason: 'Lei não está em vigor' });
    expect(repeal(s, 0, 'bread')).toEqual({ ok: true });
    s.month = 5;
    expect(decree(s, 0, 'bread')).toEqual({ ok: false, reason: 'Só pode decretar de novo em 7 meses' });
    s.month = 12; s.nations[0].res.money = 10;
    expect(decree(s, 0, 'bread')).toEqual({ ok: false, reason: 'Falta dinheiro' });
  });
  test('Pão e circo: +10, custa 2 por cidade/mês e cai sem dinheiro', () => {
    const s = world();
    s.nations[0].res.money = 500;
    decree(s, 0, 'bread');
    expect(stabilityTarget(s, pm, 1).target).toBe(B + 15);
    const m = s.nations[0].res.money;
    stabilityMonth(s, pm);
    expect(m - s.nations[0].res.money).toBe(4); // 2 cidades
    s.nations[0].res.money = 1;
    stabilityMonth(s, pm);
    expect(s.nations[0].laws).toEqual([]);
    expect(s.events.at(-1)!.text).toBe('Pão e circo suspenso: falta dinheiro');
  });
  test('Racionamento, Jornada reduzida e Lei marcial na conta do mês e no alvo', () => {
    const base = world(), r = world();
    decree(r, 0, 'ration');
    const grain = (x: GameState) => runMonth(x, pm, false, 0).lines.grain.find(l => l[0] === 'Cidades')![1];
    expect(grain(r)).toBeCloseTo(grain(base) * 0.5, 9);
    expect(stabilityTarget(r, pm, 1).target).toBe(B);
    r.nations[0].grainShort = true; base.nations[0].grainShort = true; r.nations[0].res.grain = 0;
    expect(stabilityTarget(r, pm, 1).target - stabilityTarget(base, pm, 1).target).toBe(25 - 5); // com Racionamento a fome não pesa
    const f = world();
    f.lots[1][0] = { type: 'steelworks', level: 2, remaining: 0 };
    f.nations[0].res = { money: 999, grain: 999, wood: 999, coal: 999, iron: 999, steel: 999, arms: 999 };
    const full = runMonth(f, pm, false, 0).produced['1:0'];
    decree(f, 0, 'shorter');
    expect(runMonth(f, pm, false, 0).produced['1:0']).toBe(Math.floor(full * 0.75));
    expect(stabilityTarget(f, pm, 1).factors.some(([k]) => k === 'Fábricas')).toBe(false);
    const m = world(), tax = cityTax(m, pm, 1);
    m.nations[0].res.money = 999;
    decree(m, 0, 'martial');
    expect(cityTax(m, pm, 1)).toBeCloseTo(tax * 0.8, 9);
    expect(stabilityTarget(m, pm, 1).target).toBe(B + 5);
    spawnArmy(m, 0, ['line'], 190, 32); // parado em R1
    expect(stabilityTarget(m, pm, 1).target).toBe(B + 20);
  });
  test('nação eliminada com Pão e circo: nada é cobrado', () => {
    const s = world();
    decree(s, 1, 'bread');
    eliminate(s, pm, 1, 0);
    const m = s.nations[1].res.money;
    stabilityMonth(s, pm);
    expect(s.nations[1].res.money).toBe(m);
  });
});

describe('reprimir', () => {
  test('+20, fim da greve, ressentimento, −2 homens por batalhão; recusas', () => {
    const s = world(), a = spawnArmy(s, 0, ['line', 'line'], 190, 32);
    s.stability[1] = 30; s.strikes.push({ province: 1, until: 99 });
    expect(repress(s, pm, grid, a.id)).toEqual({ ok: true });
    expect(s.stability[1]).toBe(50);
    expect(s.strikes).toEqual([]);
    expect(s.resentment[1]).toBe(60);
    expect(men(a)).toBe(36);
    s.stability[1] = 30;
    expect(repress(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Reprimida há menos de 12 meses' });
    s.month = 12; s.stability[1] = 45;
    expect(repress(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Estabilidade acima de 40' });
    a.path = [1];
    expect(repress(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Exército em marcha' });
    a.path = []; a.x = 320; a.y = 64;
    s.stability[2] = 10;
    expect(repress(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Província não é sua' });
    expect(repress(s, pm, grid, 999)).toEqual({ ok: false, reason: 'Exército inválido' });
    a.x = 190; a.y = 32; s.stability[1] = 10;
    s.battles.push({ x: 190, y: 32, start: 0, armyIds: [a.id], sides: [{ owner: 0, initial: 40, morale: 1 }] });
    expect(repress(s, pm, grid, a.id)).toEqual({ ok: false, reason: 'Exército em batalha' });
  });
});

describe('a IA', () => {
  test('decreta Pão e circo com média baixa e dinheiro; revoga quando melhora', () => {
    const s = world();
    s.nations[1].res.money = 500; s.stability[2] = 30;
    aiStability(s, pm, grid, 1);
    expect(s.nations[1].laws).toContain('bread');
    s.stability[2] = 80;
    aiStability(s, pm, grid, 1);
    expect(s.nations[1].laws).not.toContain('bread');
  });
  test('Racionamento na fome', () => {
    const s = world();
    s.nations[1].grainShort = true;
    aiStability(s, pm, grid, 1);
    expect(s.nations[1].laws).toContain('ration');
  });
  test('manda exército contra rebeldes na própria província', () => {
    const s = world();
    const mine = spawnArmy(s, 1, ['line', 'line', 'line', 'line'], 300, 100);
    const rebels = spawnArmy(s, -1, ['line'], 340, 40, -1, 'Rebeldes de R2');
    s.revolts.push({ province: 2, since: 0, army: rebels.id });
    aiStep(s, pm, grid, 1);
    const c = mine.path.at(-1)!;
    expect(Math.hypot((c % grid.size) * 4 + 2 - 340, Math.floor(c / grid.size) * 4 + 2 - 40)).toBeLessThan(20);
  });
});

describe('revisão final', () => {
  test('rebeldes órfãos (revolta encerrada por conquista) somem na virada', () => {
    const s = world(), r = spawnArmy(s, -1, ['line'], 190, 32, -1, 'Rebeldes de R1');
    s.revolts.push({ province: 1, since: 0, army: r.id });
    fall(s, pm, 1, 1);
    stabilityMonth(s, pm);
    expect(s.armies.some(a => a.id === r.id)).toBe(false);
  });
  test('a IA não revoga o Racionamento sem estoque para 6 meses de consumo cheio', () => {
    const s = world();
    s.nations[1].laws = ['ration']; s.nations[1].grainShort = false; s.nations[1].res.grain = 5;
    aiStability(s, pm, grid, 1);
    expect(s.nations[1].laws).toContain('ration');
    s.nations[1].res.grain = 500;
    aiStability(s, pm, grid, 1);
    expect(s.nations[1].laws).not.toContain('ration');
  });
});
