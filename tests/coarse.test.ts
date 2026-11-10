import { describe, expect, test } from 'vitest';
import { generateChunk, riverPaths } from '../src/worldgen/chunk';
import { generateCoarseChunk } from '../src/worldgen/coarse';
import { CHUNK } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';
import { hashArrays } from '../src/worldgen/rng';

const map = generateWorld(860);
const V = CHUNK + 1;

describe('generateCoarseChunk', { timeout: 60000 }, () => {
  test.each([2, 4] as const)('passo %i: alturas iguais ao chunk completo em vértices secos', step => {
    let checked = 0;
    for (const [cx, cy] of [[20, 20], [32, 32], [10, 40], [25, 18]]) {
      const full = generateChunk(map, cx, cy), co = generateCoarseChunk(map, cx, cy, step), N = CHUNK / step + 1;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const vx = i * step, vy = j * step;
        let dry = true;
        for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 1; dx++) {
          const tx = vx + dx, ty = vy + dy;
          if (tx >= 0 && ty >= 0 && tx < CHUNK && ty < CHUNK && full.water[ty * CHUNK + tx]) dry = false;
        }
        if (!dry || vx === 0 || vy === 0 || vx === CHUNK || vy === CHUNK) continue;
        expect(co.heights[j * N + i]).toBe(full.heights[vy * V + vx]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
  test('costura entre vizinhos grossos', () => {
    const a = generateCoarseChunk(map, 20, 20, 4), b = generateCoarseChunk(map, 21, 20, 4), N = CHUNK / 4 + 1;
    for (let j = 0; j < N; j++) expect(a.heights[j * N + N - 1]).toBe(b.heights[j * N]);
  });
  test('rios aparecem no chunk grosso', () => {
    let hits = 0, n = 0;
    for (const p of riverPaths(map).filter(p => p.length > 60).slice(0, 10)) {
      const [x, y] = p[Math.floor(p.length / 2)];
      const c = generateCoarseChunk(map, Math.floor(x / CHUNK), Math.floor(y / CHUNK), 4);
      n++; if (c.water.some(w => w === 3)) hits++;
    }
    expect(n).toBeGreaterThan(5);
    expect(hits).toBe(n);
  });
  test('fora do mundo é oceano', () => {
    const c = generateCoarseChunk(map, -1, 5, 4);
    expect(c.water.every(w => w === 1)).toBe(true);
  });
  test('determinístico e com água onde o chunk completo tem mar', () => {
    const h = () => { const c = generateCoarseChunk(map, 40, 12, 4); return hashArrays(c.heights, c.water, c.biome, c.waterLevel); };
    expect(h()).toBe(h());
    expect(generateCoarseChunk(map, 40, 12, 4).water.some(w => w === 1)).toBe(true);
  });
});
