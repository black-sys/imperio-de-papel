import { describe, expect, test } from 'vitest';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { greedy } from './greedy';

// alvos do spec, em meses a 1× (1 h = 360 meses de 10 s): 1ª colonização 3–8; primeiro aço 10–40 min (60–240);
// 1ª fortaleza 15–40 min (90–240); 20 províncias 1–4 h (360–1440)
describe.each([860, 1, 2, 7])('ritmo semente %i', { timeout: 180000 }, seed => {
  test('economia industrial com exército: colonização, aço, fortaleza e 20 províncias no alvo', () => {
    const map = generateWorld(seed), r = greedy(generateProvinces(map), 2000, map);
    console.log(`semente ${seed}: 1ª colonização ${r.firstColonize.toFixed(1)}, 1º aço ${r.firstSteel}, 1ª fortaleza ${r.firstFortress}, 20 províncias ${r.reach20}, fortalezas ${r.taken}`);
    expect(r.firstColonize).toBeGreaterThanOrEqual(3);
    expect(r.firstColonize).toBeLessThanOrEqual(8);
    expect(r.firstSteel).toBeGreaterThanOrEqual(60);
    expect(r.firstSteel).toBeLessThanOrEqual(240);
    expect(r.firstFortress).toBeGreaterThanOrEqual(90);
    expect(r.firstFortress).toBeLessThanOrEqual(240);
    expect(r.reach20).toBeGreaterThanOrEqual(360);
    expect(r.reach20).toBeLessThanOrEqual(1440);
  });
});
