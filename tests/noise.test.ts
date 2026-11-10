import { expect, test } from 'vitest';
import { fbm, ridged, valueNoise, warp } from '../src/worldgen/noise';
import { makeRng } from '../src/worldgen/rng';

const rng = makeRng(1);
const pts = Array.from({ length: 10000 }, () => [rng() * 500 - 250, rng() * 500 - 250] as const);

test('saídas em [0,1]', () => {
  for (const [x, y] of pts) {
    for (const v of [valueNoise(x, y, 7), fbm(x, y, 7, 5), ridged(x, y, 7, 4)]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  }
});
test('determinístico', () => {
  for (const [x, y] of pts.slice(0, 200)) {
    expect(fbm(x, y, 3, 4)).toBe(fbm(x, y, 3, 4));
    expect(warp(x, y, 3, 2)).toEqual(warp(x, y, 3, 2));
  }
});
test('contínuo', () => {
  for (const [x, y] of pts.slice(0, 1000)) expect(Math.abs(fbm(x, y, 5, 5) - fbm(x + 0.001, y, 5, 5))).toBeLessThan(0.01);
});
test('sementes diferentes dão campos diferentes', () => {
  const mean = (s: number) => pts.slice(0, 100).reduce((a, [x, y]) => a + valueNoise(x, y, s), 0) / 100;
  expect(mean(1)).not.toBe(mean(2));
});
test('warp desloca no máximo strength', () => {
  for (const [x, y] of pts.slice(0, 500)) {
    const [wx, wy] = warp(x, y, 9, 3);
    expect(Math.abs(wx - x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(wy - y)).toBeLessThanOrEqual(1.5);
  }
});
