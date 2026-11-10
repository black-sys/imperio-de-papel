import { expect, test } from 'vitest';
import { placeFlora } from '../src/client/view/flora';
import { generateChunk } from '../src/worldgen/chunk';
import { CHUNK } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';

const map = generateWorld(860);
const chunks = [[20, 20], [32, 32], [10, 40], [36, 35]].map(([x, y]) => generateChunk(map, x, y));
const tile = (c: ReturnType<typeof generateChunk>, x: number, y: number) => (Math.floor(y) - c.cy * CHUNK) * CHUNK + Math.floor(x) - c.cx * CHUNK;

test('determinístico', () => {
  for (const c of chunks) expect(placeFlora(c, 1)).toEqual(placeFlora(c, 1));
});
test('há vegetação e ela respeita água e recursos', () => {
  let total = 0;
  for (const c of chunks) {
    const res = new Set(c.resources.map(r => tile(c, r.x, r.y)));
    for (const f of placeFlora(c, 1)) {
      const t = tile(c, f.x, f.y);
      expect(c.water[t]).toBe(0);
      expect(res.has(t)).toBe(false);
      total++;
    }
  }
  expect(total).toBeGreaterThan(500);
});
test('densidade 0 → vazio; 0.5 → cerca de metade', () => {
  const c = chunks[0];
  expect(placeFlora(c, 0)).toEqual([]);
  const full = placeFlora(c, 1).length, half = placeFlora(c, 0.5).length;
  expect(half).toBeGreaterThan(full * 0.35);
  expect(half).toBeLessThan(full * 0.65);
});
