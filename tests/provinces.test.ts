import { describe, expect, test } from 'vitest';
import { MOUNTAIN_LEVEL } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces, type ProvinceMap } from '../src/worldgen/provinces';
import { hashArrays } from '../src/worldgen/rng';
import type { WorldMap } from '../src/worldgen/types';

const worlds = new Map<number, { map: WorldMap; pm: ProvinceMap }>();
const get = (seed: number) => {
  if (!worlds.has(seed)) { const map = generateWorld(seed); worlds.set(seed, { map, pm: generateProvinces(map) }); }
  return worlds.get(seed)!;
};
const N4 = (i: number, S: number) => { const x = i % S; return [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, i - S, i + S].filter(j => j >= 0 && j < S * S); };

describe.each([860, 1, 2])('províncias semente %i', { timeout: 60000 }, seed => {
  test('entre 250 e 350', () => {
    const n = get(seed).pm.provinces.length;
    expect(n).toBeGreaterThanOrEqual(250);
    expect(n).toBeLessThanOrEqual(350);
  });
  test('toda terra (e lago) tem província; mar não', () => {
    const { map, pm } = get(seed);
    let bad = 0;
    for (let i = 0; i < map.water.length; i++) if ((map.water[i] !== 1) !== (pm.cellProvince[i] >= 0)) bad++;
    expect(bad).toBe(0);
  });
  test('cada província é contígua', () => {
    const { map, pm } = get(seed), S = map.size, seen = new Uint8Array(S * S);
    const comps = new Map<number, number>();
    for (let s = 0; s < S * S; s++) {
      const p = pm.cellProvince[s];
      if (p < 0 || seen[s]) continue;
      comps.set(p, (comps.get(p) ?? 0) + 1);
      const st = [s]; seen[s] = 1;
      while (st.length) { const c = st.pop()!; for (const n of N4(c, S)) if (!seen[n] && pm.cellProvince[n] === p) { seen[n] = 1; st.push(n); } }
    }
    expect([...comps.values()].filter(v => v > 1)).toEqual([]);
  });
  test('vizinhanças simétricas e reais', () => {
    const { pm } = get(seed);
    for (const p of pm.provinces) for (const n of p.neighbors) expect(pm.provinces[n].neighbors).toContain(p.id);
    expect(pm.provinces.every((p, i) => p.id === i)).toBe(true);
  });
  test('tamanhos entre 30% e 300% da média (ilhas pequenas são exceção)', () => {
    const { pm } = get(seed);
    const mean = pm.provinces.reduce((a, p) => a + p.cells, 0) / pm.provinces.length;
    const bad = pm.provinces.filter(p => (p.cells < 0.3 * mean && p.neighbors.length > 0) || p.cells > 3 * mean);
    expect(bad.map(p => p.cells)).toEqual([]);
  });
});

test('fronteiras seguem rios e cristas mais que um Voronoi das mesmas sementes', { timeout: 60000 }, () => {
  const { map, pm } = get(860), S = map.size;
  const natural = (a: number, b: number) => map.river[a] || map.river[b] || map.water[a] === 2 || map.water[b] === 2 ||
    map.elevation[a] >= MOUNTAIN_LEVEL || map.elevation[b] >= MOUNTAIN_LEVEL;
  const frac = (owner: (i: number) => number) => {
    let n = 0, nat = 0;
    for (let i = 0; i < S * S; i++) {
      if (owner(i) < 0) continue;
      for (const j of [i + 1, i + S]) {
        if (j >= S * S || (j === i + 1 && (i + 1) % S === 0) || owner(j) < 0 || owner(j) === owner(i)) continue;
        n++; if (natural(i, j)) nat++;
      }
    }
    return nat / n;
  };
  // controle: Voronoi pelos centros das províncias
  const centers = pm.provinces.map(p => p.center);
  const vor = new Int16Array(S * S).fill(-1);
  for (let i = 0; i < S * S; i++) {
    if (map.water[i] === 1) continue;
    const x = (i % S) * 4 + 2, y = Math.floor(i / S) * 4 + 2;
    let best = 0, bd = Infinity;
    centers.forEach((c, k) => { const d = (c.x - x) ** 2 + (c.y - y) ** 2; if (d < bd) { bd = d; best = k; } });
    vor[i] = best;
  }
  expect(frac(i => pm.cellProvince[i])).toBeGreaterThan(frac(i => vor[i]) * 1.3);
});

test('determinístico', { timeout: 60000 }, () => {
  const { map, pm } = get(860);
  expect(hashArrays(generateProvinces(map).cellProvince)).toBe(hashArrays(pm.cellProvince));
});
