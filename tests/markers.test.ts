import { expect, test } from 'vitest';
import { checkUpgrade, checkUpgradeCity } from '../src/sim/commands';
import type { GameState } from '../src/sim/state';
import type { ProvinceMap } from '../src/worldgen/provinces';
import { markersKey, upgradeable } from '../src/client/map/markers';
import type { View } from '../src/client/map/view';
import { game, world } from './troopworld';

const { pm } = world;
const view: View = { cx: 128, cy: 128, scale: 2.5, w: 700, h: 700 };
const opts = () => ({ selectedArmies: new Set<number>(), selectedProvince: -1, pins: [], grid: world.grid });
const rich = () => { const s = game(); s.city[0]!.level = 1; for (const k of Object.keys(s.nations[0].res)) (s.nations[0].res as Record<string, number>)[k] = 1e5; return s; };

test('setinha: cidade e prédio melhoráveis com recurso; some sem recurso, em obra e no nível máximo', () => {
  const s = rich();
  s.lots[0][0] = { type: 'market', level: 1, remaining: 0 } as never;
  s.veins[0][0] = { type: 'farm', level: 1, remaining: 0 } as never;
  const before = JSON.stringify(s), u = upgradeable(s, pm);
  expect(JSON.stringify(s)).toBe(before); // estado intacto
  expect(u.has('c:0')).toBe(true);
  // cota de prédios (3 do tipo no nível): com um só mercado/fazenda, o botão do painel também recusa
  expect(u.has('l:0:0')).toBe(false);
  for (const lot of [1, 2]) s.lots[0][lot] = { type: 'market', level: 1, remaining: 0 } as never;
  expect(upgradeable(s, pm).has('l:0:0')).toBe(true);
  (s.lots[0][0] as { remaining: number }).remaining = 2; // em obra
  expect(upgradeable(s, pm).has('l:0:0')).toBe(false);
  s.lots[0][0] = { type: 'market', level: 3, remaining: 0 } as never; // máximo
  expect(upgradeable(s, pm).has('l:0:0')).toBe(false);
  s.nations[0].res.money = 0;
  expect(upgradeable(s, pm).has('c:0')).toBe(false);
});

test('markersKey muda quando o dinheiro cai abaixo do custo de melhorar', () => {
  const s = rich(), o = opts(), k0 = markersKey(s, pm, view, o);
  s.nations[0].res.money = 0;
  expect(markersKey(s, pm, view, o)).not.toBe(k0);
});

// reino grande sintético: 80 províncias com cidade, 6 lotes e 3 veios construídos
function bigRealm(P: number, seed = 1) {
  const types = ['farm', 'sawmill', 'coal_mine', 'iron_mine', 'steelworks', 'arms_factory', 'market', 'garrison'];
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 4294967296);
  const s = { owner: [] as number[], city: [] as unknown[], lots: [] as unknown[][], veins: [] as unknown[][],
    nations: [{ res: { money: 1e9, grain: 1e9, wood: 1e9, coal: 1e9, iron: 1e9, steel: 1e9, arms: 1e9 } }] };
  const b = () => ({ type: types[Math.floor(rnd() * 8)], level: 1 + Math.floor(rnd() * 3), remaining: rnd() < 0.1 ? 2 : 0 });
  for (let i = 0; i < P; i++) {
    s.owner.push(rnd() < 0.9 ? 0 : 1); s.city.push({ level: 1 + Math.floor(rnd() * 3), remaining: rnd() < 0.1 ? 1 : 0 });
    s.lots.push(Array.from({ length: 6 }, () => (rnd() < 0.85 ? b() : null)));
    s.veins.push(Array.from({ length: 3 }, () => (rnd() < 0.7 ? { ...b(), type: 'farm' } : null)));
  }
  const bigPm = { provinces: Array.from({ length: P }, (_, id) => ({ id })) };
  return { s: s as never as GameState, pm: bigPm as never as ProvinceMap };
}

test('setinha: mesma resposta que o botão "Melhorar" (checkUpgrade/checkUpgradeCity) num reino variado', () => {
  for (const seed of [1, 2, 3]) {
    const { s, pm: p } = bigRealm(40, seed);
    if (seed === 3) s.nations[0].res.money = 150; // parte cabe no bolso, parte não
    const want = new Set<string>();
    s.owner.forEach((o, id) => {
      if (o !== 0) return;
      if (checkUpgradeCity(s, p, id).ok) want.add(`c:${id}`);
      s.lots[id].forEach((b, lot) => { if (b && checkUpgrade(s, p, id, { lot }).ok) want.add(`l:${id}:${lot}`); });
      s.veins[id].forEach((b, vein) => { if (b && checkUpgrade(s, p, id, { vein }).ok) want.add(`v:${id}:${vein}`); });
    });
    expect([...upgradeable(s, p)].sort()).toEqual([...want].sort());
    expect(want.size).toBeGreaterThan(0);
  }
});

test('setinha: barata num reino grande (roda a cada quadro)', () => {
  const { s, pm: p } = bigRealm(80);
  upgradeable(s, p);
  const t = performance.now();
  for (let i = 0; i < 20; i++) upgradeable(s, p);
  expect((performance.now() - t) / 20).toBeLessThan(1);
});
