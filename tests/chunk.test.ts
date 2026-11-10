import { describe, expect, test } from 'vitest';
import { generateChunk } from '../src/worldgen/chunk';
import { CELL, CHUNK } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';
import { hashArrays } from '../src/worldgen/rng';

const map = generateWorld(860);
const V = CHUNK + 1;
const col = (h: Float32Array, x: number) => Array.from({ length: V }, (_, y) => h[y * V + x]);
const row = (h: Float32Array, y: number) => Array.from(h.slice(y * V, y * V + V));

describe('generateChunk', { timeout: 30000 }, () => {
  test('costura horizontal e vertical idênticas', () => {
    const a = generateChunk(map, 20, 20), b = generateChunk(map, 21, 20), c = generateChunk(map, 20, 21);
    expect(col(a.heights, CHUNK)).toEqual(col(b.heights, 0));
    expect(row(a.heights, CHUNK)).toEqual(row(c.heights, 0));
  });
  test('determinístico', () => {
    const h = (cx: number) => { const c = generateChunk(map, cx, 20); return hashArrays(c.heights, c.biome, c.water, c.waterLevel, c.riverWidth); };
    expect(h(20)).toBe(h(20));
  });
  test.each([[-1, 0], [64, 10], [5, -3], [0, 64]])('fora do mundo (%i,%i) é oceano', (cx, cy) => {
    const c = generateChunk(map, cx, cy);
    expect(c.water.every(v => v === 1)).toBe(true);
    expect(c.heights.length).toBe(V * V);
  });
  test('rio aparece no chunk do 5º ponto do primeiro rio longo', () => {
    const r = map.rivers.find(r => r.points.length >= 10)!;
    const c = generateChunk(map, Math.floor(r.points[8] / CHUNK), Math.floor(r.points[9] / CHUNK));
    expect(c.water.some(v => v === 3)).toBe(true);
  });
  test('tile seco inteiro submerso ao lado do oceano não existe', () => {
    let bad = 0;
    for (const [cx, cy] of [[0, 30], [1, 30], [0, 31], [12, 20], [30, 10]]) {
      const c = generateChunk(map, cx, cy);
      for (let y = 1; y < CHUNK - 1; y++) for (let x = 1; x < CHUNK - 1; x++) {
        const t = y * CHUNK + x;
        if (c.water[t] !== 0) continue;
        const top = Math.max(c.heights[y * V + x], c.heights[y * V + x + 1], c.heights[(y + 1) * V + x], c.heights[(y + 1) * V + x + 1]);
        const nearOcean = [t - 1, t + 1, t - CHUNK, t + CHUNK].some(n => c.water[n] === 1);
        if (top < -0.2 && nearOcean) bad++; // inteiro abaixo da superfície desenhada (nível − 0.15)
      }
    }
    expect(bad).toBe(0);
  });
  test('tile seco nunca tem bioma Oceano', () => {
    for (const [cx, cy] of [[0, 30], [1, 30], [0, 31], [12, 20], [30, 10]]) {
      const c = generateChunk(map, cx, cy);
      c.water.forEach((w, t) => { if (w === 0) expect(c.biome[t]).not.toBe(0); });
    }
  });
  test('tiles com água têm os 4 vértices ≤ nível da água', () => {
    const lake = map.water.indexOf(2);
    const lakeChunk = [Math.floor(((lake % map.size) * CELL) / CHUNK), Math.floor((Math.floor(lake / map.size) * CELL) / CHUNK)];
    expect(generateChunk(map, lakeChunk[0], lakeChunk[1]).water.some(v => v === 2)).toBe(true);
    for (const [cx, cy] of [[20, 20], [32, 32], [10, 40], [40, 12], lakeChunk]) {
      const c = generateChunk(map, cx, cy);
      for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
        const t = y * CHUNK + x;
        if (!c.water[t]) continue;
        for (const v of [y * V + x, y * V + x + 1, (y + 1) * V + x, (y + 1) * V + x + 1])
          expect(c.heights[v]).toBeLessThanOrEqual(c.waterLevel[t] + 1e-6);
      }
    }
  });
});
