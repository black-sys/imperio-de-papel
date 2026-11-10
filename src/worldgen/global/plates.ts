import { MOUNTAIN_LEVEL, SEA_LEVEL } from '../constants';
import { fbm, ridged } from '../noise';
import { makeRng } from '../rng';

interface Plate { x: number; y: number; dx: number; dy: number }

/** Relevo: base suavizada + cordilheiras em fronteiras convergentes de placas. */
export function applyPlates(seed: number, size: number, base: Float32Array, land: Uint8Array): Float32Array {
  const rng = makeRng(seed);
  const plates: Plate[] = [];
  const count = 8 + Math.floor(rng() * 5);
  for (let i = 0; i < count; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1;
    const m = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= m; dy /= m;
    // sementes em terra: fronteiras (e cordilheiras) caem no continente, não no mar
    let cell = 0;
    for (let t = 0; t < 1000; t++) { cell = Math.floor(rng() * size * size); if (land[cell]) break; }
    plates.push({ x: cell % size, y: Math.floor(cell / size), dx, dy });
  }
  const width = size * 0.055;
  const out = new Float32Array(size * size);
  const mtn = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (!land[i]) { out[i] = base[i]; continue; }
    const px = x + (fbm(x / 40, y / 40, seed + 1, 3) - 0.5) * size * 0.12;
    const py = y + (fbm(x / 40, y / 40, seed + 2, 3) - 0.5) * size * 0.12;
    let a = 0, b = 0, d1 = Infinity, d2 = Infinity;
    for (let p = 0; p < count; p++) {
      const ddx = px - plates[p].x, ddy = py - plates[p].y, d = ddx * ddx + ddy * ddy;
      if (d < d1) { d2 = d1; b = a; d1 = d; a = p; } else if (d < d2) { d2 = d; b = p; }
    }
    const boundary = (Math.sqrt(d2) - Math.sqrt(d1)) / 2;
    const A = plates[a], B = plates[b];
    let ux = B.x - A.x, uy = B.y - A.y;
    const um = Math.sqrt(ux * ux + uy * uy) || 1; ux /= um; uy /= um;
    const conv = (A.dx - B.dx) * ux + (A.dy - B.dy) * uy; // >0 colisão
    const fall = Math.max(0, 1 - boundary / width);
    const r = ridged((x / size) * 10, (y / size) * 10, seed + 3, 4);
    let e = SEA_LEVEL + (base[i] - SEA_LEVEL) * 0.5;
    if (conv > 0) mtn[i] = conv * 0.42 * (0.35 + r * 0.65) * fall * fall;
    else e += conv * 0.06 * fall;
    e += (fbm((x / size) * 16, (y / size) * 16, seed + 4, 4) - 0.5) * 0.08;
    out[i] = e;
  }
  // escala as cordilheiras para ~MOUNTAIN_TARGET da terra, independente de quão forte foi a colisão
  let lo = 0.2, hi = 6;
  for (let it = 0; it < 20; it++) {
    const k = (lo + hi) / 2;
    if (mountainFraction(out, mtn, land, k) > MOUNTAIN_TARGET) hi = k; else lo = k;
  }
  const k = (lo + hi) / 2;
  for (let i = 0; i < out.length; i++) if (land[i]) out[i] = Math.min(1, Math.max(SEA_LEVEL, out[i] + mtn[i] * k));
  return out;
}

const MOUNTAIN_TARGET = 0.07;
function mountainFraction(e: Float32Array, m: Float32Array, land: Uint8Array, k: number): number {
  let l = 0, n = 0;
  for (let i = 0; i < e.length; i++) if (land[i]) { l++; if (e[i] + m[i] * k >= MOUNTAIN_LEVEL) n++; }
  return n / (l || 1);
}
