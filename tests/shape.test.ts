import { describe, expect, test } from 'vitest';
import { SEA_LEVEL } from '../src/worldgen/constants';
import { landShape } from '../src/worldgen/global/shape';
import { hashArrays } from '../src/worldgen/rng';

const S = 256;
describe.each([1, 2, 3, 4, 5, 6])('semente %i', seed => {
  const { base, land } = landShape(seed, S);
  test('fração de terra em [0.35,0.55]', () => {
    const f = land.reduce((a, v) => a + v, 0) / land.length;
    expect(f).toBeGreaterThanOrEqual(0.35);
    expect(f).toBeLessThanOrEqual(0.55);
  });
  test('borda de 4 células é oceano', () => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
      if (x < 4 || y < 4 || x >= S - 4 || y >= S - 4) expect(land[y * S + x]).toBe(0);
  });
  test('land ⇔ base ≥ SEA_LEVEL', () => {
    for (let i = 0; i < land.length; i++) expect(land[i] === 1).toBe(base[i] >= SEA_LEVEL);
  });
});
test('determinístico', () => {
  const a = landShape(9, S), b = landShape(9, S);
  expect(hashArrays(a.base, a.land)).toBe(hashArrays(b.base, b.land));
});
