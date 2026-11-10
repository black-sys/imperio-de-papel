import { describe, expect, test } from 'vitest';
import { CELL, MOUNTAIN_LEVEL } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';
import { hashArrays } from '../src/worldgen/rng';
import { Biome, type WorldMap } from '../src/worldgen/types';

const cache = new Map<number, WorldMap>();
const world = (s: number) => { if (!cache.has(s)) cache.set(s, generateWorld(s)); return cache.get(s)!; };
const h = (m: WorldMap) => hashArrays(m.elevation, m.water, m.biome, m.moisture, m.temperature, m.flow);

describe('generateWorld', { timeout: 60000 }, () => {
  test('determinístico + hash de referência', () => {
    expect(h(generateWorld(860))).toBe(h(world(860)));
    expect(h(world(860))).toMatchInlineSnapshot(`"533b17c4"`);
  });
  test.each([1, 2, 3])('semente %i: terra, biomas, spawn', s => {
    const m = world(s);
    const landFrac = m.water.reduce((a, v) => a + (v === 1 ? 0 : 1), 0) / m.water.length;
    expect(landFrac).toBeGreaterThanOrEqual(0.35);
    expect(landFrac).toBeLessThanOrEqual(0.55);
    expect(new Set(m.biome).size).toBeGreaterThanOrEqual(8);
    const c = Math.floor(m.spawn.y / CELL) * m.size + Math.floor(m.spawn.x / CELL);
    expect(m.water[c]).toBe(0);
    expect([Biome.Grassland, Biome.TemperateForest]).toContain(m.biome[c]);
  });
  test('sombra de chuva: oeste das montanhas mais úmido que leste', () => {
    const m = world(1), S = m.size;
    let w = 0, e = 0, n = 0;
    for (let y = 0; y < S; y++) for (let x = 6; x < S - 6; x++) {
      const i = y * S + x;
      if (m.elevation[i] < MOUNTAIN_LEVEL || m.water[i - 6] || m.water[i + 6]) continue;
      for (let d = 2; d <= 6; d++) { w += m.moisture[i - d]; e += m.moisture[i + d]; }
      n++;
    }
    expect(n).toBeGreaterThan(0);
    expect(w / n).toBeGreaterThan(e / n);
  });
  test.each([0, 4294967295])('semente extrema %i gera mundo válido', s => {
    const m = generateWorld(s);
    const landFrac = m.water.reduce((a, v) => a + (v === 1 ? 0 : 1), 0) / m.water.length;
    expect(landFrac).toBeGreaterThanOrEqual(0.35);
    expect(landFrac).toBeLessThanOrEqual(0.55);
  });
  test('onProgress na ordem', () => {
    const st: string[] = [];
    generateWorld(5, s => { if (st.at(-1) !== s) st.push(s); });
    expect(st).toEqual(['forma', 'placas', 'umidade', 'erosão', 'rios', 'biomas']);
  });
});
