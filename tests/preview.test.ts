import { describe, expect, test } from 'vitest';
import { previewCached, previewMonth } from '../src/sim/preview';
import { found } from '../src/sim/state';
import { world } from './stabworld';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld();
const rich = { money: 900, grain: 900, wood: 900, coal: 900, iron: 900, steel: 900, arms: 900 };
const delta = (p: ReturnType<typeof previewMonth>, k: keyof typeof p.after) => p.after[k] - p.before[k];

describe('prévia das ações', () => {
  test('siderúrgica: aço sobe, ferro e carvão caem', () => {
    const s = world();
    s.nations[0].res = { ...rich };
    const p = previewMonth(s, pm, 0, { kind: 'build', province: 1, place: { lot: 0 }, type: 'steelworks' });
    expect(delta(p, 'steel')).toBeGreaterThan(0);
    expect(delta(p, 'iron')).toBeLessThan(0);
    expect(delta(p, 'coal')).toBeLessThan(0);
  });
  test('recrutar mostra a manutenção', () => {
    const s = world();
    const p = previewMonth(s, pm, 0, { kind: 'recruit', province: 0, lot: 1, type: 'line' });
    expect(delta(p, 'money')).toBeLessThan(0);
  });
  test('colonizar: impostos e grãos; sem rota a produção não entra no saldo', () => {
    const s = world();
    s.owner[2] = -1; s.city[2] = null; s.nations[1].alive = false; // R2 neutra
    const p = previewMonth(s, pm, 0, { kind: 'colonize', province: 2 });
    expect(delta(p, 'money')).toBeGreaterThan(0);
    expect(delta(p, 'grain')).toBeLessThan(0);
    expect(delta(p, 'iron')).toBe(0); // sem veios explorados nem rota
  });
  test('sem recursos para a ação: calcula mesmo assim, sem pagar nada; estado real intacto', () => {
    const s = world();
    s.nations[0].res = { money: 0, grain: 0, wood: 0, coal: 0, iron: 0, steel: 0, arms: 0 };
    const json = JSON.stringify(s);
    previewMonth(s, pm, 0, { kind: 'build', province: 1, place: { vein: 3 }, type: 'iron_mine' });
    previewMonth(s, pm, 0, { kind: 'law', law: 'bread' });
    s.lots[1][0] = { type: 'market', level: 1, remaining: 0 };
    const json2 = JSON.stringify(s);
    for (const a of [
      { kind: 'upgrade', province: 1, place: { lot: 0 } }, { kind: 'upgradeCity', province: 1 }, { kind: 'recruit', province: 0, lot: 1, type: 'line' },
      { kind: 'colonize', province: 2 }, { kind: 'route', a: 0, b: 1 }, { kind: 'trade', to: 1, give: ['iron', 5], get: ['money', 9] },
    ] as const) previewMonth(s, pm, 0, a as never);
    expect(JSON.stringify(s)).toBe(json2);
    expect(json2.length).toBeGreaterThan(json.length - 1); // só o mercado foi posto à mão
  });
  test('rota liga a cidade: a produção do depósito entra no saldo', () => {
    const s = world();
    s.routes.push({ id: 90, owner: 0, a: 0, b: 1, path: [], remaining: 0, cut: false }); // R1 ligada de verdade
    found(s, 2, 0); s.veins[2][3] = { type: 'iron_mine', level: 1, remaining: 0 };
    const p = previewMonth(s, pm, 0, { kind: 'route', a: 1, b: 2 });
    expect(delta(p, 'iron')).toBeGreaterThan(0);
  });
  test('nação eliminada: zeros, sem exceção; memória devolve o mesmo resultado', () => {
    const s = world();
    s.nations[1].alive = false;
    expect(previewMonth(s, pm, 1, { kind: 'law', law: 'bread' })).toBeDefined();
    const a = { kind: 'law' as const, law: 'ration' as const };
    expect(previewCached(s, pm, 0, a)).toBe(previewCached(s, pm, 0, { ...a }));
  });
});

test('memória vale o mês inteiro com o tempo correndo; muda com as leis', () => {
  const s = world();
  const a = { kind: 'build' as const, province: 1, place: { lot: 0 }, type: 'market' as const };
  s.month = 5.2;
  const r1 = previewCached(s, pm, 0, a);
  s.month = 5.7;
  expect(previewCached(s, pm, 0, a)).toBe(r1);
  s.nations[0].laws.push('martial');
  expect(previewCached(s, pm, 0, a)).not.toBe(r1);
});
