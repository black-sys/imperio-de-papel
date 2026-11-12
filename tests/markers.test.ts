import { expect, test } from 'vitest';
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
