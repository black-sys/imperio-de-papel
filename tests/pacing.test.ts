import { describe, expect, test } from 'vitest';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { greedy } from './greedy';

// alvo do spec: 1ª colonização em 3–8 meses; 20 províncias em 1.5–4 h a 1× (1 h = 360 meses de 10 s)
describe.each([860, 1, 2, 7])('ritmo semente %i', { timeout: 60000 }, seed => {
  test('1ª colonização e 20 províncias no alvo', () => {
    const r = greedy(generateProvinces(generateWorld(seed)), 2000);
    expect(r.firstColonize).toBeGreaterThanOrEqual(3);
    expect(r.firstColonize).toBeLessThanOrEqual(8);
    expect(r.reach20).toBeGreaterThanOrEqual(1.5 * 360);
    expect(r.reach20).toBeLessThanOrEqual(4 * 360);
  });
});
