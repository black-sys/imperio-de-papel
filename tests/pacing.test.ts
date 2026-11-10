import { describe, expect, test } from 'vitest';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { greedy } from './greedy';

// alvo do spec: 1ª colonização em 3–8 meses; 20 províncias em 1.5–4 h a 1× (1 h = 360 meses de 10 s)
describe.each([860, 1, 2, 7])('ritmo semente %i', { timeout: 180000 }, seed => {
  test('1ª colonização e 20 províncias no alvo', () => {
    const r = greedy(generateProvinces(generateWorld(seed)), 2000);
    expect(r.firstColonize).toBeGreaterThanOrEqual(3);
    expect(r.firstColonize).toBeLessThanOrEqual(8);
    expect(r.reach20).toBeGreaterThanOrEqual(1.5 * 360);
    expect(r.reach20).toBeLessThanOrEqual(4 * 360);
  });
  // com fortalezas e exército: 1ª fortaleza tomada em 15–40 min (90–240 meses). Conquistar não paga colonização, então
  // as 20 províncias chegam mais cedo que só colonizando (medido: 250–350 meses); o piso de 0.6 h guarda contra o colapso
  test('com exército: 1ª fortaleza em 15–40 min e 20 províncias entre 0.6 e 4 h', () => {
    const map = generateWorld(seed), r = greedy(generateProvinces(map), 2000, map);
    console.log(`semente ${seed}: 1ª colonização ${r.firstColonize.toFixed(1)}, 1ª fortaleza ${r.firstFortress}, 20 províncias ${r.reach20}, fortalezas tomadas ${r.taken}`);
    expect(r.firstColonize).toBeGreaterThanOrEqual(3);
    expect(r.firstColonize).toBeLessThanOrEqual(8);
    expect(r.firstFortress).toBeGreaterThanOrEqual(90);
    expect(r.firstFortress).toBeLessThanOrEqual(240);
    expect(r.reach20).toBeGreaterThanOrEqual(0.6 * 360);
    expect(r.reach20).toBeLessThanOrEqual(4 * 360);
  });
});
