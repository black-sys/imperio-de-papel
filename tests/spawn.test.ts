import { describe, expect, test } from 'vitest';
import { generateChunk } from '../src/worldgen/chunk';
import { CELL, CHUNK } from '../src/worldgen/constants';
import { generateWorld, nearestLandTile } from '../src/worldgen/global/world';

describe('spawn e teleporte', { timeout: 60000 }, () => {
  // sementes onde o revisor achou o jogador preso no spawn
  test.each([110866, 142542, 190056])('semente %i: spawn em chão firme (≥3 vizinhos andáveis)', seed => {
    const m = generateWorld(seed);
    const c = generateChunk(m, Math.floor(m.spawn.x / CHUNK), Math.floor(m.spawn.y / CHUNK));
    const lx = Math.floor(m.spawn.x) - c.cx * CHUNK, ly = Math.floor(m.spawn.y) - c.cy * CHUNK;
    const w = (x: number, y: number) => c.walk[y * CHUNK + x];
    expect(w(lx, ly)).not.toBe(0);
    const n = [w(lx + 1, ly), w(lx - 1, ly), w(lx, ly + 1), w(lx, ly - 1)].filter(v => v !== 0).length;
    expect(n).toBeGreaterThanOrEqual(3);
  });
  test('nearestLandTile: do meio do oceano acha terra seca sem rio', () => {
    const m = generateWorld(860);
    for (const [x, y] of [[10, 10], [4000, 4000], [10, 2000], [2048, 4080]]) {
      const t = nearestLandTile(m, x, y)!;
      const cell = Math.floor(t.y / CELL) * m.size + Math.floor(t.x / CELL);
      expect(m.water[cell]).toBe(0);
      expect(m.river[cell]).toBe(0);
    }
    const land = nearestLandTile(m, m.spawn.x, m.spawn.y)!;
    expect(Math.abs(land.x - m.spawn.x) + Math.abs(land.y - m.spawn.y)).toBeLessThanOrEqual(CELL);
  });
});
