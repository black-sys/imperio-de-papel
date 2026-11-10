import { describe, expect, test } from 'vitest';
import { MOUNTAIN_LEVEL, SEA_LEVEL } from '../src/worldgen/constants';
import { applyPlates } from '../src/worldgen/global/plates';
import { landShape } from '../src/worldgen/global/shape';
import { hashArrays } from '../src/worldgen/rng';

const S = 256;
function largestComponent(mask: Uint8Array, size: number) {
  const seen = new Uint8Array(mask.length);
  let best = { n: 0, w: 0, h: 0 };
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let n = 0, x0 = size, x1 = 0, y0 = size, y1 = 0;
    const st = [s]; seen[s] = 1;
    while (st.length) {
      const i = st.pop()!, x = i % size, y = (i / size) | 0; n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * size + nx;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && mask[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
    }
    if (n > best.n) best = { n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  return best;
}

describe.each([1, 2, 3, 4])('semente %i', seed => {
  const { base, land } = landShape(seed, S);
  const elev = applyPlates(seed, S, base, land);
  test('máscara preservada', () => {
    let bad = 0;
    for (let i = 0; i < land.length; i++) if ((elev[i] >= SEA_LEVEL) !== (land[i] === 1) || elev[i] < 0 || elev[i] > 1) bad++;
    expect(bad).toBe(0);
  });
  test('montanhas entre 2% e 20% da terra', () => {
    let l = 0, m = 0;
    for (let i = 0; i < land.length; i++) if (land[i]) { l++; if (elev[i] >= MOUNTAIN_LEVEL) m++; }
    expect(m / l).toBeGreaterThanOrEqual(0.02);
    expect(m / l).toBeLessThanOrEqual(0.2);
  });
  test('cordilheira alongada', () => {
    const mask = Uint8Array.from(elev, v => (v >= MOUNTAIN_LEVEL ? 1 : 0));
    const c = largestComponent(mask, S);
    expect(c.n >= 40 || Math.max(c.w, c.h) / Math.min(c.w, c.h) >= 2).toBe(true);
  });
});
test('determinístico', () => {
  const { base, land } = landShape(5, S);
  expect(hashArrays(applyPlates(5, S, base, land))).toBe(hashArrays(applyPlates(5, S, base, land)));
});
