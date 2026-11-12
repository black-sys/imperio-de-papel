import { describe, expect, test } from 'vitest';
import { setSpeed } from '../src/sim/commands';
import { addPact } from '../src/sim/diplomacy';
import { runMonth } from '../src/sim/economy';
import { decree } from '../src/sim/stability';
import { tick } from '../src/sim/tick';
import { RES_KEYS } from '../src/sim/balance';
import { world } from './stabworld';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld();
const months = (s: ReturnType<typeof world>, k: number) => { setSpeed(s, 1); for (let i = 0; i < k * 10; i++) tick(s, pm, 1, null); };
const line = (r: ReturnType<typeof runMonth>, k: keyof typeof r.lines, label: string) => r.lines[k].find(l => l[0] === label)?.[1] ?? 0;

describe('histórico', () => {
  test('guarda os últimos 24 meses de estoque e saldo real', () => {
    const s = world();
    months(s, 30);
    const h = s.nations[0].history;
    expect(h.length).toBe(24);
    expect(h.at(-1)!.stock).toEqual(s.nations[0].res);
    for (const k of RES_KEYS) expect(h.at(-1)!.stock[k] - h.at(-2)!.stock[k]).toBeCloseTo(h.at(-1)!.net[k], 9);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('comércio e Pão e circo na conta', () => {
  test('a projeção traz as linhas e bate com o que a virada aplica', () => {
    const s = world();
    s.nations[0].res = { money: 500, grain: 500, wood: 500, coal: 500, iron: 500, steel: 500, arms: 500 };
    s.nations[1].res = { ...s.nations[0].res };
    addPact(s, 'trade', 0, 1, 99, { aGives: ['iron', 10], bGives: ['money', 25] });
    decree(s, 0, 'bread');
    const proj = runMonth(s, pm, false, 0);
    expect(line(proj, 'iron', 'Comércio')).toBe(-10);
    expect(line(proj, 'money', 'Comércio')).toBe(25);
    expect(line(proj, 'money', 'Pão e circo')).toBe(-4); // 2 cidades
    const before = { ...s.nations[0].res };
    months(s, 1);
    for (const k of RES_KEYS) expect(s.nations[0].res[k] - before[k]).toBeCloseTo(proj.net[k], 6);
  });
  test('entrega parcial: a projeção entrega o que o estoque permite', () => {
    const s = world();
    s.nations[0].res.iron = 4;
    addPact(s, 'trade', 0, 1, 99, { aGives: ['iron', 10], bGives: ['money', 25] });
    expect(line(runMonth(s, pm, false, 0), 'iron', 'Comércio')).toBe(-4);
  });
});

test('detalhe por província soma o total da linha', () => {
  const s = world();
  const r = runMonth(s, pm, false, 0), parts = r.byProvince.money['Impostos'];
  expect(parts.map(([k]) => k).sort()).toEqual(['p:0', 'p:1']);
  expect(parts.reduce((a, [, v]) => a + v, 0)).toBeCloseTo(line(r, 'money', 'Impostos'), 9);
});

test('fome com importação de grãos: a projeção bate com a virada', () => {
  const s = world();
  s.nations[0].res.grain = 2; s.nations[1].res.grain = 500; s.nations[0].res.money = 500;
  addPact(s, 'trade', 0, 1, 99, { aGives: ['money', 5], bGives: ['grain', 10] });
  const proj = runMonth(s, pm, false, 0), before = s.nations[0].res.grain;
  months(s, 1);
  expect(s.nations[0].res.grain - before).toBeCloseTo(proj.net.grain, 6);
});
