import { describe, expect, test } from 'vitest';
import { CELL } from '../src/worldgen/constants';
import { runHydrology } from '../src/worldgen/global/hydrology';
import { windMoisture } from '../src/worldgen/global/moisture';
import { applyPlates } from '../src/worldgen/global/plates';
import { landShape } from '../src/worldgen/global/shape';
import type { River } from '../src/worldgen/types';

function checkRivers(size: number, rivers: River[], water: Uint8Array) {
  const pts = new Set<string>();
  for (const r of rivers) for (let k = 0; k < r.points.length; k += 2) pts.add(`${r.points[k]},${r.points[k + 1]}`);
  for (const r of rivers) {
    for (let k = 1; k < r.surface.length; k++) expect(r.surface[k]).toBeLessThanOrEqual(r.surface[k - 1]);
    const n = r.points.length;
    const lx = r.points[n - 2], ly = r.points[n - 1];
    const cell = Math.floor(ly / CELL) * size + Math.floor(lx / CELL);
    const endsInWater = water[cell] !== 0;
    const joins = rivers.some(o => o !== r && Array.from({ length: o.points.length / 2 }, (_, k) => k)
      .some(k => o.points[2 * k] === lx && o.points[2 * k + 1] === ly));
    expect(endsInWater || joins).toBe(true);
  }
  expect(pts.size).toBeGreaterThan(0);
}

function ramp(crater: boolean) {
  const S = 64, elev = new Float32Array(S * S), land = new Uint8Array(S * S), moist = new Float32Array(S * S).fill(1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    land[i] = x >= 4 ? 1 : 0;
    elev[i] = x < 4 ? 0.2 : 0.42 + x * 0.005 + ((x * 7 + y * 13) % 5) * 0.0005;
    if (crater && x >= 30 && x < 40 && y >= 25 && y < 35) elev[i] = 0.5;
  }
  return { S, ...runHydrology(S, elev, land, moist) };
}

test('rampa: rios descem e terminam no mar ou em outro rio', () => {
  const h = ramp(false);
  expect(h.rivers.length).toBeGreaterThanOrEqual(1);
  checkRivers(h.S, h.rivers, h.water);
});
test('cratera vira lago', () => {
  const h = ramp(true);
  expect(h.water.reduce((a, v) => a + (v === 2 ? 1 : 0), 0)).toBeGreaterThanOrEqual(12);
  checkRivers(h.S, h.rivers, h.water);
});
describe.each([1, 2, 3])('mundo semente %i', seed => {
  test('regras dos rios', () => {
    const S = 256;
    const { base, land } = landShape(seed, S);
    const elev = applyPlates(seed, S, base, land);
    const h = runHydrology(S, elev, land, windMoisture(S, elev, land, seed));
    checkRivers(S, h.rivers, h.water);
  });
});
