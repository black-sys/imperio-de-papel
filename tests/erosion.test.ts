import { describe, expect, test } from 'vitest';
import { MOUNTAIN_LEVEL, SEA_LEVEL } from '../src/worldgen/constants';
import { erode } from '../src/worldgen/global/erosion';
import { windMoisture } from '../src/worldgen/global/moisture';
import { applyPlates } from '../src/worldgen/global/plates';
import { landShape } from '../src/worldgen/global/shape';
import { hashArrays } from '../src/worldgen/rng';

const S = 256;
function setup(seed: number) {
  const { base, land } = landShape(seed, S);
  const { elevation, uplift } = applyPlates(seed, S, base, land);
  const rain = windMoisture(S, elevation, land, seed);
  return { land, elevation, uplift, rain };
}
function roughness(e: Float32Array, ref: Float32Array) {
  let s = 0, n = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x;
    if (ref[i] < MOUNTAIN_LEVEL) continue;
    s += Math.abs(e[i] - e[i + 1]) + Math.abs(e[i] - e[i + S]); n++;
  }
  return s / n;
}

describe.each([1, 2, 3])('erosão semente %i', seed => {
  const w = setup(seed);
  const out = erode(S, w.elevation, w.land, w.uplift, w.rain);
  test('máscara terra/oceano preservada', () => {
    let bad = 0;
    for (let i = 0; i < out.length; i++) if ((out[i] >= SEA_LEVEL) !== (w.land[i] === 1)) bad++;
    expect(bad).toBe(0);
  });
  test('montanhas sobrevivem (> 2% da terra)', () => {
    let l = 0, m = 0;
    for (let i = 0; i < out.length; i++) if (w.land[i]) { l++; if (out[i] >= MOUNTAIN_LEVEL) m++; }
    expect(m / l).toBeGreaterThan(0.02);
  });
  test('relevo mais recortado nas montanhas', () => {
    expect(roughness(out, w.elevation)).toBeGreaterThan(roughness(w.elevation, w.elevation));
  });
});
test('determinístico', () => {
  const w = setup(7);
  expect(hashArrays(erode(S, w.elevation, w.land, w.uplift, w.rain))).toBe(hashArrays(erode(S, w.elevation, w.land, w.uplift, w.rain)));
});
