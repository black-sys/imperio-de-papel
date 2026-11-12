import { expect, test } from 'vitest';
import { alerts } from '../src/sim/alerts';
import { spawnArmy } from '../src/sim/armies';
import { fall, eliminate } from '../src/sim/conquest';
import { runMonth } from '../src/sim/economy';
import { found, type GameState } from '../src/sim/state';
import { addEnemy, game, run, world } from './troopworld';

const { pm } = world;

test('alerta de dinheiro já negativo com saldo positivo não fala em "Infinity meses"', () => {
  const s = game();
  s.nations[0].res.money = -1e4; // o saldo positivo não cobre a dívida em 3 meses
  const a = alerts(s, pm, 0).find(x => x.kind === 'money-negative');
  if (a) { expect(a.text).not.toMatch(/Infinity|NaN/); expect(a.text).toMatch(/negativo/i); }
  const r = runMonth(s, pm, false, 0);
  expect(r.net.money).toBeGreaterThan(0); // o cenário é mesmo dívida com saldo positivo
  expect(a).toBeDefined();
});

test('estoque de grãos fechando exatamente em 0 com todas as cidades alimentadas não é fome', () => {
  const s = game();
  const r0 = runMonth(s, pm, false, 0);
  s.nations[0].res.grain = -r0.net.grain; // o estoque cobre o consumo do mês exatamente
  runMonth(s, pm, true, 0);
  expect(s.nations[0].res.grain).toBeCloseTo(0, 9);
  expect(s.nations[0].grainShort).toBe(false);
});

test('ressentimento e repressão não passam ao novo dono', () => {
  const s = game();
  addEnemy(s);
  const id = s.owner.findIndex((o, i) => o === 1 && s.nations[1].capital !== i && i >= 0);
  const p = id >= 0 ? id : 1;
  s.resentment[p] = s.month + 50; s.repressed[p] = s.month;
  fall(s, pm, p, 0, false);
  expect(s.resentment[p]).toBeLessThan(s.month);
  expect(s.repressed[p]).toBeLessThan(s.month - 100);
  s.resentment[p] = s.month + 50; s.repressed[p] = s.month; s.owner[p] = -1;
  found(s, p, 0);
  expect(s.resentment[p]).toBeLessThan(s.month);
});

test('registros de uma nação eliminada e de exércitos que sumiram são limpos', () => {
  const s: GameState = game();
  addEnemy(s);
  s.warSince['0:1'] = 1; s.contact['0:1'] = 1; s.lastOffer['1:0:trade'] = 1; s.lastOffer['0:1:peace'] = 1;
  s.stallWarned.t999 = 1; s.stallWarned.r999 = 1; s.stallWarned['0:1'] = 1;
  const t = spawnArmy(s, 0, ['line'], 60, 80); s.stallWarned[`t${t.id}`] = 1;
  eliminate(s, pm, 1, 0);
  expect(Object.keys(s.warSince)).toEqual([]);
  expect(Object.keys(s.contact)).toEqual([]);
  expect(Object.keys(s.lastOffer)).toEqual([]);
  run(s, 1);
  expect(Object.keys(s.stallWarned).sort()).toEqual(['0:1', `t${t.id}`].sort().filter(k => k !== `t${t.id}` || s.armies.some(a => a.id === t.id)));
});
