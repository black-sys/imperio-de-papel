import { describe, expect, test } from 'vitest';
import { generateChunk } from '../src/worldgen/chunk';
import { CHUNK, CHUNKS_PER_SIDE } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';
import { Biome, type ChunkData } from '../src/worldgen/types';

const map = generateWorld(860);
const tileOf = (c: ChunkData, x: number, y: number) => (Math.floor(y) - c.cy * CHUNK) * CHUNK + (Math.floor(x) - c.cx * CHUNK);
const majority = (c: ChunkData) => { const n = new Array(11).fill(0); c.biome.forEach(b => n[b]++); return n.indexOf(Math.max(...n)); };
function findChunk(pred: (c: ChunkData) => boolean): ChunkData {
  for (let cy = 0; cy < CHUNKS_PER_SIDE; cy += 2) for (let cx = 0; cx < CHUNKS_PER_SIDE; cx += 2) {
    const c = generateChunk(map, cx, cy);
    if (pred(c)) return c;
  }
  throw new Error('nenhum chunk');
}

describe('recursos e andabilidade', { timeout: 60000 }, () => {
  test('IDs estáveis entre gerações', () => {
    const a = generateChunk(map, 20, 20).resources, b = generateChunk(map, 20, 20).resources;
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    for (const r of a) expect(r.id).toMatch(/^c20_20#\d+$/);
  });
  test('nenhum recurso na água; tile com recurso bloqueado', () => {
    for (const [cx, cy] of [[20, 20], [10, 40], [30, 30]]) {
      const c = generateChunk(map, cx, cy);
      for (const r of c.resources) { const t = tileOf(c, r.x, r.y); expect(c.water[t]).toBe(0); expect(c.walk[t]).toBe(0); }
    }
  });
  test('floresta densa, oceano vazio', () => {
    const f = findChunk(c => majority(c) === Biome.TemperateForest);
    expect(f.resources.length / (CHUNK * CHUNK)).toBeGreaterThan(0.1);
    expect(generateChunk(map, 0, 0).resources.length).toBe(0);
  });
  test('rio estreito é vau, água funda bloqueia', () => {
    const c = findChunk(c => c.riverWidth.some(w => w > 0 && w <= 3));
    c.riverWidth.forEach((w, t) => { if (c.water[t] === 3 && w <= 3) expect(c.walk[t]).toBe(2); });
    const o = generateChunk(map, 0, 0);
    expect(o.walk.every(v => v === 0)).toBe(true);
  });
  test('spawn andável', () => {
    const c = generateChunk(map, Math.floor(map.spawn.x / CHUNK), Math.floor(map.spawn.y / CHUNK));
    expect(c.walk[tileOf(c, map.spawn.x, map.spawn.y)]).not.toBe(0);
  });
});
