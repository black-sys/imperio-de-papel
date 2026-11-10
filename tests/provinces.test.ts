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

describe('atributos', { timeout: 60000 }, () => {
  test('fatores em [0,1.5]; floresta maior em províncias de floresta que de deserto', () => {
    const { pm } = get(860);
    for (const p of pm.provinces) for (const v of [p.fertility, p.forest, p.rock]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.5); }
    const avg = (b: number) => { const l = pm.provinces.filter(p => p.biome === b); return l.reduce((a, p) => a + p.forest, 0) / l.length; };
    expect(avg(4)).toBeGreaterThan(avg(8) + 0.3); // floresta temperada vs deserto
  });
  test('vagas 3–6 e um local seco por vaga, dentro da província e afastados', () => {
    const { map, pm } = get(860), S = map.size;
    for (const p of pm.provinces) {
      expect(p.slots).toBeGreaterThanOrEqual(3); expect(p.slots).toBeLessThanOrEqual(6);
      expect(p.sites.length).toBe(p.slots);
      for (const s of p.sites) {
        const c = Math.floor(s.y / 4) * S + Math.floor(s.x / 4);
        expect(pm.cellProvince[c]).toBe(p.id);
        expect(map.water[c]).toBe(0);
        expect(map.river[c]).toBe(0);
      }
      for (let i = 0; i < p.sites.length; i++) for (let j = i + 1; j < p.sites.length; j++)
        expect(Math.hypot(p.sites[i].x - p.sites[j].x, p.sites[i].y - p.sites[j].y)).toBeGreaterThanOrEqual(4);
    }
  });
  test('nomes únicos, não vazios e determinísticos', () => {
    const { map, pm } = get(860);
    const names = pm.provinces.map(p => p.name);
    expect(names.every(n => n.length >= 3)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(generateProvinces(map).provinces.map(p => p.name)).toEqual(names);
  });
  test.each([860, 1, 2])('semente %i: 5–8 capitais sugeridas, afastadas e acima da mediana', seed => {
    const { pm } = get(seed);
    const caps = pm.suggestedCapitals;
    expect(caps.length).toBeGreaterThanOrEqual(5); expect(caps.length).toBeLessThanOrEqual(8);
    const score = (p: (typeof pm.provinces)[0]) => p.fertility + 0.6 * p.forest + 0.6 * p.rock;
    const sorted = pm.provinces.map(score).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
    for (const c of caps) expect(score(pm.provinces[c])).toBeGreaterThanOrEqual(median);
    for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
      const a = pm.provinces[caps[i]].center, b = pm.provinces[caps[j]].center;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(400);
    }
  });
});
